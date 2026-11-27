'use strict';
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createAccountStore}=require('../server/account-store.cjs');
const {createHamsterRewardLab,COOLDOWN_MS}=require('../server/hamster-reward-lab.cjs');
if(!isMainThread){
 const db=new Database(workerData.path);db.pragma('busy_timeout=5000');const lab=createHamsterRewardLab(db,createAccountStore(db));
 const gate=new Int32Array(workerData.gate);parentPort.postMessage('ready');Atomics.wait(gate,0,0);
 try{parentPort.postMessage(lab.claim('alice',1,workerData.id,10000));}catch(e){parentPort.postMessage({error:e.message});}db.close();
}else{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 (async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hamster-lab-'));const file=path.join(dir,'db');let db;
  try{
   db=new Database(file);db.pragma('journal_mode=WAL');let accounts=createAccountStore(db);
   for(const n of ['alice','bob']){assert((await accounts.register(n,'password-for-testing')).ok);assert(accounts.save(n,{money:500,inventory:{water:1}},0).ok);}
   createHamsterRewardLab(db,accounts);db.close();db=null;
   const gate=new SharedArrayBuffer(4),view=new Int32Array(gate);
   const workers=[0,1].map(i=>new Worker(__filename,{workerData:{path:file,gate,id:`hamster-request-0000000${i}`}}));
   await Promise.all(workers.map(w=>new Promise((r,j)=>{w.once('message',r);w.once('error',j);})));const wait=workers.map(w=>new Promise((r,j)=>{w.once('message',r);w.once('error',j);}));
   Atomics.store(view,0,1);Atomics.notify(view,0,2);const results=await Promise.all(wait);
   assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.error==='conflict').length,1);
   await Promise.all(workers.map(w=>new Promise((r,j)=>{if(w.threadId===-1)return r();w.once('exit',c=>c===0?r():j(Error(String(c))));})));
   db=new Database(file);accounts=createAccountStore(db);let lab=createHamsterRewardLab(db,accounts);
   const winner=results.findIndex(x=>x.ok);let r=lab.claim('alice',1,`hamster-request-0000000${winner}`,10050);assert(r.ok && r.replay);assert.equal(r.state.money,1500);
   assert.deepEqual(lab.claim('alice',2,`hamster-request-0000000${winner}`,10050),{ok:false,error:'request_reused'});
   r=lab.claim('alice',2,'hamster-second-00000000',10000+COOLDOWN_MS-1);assert.equal(r.error,'cooldown');
   r=lab.claim('bob',1,'hamster-bob-0000000000',10001);assert(r.ok);assert.equal(r.state.money,1500);
   db.close();db=new Database(file);accounts=createAccountStore(db);lab=createHamsterRewardLab(db,accounts);
   r=lab.claim('alice',2,'hamster-second-00000000',10000+COOLDOWN_MS);assert(r.ok);assert.equal(r.state.money,2500);
   assert.equal(JSON.parse(db.prepare('SELECT state_json FROM accounts WHERE login_key=?').get('alice').state_json).money,2500);
   console.log('✓ онлайн-лаборатория: $1000, лимит 2 часа на аккаунт, повтор запроса, рестарт и гонка');
  }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
