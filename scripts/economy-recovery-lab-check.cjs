'use strict';
// Isolated SQLite tests only. Production account_save remains unprotected.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {createAccountStore}=require('../server/account-store.cjs');
const {createEconomyTransactions}=require('../server/economy-transaction.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'los-recovery-')),file=path.join(dir,'db.sqlite');
const req=n=>`recovery-request-${String(n).padStart(16,'0')}`,pass='test-password-strong';
let db,accounts,tx;
function start(){db=new Database(file);accounts=createAccountStore(db);tx=createEconomyTransactions(db);}
const snapshot=name=>{const r=db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?').get(name);return {revision:r.revision,state:JSON.parse(r.state_json)};};
function purchase(name,revision,id,amount=10){return tx.execute(name,revision,req(id),'buy',{amount},({actor,revision,payload})=>{
 const state=snapshot(actor).state;state.money-=payload.amount;const saved=accounts.save(actor,state,revision,req(id));assert(saved.ok);return {cost:payload.amount};
});}
const recover=(name,revision,id,amount=10)=>tx.recover(name,revision,req(id),'buy',{amount});
(async()=>{try{
 start();for(const n of ['alice','bob']){assert((await accounts.register(n,pass)).ok);assert(accounts.save(n,{money:100,inventory:{}},0).ok);}
 // Operation commits first. Later changes and history pruning cannot cause
 // recovery to return the old receipt as the current account state.
 const done=purchase('alice',1,1);assert(done.ok && done.revision===2);
 for(let i=0;i<10;i++){const a=snapshot('alice');assert(accounts.save('alice',{...a.state,money:a.state.money+1},a.revision,req(100+i)).ok);}
 assert.equal(purchase('alice',1,1).error,'receipt_expired');
 let r=recover('alice',1,1);assert(r.ok && r.outcome==='committed');assert.equal(r.committedRevision,2);assert.deepEqual(r.state,snapshot('alice').state);assert.equal(r.state.money,100);
 assert.equal(recover('alice',1,1,11).error,'request_reused');
 // Recovery first creates a tombstone. Subsequent delayed messages and a
 // payload with the same request ID cannot run, even after restart.
 const rev=snapshot('alice').revision;r=recover('alice',rev,2);assert(r.ok && r.outcome==='cancelled');
 assert.equal(purchase('alice',rev,2).error,'request_cancelled');assert.equal(purchase('alice',rev,2,11).error,'request_reused');
 assert(purchase('bob',1,2).ok); // request IDs are scoped to actor
 db.close();start();assert.equal(recover('alice',rev,2).outcome,'cancelled');assert.equal(purchase('alice',rev,2).error,'request_cancelled');
 assert.equal(recover('alice',1,1).outcome,'committed');
 // Failure writing tombstone is fail-closed: no false successful cancellation.
 db.exec("CREATE TRIGGER deny_cancel BEFORE INSERT ON economy_operation_cancellations WHEN NEW.request_id='recovery-request-0000000000000003' BEGIN SELECT RAISE(ABORT,'test'); END");
 assert.throws(()=>recover('alice',rev,3),/test/);assert.equal(db.prepare('SELECT count(*) AS n FROM economy_operation_cancellations WHERE request_id=?').get(req(3)).n,0);
 db.exec('DROP TRIGGER deny_cancel');assert.equal(recover('alice',rev,3).outcome,'cancelled');assert.equal(purchase('alice',rev,3).error,'request_cancelled');
 assert.equal(recover('alice',999,4).error,'invalid_state');
 assert.equal(db.prepare('SELECT count(*) AS n FROM economy_operation_cancellations WHERE request_id=?').get(req(4)).n,0);
 console.log('✓ восстановление на стенде: актуальная ревизия, истёкшая история, отмена позднего запроса, перезапуск и откат');
 }finally{try{db?.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
