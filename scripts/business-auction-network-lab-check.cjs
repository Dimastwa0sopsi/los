'use strict';
// Authenticated WebSockets, disposable SQLite. No production server is involved.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3'),WebSocket=require('ws');
const {createAccountStore}=require('../server/account-store.cjs');
const {createBusinessStore}=require('../server/business-store.cjs');
const {createAuctionGatewayLab}=require('../server/auction-gateway-lab.cjs');
const {DURATION}=require('../server/auction-store.cjs');
const catalog=require('../server/auction-catalogue.json'),businessCatalog=require('../server/business-catalogue.json'),shopCatalog=require('../server/shop-catalogue.json');
const gas=businessCatalog.businesses.find(b=>b.kind==='gas' && shopCatalog.shops[b.id]?.includes('water')).id;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'los-business-network-')),file=path.join(dir,'lab.sqlite');
const req=n=>`network-request-${String(n).padStart(16,'0')}`,pass='test-password-for-network';
let db,accounts,biz,g,wss,port,now=1000000,drop=false;const clients=new Set();
async function start(){
 db=new Database(file);accounts=createAccountStore(db);
 biz=createBusinessStore(db,{[gas]:{price:10000,items:{water:2}}});
 const sessions=new Map();
 g=createAuctionGatewayLab(db,accounts,catalog,(name,revision)=>{
  const w=sessions.get(name);if(w?.readyState===WebSocket.OPEN)w.send(JSON.stringify({type:'changed',revision}));
 },{catalogue:shopCatalog,authorize:({shopId})=>shopId===gas,options:{ownership:'registry'}},businessCatalog);
 wss=new WebSocket.Server({host:'127.0.0.1',port:0});await new Promise(r=>wss.once('listening',r));port=wss.address().port;
 wss.on('connection',ws=>{let actor=null,busy=false;ws.send(JSON.stringify({type:'hello'}));
  ws.on('message',async raw=>{let m;try{m=JSON.parse(String(raw));}catch{return;}
   if(m.type==='auth' && !actor && !busy){busy=true;const r=await accounts.login(m.name,m.password);busy=false;if(ws.readyState!==WebSocket.OPEN)return;
    if(!r.ok){ws.send(JSON.stringify({type:'auth',ok:false}));return;}
    actor=r.login.normalize('NFKC').trim().toLowerCase();const old=sessions.get(actor);if(old && old!==ws)old.close();sessions.set(actor,ws);ws.send(JSON.stringify({type:'auth',ok:true}));return;}
   if(!actor || sessions.get(actor)!==ws)return;
   let r;if(m.type==='snapshot')r=g.snapshot(actor);else if(m.type==='trade')r=g.execute(actor,m.revision,m.requestId,m.action,m.payload,now);
   else if(m.type==='save')r=g.save(actor,m.revision,m.saveId,m.state);else if(m.type==='recover')r=g.recover(actor,m.request);else if(m.type==='lots')r={ok:true,lots:g.publicLots(now)};else return;
   if(m.type==='trade' && m.requestId===req(3) && drop){drop=false;return;}
   ws.send(JSON.stringify({type:m.type,...r}));
  });ws.on('close',()=>{if(actor && sessions.get(actor)===ws)sessions.delete(actor);});
 });
}
async function stop(){for(const c of clients)c.ws.terminate();clients.clear();if(wss)await new Promise(r=>wss.close(r));wss=null;db?.close();db=null;}
function connect(){const ws=new WebSocket(`ws://127.0.0.1:${port}`),queue=[],waiters=[];
 ws.on('message',raw=>{const m=JSON.parse(String(raw)),i=waiters.findIndex(w=>w.type===m.type);if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m);});
 const next=type=>new Promise((resolve,reject)=>{const i=queue.findIndex(m=>m.type===type);if(i>=0)return resolve(queue.splice(i,1)[0]);const w={type,resolve};waiters.push(w);setTimeout(()=>{const j=waiters.indexOf(w);if(j>=0){waiters.splice(j,1);reject(Error('timeout: '+type));}},5000).unref();});
 const c={ws,next,send:m=>ws.send(JSON.stringify(m))};clients.add(c);return c;
}
async function login(name){const c=connect();await c.next('hello');c.send({type:'auth',name,password:pass});assert((await c.next('auth')).ok);return c;}
async function snapshot(c){c.send({type:'snapshot'});const r=await c.next('snapshot');assert(r.ok);return r;}
async function trade(c,revision,id,action,payload,extra={}){c.send({type:'trade',revision,requestId:req(id),action,payload,...extra});return c.next('trade');}
(async()=>{try{
 await start();
 for(const name of ['seller','alice','bob']){
  assert((await accounts.register(name,pass)).ok);
  assert(accounts.save(name,{money:200000,inventory:{},vehicles:[],kiosks:[],properties:[],fridges:{},health:100},0).ok);
 }
 biz.purchaseBusiness('seller',1,gas,req(99));
 let seller=await login('seller'),alice=await login('alice'),bob=await login('bob');
 let s=await snapshot(seller),a=await snapshot(alice),b=await snapshot(bob);
 let r=await trade(alice,a.revision,1,'list',{kind:'business',key:gas,price:50000},{actor:'seller'});assert.equal(r.error,'not_owned');
 r=await trade(seller,s.revision,2,'list',{kind:'business',key:gas,price:50000});assert(r.ok);const lot=r.result.id;await seller.next('changed');
 assert.equal(biz.get(gas).owner,'seller');
 alice.send({type:'lots'});const lots=await alice.next('lots');assert.equal(lots.lots[0].assetKey,gas);assert(!JSON.stringify(lots).includes('registryBusiness'));
 r=await trade(alice,a.revision,8,'shop_buy',{shopId:gas,item:'water',quantity:1});assert.equal(r.error,'business_locked');
 drop=true;alice.send({type:'trade',revision:a.revision,requestId:req(3),action:'bid',payload:{id:lot,bid:50000}});assert.equal((await alice.next('changed')).revision,2);
 alice.ws.terminate();alice=await login('alice');r=await trade(alice,a.revision,3,'bid',{id:lot,bid:50000});assert(r.ok && r.replay && r.state.money===150000);
 r=await trade(bob,b.revision,4,'bid',{id:lot,bid:60000});assert(r.ok);assert.equal((await bob.next('changed')).revision,2);assert.equal((await alice.next('changed')).revision,3);
 a=await snapshot(alice);assert.equal(a.state.money,200000);assert.equal(biz.get(gas).owner,'seller');
 // After an outbid, the original receipt is older than the refund. Recovery
 // returns a fresh snapshot, while preserving the committed outcome.
 const oldBid={requestId:req(3),revision:1,action:'bid',payload:{id:lot,bid:50000}};
 alice.send({type:'recover',request:oldBid,actor:'bob'});const recovered=await alice.next('recover');
 assert(recovered.ok && recovered.outcome==='committed' && recovered.committedRevision===2);
 assert.equal(recovered.revision,a.revision);assert.equal(recovered.state.money,200000);
 // If the original request never arrived, recovery atomically seals it: even
 // a delayed packet on this or a replacement connection can never execute it.
 const absent={requestId:req(50),revision:a.revision,action:'shop_buy',payload:{shopId:gas,item:'water',quantity:1}};
 alice.send({type:'recover',request:absent});const cancelled=await alice.next('recover');assert(cancelled.ok && cancelled.outcome==='cancelled');
 assert.equal((await trade(alice,a.revision,50,'shop_buy',absent.payload)).error,'request_cancelled');
 assert.equal((await trade(alice,a.revision,50,'shop_buy',{...absent.payload,quantity:2})).error,'request_reused');

 bob.send({type:'save',revision:r.revision,saveId:req(5),state:{...r.state,money:200000}});assert.equal((await bob.next('save')).error,'protected_state');
 await stop();await start();seller=await login('seller');alice=await login('alice');bob=await login('bob');
 assert.equal(g.finish(lot,now+DURATION-1).settled,false);now+=DURATION;
 assert.equal(g.finish(lot,now).settled,true);assert.equal(g.finish(lot,now).settled,false);await seller.next('changed');await bob.next('changed');
 assert.equal(biz.get(gas).owner,'bob');assert.equal(biz.get(gas).stock,100);
 assert.equal((await trade(alice,a.revision,50,'shop_buy',absent.payload)).error,'request_cancelled');
 alice.send({type:'recover',request:absent});assert.equal((await alice.next('recover')).outcome,'cancelled');
 s=await snapshot(seller);a=await snapshot(alice);b=await snapshot(bob);
 assert.equal(s.state.money,250000);assert.equal(a.state.money,200000);assert.equal(b.state.money,140000);
 r=await trade(alice,a.revision,6,'shop_buy',{shopId:gas,item:'water',quantity:2});assert(r.ok);await alice.next('changed');await bob.next('changed');
 b=await snapshot(bob);assert.equal(b.state.money,140004);assert.equal(biz.get(gas).stock,98);assert.equal(r.state.inventory.water,2);
 assert.equal(s.state.money+r.state.money+b.state.money,590000); // initial total less business purchase; buyer pays new owner
 console.log('✓ сетевой бизнес-аукцион на стенде: авторизация, замок, повторы, возврат, рестарт, реестр и выручка');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
