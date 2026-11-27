'use strict';
// Isolated experiment: never expose until session auth, authoritative vehicle
// location, save-queue reconciliation, and protected account saves are ready.
const {normalizeLogin}=require('./account-store.cjs');
const CAPACITY=30, MAX=2147483647;
const forbidden=new Set(['__proto__','constructor','prototype']);
const validId=x=>typeof x==='string' && /^[a-z0-9_]{1,64}$/.test(x) && !forbidden.has(x);
function countMap(obj,limit){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
 let sum=0;for(const [k,v] of Object.entries(obj)){
  if(!validId(k)||!Number.isSafeInteger(v)||v<0||v>MAX)return null;
  sum+=v;if(!Number.isSafeInteger(sum)||sum>limit)return null;
 }return sum;
}
function createTrunkTransferLab(db,accounts,allowedItems,supportsVehicle){
 if(!(allowedItems instanceof Set)||typeof supportsVehicle!=='function')throw Error('trusted catalogues required');
 db.exec(`CREATE TABLE IF NOT EXISTS trunk_receipts_lab (login_key TEXT NOT NULL, request_id TEXT NOT NULL, base_revision INTEGER NOT NULL, payload_json TEXT NOT NULL, revision INTEGER NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY(login_key,request_id));
 CREATE TABLE IF NOT EXISTS trunk_cancelled_lab (login_key TEXT NOT NULL, request_id TEXT NOT NULL, base_revision INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(login_key,request_id))`);
 const account=db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?');
 const receipt=db.prepare('SELECT * FROM trunk_receipts_lab WHERE login_key=? AND request_id=?');
 const insert=db.prepare('INSERT INTO trunk_receipts_lab(login_key,request_id,base_revision,payload_json,revision,state_json) VALUES(?,?,?,?,?,?)');
 const cancelled=db.prepare('SELECT * FROM trunk_cancelled_lab WHERE login_key=? AND request_id=?');
 const cancel=db.prepare('INSERT INTO trunk_cancelled_lab(login_key,request_id,base_revision,payload_json) VALUES(?,?,?,?)');
 const requestValid=(name,revision,requestId,uid,item,amount,direction)=>{
  const key=normalizeLogin(name);
  return !!key && Number.isSafeInteger(revision) && revision>=0 && typeof requestId==='string' && /^[a-zA-Z0-9-]{16,80}$/.test(requestId) && typeof uid==='string' && uid.length>=1 && uid.length<=128 && validId(item) && allowedItems.has(item) && Number.isSafeInteger(amount) && amount>=1 && amount<=MAX && ['put','take'].includes(direction);
 };
 const tx=db.transaction((name,revision,requestId,uid,item,amount,direction)=>{
  const key=normalizeLogin(name);
  if(!requestValid(name,revision,requestId,uid,item,amount,direction))return {ok:false,error:'invalid'};
  const payload=JSON.stringify({uid,item,amount,direction});
  const blocked=cancelled.get(key,requestId);
  if(blocked)return {ok:false,error:blocked.base_revision===revision&&blocked.payload_json===payload?'cancelled':'request_reused'};
  const old=receipt.get(key,requestId);
  if(old){if(old.base_revision!==revision||old.payload_json!==payload)return {ok:false,error:'request_reused'};
   // A receipt confirms the operation, but its state is unsafe to apply after
   // any later save. Force recovery from the current authoritative account.
   const current=account.get(key);
   if(!current || current.revision!==old.revision || current.state_json!==old.state_json)
    return {ok:false,error:'stale_receipt',revision:current?.revision ?? null};
   return {ok:true,requestId,replay:true,revision:old.revision,state:JSON.parse(old.state_json)};}
  const row=account.get(key);if(!row||!row.state_json)return {ok:false,error:'no_state'};
  if(row.revision!==revision)return {ok:false,error:'conflict'};
  let state;try{state=JSON.parse(row.state_json);}catch{return {ok:false,error:'invalid_state'};}
  if(!state||typeof state!=='object'||Array.isArray(state)||!Array.isArray(state.vehicles)||countMap(state.inventory,Number.MAX_SAFE_INTEGER)===null)return {ok:false,error:'invalid_state'};
  const matches=state.vehicles.filter(v=>v&&v.uid===uid);
  if(matches.length!==1||!supportsVehicle(matches[0].type))return {ok:false,error:'vehicle'};
  const car=matches[0], trunk=car.trunk===undefined?{}:car.trunk, size=countMap(trunk,CAPACITY);
  if(size===null)return {ok:false,error:'invalid_state'};
  const from=direction==='put'?state.inventory:trunk,to=direction==='put'?trunk:state.inventory;
  const have=Object.hasOwn(from,item)?from[item]:0,existing=Object.hasOwn(to,item)?to[item]:0;
  if(have<amount)return {ok:false,error:'not_enough'};
  if(direction==='put'&&size+amount>CAPACITY)return {ok:false,error:'full'};
  if(existing>MAX-amount)return {ok:false,error:'overflow'};
  from[item]=have-amount;if(from[item]===0)delete from[item];to[item]=existing+amount;car.trunk=trunk;
  const saved=accounts.save(key,state,revision,null);if(!saved.ok)return saved;
  insert.run(key,requestId,revision,payload,saved.revision,JSON.stringify(state));
  return {ok:true,requestId,replay:false,revision:saved.revision,state};
 });
 // One transaction decides whether the exact operation already committed or
 // becomes permanently cancelled, then returns the CURRENT account snapshot.
 // The caller must authenticate name; this lab is not a live endpoint.
 const recover=db.transaction((name,revision,requestId,uid,item,amount,direction)=>{
  const key=normalizeLogin(name);
  if(!requestValid(name,revision,requestId,uid,item,amount,direction))return {ok:false,error:'invalid'};
  const payload=JSON.stringify({uid,item,amount,direction});
  const old=receipt.get(key,requestId), blocked=cancelled.get(key,requestId);
  if((old && (old.base_revision!==revision || old.payload_json!==payload)) || (blocked && (blocked.base_revision!==revision || blocked.payload_json!==payload)))return {ok:false,error:'request_reused'};
  if(old && blocked)return {ok:false,error:'inconsistent_receipts'};
  const row=account.get(key);if(!row || !row.state_json)return {ok:false,error:'no_state'};
  if(row.revision<revision || (old && row.revision<old.revision))return {ok:false,error:'conflict'};
  let state;try{state=JSON.parse(row.state_json);}catch{return {ok:false,error:'invalid_state'};}
  if(!state || typeof state!=='object' || Array.isArray(state))return {ok:false,error:'invalid_state'};
  if(!old && !blocked)cancel.run(key,requestId,revision,payload);
  return {ok:true,requestId,outcome:old?'committed':'cancelled',revision:row.revision,...(old?{committedRevision:old.revision}:{}),state};
 });
 return {
  transfer:(name,revision,requestId,uid,item,amount,direction)=>tx.immediate(name,revision,requestId,uid,item,amount,direction),
  recover:(name,revision,requestId,uid,item,amount,direction)=>recover.immediate(name,revision,requestId,uid,item,amount,direction)
 };
}
module.exports={createTrunkTransferLab,CAPACITY};
