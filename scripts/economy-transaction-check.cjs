'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Database = require('better-sqlite3');
const {createAccountStore} = require('../server/account-store.cjs');
const {createEconomyTransactions} = require('../server/economy-transaction.cjs');
const {createAuctionStore} = require('../server/auction-store.cjs');
const {createPlateStore} = require('../server/plate-store.cjs');
const {createBusinessStore} = require('../server/business-store.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'economy-tx-')), file = path.join(temp,'game.db');
const req = i => `request-${String(i).padStart(16,'0')}`, pass = 'secure-password-123';
(async () => {
  let db = new Database(file), accounts = createAccountStore(db), tx = createEconomyTransactions(db);
  let auction = createAuctionStore(db), plates = createPlateStore(db, () => 'А111АА77');
  let business = createBusinessStore(db, {'kiosk:0':{price:10000,items:{water:100}}});
  for (const n of ['alice','bob']) {
    assert((await accounts.register(n,pass)).ok);
    assert(accounts.save(n,{money:100000,vehicles:n==='alice'?[{uid:'car',tuning:{}}]:[],kiosks:[],properties:[],fridges:{},inventory:{}},0).ok);
  }
  const runPlate = () => tx.execute('alice',1,req(1),'plate',{uid:'car'}, ({actor,revision,requestId,payload}) => plates.issue(actor,revision,payload.uid,requestId));
  const issued = runPlate(); assert(issued.ok); assert.equal(issued.state.money,95000); assert.equal(issued.state.vehicles[0].tuning.plate,'А111АА 77');
  assert.deepEqual(runPlate().state,issued.state); assert(runPlate().replay);
  assert.equal(tx.execute('alice',1,req(1),'plate',{uid:'other'},()=>{throw Error('must not execute');}).error,'request_reused');
  // Later changes must not turn a retry into a later unrelated snapshot.
  assert(accounts.save('alice',{...issued.state,money:94000},2,req(2)).ok);
  db.close(); db = new Database(file); accounts = createAccountStore(db); tx = createEconomyTransactions(db);
  auction = createAuctionStore(db); plates = createPlateStore(db); business = createBusinessStore(db, {'kiosk:0':{price:10000,items:{water:100}}});
  const replay = runPlate(); assert(replay.replay); assert.equal(replay.revision,2); assert.equal(replay.state.money,95000);
  let result = tx.execute('alice',3,req(3),'buy_business',{id:'kiosk:0'},({actor,revision,requestId,payload}) => business.purchaseBusiness(actor,revision,payload.id,requestId));
  assert(result.ok); assert.equal(result.state.money,84000); assert.equal(business.get('kiosk:0').owner,'alice');
  result = tx.execute('bob',1,req(4),'buy_item',{id:'kiosk:0',item:'water'},({actor,revision,requestId,payload}) => business.buyItem(actor,revision,payload.id,payload.item,1,requestId));
  assert(result.ok); assert.equal(result.state.money,99900); assert.equal(result.state.inventory.water,1);
  assert.equal((await accounts.login('alice',pass)).state.money,84100);
  result = tx.execute('alice',5,req(5),'auction_list',{uid:'car'},({actor,revision,requestId,payload}) => auction.list(actor,revision,'vehicle',payload.uid,1000,requestId,100));
  assert(result.ok); assert.equal(result.state.vehicles.length,0); assert.equal(auction.get(result.result.id).status,'active');
  // Receipt failures roll back not only the account, but also the business row.
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON economy_operation_receipts WHEN NEW.request_id='request-0000000000000006' BEGIN SELECT RAISE(ABORT, 'test'); END");
  const before = (await accounts.login('bob',pass));
  assert.throws(() => tx.execute('bob',before.revision,req(6),'buy_item',{id:'kiosk:0'},({actor,revision,requestId,payload})=>business.buyItem(actor,revision,payload.id,'water',1,requestId)));
  assert.deepEqual((await accounts.login('bob',pass)).state,before.state); assert.equal(business.get('kiosk:0').stock,99);
  assert.equal(tx.execute('bob',999,req(7),'buy_item',{},()=>{throw Error('must not run');}).error,'conflict');
  assert.throws(()=>tx.execute('bob',before.revision,req(8),'broken',{},()=>({ok:true})),/handler_did_not_update_actor/);
  // Once history is pruned, an old receipt is explicitly marked committed,
  // not silently re-applied or replaced with a newer balance.
  let alice = await accounts.login('alice',pass);
  for (let i=0;i<10;i++) { assert(accounts.save('alice',{...alice.state,money:alice.state.money+i},alice.revision,req(100+i)).ok); alice = await accounts.login('alice',pass); }
  const expired = runPlate(); assert.equal(expired.error,'receipt_expired'); assert.equal(expired.committed,true); assert.equal(expired.revision,2);
  db.close(); fs.rmSync(temp,{recursive:true,force:true});
  console.log('✓ экспериментальный протокол: бизнес, покупка, аукцион, номера, повторы, рестарт, откат и истечение снимка');
})().catch(e=>{console.error(e);process.exitCode=1;});
