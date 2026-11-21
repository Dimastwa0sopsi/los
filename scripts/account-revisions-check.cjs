'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAccountStore } = require('../server/account-store.cjs');
const { createRevisionHistory, LIMIT } = require('../server/account-revisions.cjs');
(async () => {
  const db = new Database(':memory:'), accounts = createAccountStore(db), history = createRevisionHistory(db);
  await accounts.register('Alice', 'secure-password');
  for (let i = 0; i < LIMIT + 5; i++) assert(accounts.save('Alice', {money:100+i}, i, `request-${String(i).padStart(16,'0')}`).ok);
  assert.equal(history.get('alice',0),null);
  assert.equal(history.get('alice',LIMIT+5).money, 100+LIMIT+4);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM account_revisions WHERE login_key=?').get('alice').n, LIMIT);
  assert.equal(accounts.save('Alice',{money:0},1).error,'conflict');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM account_revisions WHERE login_key=?').get('alice').n, LIMIT);
  // Внешняя транзакция при ошибке не сохраняет ни данные, ни историю.
  try { db.transaction(() => { assert(accounts.save('Alice',{money:999}, LIMIT+5).ok); throw Error('rollback'); })(); } catch (e) { assert.equal(e.message,'rollback'); }
  assert.equal(history.get('alice', LIMIT+6),null);
  assert.equal((await accounts.login('Alice','secure-password')).state.money, 100+LIMIT+4);
  db.close(); console.log('✓ доверенная история ревизий ограничена, конфликт и откат атомарны');
})().catch(e => { console.error(e); process.exitCode=1; });
