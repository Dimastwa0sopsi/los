'use strict';
// Separate in-process WebSocket test server and disposable SQLite file.
// This is not the live game server or an enablement flag for it.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3'), WebSocket=require('ws');
const {createAccountStore}=require('../server/account-store.cjs');
const {createAuctionGatewayLab}=require('../server/auction-gateway-lab.cjs');
const catalog=require('../server/auction-catalogue.json');
const shopCatalog=require('../server/shop-catalogue.json');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'los-auction-network-')), file=path.join(tmp,'lab.sqlite');
const pass='pass-for-laboratory'; const req=n=>`request-${String(n).padStart(16,'0')}`;
const clients=new Set();let db,accounts,gateway,wss,port,now=1000000,dropBidReply=false;
async function start(){
 db=new Database(file);accounts=createAccountStore(db);
 const sessions=new Map(); gateway=createAuctionGatewayLab(db,accounts,catalog,name=>{const w=sessions.get(name);if(w?.readyState===WebSocket.OPEN) w.send(JSON.stringify({type:'changed'}));},{catalogue:shopCatalog,authorize:({shopId})=>shopId==='kiosk:0'});
 wss=new WebSocket.Server({host:'127.0.0.1',port:0}); await new Promise(resolve=>wss.once('listening',resolve));port=wss.address().port;
 wss.on('connection',ws=>{
   let actor=null,busy=false;ws.send(JSON.stringify({type:'hello'}));
   ws.on('message',async raw=>{
     let m;try{m=JSON.parse(String(raw));}catch{return;}
     if(m.type==='auth' && !actor && !busy){busy=true;const result=await accounts.login(m.name,m.password);busy=false;if(ws.readyState!==WebSocket.OPEN)return;
       if(!result.ok){ws.send(JSON.stringify({type:'auth',ok:false}));return;}
       actor=result.login.normalize('NFKC').trim().toLowerCase();const old=sessions.get(actor);if(old && old!==ws)old.close();sessions.set(actor,ws);ws.send(JSON.stringify({type:'auth',ok:true}));return;}
     if(!actor || sessions.get(actor)!==ws)return; // session identity, not actor in message
     let result;
     if(m.type==='snapshot') result=gateway.snapshot(actor);
     else if(m.type==='save') result=gateway.save(actor,m.revision,m.saveId,m.state);
     else if(m.type==='trade') result=gateway.execute(actor,m.revision,m.requestId,m.action,m.payload,now);
     else if(m.type==='lots') result={ok:true,lots:gateway.publicLots(now)};
     else return;
     if (m.type==='trade' && m.requestId===req(9) && dropBidReply) { dropBidReply=false; return; }
     ws.send(JSON.stringify({type:m.type,...result}));
   });
   ws.on('close',()=>{if(actor && sessions.get(actor)===ws)sessions.delete(actor);});
 });
}
async function stop(){for(const c of clients)c.ws.terminate();clients.clear();await new Promise(resolve=>wss.close(resolve));db.close();}
function connect(){
 const ws=new WebSocket(`ws://127.0.0.1:${port}`),queue=[],waiters=[];
 ws.on('message',b=>{const m=JSON.parse(String(b)), i=waiters.findIndex(w=>w.type===m.type);if(i>=0)waiters.splice(i,1)[0].resolve(m);else queue.push(m);});
 function next(type){return new Promise((resolve,reject)=>{const i=queue.findIndex(m=>m.type===type);if(i>=0)return resolve(queue.splice(i,1)[0]);const w={type,resolve};waiters.push(w);setTimeout(()=>{const j=waiters.indexOf(w);if(j>=0){waiters.splice(j,1);reject(Error('timeout: '+type));}},5000).unref();});}
 const c={ws,next,send:m=>ws.send(JSON.stringify(m))};clients.add(c);return c;
}
async function login(name){const c=connect();await c.next('hello');c.send({type:'auth',name,password:pass});assert((await c.next('auth')).ok);return c;}
async function snapshot(c){c.send({type:'snapshot'});const r=await c.next('snapshot');assert(r.ok);return r;}
async function trade(c,revision,requestId,action,payload,extra={}){c.send({type:'trade',revision,requestId,action,payload,...extra});return c.next('trade');}
async function save(c,revision,saveId,state){c.send({type:'save',revision,saveId,state});return c.next('save');}
(async()=>{
 await start();
 for(const n of ['seller','alice','bob']){assert((await accounts.register(n,pass)).ok);assert(accounts.save(n,{money:n==='seller'?1000:200000,vehicles:n==='seller'?[{uid:'car',type:'lada',tuning:{plate:'А123ВС77'}}]:[],kiosks:n==='seller'?[{id:0,last:1000,acc:0}]:[],properties:[],fridges:{},inventory:{water:1},health:100},0).ok);}
 let seller=await login('seller'),alice=await login('alice'),bob=await login('bob');
 let s=await snapshot(seller), a=await snapshot(alice), b=await snapshot(bob);
 // An authenticated actor is derived only from the session, not the forged packet.
 let fake=await trade(alice,a.revision,req(1),'list',{kind:'vehicle',key:'car',price:50000},{actor:'seller'});assert.equal(fake.error,'not_owned');
 let r=await trade(seller,s.revision,req(2),'list',{kind:'vehicle',key:'car',price:50000});assert(r.ok);let lot=r.result.id;assert.equal(r.state.vehicles.length,0);
 await seller.next('changed');
 // A new login replaces the older session, including from another device.
 const oldSeller=seller, oldClosed=new Promise(resolve=>oldSeller.ws.once('close',resolve));
 seller=await login('seller'); await oldClosed;
 // Stale save cannot resurrect a car in escrow, and even a fresh revision cannot alter economic fields.
 assert.equal((await save(seller,s.revision,req(3),s.state)).error,'conflict');
 const freshSeller=await snapshot(seller); const forged={...freshSeller.state,vehicles:s.state.vehicles};
 assert.equal((await save(seller,freshSeller.revision,req(4),forged)).error,'protected_state');
 assert.equal((await save(alice,a.revision,req(5),{...a.state,money:999999})).error,'protected_state');
 assert.equal((await save(alice,a.revision,req(6),{...a.state,inventory:{water:99}})).error,'protected_state');
 // A non-economic save succeeds without being able to replace protected fields.
 assert((await save(alice,a.revision,req(7),{...a.state,health:80})).ok);a=await snapshot(alice);
 r=await trade(alice,a.revision,req(8),'bid',{id:lot,bid:50000});assert(r.ok && r.state.money===150000);await alice.next('changed');
 // Lost response: same request ID/payload is replayed with no extra deduction.
 let replay=await trade(alice,a.revision,req(8),'bid',{id:lot,bid:50000});assert(replay.ok && replay.replay && replay.state.money===150000);
 assert.equal((await trade(alice,a.revision,req(8),'bid',{id:lot,bid:51000})).error,'request_reused');
 // Government purchase works with protected save while bid funds remain held.
 let buy=await trade(alice,replay.revision,req(14),'shop_buy',{shopId:'kiosk:0',item:'water',quantity:5});
 assert(buy.ok && buy.result.cost===10 && buy.state.money===149990 && buy.state.inventory.water===6);await alice.next('changed');
 assert.equal((await trade(alice,buy.revision,req(15),'shop_buy',{shopId:'kiosk:1',item:'coffee',quantity:1})).error,'not_authorized');

 assert.equal((await trade(bob,b.revision,req(9),'bid',{id:lot,bid:50999})).error,'bid_too_low');
 // Drop the successful response, then reconnect and retry the same request.
 dropBidReply=true; bob.send({type:'trade',revision:b.revision,requestId:req(9),action:'bid',payload:{id:lot,bid:51000}});
 await bob.next('changed'); await alice.next('changed');
 bob.ws.terminate(); bob=await login('bob');
 r=await trade(bob,b.revision,req(9),'bid',{id:lot,bid:51000});assert(r.ok && r.replay && r.state.money===149000);
 a=await snapshot(alice);assert.equal(a.state.money,199990);assert.equal(a.state.inventory.water,6);assert.equal(a.state.health,80);
 assert.equal((await save(alice,a.revision,req(10),{...a.state,money:300000})).error,'protected_state');
 bob.send({type:'lots'});const publicLots=await bob.next('lots');assert.equal(publicLots.lots.length,1);assert(!JSON.stringify(publicLots).includes('А123ВС'));
 await stop();await start(); seller=await login('seller');alice=await login('alice');bob=await login('bob');
 replay=await trade(bob,b.revision,req(9),'bid',{id:lot,bid:51000});assert(replay.ok && replay.replay && replay.state.money===149000);
 assert.equal(gateway.finish(lot,now+599999).settled,false);now+=600000;
 assert.equal(gateway.finish(lot,now).settled,true);assert.equal(gateway.finish(lot,now).settled,false);
 await seller.next('changed');await bob.next('changed');
 s=await snapshot(seller);b=await snapshot(bob);a=await snapshot(alice);
 assert.equal(s.state.money,52000);assert.equal(b.state.money,149000);assert.equal(a.state.money,199990);
 assert.equal(s.state.vehicles.length,0);assert.equal(b.state.vehicles[0].uid,'car');
 assert.equal(s.state.money+a.state.money+b.state.money,400990);
 assert.equal((await save(bob,b.revision,req(11),{...b.state,vehicles:[]})).error,'protected_state');
 // The same network path enforces the requested $10,000 business increment.
 let kiosk=await trade(seller,s.revision,req(20),'list',{kind:'business',key:'0',price:100000});assert(kiosk.ok);await seller.next('changed');
 r=await trade(alice,a.revision,req(21),'bid',{id:kiosk.result.id,bid:100000});assert(r.ok);await alice.next('changed');
 assert.equal((await trade(bob,b.revision,req(22),'bid',{id:kiosk.result.id,bid:109999})).error,'bid_too_low');
 r=await trade(bob,b.revision,req(22),'bid',{id:kiosk.result.id,bid:110000});assert(r.ok);await bob.next('changed');await alice.next('changed');
 now+=600000;assert(gateway.finish(kiosk.result.id,now).settled);await seller.next('changed');await bob.next('changed');
 s=await snapshot(seller);a=await snapshot(alice);b=await snapshot(bob);
 assert.equal(s.state.money,162000);assert.equal(a.state.money,199990);assert.equal(b.state.money,39000);assert.equal(b.state.kiosks[0].id,0);
 assert.equal(s.state.money+a.state.money+b.state.money,400990);
 await stop();fs.rmSync(tmp,{recursive:true,force:true});
 console.log('✓ сетевой тест в отдельной базе: сессии, эскроу, ставки, возврат, повторы, рестарт, передача, запрет подмены сейва');
})().catch(async e=>{console.error(e);try{await stop();}catch{}process.exitCode=1;});
