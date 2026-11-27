'use strict';
/* Isolated prototype: not a live protocol. Requires authenticated session,
 * trustworthy location checks, account-save coordination and recovery. Client
 * account_save remains authoritative today, so this cannot secure the economy. */
const crypto=require('node:crypto');
const {createEconomyTransactions}=require('./economy-transaction.cjs');
const MAX=2147483647, RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const PRICES=Object.freeze({durman:200,cigarettes:7});
function fail(code){const e=new Error(code);e.code=code;throw e;}
function createCasinoOperationsLab(db,accounts,authorize,draw=()=>crypto.randomInt(37)){
 if(typeof authorize!=='function'||typeof draw!=='function')throw TypeError('invalid_configuration');
 const tx=createEconomyTransactions(db),get=db.prepare('SELECT state_json,revision FROM accounts WHERE login_key=?');
 function handle({actor,revision,payload},action){
  if(!db.inTransaction)fail('transaction_required');
  if(authorize(actor)!==true)fail('not_authorized');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('invalid');
  const row=get.get(actor);if(!row || row.revision!==revision || !row.state_json)fail('conflict');
  let state;try{state=JSON.parse(row.state_json);}catch{fail('invalid_state');}
  if(!state||typeof state!=='object'||Array.isArray(state)||!Number.isSafeInteger(state.money)||state.money<0||state.money>MAX)fail('invalid_state');
  let result;
  if(action==='casino_roulette'){
   if(Object.keys(payload).sort().join(',')!=='bet,choice'||!Number.isSafeInteger(payload.bet)||payload.bet<1000||payload.bet>1000000||!['red','black','green'].includes(payload.choice))fail('invalid');
   if(state.money<payload.bet)fail('funds');
   const n=draw();if(!Number.isInteger(n)||n<0||n>36)fail('random');
   const color=n===0?'green':RED.has(n)?'red':'black';const payout=color===payload.choice?payload.bet*(color==='green'?36:2):0;
   const money=state.money-payload.bet+payout;if(money>MAX)fail('balance_limit');state.money=money;
   result={number:n,color,payout};
  }else if(action==='casino_buy'){
   if(Object.keys(payload).join(',')!=='item'||typeof payload.item!=='string'||!Object.prototype.hasOwnProperty.call(PRICES,payload.item))fail('invalid');
   const price=PRICES[payload.item],inv=state.inventory;
   if(!inv||typeof inv!=='object'||Array.isArray(inv))fail('invalid_state');
   const count=Object.prototype.hasOwnProperty.call(inv,payload.item)?inv[payload.item]:0;
   if(!Number.isSafeInteger(count)||count<0||count>=MAX)fail('invalid_state');
   if(state.money<price)fail('funds');state.money-=price;inv[payload.item]=count+1;result={item:payload.item,price};
  }else fail('invalid');
  const saved=accounts.save(actor,state,revision,null);if(!saved.ok)fail(saved.error);
  return result;
 }
 return {
  execute:(actor,revision,requestId,action,payload)=>{
   if(!['casino_roulette','casino_buy'].includes(action))return {ok:false,error:'invalid'};
   try{return tx.execute(actor,revision,requestId,action,payload,ctx=>handle(ctx,action));}catch(e){return {ok:false,error:e.code||'internal'};}
  },
  recover:(actor,revision,requestId,action,payload)=>{
   if(!['casino_roulette','casino_buy'].includes(action))return {ok:false,error:'invalid'};
   return tx.recover(actor,revision,requestId,action,payload);
  }
 };
}
module.exports={createCasinoOperationsLab,PRICES};
