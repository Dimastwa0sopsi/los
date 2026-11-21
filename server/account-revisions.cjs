'use strict';
// Trusted server snapshots, bounded per account. A missing old revision must
// always be treated as a conflict, never reconstructed from client data.
const LIMIT = 8;
function createRevisionHistory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS account_revisions (
    login_key TEXT NOT NULL, revision INTEGER NOT NULL, state_json TEXT NOT NULL,
    PRIMARY KEY(login_key, revision)
  )`);
  const insert = db.prepare('INSERT OR IGNORE INTO account_revisions(login_key,revision,state_json) VALUES (?,?,?)');
  const prune = db.prepare(`DELETE FROM account_revisions WHERE login_key=? AND revision NOT IN (
    SELECT revision FROM account_revisions WHERE login_key=? ORDER BY revision DESC LIMIT ${LIMIT}
  )`);
  const get = db.prepare('SELECT state_json FROM account_revisions WHERE login_key=? AND revision=?');
  return {
    record(key, revision, json) {
      if (json === null || json === undefined) return;
      insert.run(key, revision, json); prune.run(key, key);
    },
    get(key, revision) {
      const row = get.get(key, revision);
      return row ? JSON.parse(row.state_json) : null;
    },
  };
}
module.exports = { createRevisionHistory, LIMIT };
