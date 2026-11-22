'use strict';
// Temporary SQLite database only; no network authorization or live migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {createAccountStore}=require('../server/account-store.cjs');
const {createBusinessStore}=require('../server/business-store.cjs');
const {createAuctionStore,DURATION}=require('../server/auction-store.cjs');
const {createBusinessAuctionLab}=require('../server/business-auction-lab.cjs');
const {createShopPurchasesLab}=require('../server/shop-purchases-lab.cjs');
const {createEconomyTransactions}=require('../server/economy-transaction.cjs');
const catalogue=require('../server/business-catalogue.json'), shops=require('../server/shop-catalogue.json');
const gas=catalogue.businesses.find(x=>x.kind==='gas' && shops.shops[x.id]?.includes('water')).id;
const cat={[gas]:{price:10000,items:{water:2}}};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'biz-auction-')),file=path.join(dir,'db.sqlite');
const req=n=>`business-request-${String(n).padStart(16,'0')}`;let db,account,biz,auction,transactions,shop;
function start(){
 db=new Database(file);account=createAccountStore(db);biz=createBusinessStore(db,cat);
 // Initialize the common auction schema before installing registry locking triggers.
 createAuctionStore(db);const adapter=createBusinessAuctionLab(db,catalogue);
 auction=createAuctionStore(db,{authorizeListing:()=>{throw Error('not business');},businessAdapter:adapter});
 transactions=createEconomyTransactions(db);shop=createShopPurchasesLab(db,shops,()=>true,{ownership:'registry'});
}
const fail=(fn,code)=>assert.throws(fn,e=>e.code===code);
const snapshot=n=>{const x=db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?').get(n);return {revision:x.revision,state:JSON.parse(x.state_json)};};
const buy=(name,rev,id)=>transactions.execute(name,rev,req(id),'shop_buy',{shopId:gas,item:'water',quantity:1},shop);
(async()=>{try{
 start();for(const n of ['seller','alice','bob','driver']){
  assert((await account.register(n,'test-password-long')).ok);
  assert(account.save(n,{money:300000,inventory:{},vehicles:[],properties:[],kiosks:[],fridges:{}},0).ok);
 }
 biz.purchaseBusiness('seller',1,gas,req(1));
 // Reduce inventory and reserve delivery: it must block listing, even when claimed.
 biz.buyItem('alice',1,gas,'water',1,req(2));
 const order=biz.order('seller',3,gas,1,req(3),100);
 fail(()=>auction.list('seller',4,'business',gas,50000,req(4),100),'delivery_open');
 const claim=biz.claim('driver',order.id,req(5),101);
 fail(()=>auction.list('seller',4,'business',gas,50000,req(4),101),'delivery_open');
 biz.complete('driver',1,order.id,claim.token,req(6),102);
 fail(()=>auction.list('alice',2,'business',gas,50000,req(7),103),'not_owned');
 const listing=auction.list('seller',4,'business',gas,50000,req(4),103);
 assert.equal(listing.endsAt,103+DURATION);assert.equal(biz.get(gas).owner,'seller');assert.equal(biz.get(gas).stock,100);
 assert.deepEqual(auction.list('seller',4,'business',gas,50000,req(4),103),listing);
 // A single gas business ID covers fuel and shop. Transactions cannot change stock, owner or deliveries while listed.
 assert.throws(()=>biz.buyItem('alice',2,gas,'water',1,req(8)),/business_locked/);
 assert.throws(()=>buy('alice',2,9),/business_locked/);
 assert.throws(()=>db.prepare('UPDATE business_registry SET owner=? WHERE business_id=?').run('alice',gas),/business_locked/);
 assert.throws(()=>db.prepare('INSERT OR REPLACE INTO business_registry VALUES (?,?,?)').run(gas,'alice',100),/business_locked/);
 assert.throws(()=>db.prepare("INSERT INTO business_deliveries(business_id,owner,quantity,fee,status,created_at) VALUES (?, 'seller',1,1000,'open',104)").run(gas),/business_locked/);
 assert.equal(snapshot('alice').state.money,299998);assert.equal(biz.get(gas).stock,100);
 const bid1=auction.bid('alice',2,listing.id,50000,req(10),104);
 auction.bid('bob',1,listing.id,60000,req(11),105);
 assert.equal(snapshot('alice').state.money,299998);assert.equal(snapshot('bob').state.money,240000);
 assert.deepEqual(auction.bid('alice',2,listing.id,50000,req(10),104),bid1);
 assert.equal(auction.finish(listing.id,103+DURATION-1),false);
 db.close();start();assert.deepEqual(auction.due(103+DURATION),[listing.id]);
 // Transaction failure after transfer must leave owner, money, and lot unchanged.
 db.exec("CREATE TRIGGER fail_settlement BEFORE UPDATE ON accounts WHEN NEW.login_key='seller' BEGIN SELECT RAISE(ABORT,'test'); END");
 const sellerBefore=snapshot('seller').state.money;
 assert.throws(()=>auction.finish(listing.id,103+DURATION),/test/);
 assert.equal(auction.get(listing.id).status,'active');assert.equal(biz.get(gas).owner,'seller');assert.equal(snapshot('seller').state.money,sellerBefore);
 db.exec('DROP TRIGGER fail_settlement');assert(auction.finish(listing.id,103+DURATION));assert(!auction.finish(listing.id,103+DURATION));
 assert.equal(biz.get(gas).owner,'bob');assert.equal(biz.get(gas).stock,100);assert.equal(snapshot('seller').state.money,sellerBefore+60000);
 const rev=snapshot('alice').revision; const purchase=buy('alice',rev,12);
 assert(purchase.ok);assert.equal(biz.get(gas).stock,99);assert.equal(snapshot('bob').state.money,240002);
 // No bids: seller retains their business and stock; lock is removed.
 const bob=snapshot('bob');const unsold=auction.list('bob',bob.revision,'business',gas,80000,req(13),2000000);
 assert(auction.finish(unsold.id,2000000+DURATION));assert.equal(biz.get(gas).owner,'bob');assert.equal(biz.get(gas).stock,99);
 assert(auction.get(unsold.id).status==='unsold');
 // Seller balance overflow leaves ownership and the winning bid reserved.
 const b0=snapshot('bob');assert(account.save('bob',{...b0.state,money:2147483647},b0.revision,req(14)).ok);
 const b1=snapshot('bob');const overflow=auction.list('bob',b1.revision,'business',gas,50000,req(15),3000000);
 const a=snapshot('alice');auction.bid('alice',a.revision,overflow.id,50000,req(16),3000001);
 fail(()=>auction.finish(overflow.id,3000000+DURATION),'money_limit');
 assert.equal(biz.get(gas).owner,'bob');assert.equal(auction.get(overflow.id).status,'active');assert.equal(snapshot('alice').state.money,a.state.money-50000);
 // Repair in the lab only, then retry the same settlement exactly once.
 const b2=snapshot('bob');assert(account.save('bob',{...b2.state,money:0},b2.revision,req(17)).ok);
 assert(auction.finish(overflow.id,3000000+DURATION));assert.equal(biz.get(gas).owner,'alice');assert.equal(snapshot('bob').state.money,50000);
 // Never silently interpret a legacy snapshot-based business lot as a registry lot.
 db.prepare("INSERT INTO auction_lots(seller,kind,asset_key,asset_json,start_price,step,ends_at,status) VALUES ('seller','business','0',?,1,10000,9999999,'active')").run(JSON.stringify({item:{id:0}}));
 assert.throws(()=>createBusinessAuctionLab(db,catalogue),/incompatible_active_business_lot/);
 console.log('✓ бизнес-аукцион на стенде: реестр АЗС, склад, блокировка заказа, возврат ставки, рестарт, передача и откат');
 }finally{try{db?.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
