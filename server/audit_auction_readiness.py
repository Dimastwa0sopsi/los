"""Read-only aggregate audit for future auctions; never repairs or prints account data.

Run against a SQLite backup, not the live database. Duplicate houses/businesses
are expected with the old per-account ownership model; they must be resolved
before introducing a global auction. A clean report does not prove safety.
"""
import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path


def audit(path):
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError('База не найдена; файл не создавался')
    db = sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)
    try:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')  # one consistent snapshot
        columns = {row[1] for row in db.execute('PRAGMA table_info(accounts)')}
        if not {'login_key', 'state_json'}.issubset(columns):
            raise ValueError('Отсутствует совместимая таблица accounts')
        owners = defaultdict(set)
        counts = Counter()
        for login, raw in db.execute('SELECT login_key,state_json FROM accounts'):
            counts['accounts'] += 1
            if raw is None:
                counts['accounts_without_state'] += 1
                continue
            try:
                state = json.loads(raw)
                if not isinstance(state, dict):
                    raise ValueError()
            except (TypeError, ValueError):
                counts['invalid_states'] += 1
                continue
            for field, kind in (('vehicles','vehicle'),('kiosks','business'),('properties','home')):
                values = state.get(field)
                if not isinstance(values, list):
                    counts['invalid_asset_lists'] += 1
                    continue
                local = set()
                for item in values:
                    key = item.get('uid') if field == 'vehicles' and isinstance(item,dict) else item.get('id') if field == 'kiosks' and isinstance(item,dict) else item if field == 'properties' else None
                    valid = ((field == 'vehicles' and isinstance(key,str) and 0 < len(key) <= 128) or
                             (field == 'kiosks' and isinstance(key,int) and not isinstance(key,bool) and key >= 0) or
                             (field == 'properties' and isinstance(key,str) and len(key.split(':')) == 2 and all(p.isascii() and p.isdigit() for p in key.split(':'))))
                    if not valid:
                        counts['invalid_assets'] += 1
                        continue
                    identity = (kind, str(key))
                    if identity in local:
                        counts['duplicates_within_account'] += 1
                    local.add(identity)
                    owners[identity].add(login)
        for (kind, _), group in owners.items():
            if len(group) > 1:
                counts[f'duplicate_{kind}_ids_across_accounts'] += 1
        lots = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auction_lots'").fetchone()
        if lots:
            needed = {'kind','asset_key','status'}
            if not needed.issubset({row[1] for row in db.execute('PRAGMA table_info(auction_lots)')}):
                raise ValueError('Несовместимая таблица auction_lots')
            for kind, key in db.execute("SELECT kind,asset_key FROM auction_lots WHERE status='active'"):
                counts['active_lots'] += 1
                normalized = 'home' if kind in ('house','apartment') else kind
                if normalized not in ('vehicle','business','home') or not isinstance(key,str):
                    counts['invalid_active_lots'] += 1
                elif (normalized,key) in owners:
                    counts['active_lots_also_in_account'] += 1
        return {name: counts[name] for name in (
            'accounts','accounts_without_state','invalid_states','invalid_asset_lists','invalid_assets',
            'duplicates_within_account','duplicate_vehicle_ids_across_accounts',
            'duplicate_business_ids_across_accounts','duplicate_home_ids_across_accounts',
            'active_lots','invalid_active_lots','active_lots_also_in_account')}
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', help='Путь к резервной копии базы SQLite')
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.backup), ensure_ascii=False, indent=2))
        print('Проверка только для чтения; нулевые счётчики не гарантируют готовность торгов.')
    except (OSError, sqlite3.Error, ValueError) as exc:
        raise SystemExit(f'Проверка отменена: {exc}')
