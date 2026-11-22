'use strict';
/* Experimental atomic operation receipt. NOT exposed by the live server.
 * Handlers are trusted server code and must synchronously use this same SQLite
 * connection; the adapter must authenticate, authorize and validate context.
 * It does not protect account_save or keep a client frozen by itself. */
const {createHash} = require('node:crypto');
const {normalizeLogin, MAX_STATE_BYTES} = require('./account-store.cjs');
const {createRevisionHistory} = require('./account-revisions.cjs');
const REQ = /^[a-zA-Z0-9-]{16,80}$/;
function createEconomyTransactions(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS economy_operation_receipts (
    actor TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL, result_revision INTEGER NOT NULL,
    PRIMARY KEY(actor, request_id)
  );
  CREATE TABLE IF NOT EXISTS economy_operation_cancellations (
    actor TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    PRIMARY KEY(actor,request_id)
  )`);
  const history = createRevisionHistory(db);
  const account = db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?');
  const previous = db.prepare('SELECT request_hash,result_json,result_revision FROM economy_operation_receipts WHERE actor=? AND request_id=?');
  const insert = db.prepare('INSERT INTO economy_operation_receipts VALUES (?,?,?,?,?)');
  const canceled = db.prepare('SELECT request_hash FROM economy_operation_cancellations WHERE actor=? AND request_id=?');
  const cancel = db.prepare('INSERT INTO economy_operation_cancellations VALUES (?,?,?)');
  function fingerprint(revision,requestId,action,payload) {
    if (!Number.isSafeInteger(revision) || revision < 0 || typeof requestId !== 'string' || !REQ.test(requestId) ||
        typeof action !== 'string' || !/^[a-z_]{1,32}$/.test(action)) return null;
    let json; try { json=JSON.stringify([action,revision,payload]); } catch { return null; }
    if (typeof json !== 'string' || Buffer.byteLength(json,'utf8') > MAX_STATE_BYTES) return null;
    return createHash('sha256').update(json).digest('hex');
  }
  const tx = db.transaction((name, revision, requestId, action, payload, handler) => {
    const actor = normalizeLogin(name);
    const hash = fingerprint(revision,requestId,action,payload);
    if (!actor || !hash || typeof handler !== 'function') return {ok:false,error:'invalid'};
    const stopped=canceled.get(actor,requestId);
    if (stopped) return {ok:false,error:stopped.request_hash===hash ? 'request_cancelled' : 'request_reused'};
    const old = previous.get(actor,requestId);
    if (old) {
      if (old.request_hash !== hash) return {ok:false,error:'request_reused'};
      const current = account.get(actor);
      const state = current && current.revision === old.result_revision && current.state_json
        ? JSON.parse(current.state_json) : history.get(actor,old.result_revision);
      // Never return a later state as if it were the result of the old action.
      if (!state) return {ok:false,error:'receipt_expired',committed:true,requestId,revision:old.result_revision};
      return {ok:true,replay:true,requestId,revision:old.result_revision,state,result:JSON.parse(old.result_json)};
    }
    const before = account.get(actor);
    if (!before || !before.state_json) return {ok:false,error:'no_account_state'};
    if (before.revision !== revision) return {ok:false,error:'conflict'};
    // Errors escape the transaction and roll back all changes, including other accounts.
    const result = handler({actor,revision,requestId,payload});
    if (result && typeof result.then === 'function') throw new Error('async_handler_forbidden');
    const resultJson = JSON.stringify(result);
    if (!resultJson || Buffer.byteLength(resultJson,'utf8') > 8192) throw new Error('invalid_handler_result');
    const after = account.get(actor);
    if (!after || !after.state_json || !Number.isSafeInteger(after.revision) || after.revision <= revision) throw new Error('handler_did_not_update_actor');
    const state = history.get(actor,after.revision);
    if (!state || JSON.stringify(state) !== JSON.stringify(JSON.parse(after.state_json))) throw new Error('missing_revision_history');
    insert.run(actor,requestId,hash,resultJson,after.revision);
    return {ok:true,replay:false,requestId,revision:after.revision,state,result};
  });
  // Recovery snapshot and the decision about the pending request are atomic.
  // If absent, a durable tombstone prevents even a delayed packet from later
  // committing. Receipts and tombstones must not be pruned independently.
  const recovery = db.transaction((name,revision,requestId,action,payload) => {
    const actor=normalizeLogin(name),hash=fingerprint(revision,requestId,action,payload);
    if (!actor || !hash) return {ok:false,error:'invalid'};
    const row=account.get(actor);
    if (!row || !row.state_json) return {ok:false,error:'no_account_state'};
    let state;try { state=JSON.parse(row.state_json); } catch { return {ok:false,error:'invalid_state'}; }
    if (!state || typeof state!=='object' || Array.isArray(state) || !Number.isSafeInteger(row.revision) || row.revision<revision) return {ok:false,error:'invalid_state'};
    const old=previous.get(actor,requestId), stopped=canceled.get(actor,requestId);
    if (old && stopped) throw Error('conflicting_request_records');
    if ((old && old.request_hash!==hash) || (stopped && stopped.request_hash!==hash)) return {ok:false,error:'request_reused'};
    if (!old && !stopped) cancel.run(actor,requestId,hash);
    return {ok:true,requestId,outcome:old ? 'committed' : 'cancelled',revision:row.revision,state,
      ...(old ? {committedRevision:old.result_revision,result:JSON.parse(old.result_json)} : {})};
  });
  return {
    execute: (name,revision,requestId,action,payload,handler) => tx(name,revision,requestId,action,payload,handler),
    recover: (name,revision,requestId,action,payload) => recovery(name,revision,requestId,action,payload),
  };
}
module.exports = {createEconomyTransactions};
