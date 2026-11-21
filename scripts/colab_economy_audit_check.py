import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('colab_economy_audit',root/'server/colab_economy_audit.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temp:
    d=Path(temp); source=d/'game.db'
    db=sqlite3.connect(source); db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE accounts(login_key TEXT,state_json TEXT,revision INTEGER)')
    state={'money':20000,'kiosks':[],'vehicles':[],'properties':[]}
    db.execute('INSERT INTO accounts VALUES (?,?,?)',('private-player',json.dumps(state),1)); db.commit()
    before=db.execute('SELECT * FROM accounts').fetchall()
    one=m.create_backup(source,d); two=m.create_backup(source,d)
    assert one != two and one.exists() and two.exists()
    copy=sqlite3.connect(one); assert copy.execute('SELECT * FROM accounts').fetchall()==before; copy.close()
    reports=m.audit_backup(one,root/'server')
    assert reports['business']['counts']['accounts']==1
    assert reports['auction']['accounts']==1 and reports['plates']['counts']['accounts']==1
    assert 'private-player' not in json.dumps(reports)
    assert db.execute('SELECT * FROM accounts').fetchall()==before
    try: m.create_backup(d/'missing.db',d); raise AssertionError('missing database created')
    except FileNotFoundError: assert not (d/'missing.db').exists()
    try: m.create_backup(source,d/'missing-folder'); raise AssertionError('missing directory created')
    except FileNotFoundError: assert not (d/'missing-folder').exists()
    try: m.download_auditors(d,'../../invalid'); raise AssertionError('invalid ref accepted')
    except ValueError: pass
    db.close()
print('✓ Colab-аудит: SQLite backup с WAL, отдельные копии, проверки и неизменённый оригинал')
