'use strict';
/* Registry business auction adapter for disposable lab databases only.
 * Initialize business-store and auction-store tables first. Client saves,
 * location, migration and durable client sync are NOT addressed here. */
const {normalizeLogin}=require('./account-store.cjs');
function fail(code){const e=Error(code);e.code=code;throw e;}
function createBusinessAuctionLab(db,catalogue){
  if(!catalogue || catalogue.schema!==1 || !Array.isArray(catalogue.businesses))throw TypeError('invalid_catalogue');
  const ids=new Set();
  for(const b of catalogue.businesses){
    if(!b || typeof b.id!=='string' || !/^(?:kiosk|building):(?:0|[1-9]\d{0,8})$/.test(b.id) || ids.has(b.id))throw TypeError('invalid_catalogue');
    ids.add(b.id);
  }
  // Do not interpret an older snapshot-based business lot as a registry lot.
  // No automatic reconciliation or migration of older data is attempted.
  for(const lot of db.prepare("SELECT asset_key,asset_json FROM auction_lots WHERE kind='business' AND status='active'").iterate()){
    let asset;try{asset=JSON.parse(lot.asset_json);}catch{throw Error('incompatible_active_business_lot');}
    if(!ids.has(lot.asset_key) || !asset || asset.registryBusiness!==true || !Number.isSafeInteger(asset.stock) || asset.stock<0 || asset.stock>100)throw Error('incompatible_active_business_lot');
  }
  const registry=db.prepare('SELECT owner,stock FROM business_registry WHERE business_id=?');
  const open=db.prepare("SELECT 1 FROM business_deliveries WHERE business_id=? AND status IN ('open','claimed')");
  const transfer=db.prepare('UPDATE business_registry SET owner=? WHERE business_id=? AND owner=? AND stock=?');
  // Database-enforced lock survives restart and protects other lab handlers too.
  // It intentionally freezes commerce and deliveries until finalization.
  db.exec(`CREATE TRIGGER IF NOT EXISTS lab_auction_business_update BEFORE UPDATE ON business_registry
    WHEN EXISTS(SELECT 1 FROM auction_lots WHERE kind='business' AND status='active' AND asset_key IN (OLD.business_id,NEW.business_id))
    BEGIN SELECT RAISE(ABORT,'business_locked'); END;
  CREATE TRIGGER IF NOT EXISTS lab_auction_business_insert BEFORE INSERT ON business_registry
    WHEN EXISTS(SELECT 1 FROM auction_lots WHERE kind='business' AND status='active' AND asset_key=NEW.business_id)
    BEGIN SELECT RAISE(ABORT,'business_locked'); END;
  CREATE TRIGGER IF NOT EXISTS lab_auction_business_delete BEFORE DELETE ON business_registry
    WHEN EXISTS(SELECT 1 FROM auction_lots WHERE kind='business' AND status='active' AND asset_key=OLD.business_id)
    BEGIN SELECT RAISE(ABORT,'business_locked'); END;
  CREATE TRIGGER IF NOT EXISTS lab_auction_delivery_insert BEFORE INSERT ON business_deliveries
    WHEN EXISTS(SELECT 1 FROM auction_lots WHERE kind='business' AND status='active' AND asset_key=NEW.business_id)
    BEGIN SELECT RAISE(ABORT,'business_locked'); END;
  CREATE TRIGGER IF NOT EXISTS lab_auction_delivery_update BEFORE UPDATE ON business_deliveries
    WHEN EXISTS(SELECT 1 FROM auction_lots WHERE kind='business' AND status='active' AND asset_key IN (OLD.business_id,NEW.business_id))
    BEGIN SELECT RAISE(ABORT,'business_locked'); END;
  CREATE TRIGGER IF NOT EXISTS lab_auction_delivery_delete BEFORE DELETE ON business_deliveries
    WHEN EXISTS(SELECT 1 FROM auction_lots WHERE kind='business' AND status='active' AND asset_key=OLD.business_id)
    BEGIN SELECT RAISE(ABORT,'business_locked'); END;`);
  function check(key,seller){
    if(!db.inTransaction)fail('transaction_required');
    if(!ids.has(key))fail('invalid_asset');
    if(typeof seller!=='string' || !seller || normalizeLogin(seller)!==seller)fail('invalid_actor');
    const row=registry.get(key);
    if(!row || row.owner!==seller)fail('not_owned');
    if(!Number.isSafeInteger(row.stock) || row.stock<0 || row.stock>100)fail('invalid_business');
    if(open.get(key))fail('delivery_open');
    return row;
  }
  return {
    authorize({actor,key}){check(key,actor);},
    reserve({actor,key}){const row=check(key,actor);return {registryBusiness:true,stock:row.stock};},
    settle({key,seller,winner,asset}){
      const row=check(key,seller);
      if(!asset || asset.registryBusiness!==true || !Number.isSafeInteger(asset.stock) || asset.stock!==row.stock)fail('business_changed');
      if(winner!==null){
        if(typeof winner!=='string' || !winner || normalizeLogin(winner)!==winner || winner===seller)fail('invalid_actor');
        if(!transfer.run(winner,key,seller,row.stock).changes)fail('business_changed');
      }
    },
  };
}
module.exports={createBusinessAuctionLab};
