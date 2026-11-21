'use strict';
/* Read-only view of legacy kiosk ownership. The old account snapshots do not
 * guarantee uniqueness: collisions and malformed states are explicitly marked
 * instead of silently choosing an owner or calling a kiosk state-owned. */
function readKioskOwners(db) {
  const owners = new Map(); let complete = true;
  for (const row of db.prepare('SELECT display_name,state_json FROM accounts WHERE state_json IS NOT NULL').iterate()) {
    let state;
    try { state = JSON.parse(row.state_json); } catch { complete = false; continue; }
    if (!state || !Array.isArray(state.kiosks) || typeof row.display_name !== 'string' || !row.display_name || row.display_name.length > 32) { complete = false; continue; }
    const local = new Set();
    for (const kiosk of state.kiosks) {
      if (!kiosk || !Number.isSafeInteger(kiosk.id) || kiosk.id < 0 || kiosk.id > 1000000 || local.has(kiosk.id)) { complete = false; continue; }
      local.add(kiosk.id);
      if (owners.has(kiosk.id)) owners.set(kiosk.id, null);
      else owners.set(kiosk.id, row.display_name);
    }
  }
  const rows = [...owners].sort((a,b) => a[0]-b[0]);
  if (rows.length > 1000) complete = false;
  return { complete, owners: rows.slice(0,1000).map(([id,name]) => ({id,name})) };
}
module.exports = { readKioskOwners };
