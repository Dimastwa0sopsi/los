'use strict';
// An isolated integration experiment, not a live network or game test.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {buildSync}=require('esbuild');
const {createAccountStore}=require('../server/account-store.cjs');
const {createProtectedSaveLab}=require('../server/protected-save-lab.cjs');
const {createTrunkTransferLab}=require('../server/trunk-transfer-lab.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trunk-integration-'));let db;
(async()=>{try{
 for(const name of ['economyBarrier','economyJournal']) buildSync({entryPoints:[path.join(__dirname,'../src/game',name+'.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,name+'.cjs'),logLevel:'silent'});
 const {EconomyBarrier}=require(path.join(dir,'economyBarrier.cjs'));
 const {EconomyJournal}=require(path.join(dir,'economyJournal.cjs'));
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 db=new Database(path.join(dir,'db'));const accounts=createAccountStore(db);
 assert((await accounts.register('alice','password-for-testing')).ok);
 const initial={money:100,inventory:{water:30},vehicles:[{uid:'car1',type:'sedan',trunk:{}}]};
 assert(accounts.save('alice',initial,0).ok);
 let trunk=createTrunkTransferLab(db,accounts,new Set(['water']),type=>type==='sedan');
 const protectedSave=createProtectedSaveLab(db,accounts);
 const request={requestId:'trunk-integration-0000001',revision:1,action:'trunk',payload:{uid:'car1',item:'water',amount:20,direction:'put'}};
 let journal=new EconomyJournal(storage,'wss://example.test/','alice'), barrier=new EconomyBarrier();
 assert(barrier.begin(request,true,initial));assert(journal.write(request));
 const args=r=>['alice',r.revision,r.requestId,r.payload.uid,r.payload.item,r.payload.amount,r.payload.direction];
 // Normal successful response is compatible with the client barrier.
 const result=trunk.transfer(...args(request));assert(result.ok);
 const accepted=barrier.accept(result,initial);assert(accepted.ok);
 assert(barrier.installed(request.requestId,accepted.state,accepted.revision));assert(journal.clear(request.requestId));
 assert.equal(protectedSave.save('alice',initial,1,'stale-save-request-00001').error,'untrusted_change');
 let current=accepted.state;
 const lost={requestId:'trunk-integration-0000002',revision:2,action:'trunk',payload:{uid:'car1',item:'water',amount:5,direction:'take'}};
 barrier=new EconomyBarrier();assert(barrier.begin(lost,true,current));assert(journal.write(lost));
 assert(trunk.transfer(...args(lost)).ok); // response lost
 // Restart the DB and client; the journal is a hint, not proof of commitment.
 db.close();db=new Database(path.join(dir,'db'));trunk=createTrunkTransferLab(db,createAccountStore(db),new Set(['water']),type=>type==='sedan');
 journal=new EconomyJournal(storage,'wss://example.test/','alice');const read=journal.read();assert(read.ok && read.request);
 barrier=new EconomyBarrier();assert(barrier.begin(read.request,true,current));
 let recovery=trunk.recover(...args(read.request));assert.equal(recovery.outcome,'committed');
 let applied=barrier.acceptRecovery(recovery,current);assert(applied.ok);assert.equal(applied.state.inventory.water,15);
 assert(barrier.installed(lost.requestId,applied.state,applied.revision));assert(journal.clear(lost.requestId));current=applied.state;
 const delayed={requestId:'trunk-integration-0000003',revision:3,action:'trunk',payload:{uid:'car1',item:'water',amount:1,direction:'put'}};
 barrier=new EconomyBarrier();assert(barrier.begin(delayed,true,current));assert(journal.write(delayed));
 recovery=trunk.recover(...args(delayed));assert.equal(recovery.outcome,'cancelled');
 applied=barrier.acceptRecovery(recovery,current);assert(applied.ok);assert(barrier.installed(delayed.requestId,applied.state,applied.revision));assert(journal.clear(delayed.requestId));
 assert.equal(trunk.transfer(...args(delayed)).error,'cancelled');
 console.log('✓ лабораторная интеграция: перенос, защищённый старый сейв, потеря ответа, рестарт и отмена запоздавшего запроса');
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
