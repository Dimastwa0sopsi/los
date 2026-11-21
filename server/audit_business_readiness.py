"""Read-only audit of a SQLite BACKUP for future business migration.

Never edits accounts, pays income or chooses between conflicting owners. Output
is aggregate only (no nicknames, passwords, account data or coordinates).
Even a clean report is not permission to enable server-owned businesses.
"""
import argparse
import json
import hashlib
import sqlite3
import time
from collections import Counter, defaultdict
from pathlib import Path

MAX_MONEY = 2147483647
PERIOD_MS = 60000
MAX_PERIODS = 120


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def _bad_constant(_):
    raise ValueError('non-finite JSON number')


def _load(raw):
    return json.loads(raw, object_pairs_hook=_object, parse_constant=_bad_constant)


def _integer(value, minimum=0, maximum=MAX_MONEY):
    return type(value) is int and minimum <= value <= maximum


def audit(path, catalogue_path=None, now_ms=None):
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    if not _integer(now_ms, 0, 9007199254740991):
        raise ValueError('Некорректное время проверки')
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError('База не найдена; файл не создавался')
    cat_path = Path(catalogue_path) if catalogue_path else Path(__file__).with_name('business-catalogue.json')
    catalogue_text = cat_path.read_text(encoding='utf-8')
    catalogue = _load(catalogue_text)
    if not isinstance(catalogue, dict) or type(catalogue.get('schema')) is not int or catalogue.get('schema') != 1 or not isinstance(catalogue.get('businesses'), list):
        raise ValueError('Несовместимый каталог')
    businesses = catalogue['businesses']
    if any(not isinstance(x, dict) or not isinstance(x.get('id'), str) for x in businesses):
        raise ValueError('Повреждён каталог')
    index = {x['id']: x for x in businesses}
    if len(index) != len(businesses):
        raise ValueError('Повтор идентификатора в каталоге')
    kiosks = {int(key[6:]): item for key, item in index.items()
              if key.startswith('kiosk:') and key[6:].isascii() and key[6:].isdigit() and str(int(key[6:])) == key[6:]}
    if not kiosks or any(not _integer(v.get('legacyIncome'), 1) for v in kiosks.values()):
        raise ValueError('Некорректный каталог ларьков')
    counts = Counter()
    owners = defaultdict(set)
    db = sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True)
    try:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('Проверка целостности базы не пройдена')
        columns = {row[1] for row in db.execute('PRAGMA table_info(accounts)')}
        if not {'login_key', 'state_json', 'revision'}.issubset(columns):
            raise ValueError('Отсутствует совместимая таблица accounts')
        for login, raw, revision in db.execute('SELECT login_key,state_json,revision FROM accounts'):
            counts['accounts'] += 1
            if raw is None:
                counts['accounts_without_state'] += 1
                continue
            if not isinstance(login, str) or not login or not _integer(revision, 0, 9007199254740991):
                counts['invalid_accounts'] += 1
                continue
            try:
                state = _load(raw)
                if not isinstance(state, dict) or not isinstance(state.get('kiosks'), list):
                    raise ValueError()
            except (TypeError, ValueError, RecursionError):
                counts['invalid_states'] += 1
                continue
            money = state.get('money')
            if not _integer(money): counts['invalid_money'] += 1
            accrued = 0
            local = set()
            for k in state['kiosks']:
                counts['legacy_records'] += 1
                if not isinstance(k, dict) or not _integer(k.get('id'), 0, 1000000) or k['id'] not in kiosks:
                    counts['invalid_kiosk_ids'] += 1
                    continue
                kid = k['id']
                if kid in local:
                    counts['duplicates_within_account'] += 1
                local.add(kid)
                owners[kid].add(login)
                last, acc, closed = k.get('last'), k.get('acc'), k.get('closed', False)
                if not _integer(last, 0, 9007199254740991) or not _integer(acc) or type(closed) is not bool:
                    counts['invalid_kiosk_income'] += 1
                    continue
                if last > now_ms: counts['future_timestamps'] += 1
                periods = max(0, (now_ms - last) // PERIOD_MS) if not closed else 0
                income = kiosks[kid]['legacyIncome']
                # Same cap as the old updateKiosks; no updates or payouts here.
                estimated = min(income * MAX_PERIODS, acc + periods * income) if periods else acc
                counts['stored_uncollected_income'] += acc
                counts['estimated_uncollected_income'] += estimated
                accrued += estimated
            if _integer(money) and money + accrued > MAX_MONEY:
                counts['possible_balance_overflows'] += 1
        counts['distinct_owned_kiosks'] = len(owners)
        counts['conflicting_kiosks'] = sum(len(names) > 1 for names in owners.values())
        exists = lambda name: bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone())
        if exists('auction_lots'):
            if not {'kind','asset_key','status'}.issubset({r[1] for r in db.execute('PRAGMA table_info(auction_lots)')}):
                raise ValueError('Несовместимая таблица auction_lots')
            for (key,) in db.execute("SELECT asset_key FROM auction_lots WHERE status='active' AND kind='business'"):
                counts['active_business_lots'] += 1
                if not isinstance(key, str) or not key.isascii() or not key.isdigit() or str(int(key)) != key or int(key) not in kiosks:
                    counts['invalid_business_lots'] += 1
                elif int(key) in owners:
                    counts['active_lots_also_owned'] += 1
        if exists('business_registry'):
            if not {'business_id','owner','stock'}.issubset({r[1] for r in db.execute('PRAGMA table_info(business_registry)')}):
                raise ValueError('Несовместимая таблица business_registry')
            for bid, owner, stock in db.execute('SELECT business_id,owner,stock FROM business_registry'):
                counts['registry_rows'] += 1
                if bid not in index or not _integer(stock, 0, 100) or (owner is not None and (not isinstance(owner, str) or not owner)):
                    counts['invalid_registry_rows'] += 1
                if isinstance(bid, str) and bid.startswith('kiosk:') and bid[6:].isascii() and bid[6:].isdigit() and int(bid[6:]) in owners:
                    counts['registry_rows_also_legacy_owned'] += 1
        keys = ('accounts','accounts_without_state','invalid_accounts','invalid_states','invalid_money',
                'legacy_records','invalid_kiosk_ids','duplicates_within_account','invalid_kiosk_income','future_timestamps',
                'distinct_owned_kiosks','conflicting_kiosks','stored_uncollected_income','estimated_uncollected_income',
                'possible_balance_overflows','active_business_lots','invalid_business_lots','active_lots_also_owned',
                'registry_rows','invalid_registry_rows','registry_rows_also_legacy_owned')
        return {'audit_time_ms': now_ms, 'catalogue_sha256': hashlib.sha256(catalogue_text.encode('utf-8')).hexdigest(), 'catalogue_businesses':len(index), 'catalogue_kiosks':len(kiosks),
                'counts':{key:counts[key] for key in keys}, 'migration_enabled':False}
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', help='Путь к резервной копии SQLite, не к работающей базе')
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.backup), ensure_ascii=False, indent=2))
        print('Только чтение. Даже при нулевых конфликтах перенос и серверные бизнесы ещё не включены.')
    except (OSError, sqlite3.Error, ValueError) as exc:
        raise SystemExit(f'Проверка отменена: {exc}')
