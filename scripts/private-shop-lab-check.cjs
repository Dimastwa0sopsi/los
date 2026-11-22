'use strict';
// Temporary test only: the trusted location callback is a fixture, not security.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {createAccountStore}=require('../server/account-store.cjs');
const {createAuctionGatewayLab}=require('../server/auction-gateway-lab.cjs');
const {createBusinessStore}=require('../server/business-store.cjs');
const catalog=require('../server/shop-catalogue.json'), auctionCatalog=require('../server/auction-catalogue.json');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'private-shop-')),file=path.join(dir,'test.db');
const req=n=>`private-request-${String(n).padStart(16,'0')}`,pass='test-strong-password';
let db,accounts,g,notices=[];
function start(){
 db=new Database(file);accounts=createAccountStore(db);
 createBusinessStore(db,{'kiosk:0':{price:100,items:{water:2}}});
 g=createAuctionGatewayLab(db,accounts,auctionCatalog,n=>notices.push(n),{catalogue:catalog,authorize:({shopId})=>shopId==='kiosk:0',options:{ownership:'registry'}});
}
function buy(actor,revision,id,quantity=1){return g.execute(actor,revision,req(id),'shop_buy',{shopId:'kiosk:0',item:'water',quantity},100);}
(async()=>{try{
 start();
 for(const name of ['owner','buyer','other']){
  assert((await accounts.register(name,pass)).ok);
  assert(accounts.save(name,{money:1000,inventory:{},vehicles:[],kiosks:[],properties:[],fridges:{}},0).ok);
 }
 db.prepare('INSERT INTO business_registry VALUES (?,?,?)').run('kiosk:0','owner',3);
 let r=buy('buyer',1,1,2);assert(r.ok);assert.equal(r.state.money,996);assert.equal(r.state.inventory.water,2);assert.equal(r.result.stock,1);
 assert.equal(g.snapshot('owner').state.money,1004);assert.deepEqual(notices.sort(),['buyer','owner']);
 assert.equal(buy('other',1,2,2).error,'out_of_stock');assert.equal(g.snapshot('other').state.money,1000);
 let replay=buy('buyer',1,1,2);assert(replay.ok&&replay.replay);assert.equal(g.snapshot('owner').state.money,1004);
 r=buy('owner',2,3);assert(r.ok);assert.equal(r.state.money,1004);assert.equal(r.result.stock,0);assert.equal(r.state.inventory.water,1);
 assert.equal(buy('other',1,4).error,'out_of_stock');
 db.close();start();assert.equal(db.prepare('SELECT stock FROM business_registry').get().stock,0);
 replay=buy('owner',2,3);assert(replay.ok&&replay.replay);assert.equal(g.snapshot('owner').state.money,1004);
 // A receipt failure rolls back both accounts and stock, not just the buyer.
 db.prepare('UPDATE business_registry SET stock=2').run();
 db.exec("CREATE TRIGGER deny_receipt BEFORE INSERT ON economy_operation_receipts WHEN NEW.request_id='private-request-0000000000000005' BEGIN SELECT RAISE(ABORT, 'test'); END");
 assert.equal(buy('buyer',2,5).error,'internal');assert.equal(g.snapshot('buyer').state.money,996);assert.equal(g.snapshot('owner').state.money,1004);assert.equal(db.prepare('SELECT stock FROM business_registry').get().stock,2);
 // Owner overflow must not debit buyer or consume inventory.
 const o=g.snapshot('owner');assert(accounts.save('owner',{...o.state,money:2147483647},o.revision,req(6)).ok);
 assert.equal(buy('buyer',2,7).error,'owner_money_limit');assert.equal(g.snapshot('buyer').state.money,996);assert.equal(db.prepare('SELECT stock FROM business_registry').get().stock,2);
 // Missing owner is not treated as a state-owned business.
 db.prepare('UPDATE business_registry SET owner=?').run('nonexistent');
 assert.equal(buy('buyer',2,8).error,'invalid_business_owner');assert.equal(db.prepare('SELECT stock FROM business_registry').get().stock,2);
 // State ownership has infinite stock and no private recipient.
 db.prepare('UPDATE business_registry SET owner=NULL,stock=0').run();
 r=buy('buyer',2,9,5);assert(r.ok);assert.equal(r.result.stock,null);assert.equal(r.state.money,986);
 console.log('✓ частный магазин на стенде: склад, выручка, повтор, рестарт, переполнение и атомарный откат');
 }finally{try{db?.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
