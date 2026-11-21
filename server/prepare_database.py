"""Подготовка будущих таблиц без изменения аккаунтов; НЕ включает функции игры.

Перед применением остановите игровой сервер. Используется SQLite backup, затем
только создание отсутствующих таблиц и индексов одной транзакцией.
"""
import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

TABLES = {
    'auction_lots': '''CREATE TABLE IF NOT EXISTS auction_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, seller TEXT NOT NULL, kind TEXT NOT NULL,
        asset_key TEXT NOT NULL, asset_json TEXT NOT NULL, start_price INTEGER NOT NULL,
        step INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL,
        bidder TEXT, bid INTEGER, finished_at INTEGER)''',
    'auction_requests': '''CREATE TABLE IF NOT EXISTS auction_requests (
        actor TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
        PRIMARY KEY(actor,request_id))''',
    'plate_requests': '''CREATE TABLE IF NOT EXISTS plate_requests (
        account_key TEXT NOT NULL, request_id TEXT NOT NULL, vehicle_uid TEXT NOT NULL,
        number TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(account_key,request_id))''',
    'plate_registrations': '''CREATE TABLE IF NOT EXISTS plate_registrations (
        number TEXT PRIMARY KEY, account_key TEXT NOT NULL, vehicle_uid TEXT NOT NULL,
        issued_at INTEGER NOT NULL, UNIQUE(account_key, vehicle_uid))''',
}
EXPECTED = {
    'auction_lots': {'id', 'seller', 'kind', 'asset_key', 'asset_json', 'start_price', 'step', 'ends_at', 'status', 'bidder', 'bid', 'finished_at'},
    'auction_requests': {'actor', 'request_id', 'payload', 'result'},
    'plate_registrations': {'number', 'account_key', 'vehicle_uid', 'issued_at'},
    'plate_requests': {'account_key', 'request_id', 'vehicle_uid', 'number', 'revision'},
}
INDEXES = (
    "CREATE UNIQUE INDEX IF NOT EXISTS auction_active_asset ON auction_lots(kind,asset_key) WHERE status='active'",
    "CREATE UNIQUE INDEX IF NOT EXISTS auction_active_home ON auction_lots(asset_key) WHERE status='active' AND kind IN ('apartment','house')",
)

def prepare(path):
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f'База не найдена: {source}; новая база не создавалась')
    db = sqlite3.connect(f'{source.as_uri()}?mode=rw', uri=True, timeout=30)
    backup = None
    try:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Проверка целостности базы не пройдена')
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").fetchone():
            raise RuntimeError('Таблица accounts не найдена: проверьте путь к базе')
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = source.with_name(f'{source.stem}-before-rp-{stamp}.db')
        # O_EXCL не позволит перезаписать ранее сделанную копию.
        fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        with sqlite3.connect(backup) as target:
            db.backup(target)
            if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Проверка резервной копии не пройдена')
        db.execute('BEGIN IMMEDIATE')
        for name, statement in TABLES.items():
            db.execute(statement)
            columns = {r[1] for r in db.execute(f'PRAGMA table_info({name})')}
            if not EXPECTED[name].issubset(columns):
                raise RuntimeError(f'Несовместимая таблица {name}: {sorted(EXPECTED[name] - columns)}')
        for statement in INDEXES:
            db.execute(statement)
        db.commit()
        return str(backup)
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default='/content/drive/MyDrive/los-gorod/data/game.db')
    args = parser.parse_args()
    try:
        saved = prepare(args.db)
        print('Резервная копия:', saved)
        print('Таблицы подготовлены. Аукцион и регистрация номеров ещё не включены.')
    except Exception as e:
        raise SystemExit(f'Подготовка отменена: {e}')
