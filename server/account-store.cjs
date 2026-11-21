'use strict';
// Отдельный слой аккаунтов. Вызовы сохранения должны выполняться только для
// авторизованной сессии. Пароли и коды восстановления никогда не пишутся в лог.
const auth = require('./account-auth.cjs');
const MAX_STATE_BYTES = 1024 * 1024;
const normalizeLogin = value => typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
const validLogin = value => /^[\p{L}\p{N} _.-]{2,16}$/u.test(value);

function createAccountStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (
    login_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    backup_hash TEXT,
    state_json TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    save_id TEXT,
    reset_digest TEXT,
    reset_expires INTEGER
  )`);
  try { db.exec('ALTER TABLE accounts ADD COLUMN backup_hash TEXT'); } catch (e) { if (!String(e.message).includes('duplicate column')) throw e; }
  try { db.exec('ALTER TABLE accounts ADD COLUMN save_id TEXT'); } catch (e) { if (!String(e.message).includes('duplicate column')) throw e; }
  const get = db.prepare('SELECT * FROM accounts WHERE login_key = ?');
  const create = db.prepare('INSERT INTO accounts (login_key, display_name, password_hash, backup_hash) VALUES (?, ?, ?, ?)');
  const reset = db.prepare('UPDATE accounts SET reset_digest = ?, reset_expires = ? WHERE login_key = ?');
  const consume = db.prepare('UPDATE accounts SET password_hash = ?, reset_digest = NULL, reset_expires = NULL WHERE login_key = ? AND reset_digest = ? AND reset_expires > ?');
  const update = db.prepare('UPDATE accounts SET state_json = ?, save_id = ?, revision = revision + 1 WHERE login_key = ? AND revision = ?');

  const rowFor = login => get.get(normalizeLogin(login));
  const snapshot = row => ({ login: row.display_name, state: row.state_json ? JSON.parse(row.state_json) : null, revision: row.revision, saveId: row.save_id });
  async function register(login, password, backup = '') {
    const key = normalizeLogin(login), display = typeof login === 'string' ? login.normalize('NFKC').trim() : '';
    if (!validLogin(key) || !validLogin(display) || !auth.validPassword(password) || (backup !== '' && !auth.validPassword(backup))) return { ok: false, error: 'invalid' };
    if (get.get(key)) return { ok: false, error: 'exists' };
    const hash = await auth.hashPassword(password);
    const backupHash = backup ? await auth.hashPassword(backup) : null;
    try { create.run(key, display, hash, backupHash); } catch (e) { if (get.get(key)) return { ok: false, error: 'exists' }; throw e; }
    return { ok: true, ...snapshot(get.get(key)) };
  }
  // Только для поддержки после проверки владельца старого ника. Не вызывается
  // при обычной регистрации: код нужен, чтобы задать первый пароль.
  function prepareLegacy(name, now = Date.now()) {
    const key = normalizeLogin(name), display = typeof name === 'string' ? name.normalize('NFKC').trim() : '';
    if (!validLogin(key) || !validLogin(display) || get.get(key)) return null;
    const token = auth.createReset(now);
    const insert = db.prepare('INSERT INTO accounts (login_key, display_name, password_hash, reset_digest, reset_expires) VALUES (?, ?, ?, ?, ?)');
    try { insert.run(key, display, '', token.digest, token.expiresAt); } catch (e) { if (get.get(key)) return null; throw e; }
    return { code: token.code, expiresAt: token.expiresAt };
  }
  async function login(name, password) {
    const row = rowFor(name);
    // Не различаем отсутствие аккаунта и неверный пароль во внешнем ответе.
    if (!row) return { ok: false, error: 'credentials' };
    const primary = await auth.verifyPassword(password, row.password_hash);
    const backup = row.backup_hash ? await auth.verifyPassword(password, row.backup_hash) : false;
    if (!primary && !backup) return { ok: false, error: 'credentials' };
    return { ok: true, ...snapshot(row) };
  }
  // Только оператор поддержки после проверки владельца может вызвать этот метод.
  function issueReset(name, now = Date.now()) {
    const key = normalizeLogin(name);
    if (!get.get(key)) return null;
    const token = auth.createReset(now);
    reset.run(token.digest, token.expiresAt, key);
    return { code: token.code, expiresAt: token.expiresAt };
  }
  async function resetPassword(name, code, password, now = Date.now()) {
    const key = normalizeLogin(name), row = get.get(key);
    if (!row || !auth.validPassword(password) || !auth.verifyReset(code, row.reset_digest, row.reset_expires, now)) return false;
    const hash = await auth.hashPassword(password);
    // Сравнение и потребление одним UPDATE: повторное или параллельное применение невозможно.
    return consume.run(hash, key, row.reset_digest, now).changes === 1;
  }
  function save(name, state, revision, saveId = null) {
    const key = normalizeLogin(name);
    if (saveId !== null && (typeof saveId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(saveId))) return { ok: false, error: 'invalid' };
    if (!Number.isSafeInteger(revision) || revision < 0 || !state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, error: 'invalid' };
    let json;
    try { json = JSON.stringify(state); } catch { return { ok: false, error: 'invalid' }; }
    if (!json || Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) return { ok: false, error: 'too_large' };
    if (update.run(json, saveId, key, revision).changes !== 1) return { ok: false, error: 'conflict' };
    return { ok: true, revision: revision + 1 };
  }
  return { register, login, prepareLegacy, issueReset, resetPassword, save };
}
module.exports = { createAccountStore, normalizeLogin, MAX_STATE_BYTES };
