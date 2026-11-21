'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process'), assert = require('assert');
const WebSocket = require('ws');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-accounts-'));
for (const f of ['server.js', 'ads.cjs', 'moderation.cjs', 'account-auth.cjs', 'account-store.cjs']) fs.copyFileSync(path.join(__dirname, '../server', f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');
const db = path.join(dir, 'db.sqlite');
const port = 23000 + Math.floor(Math.random() * 20000);
let proc;
const start = () => new Promise((resolve, reject) => {
  proc = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: String(port), DB_FILE: db, ADMIN_TOKEN: 'test-admin-token' } });
  let logs = ''; proc.stdout.on('data', d => { logs += d; if (logs.includes('Los-Gorod server on')) resolve(); });
  proc.stderr.on('data', d => logs += d); proc.on('exit', code => { if (code) reject(new Error(logs)); });
  setTimeout(() => reject(new Error('server startup timeout: ' + logs)), 10000).unref();
});
const stop = () => new Promise(resolve => { proc.once('exit', resolve); proc.kill(); });
function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`); const queue = [], waiters = [];
  ws.on('message', b => { const m = JSON.parse(String(b)); const i = waiters.findIndex(w => w.type === m.type); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else queue.push(m); });
  const next = type => new Promise((resolve, reject) => { const i = queue.findIndex(m => m.type === type); if (i >= 0) return resolve(queue.splice(i, 1)[0]); const w = { type, resolve }; waiters.push(w); setTimeout(() => { const j = waiters.indexOf(w); if (j >= 0) { waiters.splice(j, 1); reject(Error('timeout ' + type)); } }, 5000).unref(); });
  return { ws, next, send: m => ws.send(JSON.stringify(m)) };
}
async function auth(name, mode, password, backup) { const c = client(); assert.equal((await c.next('hello')).accounts, 1); c.send({type:'login', name, mode, password, backup, gender:'f'}); return c; }
(async () => {
  await start();
  let legacy = client(); await legacy.next('hello'); legacy.send({ type:'login', name:'Tester' }); assert.equal((await legacy.next('error')).code, 'auth'); legacy.ws.close();
  let a = await auth('Tester', 'register', 'primary-password', 'backup-password'); let first = await a.next('login_success'); assert.equal(first.accountState, null); assert.equal(first.accountRevision, 0);
  let dupe = await auth('tester', 'register', 'another-password'); assert.match((await dupe.next('error')).text, /занят/); dupe.ws.close();
  let bad = await auth('Tester', 'login', 'wrong-password'); assert.match((await bad.next('error')).text, /Неверный/); bad.ws.close();
  const state = { money: 987654, health: 61, food: 42, properties:['1:2'], vehicles:[{type:'lada'}], pos:{x:510,z:490,a:1}, inventory:{bread:3} };
  a.send({type:'account_save', state, revision:0}); assert.equal((await a.next('account_saved')).revision, 1);
  let b = await auth('TESTER', 'login', 'backup-password'); let login = await b.next('login_success'); assert.deepStrictEqual(login.accountState, state); assert.equal(login.player.money, state.money); assert.equal(login.accountRevision, 1); assert.equal((await a.next('error')).code, 'replaced');
  b.send({type:'account_save', state, revision:0}); assert.equal((await b.next('account_saved')).error, 'conflict');
  b.ws.close(); await stop(); await start();
  let c = await auth('tester', 'login', 'primary-password'); login = await c.next('login_success'); assert.deepStrictEqual(login.accountState, state); assert.equal(login.player.money, state.money); c.ws.close();
  await stop(); fs.rmSync(dir, { recursive:true, force:true }); console.log('✓ сетевой вход, запасной пароль, две сессии, ревизии и сохранение после перезапуска');
})().catch(e => { console.error(e); if (proc) proc.kill(); process.exitCode = 1; });
