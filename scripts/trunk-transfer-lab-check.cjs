'use strict';
const assert=require('node:assert/strict'), Database=require('better-sqlite3');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createAccountStore}=require('../server/account-store.cjs');
const {createTrunkTransferLab}=require('../server/trunk-transfer-lab.cjs');
const make=db=>createTrunkTransferLab(db,createAccountStore(db),new Set(['water','bread']),type=>type==='sedan');
if(!isMainThread){const db=new Database(workerData.file);db.pragma('busy_timeout=5000');const lab=make(db),gate=new Int32Array(workerData.gate);parentPort.postMessage('ready');Atomics.wait(gate,0,0);try{const args=[workerData.user||'alice',1,workerData.id,workerData.car||'car1','water',20,'put'];parentPort.postMessage(workerData.recover?lab.recover(...args):lab.transfer(...args));}catch(e){parentPort.postMessage({error:e.message});}db.close();}
else {const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trunk-lab-')),file=path.join(dir,'db');let db;
try{
 db=new Database(file);db.pragma('journal_mode=WAL');const accounts=createAccountStore(db);
 for(const n of ['alice','bob']){assert((await accounts.register(n,'password-for-testing')).ok);assert(accounts.save(n,{money:100,inventory:{water:30},vehicles:[{uid:n==='alice'?'car1':'car2',type:'sedan',trunk:{}}]},0).ok);}
 make(db);db.close();db=null;const gate=new SharedArrayBuffer(4),view=new Int32Array(gate);
 const ws=[0,1].map(i=>new Worker(__filename,{workerData:{file,gate,id:`trunk-request-000000000${i}`}}));await Promise.all(ws.map(w=>new Promise((r,j)=>{w.once('message',r);w.once('error',j);})));const wait=ws.map(w=>new Promise((r,j)=>{w.once('message',r);w.once('error',j);}));Atomics.store(view,0,1);Atomics.notify(view,0,2);const res=await Promise.all(wait);
 assert.equal(res.filter(x=>x.ok).length,1);assert.equal(res.filter(x=>x.error==='conflict').length,1);
 await Promise.all(ws.map(w=>new Promise((r,j)=>{if(w.threadId===-1)return r();w.once('exit',c=>c===0?r():j(Error(String(c))));})));
 db=new Database(file);let lab=make(db);const i=res.findIndex(x=>x.ok),id=`trunk-request-000000000${i}`;
 let r=lab.transfer('alice',1,id,'car1','water',20,'put');assert(r.ok&&r.replay);assert.equal(r.state.inventory.water,10);assert.equal(r.state.vehicles[0].trunk.water,20);
 assert.equal(lab.transfer('alice',1,id,'car1','water',1,'put').error,'request_reused');
 assert.equal(lab.transfer('bob',1,'bob-request-0000000000','car1','water',1,'put').error,'vehicle');
 assert.equal(lab.transfer('alice',2,'full-request-000000000','car1','water',11,'put').error,'not_enough');
 assert.equal(lab.transfer('alice',2,'item-request-000000000','car1','__proto__',1,'put').error,'invalid');
 r=lab.transfer('alice',2,'add-request-0000000000','car1','water',10,'put');assert(r.ok);assert.equal(r.state.vehicles[0].trunk.water,30);
 r=lab.transfer('alice',1,id,'car1','water',20,'put');assert.equal(r.error,'stale_receipt');assert.equal(r.revision,3);assert.equal(r.state,undefined);
 r=lab.recover('alice',1,id,'car1','water',20,'put');assert(r.ok);assert.equal(r.outcome,'committed');assert.equal(r.committedRevision,2);assert.equal(r.revision,3);assert.equal(r.state.vehicles[0].trunk.water,30);
 assert.equal(lab.recover('alice',1,id,'car1','water',19,'put').error,'request_reused');
 const cancelled='cancel-request-00000000';
 r=lab.recover('alice',3,cancelled,'car1','water',30,'take');assert(r.ok);assert.equal(r.outcome,'cancelled');assert.equal(r.revision,3);
 assert.equal(lab.transfer('alice',3,cancelled,'car1','water',30,'take').error,'cancelled');
 assert.equal(lab.transfer('alice',3,cancelled,'car1','water',1,'take').error,'request_reused');
 db.close();db=new Database(file);lab=make(db);
 assert.equal(lab.recover('alice',3,cancelled,'car1','water',30,'take').outcome,'cancelled');
 assert.equal(lab.transfer('alice',3,cancelled,'car1','water',30,'take').error,'cancelled');
 r=lab.transfer('alice',3,'take-request-000000000','car1','water',30,'take');assert(r.ok);assert.equal(r.state.inventory.water,30);assert.deepEqual(r.state.vehicles[0].trunk,{});
 const raceGate=new SharedArrayBuffer(4),raceView=new Int32Array(raceGate),raceId='recover-race-000000000';
 const racers=[false,true].map(recover=>new Worker(__filename,{workerData:{file,gate:raceGate,id:raceId,user:'bob',car:'car2',recover}}));
 await Promise.all(racers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject)})));
 const results=racers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject)}));
 Atomics.store(raceView,0,1);Atomics.notify(raceView,0,2);const [transferResult,recoveryResult]=await Promise.all(results);
 await Promise.all(racers.map(w=>new Promise((resolve,reject)=>{if(w.threadId===-1)return resolve();w.once('exit',c=>c===0?resolve():reject(Error(String(c))))})));
 assert(recoveryResult.ok);const bob=JSON.parse(db.prepare('SELECT state_json FROM accounts WHERE login_key=?').get('bob').state_json);
 if(recoveryResult.outcome==='committed'){assert(transferResult.ok);assert.equal(bob.vehicles[0].trunk.water,20);}
 else{assert.equal(recoveryResult.outcome,'cancelled');assert.equal(transferResult.error,'cancelled');assert.deepEqual(bob.vehicles[0].trunk,{});}
 console.log('✓ багажник лаборатория: атомарный перенос, восстановление, отмена, рестарт и гонки');
}finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});}
