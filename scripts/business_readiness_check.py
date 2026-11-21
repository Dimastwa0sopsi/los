import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit_business', root / 'server/audit_business_readiness.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
manifest = json.loads((root / 'server/business-catalogue.json').read_text())
kiosks = [x for x in manifest['businesses'] if x['kind'] == 'kiosk']
assert len(kiosks) >= 2
k0, k1 = (int(kiosks[i]['id'].split(':')[1]) for i in range(2))
now = 2_000_000
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / 'backup.db'
    db = sqlite3.connect(path)
    db.executescript('''CREATE TABLE accounts(login_key TEXT, state_json TEXT, revision INTEGER);
    CREATE TABLE auction_lots(kind TEXT, asset_key TEXT, status TEXT);
    CREATE TABLE business_registry(business_id TEXT, owner TEXT, stock INTEGER);''')
    def add(name, money, records):
        db.execute('INSERT INTO accounts VALUES (?,?,?)', (name, json.dumps({'money':money,'kiosks':records}), 1))
    add('private-alice', 1000, [{'id':k0,'acc':10,'last':now-120000}, {'id':k1,'acc':20,'last':now,'closed':True}])
    add('private-bob', 2_147_483_647, [{'id':k0,'acc':4,'last':now}, {'id':k0,'acc':4,'last':now}])
    add('bad-records', 0, [{'id':999999,'acc':0,'last':now}, {'id':k1,'acc':-1,'last':now}, {'id':k1,'acc':0,'last':now+1}])
    db.execute('INSERT INTO accounts VALUES (?,?,?)', ('broken', '{"kiosks":[],"kiosks":[]}', 0))
    db.execute('INSERT INTO accounts VALUES (?,?,?)', ('fresh', None, 0))
    db.execute('INSERT INTO auction_lots VALUES (?,?,?)', ('business',str(k0),'active'))
    db.execute('INSERT INTO auction_lots VALUES (?,?,?)', ('business','999999','active'))
    db.execute('INSERT INTO auction_lots VALUES (?,?,?)', ('business',str(k1),'sold'))
    db.execute('INSERT INTO business_registry VALUES (?,?,?)', (f'kiosk:{k0}','private-alice',100))
    db.execute('INSERT INTO business_registry VALUES (?,?,?)', ('unknown:9','private-bob',101))
    db.commit()
    before = list(db.iterdump()); db.close()
    report = audit.audit(path, now_ms=now)
    c = report['counts']
    assert c['accounts']==5 and c['accounts_without_state']==1 and c['invalid_states']==1
    assert c['legacy_records']==7 and c['invalid_kiosk_ids']==1 and c['invalid_kiosk_income']==1
    assert c['duplicates_within_account']==2 and c['conflicting_kiosks']==2
    assert c['stored_uncollected_income']==38
    assert c['estimated_uncollected_income']==38 + 2*kiosks[0]['legacyIncome']
    assert c['possible_balance_overflows']==1 and c['future_timestamps']==1
    assert c['active_business_lots']==2 and c['active_lots_also_owned']==1 and c['invalid_business_lots']==1
    assert c['registry_rows']==2 and c['invalid_registry_rows']==1 and c['registry_rows_also_legacy_owned']==1
    assert report['migration_enabled'] is False and 'private-' not in json.dumps(report)
    db = sqlite3.connect(path); assert list(db.iterdump()) == before; db.close()
    try:
        audit.audit(Path(tmp) / 'missing.db')
        raise AssertionError('missing file accepted')
    except FileNotFoundError:
        assert not (Path(tmp) / 'missing.db').exists()
    badcat = Path(tmp) / 'bad.json'; badcat.write_text('{"schema":1,"businesses":[]}')
    try:
        audit.audit(path,badcat)
        raise AssertionError('invalid catalogue accepted')
    except ValueError: pass
print('✓ аудит бизнеса: конфликты, доход, лоты, реестр, повреждения, переполнение, приватность и только чтение')
