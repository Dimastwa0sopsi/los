'use strict';
/* Experimental listing checks; does NOT secure the normal account_save API.
 * Caller must run this on the same SQLite connection inside the transaction
 * that moves the asset into escrow. A later client save can still forge assets;
 * this policy is not sufficient to expose live auction transactions. */
const {normalizeLogin} = require('./account-store.cjs');
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function createListingPolicy(db, catalogue) {
  if (!catalogue || catalogue.schema !== 1 || !catalogue.housing || typeof catalogue.housing !== 'object' ||
      Array.isArray(catalogue.housing) || !Array.isArray(catalogue.kiosks) || !Array.isArray(catalogue.vehicles)) throw new TypeError('invalid_catalogue');
  const housing = new Map(Object.entries(catalogue.housing));
  const kiosks = new Set(catalogue.kiosks), vehicles = new Set(catalogue.vehicles);
  if (kiosks.size !== catalogue.kiosks.length || vehicles.size !== catalogue.vehicles.length ||
      [...housing].some(([k,v]) => !/^(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/.test(k) || !['house','apartment'].includes(v)) ||
      [...kiosks].some(k => typeof k !== 'string' || !/^(?:0|[1-9]\d*)$/.test(k)) ||
      [...vehicles].some(v => typeof v !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(v))) throw new TypeError('invalid_catalogue');
  const all = db.prepare('SELECT login_key,state_json FROM accounts');
  return function authorizeListing({actor,kind,key}) {
    if (!db.inTransaction) fail('transaction_required');
    if (typeof actor !== 'string' || !actor || normalizeLogin(actor) !== actor || typeof key !== 'string' || !key || key.length > 128) fail('invalid_asset');
    if (kind === 'business') { if (!kiosks.has(key)) fail('invalid_asset'); }
    else if (kind === 'house' || kind === 'apartment') { if (housing.get(key) !== kind) fail('invalid_asset'); }
    else if (kind !== 'vehicle') fail('invalid_asset');
    let owners = 0, actorOwns = false;
    for (const row of all.iterate()) {
      if (row.state_json === null) continue;
      let state;
      try { state = JSON.parse(row.state_json); } catch { fail('incomplete_ownership'); }
      if (!state || typeof state !== 'object' || Array.isArray(state) || typeof row.login_key !== 'string' || !row.login_key) fail('incomplete_ownership');
      const field = kind === 'vehicle' ? 'vehicles' : kind === 'business' ? 'kiosks' : 'properties';
      if (!Array.isArray(state[field])) fail('incomplete_ownership');
      const seen = new Set();
      for (const item of state[field]) {
        let id;
        if (kind === 'vehicle') {
          if (!item || typeof item !== 'object' || typeof item.uid !== 'string' || !item.uid || item.uid.length > 128) fail('incomplete_ownership');
          id = item.uid;
          // A matching vehicle must have a known model; never trust the client's kind.
          if (id === key && (typeof item.type !== 'string' || !vehicles.has(item.type))) fail('invalid_asset');
        } else if (kind === 'business') {
          if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.id) || item.id < 0 || !kiosks.has(String(item.id))) fail('incomplete_ownership');
          id = String(item.id);
        } else {
          if (typeof item !== 'string' || !housing.has(item)) fail('incomplete_ownership');
          id = item;
        }
        if (seen.has(id)) fail('incomplete_ownership');
        seen.add(id);
        if (id === key) { owners++; if (row.login_key === actor) actorOwns = true; }
      }
    }
    if (!actorOwns) fail('not_owned');
    if (owners !== 1) fail('asset_conflict');
  };
}
module.exports={createListingPolicy};
