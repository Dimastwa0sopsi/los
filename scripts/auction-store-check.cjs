'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const Database = require('better-sqlite3');
const { createAccountStore } = require('../server/account-store.cjs');
const { createAuctionStore, DURATION } = require('../server/auction-store.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-auction-')); const file = path.join(dir, 'db.sqlite');
const key = n => `request-${String(n).padStart(16,'0')}`;
(async () => {
  let db = new Database(file), accounts = createAccountStore(db), auction = createAuctionStore(db);
  for (const name of ['seller','alice','bob']) {
    assert((await accounts.register(name, 'пароль для теста')).ok);
    const state = { money: name === 'seller' ? 0 : 500000, vehicles: name === 'seller' ? [{ uid:'car1', type:'lada', pos:{x:1,z:1} }] : [],
      kiosks: name === 'seller' ? [{id:7,last:10,acc:30}] : [], properties: name === 'seller' ? ['10:0', '11:2'] : [], fridges: name === 'seller' ? {'10:0':{water:2}} : {} };
    assert(accounts.save(name, state, 0).ok);
  }
  const snap = async n => (await accounts.login(n, 'пароль для теста'));
  const fail = (f, code) => assert.throws(f, e => e.code === code);
  const time = 1000000;
  const lot = auction.list('seller', 1, 'business', '7', 100000, key(1), time);
  assert.equal(lot.endsAt, time + DURATION);
  assert.deepEqual(auction.list('seller', 1, 'business', '7', 100000, key(1), time), lot);
  fail(() => auction.list('seller', 2, 'business', '7', 100001, key(1), time), 'request_reused');
  assert.equal((await snap('seller')).state.kiosks.length, 0);
  auction.bid('alice', 1, lot.id, 100000, key(2), time);
  fail(() => auction.bid('bob', 1, lot.id, 109999, key(3), time), 'bid_too_low');
  fail(() => auction.bid('bob', 0, lot.id, 110000, key(3), time), 'conflict');
  auction.bid('bob', 1, lot.id, 110000, key(3), time);
  assert.equal((await snap('alice')).state.money, 500000);
  assert.equal((await snap('bob')).state.money, 390000);
  fail(() => auction.bid('alice', 3, lot.id, 120000, key(4), time + DURATION), 'closed');
  assert.equal(auction.finish(lot.id, time + DURATION - 1), false);
  db.close(); db = new Database(file); accounts = createAccountStore(db); auction = createAuctionStore(db);
  assert.deepEqual(auction.due(time + DURATION), [lot.id]);
  assert(auction.finish(lot.id, time + DURATION)); assert(!auction.finish(lot.id, time + DURATION));
  assert.equal((await snap('seller')).state.money, 110000);
  assert.equal((await snap('bob')).state.kiosks[0].id, 7);
  for (const [i, kind, asset] of [[5,'vehicle','car1'],[6,'house','10:0'],[7,'apartment','11:2']]) {
    const s = await snap('seller'); const l = auction.list('seller', s.revision, kind, asset, 1000, key(i), time);
    assert(auction.finish(l.id, time + DURATION));
  }
  const end = (await snap('seller')).state;
  assert.equal(end.vehicles[0].uid, 'car1'); assert.deepEqual(end.fridges['10:0'], {water:2}); assert(end.properties.includes('11:2'));
  // Продажа машины и жилья, а не только возврат несостоявшихся лотов.
  for (const [i, kind, asset] of [[8,'vehicle','car1'],[10,'house','10:0'],[12,'apartment','11:2']]) {
    const s = await snap('seller'), a = await snap('alice');
    const l = auction.list('seller', s.revision, kind, asset, 1000, key(i), time);
    auction.bid('alice', a.revision, l.id, 1000, key(i+1), time);
    assert(auction.finish(l.id, time + DURATION));
  }
  const buyer = (await snap('alice')).state;
  assert.equal(buyer.vehicles[0].uid, 'car1'); assert.equal(buyer.vehicles[0].pos, null);
  assert(buyer.properties.includes('10:0') && buyer.properties.includes('11:2'));
  assert.deepEqual(buyer.fridges['10:0'], {water:2});
  // При переполнении баланса продавца сделка полностью откатывается.
  const s = await snap('seller'); s.state.money = 2147483647;
  assert(accounts.save('seller', s.state, s.revision).ok);
  const a = await snap('alice');
  const overflow = auction.list('alice', a.revision, 'vehicle', 'car1', 1000, key(20), time);
  const b = await snap('bob'); auction.bid('bob', b.revision, overflow.id, 1000, key(21), time);
  // Баланс alice здесь не переполнен, поэтому поднимем его после выставления.
  const a2 = await snap('alice'); a2.state.money = 2147483647;
  assert(accounts.save('alice', a2.state, a2.revision).ok);
  fail(() => auction.finish(overflow.id, time + DURATION), 'money_limit');
  assert.equal(auction.get(overflow.id).status, 'active');
  assert(!(await snap('bob')).state.vehicles.some(v => v.uid === 'car1'));
  db.close(); fs.rmSync(dir,{recursive:true,force:true});
  console.log('✓ ставки, шаг, возврат, эскроу, повторы, конфликт, таймер, рестарт и возврат имущества');
})().catch(e => { console.error(e); process.exitCode = 1; });
