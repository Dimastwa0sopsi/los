'use strict';
/* Экспериментальный транзакционный реестр. Не подключать к сетевому API до
 * защиты account_save от перезаписи реестра и согласования передач автомобилей. */
const { randomInt } = require('node:crypto');
const { normalizeLogin, MAX_STATE_BYTES } = require('./account-store.cjs');
const { createRevisionHistory } = require('./account-revisions.cjs');
const PRICE = 5000;
const LETTERS = 'АВЕКМНОРСТУХ';
// Латинские похожие буквы и пробелы не должны обходить уникальный индекс.
function canonicalPlate(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  const s = value.toUpperCase().replace(/\s+/g, '').replace(/[ABEKMHOPCTYX]/g, c => LETTERS['ABEKMHOPCTYX'.indexOf(c)]);
  return /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2}$/.test(s) ? s : null;
}
function displayPlate(value) { return `${value.slice(0,6)} ${value.slice(6)}`; }
function plate() { return `${LETTERS[randomInt(12)]}${String(randomInt(1000)).padStart(3, '0')}${LETTERS[randomInt(12)]}${LETTERS[randomInt(12)]}${String(randomInt(1,100)).padStart(2,'0')}`; }
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function createPlateStore(db, generator = plate) {
  db.exec(`CREATE TABLE IF NOT EXISTS plate_registrations (
    number TEXT PRIMARY KEY, account_key TEXT NOT NULL, vehicle_uid TEXT NOT NULL,
    issued_at INTEGER NOT NULL, UNIQUE(account_key, vehicle_uid));
    CREATE TABLE IF NOT EXISTS plate_requests (
      account_key TEXT NOT NULL, request_id TEXT NOT NULL, vehicle_uid TEXT NOT NULL,
      number TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(account_key,request_id));`);
  const history = createRevisionHistory(db);
  const account = db.prepare('SELECT state_json,revision FROM accounts WHERE login_key=?');
  const update = db.prepare('UPDATE accounts SET state_json=?,revision=revision+1,save_id=NULL WHERE login_key=? AND revision=?');
  const byRequest = db.prepare('SELECT * FROM plate_requests WHERE account_key=? AND request_id=?');
  const deleteOld = db.prepare('DELETE FROM plate_registrations WHERE account_key=? AND vehicle_uid=?');
  const insert = db.prepare('INSERT INTO plate_registrations(number,account_key,vehicle_uid,issued_at) VALUES (?,?,?,?)');
  const exists = db.prepare('SELECT 1 FROM plate_registrations WHERE number=?');
  const issue = db.transaction((name, revision, uid, requestId, now) => {
    const key = normalizeLogin(name);
    if (!key || typeof uid !== 'string' || !uid || uid.length > 128 || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) fail('invalid');
    const prev = byRequest.get(key, requestId);
    if (prev) { if (prev.vehicle_uid !== uid) fail('request_reused'); return { number: displayPlate(prev.number), revision: prev.revision, replay: true }; }
    if (!Number.isSafeInteger(revision) || revision < 0) fail('invalid');
    const row = account.get(key); if (!row || !row.state_json) fail('no_account_state');
    if (row.revision !== revision) fail('conflict');
    const state = JSON.parse(row.state_json);
    if (!state || !Number.isSafeInteger(state.money) || state.money < 0 || state.money > 2147483647 || !Array.isArray(state.vehicles)) fail('invalid_state');
    const cars = state.vehicles.filter(v => v.uid === uid);
    if (cars.length !== 1 || !cars[0].tuning || typeof cars[0].tuning !== 'object') fail('not_owned');
    if (state.money < PRICE) fail('insufficient_funds');
    let num = '';
    // Предыдущий номер остаётся занят до выбора нового и не может выпасть вновь.
    for (let i = 0; i < 100; i++) {
      const candidate = canonicalPlate(generator());
      if (!candidate) fail('invalid_generator');
      if (!exists.get(candidate)) { num = candidate; break; }
    }
    if (!num) fail('no_numbers');
    deleteOld.run(key, uid); insert.run(num, key, uid, now);
    state.money -= PRICE;
    Object.assign(cars[0].tuning, { plate: displayPlate(num), plateFront: true, plateBack: true });
    const json = JSON.stringify(state); if (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) fail('state_too_large');
    if (!update.run(json, key, revision).changes) fail('conflict');
    history.record(key, revision, row.state_json);
    history.record(key, revision + 1, json);
    db.prepare('INSERT INTO plate_requests VALUES (?,?,?,?,?)').run(key, requestId, uid, num, revision + 1);
    return { number: displayPlate(num), revision: revision + 1, replay: false };
  });
  return { issue: (name, revision, uid, requestId, now = Date.now()) => issue(name, revision, uid, requestId, now), get: number => { const key = canonicalPlate(number); return key ? db.prepare('SELECT * FROM plate_registrations WHERE number=?').get(key) : undefined; } };
}
module.exports = { createPlateStore, PRICE, canonicalPlate, displayPlate };
