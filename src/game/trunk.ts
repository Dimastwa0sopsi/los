/* Inventory primitives for the upcoming vehicle trunk; not connected to UI or
 * online accounts yet. Capacity counts individual items, not item types. */
export const TRUNK_CAPACITY = 30;
export type ItemCounts = Record<string, number>;
export type TrunkTransfer = { ok: true; inventory: ItemCounts; trunk: ItemCounts } | { ok: false; error: 'invalid' | 'not_enough' | 'full' | 'overflow' };
const MAX_COUNT = 2_147_483_647;
const validId = (id: string) => /^[a-z0-9_]{1,64}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
function validCounts(counts: ItemCounts, capacity: number): boolean {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return false;
  let total = 0;
  for (const [id, n] of Object.entries(counts)) {
    if (!validId(id) || !Number.isSafeInteger(n) || n < 0 || n > MAX_COUNT) return false;
    total += n;
    if (!Number.isSafeInteger(total) || total > capacity) return false;
  }
  return true;
}
export function trunkCount(trunk: ItemCounts): number | null {
  if (!validCounts(trunk, TRUNK_CAPACITY)) return null;
  return Object.values(trunk).reduce((a, b) => a + b, 0);
}
/** Pure operation: on failure, neither source is changed. Allowed item IDs are
 * supplied by trusted game code; the caller must verify vehicle ownership and
 * persist the two containers atomically. */
export function transferTrunk(inventory: ItemCounts, trunk: ItemCounts, id: string, count: number, direction: 'put' | 'take', allowed: ReadonlySet<string>): TrunkTransfer {
  if (!validCounts(inventory, Number.MAX_SAFE_INTEGER) || !validCounts(trunk, TRUNK_CAPACITY) || typeof id !== 'string' || !validId(id) || !allowed.has(id) || !Number.isSafeInteger(count) || count < 1 || (direction !== 'put' && direction !== 'take')) return {ok:false,error:'invalid'};
  const from = direction === 'put' ? inventory : trunk, to = direction === 'put' ? trunk : inventory;
  const have = Object.prototype.hasOwnProperty.call(from,id) ? from[id] : 0, existing = Object.prototype.hasOwnProperty.call(to,id) ? to[id] : 0;
  if (have < count) return {ok:false,error:'not_enough'};
  if (direction === 'put' && trunkCount(trunk)! + count > TRUNK_CAPACITY) return {ok:false,error:'full'};
  if (existing > MAX_COUNT - count) return {ok:false,error:'overflow'};
  const nextInventory = {...inventory}, nextTrunk = {...trunk};
  const nextFrom = direction === 'put' ? nextInventory : nextTrunk, nextTo = direction === 'put' ? nextTrunk : nextInventory;
  nextFrom[id] = have - count; if (!nextFrom[id]) delete nextFrom[id];
  nextTo[id] = existing + count;
  return {ok:true,inventory:nextInventory,trunk:nextTrunk};
}
