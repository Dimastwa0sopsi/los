import importlib.util
import sqlite3
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('prepare_database', Path(__file__).resolve().parents[1] / 'server/prepare_database.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / 'game.db'
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE accounts (login_key TEXT PRIMARY KEY, state_json TEXT)')
        db.execute('INSERT INTO accounts VALUES (?, ?)', ('player', '{"money":42}'))
    backup = mod.prepare(path)
    with sqlite3.connect(backup) as old, sqlite3.connect(path) as db:
        assert old.execute('SELECT state_json FROM accounts').fetchone()[0] == '{"money":42}'
        assert not old.execute("SELECT 1 FROM sqlite_master WHERE name='auction_lots'").fetchone()
        assert db.execute('SELECT state_json FROM accounts').fetchone()[0] == '{"money":42}'
        assert all(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (n,)).fetchone() for n in mod.TABLES)
        db.execute("INSERT INTO plate_registrations VALUES ('А123ВС77','player','car1',1)")
        try:
            db.execute("INSERT INTO plate_registrations VALUES ('А123ВС77','other','car2',1)")
            raise AssertionError('duplicate plate accepted')
        except sqlite3.IntegrityError:
            pass
    second = mod.prepare(path)
    assert backup != second and Path(second).is_file()
    wrong = Path(tmp) / 'wrong.db'
    with sqlite3.connect(wrong) as db:
        db.execute('CREATE TABLE accounts (login_key TEXT)')
        db.execute('CREATE TABLE auction_lots (id INTEGER)')
    try:
        mod.prepare(wrong)
        raise AssertionError('incompatible schema accepted')
    except RuntimeError:
        pass
    with sqlite3.connect(wrong) as db:
        assert not db.execute("SELECT 1 FROM sqlite_master WHERE name='auction_requests'").fetchone()
    try:
        mod.prepare(Path(tmp) / 'missing.db')
        raise AssertionError('missing file accepted')
    except FileNotFoundError:
        pass
print('✓ резервная копия, повторный запуск, сохранность аккаунтов, уникальность и откат несовместимой схемы')
