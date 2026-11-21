'use strict';
/* Experimental settlement batches. Not wired to the live server: enabling a
 * worker before account-save synchronization is safe would risk duplication.
 * Each lot is settled in its own transaction. Failed lots remain untouched,
 * and a cursor prevents one bad lot from blocking the rest of the batch. */
function createSettlementRunner(db, auction) {
  const due = db.prepare(`SELECT id FROM auction_lots
    WHERE status='active' AND ends_at<=? AND id>? ORDER BY id LIMIT ?`);
  function runBatch({ now = Date.now(), afterId = 0, limit = 50 } = {}) {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(afterId) || afterId < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('invalid_batch');
    const rows = due.all(now, afterId, limit);
    const settled = [], failed = [];
    for (const { id } of rows) {
      try { if (auction.finish(id, now)) settled.push(id); }
      catch (error) {
        // Do not expose SQL messages, account snapshots or asset contents.
        const code = typeof error?.code === 'string' && /^[a-z_]{1,40}$/.test(error.code) ? error.code : 'internal';
        failed.push({ id, error: code });
      }
    }
    // Wrap around after the final page; failures are retried on a later cycle.
    return { settled, failed, nextAfterId: rows.length === limit ? rows[rows.length - 1].id : 0 };
  }
  return { runBatch };
}
module.exports = { createSettlementRunner };
