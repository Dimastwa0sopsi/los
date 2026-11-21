'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process'), assert = require('assert');
const WebSocket = require('ws');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-accounts-'));
for (const f of ['server.js', 'ads.cjs', 'moderation.cjs', 'account-auth.cjs', 'account-store.cjs', 'account-revisions.cjs', 'auction-store.cjs', 'business-owners.cjs']) fs.copyFileSync(path.join(__dirname, '../server', f), path.join(dir, f));
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
  const gameAdminReq = async (session, password='GAMEMODE') => fetch(`http://127.0.0.1:${port}/admin/state`, {headers:{'x-admin-token':password, 'x-game-admin-session':session}});
  assert.equal((await gameAdminReq('')).status, 403);
  let owner = await auth('Kitty_Kittys', 'register', 'secure-admin-password'); let ownerLogin = await owner.next('login_success'); assert(ownerLogin.adminSession);
  assert.equal((await gameAdminReq(ownerLogin.adminSession, 'wrong')).status, 403);
  assert.equal((await gameAdminReq(ownerLogin.adminSession)).status, 200);
  let otherOwner = await auth('kitty_kittys', 'login', 'secure-admin-password'); let owner2 = await otherOwner.next('login_success'); await owner.next('error');
  assert.equal((await gameAdminReq(ownerLogin.adminSession)).status, 403); assert.equal((await gameAdminReq(owner2.adminSession)).status, 200); otherOwner.ws.close();
  let legacy = client(); await legacy.next('hello'); legacy.send({ type:'login', name:'Tester' }); assert.equal((await legacy.next('error')).code, 'auth'); legacy.ws.close();
  let a = await auth('Tester', 'register', 'primary-password', 'backup-password'); let first = await a.next('login_success'); assert(!first.adminSession); assert.equal(first.accountState, null); assert.equal(first.accountRevision, 0);
  // Реальный WebSocket: публичный каталог показывает только активные лоты,
  // не раскрывает полный объект автомобиля и не позволяет делать ставки.
  const DatabaseAuction = require('better-sqlite3');
  const adb = new DatabaseAuction(db);
  const addLot = adb.prepare("INSERT INTO auction_lots(seller,kind,asset_key,asset_json,start_price,step,ends_at,status) VALUES (?,?,?,?,?,?,?,'active')");
  const secret = JSON.stringify({item:{type:'lada', uid:'car', secret:'PRIVATE'}});
  addLot.run('seller','vehicle','car',secret,50000,1000,Date.now()+600000);
  addLot.run('seller','vehicle','old',secret,50000,1000,Date.now()-1);
  adb.close();
  a.send({type:'auction_list'});
  const catalog = await a.next('auction_list');
  assert.equal(catalog.trading,false); assert.equal(catalog.lots.length,1);
  assert.equal(catalog.lots[0].vehicleType,'lada');
  assert(!JSON.stringify(catalog).includes('PRIVATE')); assert(!('asset_json' in catalog.lots[0]));
  a.send({type:'auction_bid',id:catalog.lots[0].id,bid:50000});
  let dupe = await auth('tester', 'register', 'another-password'); assert.match((await dupe.next('error')).text, /занят/); dupe.ws.close();
  let bad = await auth('Tester', 'login', 'wrong-password'); assert.match((await bad.next('error')).text, /Неверный/); bad.ws.close();
  const state = { money: 987654, health: 61, food: 42, properties:['1:2'], kiosks:[{id:3,last:0,acc:7}], vehicles:[{type:'lada'}], pos:{x:510,z:490,a:1}, inventory:{bread:3} };
  a.send({type:'account_save', state, revision:0}); assert.equal((await a.next('account_saved')).revision, 1);
  let b = await auth('TESTER', 'login', 'backup-password'); let login = await b.next('login_success'); assert.deepStrictEqual(login.accountState, state); assert.equal(login.player.money, state.money); assert.equal(login.accountRevision, 1); assert.equal((await a.next('error')).code, 'replaced');
  b.send({type:'kiosk_owners'}); const owners = await b.next('kiosk_owners');
  assert.equal(owners.complete,true); assert.deepStrictEqual(owners.owners,[{id:3,name:'Tester'}]); assert(!JSON.stringify(owners).includes('987654'));
  b.send({type:'account_save', state, revision:0}); assert.equal((await b.next('account_saved')).error, 'conflict');
  const admin = async (action, opts = {}) => (await fetch(`http://127.0.0.1:${port}/admin/action`, { method:'POST', headers:{'Content-Type':'application/json', 'x-admin-token':'test-admin-token'}, body: JSON.stringify({action, name:'Tester', ...opts}) })).json();
  let r = await admin('mute', {minutes:30}); assert(r.ok); b.send({type:'chat',text:'привет'}); assert.match((await b.next('chat')).text, /запрещён/);
  b.send({type:'chat',text:'§LGMдействие'}); assert.match((await b.next('chat')).text, /запрещён/);
  r = await admin('warn', {minutes:30}); assert(r.ok);
  const Database = require('better-sqlite3'); const direct = new Database(db); direct.prepare('UPDATE players SET muted_until = ? WHERE name = ?').run(Date.now()-1, 'Tester'); direct.prepare('UPDATE timed_warns SET expires = ?').run(Date.now()-1); direct.close();
  b.send({type:'chat',text:'бля привет'}); assert.equal((await b.next('chat')).text, 'бля привет');
  b.send({type:'chat',text:'заходите на пример.рф'}); assert.match((await b.next('chat')).text, /запрещены/);
  let status = await (await fetch(`http://127.0.0.1:${port}/admin/state?token=test-admin-token`)).json(); assert.equal(status.players.find(p => p.name === 'Tester').warns, 0);
  assert(!(await admin('mute', {minutes:-1})).ok);
  assert((await admin('ban', {minutes:30, reason:'тест'})).ok); assert.equal((await b.next('error')).text, 'Вы забанены: тест');
  let banned = await auth('Tester', 'login', 'primary-password'); assert.equal((await banned.next('error')).code, 'banned'); banned.ws.close();
  const db2 = new Database(db); db2.prepare('UPDATE players SET banned_until = ? WHERE name = ?').run(Date.now()-1, 'Tester'); db2.close();
  b.ws.close(); await stop(); await start();
  let c = await auth('tester', 'login', 'primary-password'); login = await c.next('login_success'); assert.deepStrictEqual(login.accountState, state); assert.equal(login.player.money, state.money); c.send({type:'kiosk_owners'}); assert.deepStrictEqual((await c.next('kiosk_owners')).owners,[{id:3,name:'Tester'}]); c.ws.close();
  await stop(); fs.rmSync(dir, { recursive:true, force:true }); console.log('✓ аккаунты и прогресс; мут, варн, бан и истечение срока после перезапуска');
})().catch(e => { console.error(e); if (proc) proc.kill(); process.exitCode = 1; });
