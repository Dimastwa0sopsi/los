'use strict';
/* Fail-closed experiment, deliberately NOT wired to the live server.
 * No client fields are trusted. This intentionally rejects legitimate changes
 * until each has a server-authoritative operation and synchronization path.
 * Initialization must also be server-owned; the client cannot choose a base.
 */
const {isDeepStrictEqual} = require('node:util');
const {normalizeLogin, MAX_STATE_BYTES} = require('./account-store.cjs');

function createProtectedSaveLab(db, accounts) {
  const get = db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?');
  const save = db.transaction((name, candidate, revision, saveId) => {
    const key = normalizeLogin(name);
    if (!key || !Number.isSafeInteger(revision) || revision < 0 ||
        typeof saveId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(saveId) ||
        !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {ok:false,error:'invalid'};
    let encoded;
    try { encoded = JSON.stringify(candidate); } catch { return {ok:false,error:'invalid'}; }
    if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_STATE_BYTES) return {ok:false,error:'too_large'};
    const row = get.get(key);
    if (!row || row.state_json === null) return {ok:false,error:'no_trusted_state'};
    let trusted, parsed;
    try { trusted = JSON.parse(row.state_json); parsed = JSON.parse(encoded); } catch { return {ok:false,error:'invalid_state'}; }
    if (!trusted || typeof trusted !== 'object' || Array.isArray(trusted)) return {ok:false,error:'invalid_state'};
    // Unknown and nested fields are denied too: a denylist would silently let
    // newly added economic state through. Never accept an initial client state.
    if (!isDeepStrictEqual(parsed, trusted)) return {ok:false,error:'untrusted_change'};
    return accounts.save(key, trusted, revision, saveId);
  });
  return {save: (name, state, revision, saveId) => save(name, state, revision, saveId)};
}
module.exports = {createProtectedSaveLab};
