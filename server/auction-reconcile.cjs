'use strict';
/* Experimental three-way merge for server-side auction changes.
 * The caller MUST retrieve base from a trusted server snapshot tied to the
 * client's acknowledged revision, never from an unverified client payload.
 * Not wired to account_save: unresolved conflicts require a client workflow. */
const { isDeepStrictEqual } = require('node:util');
const MAX_MONEY = 2147483647;
const MISSING = Symbol('missing');
const keyed = {
  vehicles: v => v && typeof v.uid === 'string' && v.uid ? v.uid : null,
  kiosks: v => v && Number.isSafeInteger(v.id) && v.id >= 0 ? String(v.id) : null,
  properties: v => typeof v === 'string' && /^\d+:\d+$/.test(v) ? v : null,
};
const equal = (a, b) => a === MISSING || b === MISSING ? a === b : isDeepStrictEqual(a, b);
function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return v === MISSING ? MISSING : structuredClone(v); }
function reconcileAuctionState(base, local, remote) {
  if (![base, local, remote].every(object)) return { ok: false, conflicts: ['state'] };
  const conflicts = [], out = {};
  const merge = (b, l, r, path) => {
    if (equal(l, b)) return clone(r);
    if (equal(r, b) || equal(l, r)) return clone(l);
    conflicts.push(path); return MISSING;
  };
  function arrayMap(value, key, field) {
    if (!Array.isArray(value)) { conflicts.push(field); return null; }
    const map = new Map();
    for (const item of value) {
      const id = key(item);
      if (id === null || map.has(id)) { conflicts.push(field); return null; }
      map.set(id, item);
    }
    return map;
  }
  function read(o, k) { return Object.hasOwn(o, k) ? o[k] : MISSING; }
  for (const field of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    if (field === '__proto__' || field === 'constructor' || field === 'prototype') { conflicts.push(field); continue; }
    const b = read(base, field), l = read(local, field), r = read(remote, field);
    let value;
    if (field === 'money') {
      if (![b, l, r].every(n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_MONEY)) { conflicts.push(field); continue; }
      value = r + (l - b);
      if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) { conflicts.push(field); continue; }
    } else if (Object.hasOwn(keyed, field)) {
      const bm = arrayMap(b, keyed[field], field), lm = arrayMap(l, keyed[field], field), rm = arrayMap(r, keyed[field], field);
      if (!bm || !lm || !rm) continue;
      value = [];
      for (const id of new Set([...rm.keys(), ...lm.keys(), ...bm.keys()])) {
        const x = merge(bm.has(id) ? bm.get(id) : MISSING, lm.has(id) ? lm.get(id) : MISSING, rm.has(id) ? rm.get(id) : MISSING, `${field}:${id}`);
        if (x !== MISSING) value.push(x);
      }
    } else if (field === 'fridges' && [b, l, r].every(object)) {
      value = {};
      for (const id of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
        if (id === '__proto__' || id === 'constructor' || id === 'prototype') { conflicts.push(`fridges:${id}`); continue; }
        const x = merge(read(b, id), read(l, id), read(r, id), `fridges:${id}`);
        if (x !== MISSING) value[id] = x;
      }
    } else value = merge(b, l, r, field);
    if (value !== MISSING) out[field] = value;
  }
  return conflicts.length ? { ok: false, conflicts: [...new Set(conflicts)] } : { ok: true, state: out };
}
module.exports = { reconcileAuctionState };
