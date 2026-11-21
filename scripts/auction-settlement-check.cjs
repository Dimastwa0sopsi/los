'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Database = require('better-sqlite3');
const { createAccountStore } = require('../server/account-store.cjs');
const { createAuctionStore, DURATION } = require('../server/auction-store.cjs');
const { createSettlementRunner } = require('../server/auction-settlement.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-settle-'));
const file = path.join(dir, 'test.db'), pass = 'password-for-test';
(async () => {
  let db = new Database(file), accounts = createAccountStore(db), auction = createAuctionStore(db, {authorizeListing: () => {}});
  for (const name of ['seller', 'buyer']) {
    await accounts.register(name, pass);
    assert(accounts.save(name, { money: name === 'buyer' ? 20000 : 0, vehicles: name === 'seller' ? [{uid:'one'}, {uid:'two'}, {uid:'three'}] : [], kiosks:[], properties:[], fridges:{} }, 0).ok);
  }
  const req = i => `request-${String(i).padStart(16,'0')}`;
  const first = auction.list('seller',1,'vehicle','one',1000,req(1),100);
  const second = auction.list('seller',2,'vehicle','two',1000,req(2),100);
  const third = auction.list('seller',3,'vehicle','three',1000,req(3),100);
  auction.bid('buyer',1,first.id,1000,req(4),100);
  // Simulate a bad lot without touching the other two.
  const original = db.prepare('SELECT asset_json FROM auction_lots WHERE id=?').get(first.id).asset_json;
  db.prepare('UPDATE auction_lots SET asset_json=? WHERE id=?').run('{broken',first.id);
  let runner = createSettlementRunner(db,auction);
  assert.deepEqual(runner.runBatch({now:100+DURATION-1}).settled,[]);
  let batch = runner.runBatch({now:100+DURATION,limit:2});
  assert.deepEqual(batch.failed,[{id:first.id,error:'internal'}]);
  assert.deepEqual(batch.settled,[second.id]); assert.equal(batch.nextAfterId,second.id);
  // A failure on the first lot cannot block later lots, even across restart.
  db.close(); db = new Database(file); accounts = createAccountStore(db); auction = createAuctionStore(db, {authorizeListing: () => {}}); runner = createSettlementRunner(db,auction);
  batch = runner.runBatch({now:100+DURATION,afterId:second.id,limit:2});
  assert.deepEqual(batch.settled,[third.id]); assert.equal(batch.nextAfterId,0);
  let seller = (await accounts.login('seller',pass)).state, buyer = (await accounts.login('buyer',pass)).state;
  assert.equal(seller.money,0); assert.equal(buyer.money,19000); assert.equal(seller.vehicles.length,2); assert.equal(buyer.vehicles.length,0);
  db.prepare('UPDATE auction_lots SET asset_json=? WHERE id=?').run(original,first.id);
  batch = runner.runBatch({now:100+DURATION,limit:2}); assert.deepEqual(batch.settled,[first.id]);
  assert.deepEqual(runner.runBatch({now:100+DURATION}).settled,[]);
  seller = (await accounts.login('seller',pass)).state; buyer = (await accounts.login('buyer',pass)).state;
  assert.equal(seller.money+buyer.money,20000); assert.equal(seller.money,1000);
  assert.deepEqual(buyer.vehicles.map(v=>v.uid),['one']); assert.equal(seller.vehicles.length,2);
  assert.throws(()=>runner.runBatch({limit:101}),RangeError);
  db.close(); fs.rmSync(dir,{recursive:true,force:true});
  console.log('✓ экспериментальный обработчик: таймер, сбой лота, порции, перезапуск, повтор и сохранность денег');
})().catch(e => {console.error(e);process.exitCode=1;});
