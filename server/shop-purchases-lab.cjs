'use strict';
/* Experimental protected shop purchase handler. Never connected to server.js.
 * Must run inside economy-transaction's SQLite transaction. Authorize callback
 * is trusted server code and MUST verify presence. In default mode it must
 * also verify state ownership. Registry mode is experimental, requires a
 * properly initialized registry and assumes that registry is authoritative. */
const {normalizeLogin,MAX_STATE_BYTES}=require('./account-store.cjs');
const {createRevisionHistory}=require('./account-revisions.cjs');
const MAX=2147483647;
const unsafe=k=>['__proto__','constructor','prototype'].includes(k);
function fail(code){const e=Error(code);e.code=code;throw e;}
function createShopPurchasesLab(db,catalogue,authorize,{ownership = 'state'}={}){
  if(ownership!=='state' && ownership!=='registry')throw TypeError('invalid_ownership_mode');
  if(!catalogue || catalogue.schema!==1 || !catalogue.shops || !catalogue.items || typeof authorize!=='function')throw TypeError('invalid_shop_configuration');
  const shops=structuredClone(catalogue.shops), items=structuredClone(catalogue.items);
  if(typeof shops!=='object' || Array.isArray(shops) || typeof items!=='object' || Array.isArray(items))throw TypeError('invalid_catalogue');
  for(const [id,meta] of Object.entries(items)) {
    if(unsafe(id) || !/^[a-z0-9_]{1,64}$/.test(id) || !meta || !Number.isSafeInteger(meta.price) || meta.price<1 || meta.price>MAX ||
       typeof meta.weapon!=='boolean' || typeof meta.firearm!=='boolean' || (meta.firearm && !meta.weapon) ||
       !Number.isSafeInteger(meta.ammo) || meta.ammo<0 || meta.ammo>10000 ||
       (meta.ammo>0 && (typeof meta.ammoType!=='string' || unsafe(meta.ammoType) || !/^[a-z0-9_]{1,12}$/.test(meta.ammoType))) ||
       (meta.ammo===0 && meta.ammoType!==null) || (meta.weapon && meta.ammo>0)) throw TypeError('invalid_catalogue');
  }
  for(const [id,list] of Object.entries(shops)){
    if(!/^(?:building|kiosk):(?:0|[1-9]\d{0,8})$/.test(id) || !Array.isArray(list) || list.length===0 || new Set(list).size!==list.length || list.some(v=>typeof v!=='string' || !Object.hasOwn(items,v))) throw TypeError('invalid_catalogue');
  }
  const get=db.prepare('SELECT state_json,revision FROM accounts WHERE login_key=?');
  // Fail at initialization if the registry was not explicitly created.
  const registry=ownership==='registry' ? db.prepare('SELECT owner,stock FROM business_registry WHERE business_id=?') : null;
  const consume=registry ? db.prepare('UPDATE business_registry SET stock=stock-? WHERE business_id=? AND owner=? AND stock>=?') : null;
  const hasAuction=registry && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auction_lots'").get();
  const locked=hasAuction ? db.prepare("SELECT 1 FROM auction_lots WHERE kind='business' AND asset_key=? AND status='active'") : null;
  const update=db.prepare('UPDATE accounts SET state_json=?,revision=revision+1,save_id=NULL WHERE login_key=? AND revision=?');
  const history=createRevisionHistory(db);
  return function purchase({actor,revision,payload}){
    if(!db.inTransaction)fail('transaction_required');
    if(typeof actor!=='string' || !actor || normalizeLogin(actor)!==actor || !Number.isSafeInteger(revision) || revision<0)fail('invalid');
    if(!payload || typeof payload!=='object' || Array.isArray(payload) || Object.keys(payload).sort().join(',')!=='item,quantity,shopId')fail('invalid_purchase');
    const {shopId,item,quantity}=payload;
    if(typeof shopId!=='string' || !Object.hasOwn(shops,shopId) || typeof item!=='string' || !Object.hasOwn(items,item) || !shops[shopId].includes(item) || !Number.isSafeInteger(quantity) || quantity<1 || quantity>5)fail('invalid_purchase');
    // Must be actual trusted context, not a client-provided position/flag.
    if(authorize({actor,shopId})!==true)fail('not_authorized');
    if(locked?.get(shopId))fail('business_locked');
    const business=registry?.get(shopId);
    if(business && (business.owner!==null && (typeof business.owner!=='string' || !business.owner || normalizeLogin(business.owner)!==business.owner) || !Number.isSafeInteger(business.stock) || business.stock<0 || business.stock>100))fail('invalid_business');
    const owner=business?.owner ?? null;
    if(owner && business.stock<quantity)fail('out_of_stock');
    const meta=items[item];if(meta.weapon && quantity!==1)fail('invalid_purchase');
    const row=get.get(actor);if(!row || !row.state_json)fail('no_account_state');if(row.revision!==revision)fail('conflict');
    let state;try{state=JSON.parse(row.state_json);}catch{fail('invalid_state');}
    if(!state || typeof state!=='object' || Array.isArray(state) || !Number.isSafeInteger(state.money) || state.money<0 || state.money>MAX || !state.inventory || typeof state.inventory!=='object' || Array.isArray(state.inventory))fail('invalid_state');
    if(meta.firearm && state.documents?.weapon!==true)fail('weapon_license_required');
    const cost=meta.price*quantity;if(state.money<cost)fail('insufficient_funds');
    if(meta.ammo){
      if(state.ammoBy!==undefined && (!state.ammoBy || typeof state.ammoBy!=='object' || Array.isArray(state.ammoBy)))fail('invalid_state');
      const ammo=state.ammoBy ?? {}, count=Object.hasOwn(ammo,meta.ammoType)?ammo[meta.ammoType]:0, add=meta.ammo*quantity;
      if(!Number.isSafeInteger(count) || count<0 || count>MAX-add)fail('inventory_limit');
      ammo[meta.ammoType]=count+add;state.ammoBy=ammo;
    }else{
      const count=Object.hasOwn(state.inventory,item)?state.inventory[item]:0;
      if(!Number.isSafeInteger(count) || count<0 || count>MAX-quantity)fail('inventory_limit');
      if(meta.weapon && count>0)fail('already_owned');
      state.inventory[item]=count+quantity;
    }
    state.money-=cost;
    // A private owner receives the full sale price, atomically with stock and
    // buyer. A self-purchase costs no net money but still consumes stock.
    if(owner===actor) state.money+=cost;
    else if(owner){
      const ownerRow=get.get(owner); if(!ownerRow || !ownerRow.state_json)fail('invalid_business_owner');
      let ownerState;try{ownerState=JSON.parse(ownerRow.state_json);}catch{fail('invalid_business_owner');}
      if(!ownerState || typeof ownerState!=='object' || Array.isArray(ownerState) || !Number.isSafeInteger(ownerState.money) || ownerState.money<0 || ownerState.money>MAX-cost)fail('owner_money_limit');
      ownerState.money+=cost;const ownerJson=JSON.stringify(ownerState);
      if(Buffer.byteLength(ownerJson,'utf8')>MAX_STATE_BYTES)fail('state_too_large');
      if(!update.run(ownerJson,owner,ownerRow.revision).changes)fail('conflict');
      history.record(owner,ownerRow.revision,ownerRow.state_json);history.record(owner,ownerRow.revision+1,ownerJson);
    }
    if(owner && !consume.run(quantity,shopId,owner,quantity).changes)fail('out_of_stock');
    const json=JSON.stringify(state);
    if(Buffer.byteLength(json,'utf8')>MAX_STATE_BYTES)fail('state_too_large');
    if(!update.run(json,actor,revision).changes)fail('conflict');
    history.record(actor,revision,row.state_json);history.record(actor,revision+1,json);
    return {shopId,item,quantity,cost,revision:revision+1,owner,stock:owner ? business.stock-quantity : null};
  };
}
module.exports={createShopPurchasesLab};
