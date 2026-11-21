'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAccountStore } = require('../server/account-store.cjs');
const { createPlateStore } = require('../server/plate-store.cjs');
(async () => {
  const db = new Database(':memory:'), accounts = createAccountStore(db);
  for (const n of ['alice', 'bob', 'poor']) {
    await accounts.register(n, 'длинный пароль');
    accounts.save(n, { money:n === 'poor' ? 4999 : 20000, vehicles:[{uid:n, tuning:{}}] }, 0);
  }
  let samples = ['А111АА77','А111АА77','В222ВВ77','К333КК77'];
  const plates = createPlateStore(db, () => samples.shift());
  const key = i => `request-${String(i).padStart(16,'0')}`;
  const a = plates.issue('alice', 1, 'alice', key(1));
  assert.equal(a.number, 'А111АА77');
  assert.equal(plates.issue('alice', 1, 'alice', key(1)).replay, true);
  const b = plates.issue('bob', 1, 'bob', key(2));
  assert.equal(b.number, 'В222ВВ77');
  assert.equal((await accounts.login('alice','длинный пароль')).state.money, 15000);
  assert.equal((await accounts.login('bob','длинный пароль')).state.vehicles[0].tuning.plate, 'В222ВВ77');
  assert.throws(() => plates.issue('poor', 1, 'poor', key(3)), e => e.code === 'insufficient_funds');
  assert.throws(() => plates.issue('alice', 1, 'alice', key(4)), e => e.code === 'conflict');
  const changed = plates.issue('alice', 2, 'alice', key(4));
  assert.equal(changed.number, 'К333КК77'); assert(!plates.get(a.number));
  assert.equal((await accounts.login('alice','длинный пароль')).state.money, 10000);
  db.close(); console.log('✓ уникальная выдача, $5000, повтор без списания, коллизия, замена, конфликт сохранения');
})().catch(e => { console.error(e); process.exitCode=1; });
