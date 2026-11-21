'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Database = require('better-sqlite3');
const {createAccountStore} = require('../server/account-store.cjs');
const {createBusinessStore,LEASE_MS} = require('../server/business-store.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'los-business-')), file = path.join(dir,'game.db');
const catalog = {'kiosk:0':{price:100000,items:{water:75,bread:100}},'building:2':{price:200000,items:{water:75}}};
const req = n => `request-${String(n).padStart(16,'0')}`, pass = 'password-for-testing';
(async () => {
  let db = new Database(file), accounts = createAccountStore(db), biz = createBusinessStore(db,catalog);
  for (const name of ['owner','buyer','driver','other']) {
    assert((await accounts.register(name,pass)).ok);
    assert(accounts.save(name,{money:500000,inventory:{}},0).ok);
  }
  const snapshot = async n => await accounts.login(n,pass);
  const fails = (fn,code) => assert.throws(fn,e=>e.code===code);
  assert.deepEqual(biz.get('kiosk:0'),{id:'kiosk:0',owner:null,stock:100});
  // Purchases at an unowned shop go to the state, and its stock survives acquisition.
  const gov = biz.buyItem('other',1,'building:2','water',2,req(20));
  assert.equal(gov.stock,98); assert.equal((await snapshot('other')).state.money,499850);
  const acquired = biz.purchaseBusiness('other',2,'building:2',req(21));
  assert.equal(acquired.stock,98); assert.equal(biz.get('building:2').owner,'other');
  const own = biz.purchaseBusiness('owner',1,'kiosk:0',req(1));
  assert.equal(own.stock,100); assert.deepEqual(biz.purchaseBusiness('owner',1,'kiosk:0',req(1)),own);
  fails(()=>biz.purchaseBusiness('other',3,'kiosk:0',req(2)),'owned');
  fails(()=>biz.purchaseBusiness('other',3,'building:999',req(2)),'invalid_business');
  const sale = biz.buyItem('buyer',1,'kiosk:0','water',5,req(3));
  assert.equal(sale.stock,95); assert.deepEqual(biz.buyItem('buyer',1,'kiosk:0','water',5,req(3)),sale);
  fails(()=>biz.buyItem('buyer',2,'kiosk:0','water',6,req(3)),'request_reused');
  assert.equal((await snapshot('buyer')).state.money,499625);
  assert.equal((await snapshot('buyer')).state.inventory.water,5);
  assert.equal((await snapshot('owner')).state.money,400375);
  fails(()=>biz.order('buyer',2,'kiosk:0',5,req(4),100),'not_owner');
  fails(()=>biz.order('owner',3,'kiosk:0',6,req(4),100),'capacity');
  const order = biz.order('owner',3,'kiosk:0',5,req(4),100);
  assert.equal(order.cost,6000); assert.equal((await snapshot('owner')).state.money,394375);
  fails(()=>biz.order('owner',4,'kiosk:0',1,req(5),100),'order_exists');
  const claim = biz.claim('driver',order.id,req(6),100);
  assert.equal(biz.openOrders(100).length,0);
  fails(()=>biz.claim('other',order.id,req(7),101),'unavailable');
  fails(()=>biz.cancel('owner',4,order.id,req(8),101),'unavailable');
  fails(()=>biz.complete('other',1,order.id,claim.token,req(9),101),'unavailable');
  fails(()=>biz.complete('driver',1,order.id,claim.token,req(9),100+LEASE_MS),'unavailable');
  // Persistence and reclaim with a fresh token after a driver disconnects.
  db.close(); db = new Database(file); accounts=createAccountStore(db); biz=createBusinessStore(db,catalog);
  assert.equal(biz.openOrders(100+LEASE_MS).length,1);
  const second = biz.claim('other',order.id,req(10),100+LEASE_MS);
  assert.notEqual(second.token,claim.token);
  fails(()=>biz.complete('driver',1,order.id,claim.token,req(11),101+LEASE_MS),'unavailable');
  const delivered = biz.complete('other',3,order.id,second.token,req(12),101+LEASE_MS);
  assert.equal(delivered.stock,100); assert.equal(delivered.fee,1000);
  assert.deepEqual(biz.complete('other',3,order.id,second.token,req(12),101+LEASE_MS),delivered);
  assert.equal((await snapshot('other')).state.money,300850);
  assert.equal(biz.openOrders(102+LEASE_MS).length,0);
  // Self-purchase still consumes stock but returns sale proceeds to the owner.
  const before = await snapshot('owner');
  biz.buyItem('owner',before.revision,'kiosk:0','bread',1,req(13));
  const after = await snapshot('owner'); assert.equal(after.state.money,before.state.money); assert.equal(after.state.inventory.bread,1);
  const refundOrder = biz.order('owner',after.revision,'kiosk:0',1,req(14),2000000);
  const cancel = biz.cancel('owner',refundOrder.revision,refundOrder.id,req(15),2000001);
  assert.equal(cancel.refund,2000); assert.equal((await snapshot('owner')).state.money,after.state.money);
  fails(()=>biz.complete('other',2,order.id,second.token,req(16),101+LEASE_MS),'unavailable');
  // Failure writing owner history must roll back stock, balances, and buyer inventory.
  db.exec("CREATE TRIGGER fail_business_history BEFORE INSERT ON account_revisions WHEN NEW.login_key='owner' AND NEW.revision=7 BEGIN SELECT RAISE(ABORT,'test'); END");
  const ownerBefore = await snapshot('owner'), buyerBefore = await snapshot('buyer'), stock = biz.get('kiosk:0').stock;
  // Trigger the exact next history insertion even if revision numbering changes.
  db.exec('DROP TRIGGER fail_business_history');
  db.exec(`CREATE TRIGGER fail_business_history BEFORE INSERT ON account_revisions WHEN NEW.login_key='owner' AND NEW.revision=${ownerBefore.revision+1} BEGIN SELECT RAISE(ABORT,'test'); END`);
  assert.throws(()=>biz.buyItem('buyer',buyerBefore.revision,'kiosk:0','water',1,req(17)));
  assert.deepEqual((await snapshot('owner')).state,ownerBefore.state);
  assert.deepEqual((await snapshot('buyer')).state,buyerBefore.state); assert.equal(biz.get('kiosk:0').stock,stock);
  db.close(); fs.rmSync(dir,{recursive:true,force:true});
  console.log('✓ экспериментальный бизнес: владение, склад, покупки, выручка, заказ, доставка, повтор, возврат и рестарт');
})().catch(e=>{console.error(e);process.exitCode=1;});
