'use strict';
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createAccountStore}=require('../server/account-store.cjs');
const {createHamsterRewardLab}=require('../server/hamster-reward-lab.cjs');
const id='hamster-recover-race-001';
if(!isMainThread){
 const db=new Database(workerData.file);db.pragma('busy_timeout=5000');const lab=createHamsterRewardLab(db,createAccountStore(db));
 const gate=new Int32Array(workerData.gate);parentPort.postMessage('ready');Atomics.wait(gate,0,0);
 try{parentPort.postMessage(workerData.kind==='claim'?lab.claim('alice',1,id,1000):lab.recover('alice',1,id));}catch(e){parentPort.postMessage({error:e.message});}db.close();
}else{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 (async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hamster-recover-'));const file=path.join(dir,'db');let db;
 try{
  db=new Database(file);db.pragma('journal_mode=WAL');const accounts=createAccountStore(db);assert((await accounts.register('alice','test-password-123')).ok);assert(accounts.save('alice',{money:500},0).ok);createHamsterRewardLab(db,accounts);db.close();db=null;
  const gate=new SharedArrayBuffer(4);const workers=['claim','recover'].map(kind=>new Worker(__filename,{workerData:{file,gate,kind}}));
  await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);})));const responses=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
  Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0,2);
  const [claim,recovery]=await Promise.all(responses);assert(recovery.ok);
  if(recovery.outcome==='committed'){assert(claim.ok);assert.equal(recovery.state.money,1500);}else{assert.equal(recovery.outcome,'cancelled');assert.equal(claim.error,'cancelled');assert.equal(recovery.state.money,500);}
  await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{if(w.threadId===-1)return resolve();w.once('exit',code=>code===0?resolve():reject(Error(String(code))));})));
  db=new Database(file);const lab=createHamsterRewardLab(db,createAccountStore(db));const again=lab.recover('alice',1,id);assert.equal(again.outcome,recovery.outcome);assert.equal(again.state.money,recovery.state.money);
  const delayed=lab.claim('alice',1,id,2000);if(recovery.outcome==='cancelled')assert.equal(delayed.error,'cancelled');else assert(delayed.ok&&delayed.replay);
  console.log('✓ лаборатория хомяка: гонка восстановления и выплаты, поздний пакет и рестарт');
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
