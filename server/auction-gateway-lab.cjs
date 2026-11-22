'use strict';
/* Isolated experimental gateway, NEVER wired to server.js/Colab.
 * Its strict save policy blocks all legacy economic actions. The caller MUST
 * authenticate the session, supply the actor from the session (not a packet),
 * validate presence in the auction hall, persist requests across reconnects,
 * and reconcile/freeze live clients before this could be used in production. */
const {isDeepStrictEqual} = require('node:util');
const {normalizeLogin} = require('./account-store.cjs');
const {createAuctionStore} = require('./auction-store.cjs');
const {createListingPolicy} = require('./auction-listing-policy.cjs');
const {createEconomyTransactions} = require('./economy-transaction.cjs');
const {createShopPurchasesLab} = require('./shop-purchases-lab.cjs');
const {createBusinessAuctionLab} = require('./business-auction-lab.cjs');
const SAFE = new Set(['look','health','food','water','energy','gameTime','playTime']);
function createAuctionGatewayLab(db, accounts, catalogue, notify = () => {}, shopConfig = null, businessCatalogue = null) {
  const authorizeListing=createListingPolicy(db,catalogue);
  // Explicit opt-in on the isolated gateway; registry tables must already exist.
  // Legacy active business lots must be handled separately, not silently mixed.
  if (businessCatalogue && shopConfig && shopConfig.options?.ownership!=='registry') throw TypeError('registry_shop_required');
  let auction=createAuctionStore(db,{authorizeListing});
  if (businessCatalogue) {
    const businessAdapter=createBusinessAuctionLab(db,businessCatalogue);
    auction=createAuctionStore(db,{authorizeListing,businessAdapter});
  }
  const receipts = createEconomyTransactions(db);
  const shopBuy = shopConfig ? createShopPurchasesLab(db,shopConfig.catalogue,shopConfig.authorize,shopConfig.options) : null;
  const get = db.prepare('SELECT state_json,revision FROM accounts WHERE login_key=?');
  function updateNotice(names) {
    for (const name of new Set(names.filter(Boolean))) {
      try { const row=get.get(name); if (row) notify(name,row.revision); } catch { /* committed operation must not be reported as failed */ }
    }
  }
  function load(name) {
    const actor=normalizeLogin(name); if (!actor || actor!==name) return {ok:false,error:'invalid_actor'};
    const row=get.get(actor); if (!row || !row.state_json) return {ok:false,error:'no_account_state'};
    try { const state=JSON.parse(row.state_json); if (!state || Array.isArray(state) || typeof state!=='object') throw Error(); return {ok:true,revision:row.revision,state}; }
    catch { return {ok:false,error:'invalid_state'}; }
  }
  // Fail closed on *all* fields not explicitly safe. This protects more than a
  // denylist: unknown/new game fields cannot silently bypass the policy.
  // It intentionally blocks normal legacy purchases, jobs and vehicle updates.
  const saveTx=db.transaction((actor,revision,saveId,state)=>{
    const current=load(actor); if (!current.ok) return current;
    if (!Number.isSafeInteger(revision) || revision<0 || !state || typeof state!=='object' || Array.isArray(state)) return {ok:false,error:'invalid'};
    if (current.revision !== revision) return accounts.save(actor,state,revision,saveId); // only exact, already-committed replay can succeed
    for (const key of new Set([...Object.keys(current.state),...Object.keys(state)])) {
      if (!SAFE.has(key) && (!Object.hasOwn(current.state,key) || !Object.hasOwn(state,key) || !isDeepStrictEqual(current.state[key],state[key]))) return {ok:false,error:'protected_state'};
    }
    return accounts.save(actor,state,revision,saveId);
  });
  function execute(actor,revision,requestId,action,payload,now=Date.now()) {
    if (typeof actor!=='string' || !actor || normalizeLogin(actor)!==actor || !Number.isSafeInteger(now) || now<0) return {ok:false,error:'invalid'};
    if (!payload || typeof payload!=='object' || Array.isArray(payload)) return {ok:false,error:'invalid'};
    let prior=null, result;
    try {
      result=receipts.execute(actor,revision,requestId,action,payload,({actor,revision,requestId,payload})=>{
        if (action==='shop_buy' && shopBuy) return shopBuy({actor,revision,payload});
        if (action==='list') return auction.list(actor,revision,payload.kind,payload.key,payload.price,requestId,now);
        if (action==='bid') { prior=Number.isSafeInteger(payload.id) ? auction.get(payload.id)?.bidder : null; return auction.bid(actor,revision,payload.id,payload.bid,requestId,now); }
        const e=Error('invalid_action');e.code='invalid_action';throw e;
      });
    } catch(e) { return {ok:false,requestId,error:typeof e?.code==='string' && /^[a-z_]{1,40}$/.test(e.code) ? e.code : 'internal'}; }
    if (result.ok && !result.replay) updateNotice([actor,prior,action==='shop_buy' ? result.result.owner : null]);
    return result;
  }
  // Test-only recovery; actor comes from authenticated adapter, never payload.
  function recover(actor,request) {
    if(typeof actor!=='string' || !actor || normalizeLogin(actor)!==actor || !request || typeof request!=='object' || Array.isArray(request)) return {ok:false,error:'invalid'};
    try { return receipts.recover(actor,request.revision,request.requestId,request.action,request.payload); }
    catch { return {ok:false,error:'internal'}; }
  }
  function finish(id,now=Date.now()) {
    if (!Number.isSafeInteger(id) || id<=0 || !Number.isSafeInteger(now) || now<0) return {ok:false,error:'invalid'};
    let lot;
    try {
      const done=db.transaction(() => { lot=auction.get(id); return auction.finish(id,now); })();
      if (done) updateNotice([lot.seller,lot.bidder]);
      return {ok:true,settled:done};
    } catch(e) { return {ok:false,error:typeof e?.code==='string' && /^[a-z_]{1,40}$/.test(e.code) ? e.code : 'internal'}; }
  }
  return {snapshot:load,save:(actor,revision,saveId,state)=>saveTx(actor,revision,saveId,state),execute,recover,finish,publicLots:now=>auction.publicLots(now),due:now=>auction.due(now)};
}
module.exports={createAuctionGatewayLab};
