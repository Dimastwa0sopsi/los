'use strict';
// Disposable database only. The authorizer below stands in for future trusted
// server location and ownership enforcement; it is NOT a production check.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {createAccountStore}=require('../server/account-store.cjs');
const {createAuctionGatewayLab}=require('../server/auction-gateway-lab.cjs');
const {createShopPurchasesLab}=require('../server/shop-purchases-lab.cjs');
const cat=require('../server/shop-catalogue.json'), auctions=require('../server/auction-catalogue.json');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'los-shop-lab-')),file=path.join(tmp,'lab.db');
const req=n=>`request-${String(n).padStart(16,'0')}`, pass='secure-laboratory-password';
const gunShop=Object.entries(cat.shops).find(([,items])=>items.includes('pistol') && items.includes('ammo'))[0];
const fixture=new Map([['alice','kiosk:0'],['bob','kiosk:0'],['seller','kiosk:0']]);
const authorize=({actor,shopId})=>fixture.get(actor)===shopId; // no client coordinate/ownership input
const config={catalogue:cat,authorize};
let db,accounts,g;
function start(){db=new Database(file);accounts=createAccountStore(db);g=createAuctionGatewayLab(db,accounts,auctions,()=>{},config);}
function tx(actor,revision,id,payload){return g.execute(actor,revision,req(id),'shop_buy',payload,100);}
(async()=>{
 start();
 for(const name of ['seller','alice','bob']){
  assert((await accounts.register(name,pass)).ok);
  assert(accounts.save(name,{money:name==='seller'?1000:200000,vehicles:name==='seller'?[{uid:'car',type:'lada'}]:[],kiosks:[],properties:[],fridges:{},inventory:{},ammoBy:{p:2},documents:{passport:true,weapon:name==='alice'},health:100},0).ok);
 }
 const shop=createShopPurchasesLab(db,cat,authorize);
 assert.throws(()=>shop({actor:'alice',revision:1,payload:{shopId:'kiosk:0',item:'water',quantity:1}}),e=>e.code==='transaction_required');
 assert.throws(()=>createShopPurchasesLab(db,cat,null),TypeError);
 assert.equal(tx('alice',1,1,{shopId:'kiosk:0',item:'water',quantity:1,price:0}).error,'invalid_purchase');
 assert.equal(tx('alice',1,2,{shopId:'kiosk:0',item:'pistol',quantity:1}).error,'invalid_purchase');
 assert.equal(tx('alice',1,3,{shopId:gunShop,item:'pistol',quantity:1}).error,'not_authorized');
 assert.equal(tx('alice',1,4,{shopId:'kiosk:0',item:'water',quantity:0}).error,'invalid_purchase');
 assert.equal(tx('alice',1,5,{shopId:'kiosk:0',item:'water',quantity:999}).error,'invalid_purchase');
 assert.equal(tx('alice',1,6,{shopId:'kiosk:0',item:'__proto__',quantity:1}).error,'invalid_purchase');
 // Seller lists a car, Alice bids, and can still buy real shop items with the
 // remaining protected balance without overwriting her reserved bid.
 let r=g.execute('seller',1,req(7),'list',{kind:'vehicle',key:'car',price:50000},100);assert(r.ok);const lot=r.result.id;
 r=g.execute('alice',1,req(8),'bid',{id:lot,bid:50000},100);assert(r.ok);assert.equal(r.state.money,150000);
 const payload={shopId:'kiosk:0',item:'water',quantity:5};
 r=tx('alice',2,9,payload);assert(r.ok);assert.equal(r.result.cost,10);assert.equal(r.state.money,149990);assert.equal(r.state.inventory.water,5);
 let replay=tx('alice',2,9,payload);assert(replay.ok && replay.replay);assert.equal(replay.state.money,149990);
 assert.equal(tx('alice',2,9,{...payload,quantity:4}).error,'request_reused');
 assert.equal(tx('alice',2,10,payload).error,'conflict');
 const forged={...r.state,money:900000};assert.equal(g.save('alice',r.revision,req(11),forged).error,'protected_state');
 // Outbid refunds all, preserving the other purchase.
 r=g.execute('bob',1,req(12),'bid',{id:lot,bid:51000},100);assert(r.ok);
 let a=g.snapshot('alice');assert.equal(a.state.money,199990);assert.equal(a.state.inventory.water,5);
 fixture.set('alice',gunShop);fixture.set('bob',gunShop);
 assert.equal(tx('bob',2,13,{shopId:gunShop,item:'pistol',quantity:1}).error,'weapon_license_required');
 r=tx('alice',a.revision,14,{shopId:gunShop,item:'pistol',quantity:1});assert(r.ok);assert.equal(r.state.inventory.pistol,1);assert.equal(r.result.cost,cat.items.pistol.price);
 assert.equal(tx('alice',r.revision,15,{shopId:gunShop,item:'pistol',quantity:1}).error,'already_owned');
 r=tx('alice',r.revision,16,{shopId:gunShop,item:'ammo',quantity:2});assert(r.ok);assert.equal(r.state.ammoBy.p,62);assert.equal(r.state.inventory.ammo,undefined);
 const before=r.state.money;db.close();start();fixture.set('alice',gunShop);
 replay=tx('alice',r.revision-1,16,{shopId:gunShop,item:'ammo',quantity:2});assert(replay.ok && replay.replay);assert.equal(g.snapshot('alice').state.money,before);
 // Failed receipts must roll back the purchase and balance as one transaction.
 db.exec("CREATE TRIGGER reject_shop_receipt BEFORE INSERT ON economy_operation_receipts WHEN NEW.request_id='request-0000000000000017' BEGIN SELECT RAISE(ABORT, 'test'); END");
 const revision=g.snapshot('alice').revision;assert.equal(tx('alice',revision,17,{shopId:gunShop,item:'ammo',quantity:1}).error,'internal');
 assert.equal(g.snapshot('alice').state.money,before);assert.equal(g.snapshot('alice').state.ammoBy.p,62);
 db.close();fs.rmSync(tmp,{recursive:true,force:true});
 console.log('✓ защищённые покупки на стенде: каталог и право доступа, лицензия, патроны, ставка, возврат, повтор, рестарт и откат');
})().catch(e=>{console.error(e);try{db.close();}catch{}process.exitCode=1;});
