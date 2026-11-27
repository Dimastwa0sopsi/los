'use strict';
// Isolated SQLite only. Never uses the real Colab database or live server.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {Worker, isMainThread, workerData, parentPort} = require('node:worker_threads');
const Database = require('better-sqlite3');
const {createAccountStore} = require('../server/account-store.cjs');
const {createProtectedSaveLab} = require('../server/protected-save-lab.cjs');
const {createBusinessStore} = require('../server/business-store.cjs');
const catalogue = {'kiosk:0':{price:1000,items:{water:2}}};
if (!isMainThread) {
  const db = new Database(workerData.file); db.pragma('busy_timeout = 5000');
  const biz = createBusinessStore(db,catalogue), gate = new Int32Array(workerData.gate);
  parentPort.postMessage('ready'); Atomics.wait(gate,0,0);
  try { parentPort.postMessage({ok:true,result:biz.purchaseBusiness(workerData.name,1,'kiosk:0',workerData.request)}); }
  catch (e) { parentPort.postMessage({ok:false,error:e.code || e.message}); }
  db.close();
} else {
  (async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'los-economy-security-'));
    const file=path.join(dir,'test.db'); let db;
    try {
      db=new Database(file); db.pragma('journal_mode = WAL');
      const accounts=createAccountStore(db), protectedSave=createProtectedSaveLab(db,accounts);
      for (const name of ['alice','bob','newuser']) assert((await accounts.register(name,'password-for-testing')).ok);
      const initial={money:5000,inventory:{water:2},vehicles:[],properties:[],kiosks:[]};
      assert.deepEqual(protectedSave.save('newuser',initial,0,'request-newuser-00001'),{ok:false,error:'no_trusted_state'});
      for (const name of ['alice','bob']) assert(accounts.save(name,initial,0).ok);
      for (const [i,change] of [
        s=>s.money=999999, s=>s.inventory.water=999, s=>s.vehicles.push({uid:'stolen'}),
        s=>s.properties.push('1:1'), s=>s.kiosks.push({id:0}), s=>s.newUnknownField={money:1},
      ].entries()) {
        const state=structuredClone(initial); change(state);
        assert.deepEqual(protectedSave.save('alice',state,1,`attack-request-${String(i).padStart(16,'0')}`),{ok:false,error:'untrusted_change'});
      }
      const same=protectedSave.save('alice',initial,1,'valid-save-request-0001');
      assert.equal(same.ok,true);
      assert.equal(protectedSave.save('alice',initial,1,'valid-save-request-0001').replay,true);
      // Reset Alice in the disposable fixture so both competitors start at revision 1.
      db.prepare("UPDATE accounts SET revision=1,save_id=NULL WHERE login_key='alice'").run();
      createBusinessStore(db,catalogue); db.close(); db=null;
      const gate=new SharedArrayBuffer(4), view=new Int32Array(gate);
      const workers=['alice','bob'].map((name,i)=>new Worker(__filename,{workerData:{file,name,gate,request:`business-request-${String(i).padStart(16,'0')}`}}));
      const ready=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
      await Promise.all(ready);
      const results=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
      Atomics.store(view,0,1); Atomics.notify(view,0,2);
      const outcome=await Promise.all(results);
      assert.equal(outcome.filter(x=>x.ok).length,1);
      assert.equal(outcome.filter(x=>x.error==='owned').length,1);
      await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{if(w.threadId===-1)return resolve();w.once('exit',code=>code===0?resolve():reject(Error(`worker exit ${code}`)));})));
      db=new Database(file);
      const owners=db.prepare('SELECT owner FROM business_registry WHERE business_id=?').all('kiosk:0');
      const states=db.prepare("SELECT login_key,state_json FROM accounts WHERE login_key IN ('alice','bob') ORDER BY login_key").all();
      assert.equal(owners.length,1); assert.equal(states.filter(r=>JSON.parse(r.state_json).money===4000).length,1);
      assert.equal(states.filter(r=>JSON.parse(r.state_json).money===5000).length,1);
      assert.equal(JSON.parse(states.find(r=>r.login_key===owners[0].owner).state_json).money,4000);
      console.log('✓ fail-closed лаборатория: подмена экономики и неизвестных полей отклонена; клиентская инициализация запрещена');
      console.log('✓ два независимых SQLite-потока: один владелец, одно списание, второму отказ');
    } finally { if(db) db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
  })().catch(e=>{console.error(e);process.exitCode=1;});
}
