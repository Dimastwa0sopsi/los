'use strict';
// Offline laboratory only. The caller must authenticate, authorize proximity,
// coordinate save queues and use the server clock before exposing this.
const {normalizeLogin} = require('./account-store.cjs');
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const REWARD = 1000;
const MAX_MONEY = 2_147_483_647;
function createHamsterRewardLab(db, accounts) {
  db.exec(`CREATE TABLE IF NOT EXISTS hamster_cooldowns_lab (
    login_key TEXT PRIMARY KEY, next_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS hamster_receipts_lab (
    login_key TEXT NOT NULL, request_id TEXT NOT NULL, base_revision INTEGER NOT NULL,
    revision INTEGER NOT NULL, state_json TEXT NOT NULL, next_at INTEGER NOT NULL,
    PRIMARY KEY(login_key,request_id)
  ); CREATE TABLE IF NOT EXISTS hamster_cancelled_lab (
    login_key TEXT NOT NULL, request_id TEXT NOT NULL, base_revision INTEGER NOT NULL,
    PRIMARY KEY(login_key,request_id)
  );`);
  const getAccount=db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?');
  const getCooldown=db.prepare('SELECT next_at FROM hamster_cooldowns_lab WHERE login_key=?');
  const setCooldown=db.prepare('INSERT INTO hamster_cooldowns_lab(login_key,next_at) VALUES(?,?) ON CONFLICT(login_key) DO UPDATE SET next_at=excluded.next_at');
  const getReceipt=db.prepare('SELECT * FROM hamster_receipts_lab WHERE login_key=? AND request_id=?');
  const putReceipt=db.prepare('INSERT INTO hamster_receipts_lab(login_key,request_id,base_revision,revision,state_json,next_at) VALUES(?,?,?,?,?,?)');
  const getCancelled=db.prepare('SELECT base_revision FROM hamster_cancelled_lab WHERE login_key=? AND request_id=?');
  const putCancelled=db.prepare('INSERT INTO hamster_cancelled_lab(login_key,request_id,base_revision) VALUES(?,?,?)');
  const validRequest=(key,revision,id)=>!!key && Number.isSafeInteger(revision) && revision>=0 && typeof id==='string' && /^[a-zA-Z0-9-]{16,80}$/.test(id);
  const tx=db.transaction((name,revision,requestId,now)=>{
    const key=normalizeLogin(name);
    if(!validRequest(key,revision,requestId) || !Number.isSafeInteger(now) || now<0 || now>Number.MAX_SAFE_INTEGER-COOLDOWN_MS) return {ok:false,error:'invalid'};
    const cancelled=getCancelled.get(key,requestId);
    if(cancelled)return {ok:false,error:cancelled.base_revision===revision?'cancelled':'request_reused'};
    const receipt=getReceipt.get(key,requestId);
    if(receipt){
      if(receipt.base_revision!==revision)return {ok:false,error:'request_reused'};
      const current=getAccount.get(key);
      // An old receipt must never be installed as the current account snapshot:
      // another save or operation may already have advanced the account.
      if(!current || current.revision!==receipt.revision || current.state_json!==receipt.state_json)
        return {ok:false,error:'receipt_stale',committed:true,revision:receipt.revision};
      return {ok:true,replay:true,revision:receipt.revision,state:JSON.parse(receipt.state_json),nextAt:receipt.next_at,reward:REWARD};
    }
    const row=getAccount.get(key);
    if(!row || !row.state_json)return {ok:false,error:'no_state'};
    if(row.revision!==revision)return {ok:false,error:'conflict'};
    const cooldown=getCooldown.get(key);
    if(cooldown && now<cooldown.next_at)return {ok:false,error:'cooldown',nextAt:cooldown.next_at};
    let state;try{state=JSON.parse(row.state_json);}catch{return {ok:false,error:'invalid_state'};}
    if(!state || typeof state!=='object' || Array.isArray(state) || !Number.isSafeInteger(state.money) || state.money<0 || state.money>MAX_MONEY-REWARD)return {ok:false,error:'invalid_state'};
    state.money+=REWARD;
    const result=accounts.save(key,state,revision,null);
    if(!result.ok)return result;
    const nextAt=now+COOLDOWN_MS;
    setCooldown.run(key,nextAt);
    putReceipt.run(key,requestId,revision,result.revision,JSON.stringify(state),nextAt);
    return {ok:true,replay:false,revision:result.revision,state,nextAt,reward:REWARD};
  });
  // Atomically resolve an uncertain request. If it did not commit, persist a
  // tombstone so even a late packet cannot commit after recovery. The caller
  // must authenticate the account and reconcile/freeze its save queue.
  const recover=db.transaction((name,revision,requestId)=>{
    const key=normalizeLogin(name);
    if(!validRequest(key,revision,requestId))return {ok:false,error:'invalid'};
    const receipt=getReceipt.get(key,requestId), cancelled=getCancelled.get(key,requestId);
    if((receipt && receipt.base_revision!==revision)||(cancelled && cancelled.base_revision!==revision))return {ok:false,error:'request_reused'};
    if(receipt && cancelled)return {ok:false,error:'inconsistent_receipts'};
    const row=getAccount.get(key);
    if(!row || !row.state_json)return {ok:false,error:'no_state'};
    if(!Number.isSafeInteger(row.revision) || row.revision<revision || (receipt && row.revision<receipt.revision))return {ok:false,error:'conflict'};
    let state;try{state=JSON.parse(row.state_json);}catch{return {ok:false,error:'invalid_state'};}
    if(!state || typeof state!=='object' || Array.isArray(state))return {ok:false,error:'invalid_state'};
    if(!receipt && !cancelled)putCancelled.run(key,requestId,revision);
    return {ok:true,requestId,outcome:receipt?'committed':'cancelled',revision:row.revision,state,...(receipt?{committedRevision:receipt.revision,nextAt:receipt.next_at,reward:REWARD}:{})};
  });
  return {claim:(name,revision,requestId,now)=>tx.immediate(name,revision,requestId,now),recover:(name,revision,requestId)=>recover.immediate(name,revision,requestId)};
}
module.exports={createHamsterRewardLab,COOLDOWN_MS,REWARD};
