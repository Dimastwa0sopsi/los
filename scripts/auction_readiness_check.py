import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parents[1] / 'server/audit_auction_readiness.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / 'backup.db'
    db = sqlite3.connect(path)
    db.executescript('CREATE TABLE accounts(login_key TEXT, state_json TEXT); CREATE TABLE auction_lots(kind TEXT, asset_key TEXT, status TEXT);')
    state = {'vehicles':[{'uid':'car'}], 'kiosks':[{'id':7}], 'properties':['1:0']}
    for name in ('private-alice','private-bob'):
        db.execute('INSERT INTO accounts VALUES (?,?)', (name, json.dumps(state)))
    db.execute('INSERT INTO accounts VALUES (?,?)', ('broken','not-json'))
    db.execute('INSERT INTO accounts VALUES (?,?)', ('new',None))
    db.execute("INSERT INTO auction_lots VALUES ('house','1:0','active')")
    db.execute("INSERT INTO auction_lots VALUES ('vehicle','car','sold')")
    db.commit()
    before = db.execute('SELECT * FROM accounts').fetchall()
    db.close()
    result = module.audit(path)
    assert result['accounts'] == 4
    assert result['invalid_states'] == 1 and result['accounts_without_state'] == 1
    assert result['duplicate_home_ids_across_accounts'] == 1
    assert result['duplicate_business_ids_across_accounts'] == 1
    assert result['duplicate_vehicle_ids_across_accounts'] == 1
    assert result['active_lots'] == 1 and result['active_lots_also_in_account'] == 1
    assert 'private-alice' not in json.dumps(result)
    db = sqlite3.connect(path)
    assert db.execute('SELECT * FROM accounts').fetchall() == before
    db.close()
    try:
        module.audit(Path(tmp) / 'missing.db')
        raise AssertionError('missing file accepted')
    except FileNotFoundError:
        assert not (Path(tmp) / 'missing.db').exists()
print('✓ проверка копии базы: дубли, эскроу, некорректные данные, только чтение и приватность')
