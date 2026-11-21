import importlib.util, json, sqlite3, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit_plates',root/'server/audit_plate_readiness.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
assert m.canonical_plate('a123bc 77')=='А123ВС77'
assert m.canonical_plate('А123ВС77')=='А123ВС77'
assert m.canonical_plate('A123ZC77') is None
with tempfile.TemporaryDirectory() as tmp:
    p=Path(tmp)/'backup.db'; db=sqlite3.connect(p)
    db.executescript('''CREATE TABLE accounts(login_key TEXT,state_json TEXT);
      CREATE TABLE auction_lots(seller TEXT,kind TEXT,status TEXT,asset_json TEXT);
      CREATE TABLE plate_registrations(number TEXT,account_key TEXT,vehicle_uid TEXT);''')
    car=lambda uid,plate:{'uid':uid,'tuning':{'plate':plate}}
    for name,vehicles in [('secret-alice',[car('a','А123ВС 77'),car('b','Х999ХХ99')]),('secret-bob',[car('c','A123BC77'),car('d','broken'),car('e','')])]:
        db.execute('INSERT INTO accounts VALUES (?,?)',(name,json.dumps({'vehicles':vehicles})))
    db.execute('INSERT INTO accounts VALUES (?,?)',('bad','{"vehicles":[],"vehicles":[]}'))
    db.execute('INSERT INTO accounts VALUES (?,?)',('empty',None))
    db.execute('INSERT INTO auction_lots VALUES (?,?,?,?)',('secret-alice','vehicle','active',json.dumps({'item':car('a','А123ВС77')})))
    db.execute('INSERT INTO auction_lots VALUES (?,?,?,?)',('secret-bob','vehicle','active','bad-json'))
    db.execute('INSERT INTO plate_registrations VALUES (?,?,?)',('А123ВС77','secret-alice','a'))
    db.execute('INSERT INTO plate_registrations VALUES (?,?,?)',('A123BC 77','secret-bob','c'))
    db.execute('INSERT INTO plate_registrations VALUES (?,?,?)',('К111КК77','secret-bob','gone'))
    db.commit(); before=list(db.iterdump()); db.close()
    r=m.audit(p); c=r['counts']
    assert c['accounts']==4 and c['accounts_without_state']==1 and c['invalid_states']==1
    assert c['vehicles_checked']==6 and c['vehicles_without_number']==1 and c['invalid_numbers']==1
    assert c['duplicate_numbers']==1 and c['duplicate_numbers_cross_account']==1 and c['numbers_in_escrow_and_account']==1
    assert c['registry_rows']==3 and c['duplicate_registry_numbers']==1 and c['registry_without_matching_vehicle']==1
    assert c['numbers_without_registry']==1 and c['invalid_vehicle_lots']==1
    assert 'secret-' not in json.dumps(r) and '123' not in json.dumps(r)
    db=sqlite3.connect(p); assert list(db.iterdump())==before; db.close()
    try: m.audit(Path(tmp)/'absent.db'); raise AssertionError('missing accepted')
    except FileNotFoundError: assert not (Path(tmp)/'absent.db').exists()
print('✓ аудит номеров: коллизии, похожие буквы, эскроу, реестр, повреждения, приватность и только чтение')
