'use strict';
/* Experimental reconciliation for pending account saves after an auction.
 * Not exposed over the network until clients can pause their save queue and
 * atomically install the reconciled state and revision. */
const { createHash } = require('node:crypto');
const { normalizeLogin } = require('./account-store.cjs');
const { createRevisionHistory } = require('./account-revisions.cjs');
const { reconcileAuctionState } = require('./auction-reconcile.cjs');
function createAuctionSave(db, accounts) {
  db.exec(`CREATE TABLE IF NOT EXISTS auction_save_requests (
    login_key TEXT NOT NULL, save_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
    PRIMARY KEY(login_key,save_id)
  )`);
  const history = createRevisionHistory(db);
  const previous = db.prepare('SELECT payload_hash FROM auction_save_requests WHERE login_key=? AND save_id=?');
  const remember = db.prepare('INSERT INTO auction_save_requests VALUES (?,?,?)');
  const get = db.prepare('SELECT state_json, revision, save_id FROM accounts WHERE login_key=?');
  const run = db.transaction((name, local, baseRevision, saveId) => {
    const key = normalizeLogin(name);
    if (!key || !Number.isSafeInteger(baseRevision) || baseRevision < 0 || typeof saveId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(saveId)) return {ok:false,error:'invalid'};
    const row = get.get(key);
    if (!row || !row.state_json) return {ok:false,error:'no_account_state'};
    let payload;
    try { payload = JSON.stringify([baseRevision, local]); } catch { return {ok:false,error:'invalid'}; }
    if (!payload || Buffer.byteLength(payload, 'utf8') > 1024 * 1024 + 128) return {ok:false,error:'too_large'};
    const hash = createHash('sha256').update(payload).digest('hex');
    const prior = previous.get(key, saveId);
    if (prior) return prior.payload_hash === hash
      ? {ok:true,revision:row.revision,state:JSON.parse(row.state_json),replay:true}
      : {ok:false,error:'request_reused'};
    if (row.revision < baseRevision) return {ok:false,error:'conflict'};
    const base = row.revision === baseRevision ? JSON.parse(row.state_json) : history.get(key, baseRevision);
    if (!base) return {ok:false,error:'base_expired'};
    const merged = reconcileAuctionState(base, local, JSON.parse(row.state_json));
    if (!merged.ok) return {ok:false,error:'conflict',conflicts:merged.conflicts};
    const saved = accounts.save(key, merged.state, row.revision, saveId);
    if (!saved.ok) return saved;
    remember.run(key, saveId, hash);
    return {ok:true,revision:saved.revision,state:merged.state,replay:false};
  });
  return { save: (name, local, baseRevision, saveId) => run(name, local, baseRevision, saveId) };
}
module.exports = { createAuctionSave };
