'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {createAccountStore} = require('../server/account-store.cjs');
const {createAuctionStore} = require('../server/auction-store.cjs');
const {createAuctionSave} = require('../server/auction-save.cjs');
(async () => {
  const db = new Database(':memory:'), accounts = createAccountStore(db), auction = createAuctionStore(db), saver = createAuctionSave(db, accounts);
  const pass = 'password-is-secure', req = n => `request-${String(n).padStart(16,'0')}`;
  const state = n => ({money:200000, vehicles:n === 'seller' ? [{uid:'car',fuel:100}] : [], kiosks:[], properties:[], fridges:{}, food:80});
  for (const n of ['seller','alice','bob']) { await accounts.register(n,pass); assert(accounts.save(n,state(n),0).ok); }
  const lot = auction.list('seller',1,'vehicle','car',50000,req(1),100);
  const oldSeller = state('seller'); oldSeller.food=70;
  const sellerSave = saver.save('seller',oldSeller,1,req(2));
  assert(sellerSave.ok); assert.deepEqual(sellerSave.state.vehicles,[]); assert.equal(sellerSave.state.food,70);
  auction.bid('alice',1,lot.id,50000,req(3),100);
  const alice = state('alice'); alice.money -= 5000;
  const saved = saver.save('alice',alice,1,req(4)); assert(saved.ok); assert.equal(saved.state.money,145000);
  assert.equal(saver.save('alice',alice,1,req(4)).replay,true);
  assert.equal(saver.save('alice',{...alice,money:1},1,req(4)).error,'request_reused');
  auction.bid('bob',1,lot.id,51000,req(5),100);
  const replayAfterRefund = saver.save('alice',alice,1,req(4));
  assert(replayAfterRefund.replay && replayAfterRefund.state.money === 195000);
  const pending = structuredClone(saved.state); pending.food=50; pending.money-=1000;
  const refunded = saver.save('alice',pending,saved.revision,req(6));
  assert(refunded.ok); assert.equal(refunded.state.money,194000); assert.equal(refunded.state.food,50);
  // Нельзя молча переписать автомобиль, проданный/переданный сервером.
  const changing = state('seller'); changing.vehicles[0].fuel=20;
  const before = (await accounts.login('seller',pass)).revision;
  const conflict = saver.save('seller',changing,1,req(7));
  assert.equal(conflict.error,'conflict'); assert(conflict.conflicts.includes('vehicles:car'));
  assert.equal((await accounts.login('seller',pass)).revision,before);
  db.close(); console.log('✓ сохранения вокруг эскроу, ставок и возврата объединяются или явно отклоняются');
})().catch(e => {console.error(e);process.exitCode=1;});
