"""Aggregate read-only number-plate audit for a SQLite backup.
Does not create registrations, modify vehicles, or expose player/plate IDs.
A clean report alone does not make the current client-save protocol safe.
"""
import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

LETTERS = 'АВЕКМНОРСТУХ'
TRANSLATE = str.maketrans('ABEKMHOPCTYX', LETTERS)
PATTERN = re.compile(r'^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2}$', re.ASCII)


def canonical_plate(value):
    if not isinstance(value, str) or len(value) > 32:
        return None
    value = re.sub(r'\s+', '', value.upper()).translate(TRANSLATE)
    return value if PATTERN.fullmatch(value) else None


def _load(raw):
    def obj(pairs):
        d = {}
        for k, v in pairs:
            if k in d: raise ValueError('duplicate key')
            d[k] = v
        return d
    return json.loads(raw, object_pairs_hook=obj, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))


def audit(path):
    source = Path(path).expanduser().resolve()
    if not source.is_file(): raise FileNotFoundError('База не найдена; файл не создавался')
    db = sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)
    counts, owners = Counter(), defaultdict(list)
    try:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok': raise ValueError('База повреждена')
        if not {'login_key','state_json'}.issubset({r[1] for r in db.execute('PRAGMA table_info(accounts)')}):
            raise ValueError('Нет совместимой таблицы accounts')
        def vehicle(login, car, context):
            counts['vehicles_checked'] += 1
            if not isinstance(car, dict) or not isinstance(car.get('uid'), str) or not car['uid'] or len(car['uid']) > 128 or not isinstance(car.get('tuning'), dict):
                counts['invalid_vehicles'] += 1; return
            raw = car['tuning'].get('plate')
            if raw is None or raw == '': counts['vehicles_without_number'] += 1; return
            number = canonical_plate(raw)
            if not number: counts['invalid_numbers'] += 1; return
            counts['vehicles_with_number'] += 1
            owners[number].append((login, car['uid'], context))
        for login, raw in db.execute('SELECT login_key,state_json FROM accounts'):
            counts['accounts'] += 1
            if raw is None: counts['accounts_without_state'] += 1; continue
            try:
                state = _load(raw)
                if not isinstance(login,str) or not login or not isinstance(state,dict) or not isinstance(state.get('vehicles'),list): raise ValueError()
                for car in state['vehicles']: vehicle(login,car,'account')
            except (TypeError,ValueError,RecursionError): counts['invalid_states'] += 1
        exists = lambda name: bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone())
        if exists('auction_lots'):
            if not {'seller','kind','status','asset_json'}.issubset({r[1] for r in db.execute('PRAGMA table_info(auction_lots)')}):
                raise ValueError('Несовместимая таблица auction_lots')
            for seller, raw in db.execute("SELECT seller,asset_json FROM auction_lots WHERE kind='vehicle' AND status='active'"):
                counts['active_vehicle_lots'] += 1
                try:
                    asset = _load(raw)
                    if not isinstance(seller,str) or not seller or not isinstance(asset,dict) or not isinstance(asset.get('item'),dict): raise ValueError()
                    vehicle(seller,asset['item'],'escrow')
                except (TypeError,ValueError,RecursionError): counts['invalid_vehicle_lots'] += 1
        counts['duplicate_numbers'] = sum(len(rows)>1 for rows in owners.values())
        counts['duplicate_numbers_cross_account'] = sum(len({row[0] for row in rows})>1 for rows in owners.values())
        counts['numbers_in_escrow_and_account'] = sum(len({row[2] for row in rows})>1 for rows in owners.values())
        registered = set()
        if exists('plate_registrations'):
            if not {'number','account_key','vehicle_uid'}.issubset({r[1] for r in db.execute('PRAGMA table_info(plate_registrations)')}):
                raise ValueError('Несовместимая таблица plate_registrations')
            for number, login, uid in db.execute('SELECT number,account_key,vehicle_uid FROM plate_registrations'):
                counts['registry_rows'] += 1
                canonical = canonical_plate(number)
                if not canonical or not isinstance(login,str) or not login or not isinstance(uid,str) or not uid:
                    counts['invalid_registry_rows'] += 1; continue
                if canonical in registered: counts['duplicate_registry_numbers'] += 1
                registered.add(canonical)
                if not any(owner == login and vehicle_id == uid for owner,vehicle_id,_ in owners.get(canonical,[])):
                    counts['registry_without_matching_vehicle'] += 1
        counts['numbers_without_registry'] = sum(number not in registered for number in owners)
        counts['unique_numbers_in_snapshots'] = len(owners)
        fields = ('accounts','accounts_without_state','invalid_states','vehicles_checked','invalid_vehicles',
                  'vehicles_without_number','invalid_numbers','vehicles_with_number','unique_numbers_in_snapshots',
                  'duplicate_numbers','duplicate_numbers_cross_account','active_vehicle_lots','invalid_vehicle_lots',
                  'numbers_in_escrow_and_account','registry_rows','invalid_registry_rows','duplicate_registry_numbers',
                  'registry_without_matching_vehicle','numbers_without_registry')
        return {'counts':{k:counts[k] for k in fields}, 'migration_enabled':False}
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', help='Путь к резервной копии SQLite, не к работающей базе')
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.backup),ensure_ascii=False,indent=2))
        print('Только чтение. Серверная выдача и миграция по-прежнему не включены.')
    except (OSError,sqlite3.Error,ValueError) as exc:
        raise SystemExit(f'Проверка отменена: {exc}')
