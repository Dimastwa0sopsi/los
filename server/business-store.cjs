'use strict';
/* Experimental business ledger, NOT exposed to the live server. account_save
 * still trusts whole client snapshots, so integrating this store now could
 * undo purchases and transfers. The future network adapter must also validate
 * location, job/truck, licences, item rules and use a trusted world catalogue.
 * Existing per-account businesses need an explicit ownership migration first. */
const { randomBytes } = require('node:crypto');
const { normalizeLogin, MAX_STATE_BYTES } = require('./account-store.cjs');
const { createRevisionHistory } = require('./account-revisions.cjs');
const CAPACITY = 100, UNIT_COST = 1000, DELIVERY_FEE = 1000, LEASE_MS = 30 * 60 * 1000, MAX_MONEY = 2147483647;
const validId = id => typeof id === 'string' && /^(kiosk|building):(?:0|[1-9]\d{0,8})$/.test(id);
const validRequest = id => typeof id === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(id);
function fail(code) { const e = new Error(code); e.code = code; throw e; }

// catalogue is supplied by the server, never by a client request:
// { 'kiosk:0': { price: 100000, items: { water: 25 } }, ... }
function createBusinessStore(db, catalogue) {
  if (!catalogue || typeof catalogue !== 'object') throw new TypeError('catalogue required');
  db.exec(`CREATE TABLE IF NOT EXISTS business_registry (
    business_id TEXT PRIMARY KEY, owner TEXT, stock INTEGER NOT NULL CHECK(stock BETWEEN 0 AND 100)
  );
  CREATE TABLE IF NOT EXISTS business_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, owner TEXT NOT NULL,
    quantity INTEGER NOT NULL, fee INTEGER NOT NULL, status TEXT NOT NULL,
    driver TEXT, claim_token TEXT, lease_until INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS business_one_open_delivery ON business_deliveries(business_id)
    WHERE status IN ('open','claimed');
  CREATE TABLE IF NOT EXISTS business_requests (
    actor TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(actor,request_id)
  );`);
  const history = createRevisionHistory(db);
  const getAccount = db.prepare('SELECT login_key,state_json,revision FROM accounts WHERE login_key=?');
  const updateAccount = db.prepare('UPDATE accounts SET state_json=?,revision=revision+1,save_id=NULL WHERE login_key=? AND revision=?');
  const getBusiness = db.prepare('SELECT * FROM business_registry WHERE business_id=?');
  const getDelivery = db.prepare('SELECT * FROM business_deliveries WHERE id=?');
  const reqGet = db.prepare('SELECT payload,result FROM business_requests WHERE actor=? AND request_id=?');
  const reqPut = db.prepare('INSERT INTO business_requests VALUES (?,?,?,?)');
  const def = id => {
    if (!validId(id) || !Object.hasOwn(catalogue,id)) fail('invalid_business');
    const d = catalogue[id];
    if (!d || !Number.isSafeInteger(d.price) || d.price <= 0 || d.price > MAX_MONEY || !d.items || typeof d.items !== 'object') fail('invalid_catalogue');
    return d;
  };
  const actorKey = actor => { const key = normalizeLogin(actor); if (!key || key.length > 64) fail('invalid_actor'); return key; };
  function replay(actor, id, payload, action) {
    if (!validRequest(id)) fail('invalid_request');
    const str = JSON.stringify(payload), old = reqGet.get(actor,id);
    if (old) { if (old.payload !== str) fail('request_reused'); return JSON.parse(old.result); }
    const result = action(); reqPut.run(actor,id,str,JSON.stringify(result)); return result;
  }
  function load(key, expected) {
    const row = getAccount.get(key);
    if (!row || !row.state_json) fail('no_account_state');
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 0 || row.revision !== expected)) fail('conflict');
    let state; try { state = JSON.parse(row.state_json); } catch { fail('invalid_state'); }
    if (!state || typeof state !== 'object' || Array.isArray(state) || !Number.isSafeInteger(state.money) || state.money < 0 || state.money > MAX_MONEY) fail('invalid_state');
    return { row, state };
  }
  function save(a) {
    if (!Number.isSafeInteger(a.state.money) || a.state.money < 0 || a.state.money > MAX_MONEY) fail('money_limit');
    const json = JSON.stringify(a.state);
    if (Buffer.byteLength(json,'utf8') > MAX_STATE_BYTES) fail('state_too_large');
    if (!updateAccount.run(json,a.row.login_key,a.row.revision).changes) fail('conflict');
    history.record(a.row.login_key,a.row.revision,a.row.state_json);
    history.record(a.row.login_key,a.row.revision+1,json);
  }
  function purchaseBusiness(name, revision, id, requestId) {
    const actor = actorKey(name);
    return db.transaction(() => replay(actor,requestId,{op:'buy_business',id},() => {
      const info = def(id), account = load(actor,revision);
      const existing = getBusiness.get(id);
      if (existing?.owner) fail('owned');
      if (account.state.money < info.price) fail('insufficient_funds');
      account.state.money -= info.price;
      if (existing) db.prepare('UPDATE business_registry SET owner=? WHERE business_id=?').run(actor,id);
      else db.prepare('INSERT INTO business_registry VALUES (?,?,?)').run(id,actor,CAPACITY);
      save(account);
      return { id, owner:actor, stock:existing?.stock ?? CAPACITY, revision:account.row.revision+1 };
    }))();
  }
  function buyItem(name, revision, id, item, quantity, requestId) {
    const actor = actorKey(name);
    return db.transaction(() => replay(actor,requestId,{op:'buy_item',id,item,quantity},() => {
      const info = def(id), business = getBusiness.get(id);
      if (typeof item !== 'string' || ['__proto__','constructor','prototype'].includes(item) || !/^[a-zA-Z0-9_-]{1,64}$/.test(item) || !Object.hasOwn(info.items,item)) fail('invalid_item');
      const price = info.items[item];
      if (!Number.isSafeInteger(price) || price <= 0 || price > MAX_MONEY || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > CAPACITY) fail('invalid_item');
      const stock = business?.stock ?? CAPACITY;
      if (stock < quantity) fail('out_of_stock');
      const buyer = load(actor,revision), total = price * quantity;
      if (!Number.isSafeInteger(total) || buyer.state.money < total) fail('insufficient_funds');
      if (!buyer.state.inventory || typeof buyer.state.inventory !== 'object' || Array.isArray(buyer.state.inventory)) fail('invalid_inventory');
      const count = Object.hasOwn(buyer.state.inventory,item) ? buyer.state.inventory[item] : 0;
      if (!Number.isSafeInteger(count) || count < 0 || count + quantity > MAX_MONEY) fail('invalid_inventory');
      buyer.state.money -= total; buyer.state.inventory[item] = count + quantity;
      if (business?.owner === actor) buyer.state.money += total;
      else if (business?.owner) { const owner = load(business.owner); owner.state.money += total; save(owner); }
      save(buyer);
      if (!business) db.prepare('INSERT INTO business_registry VALUES (?,NULL,?)').run(id,stock);
      db.prepare('UPDATE business_registry SET stock=stock-? WHERE business_id=?').run(quantity,id);
      return { id,item,quantity,stock:stock-quantity,revision:buyer.row.revision+1 };
    }))();
  }
  function order(name, revision, id, quantity, requestId, now = Date.now()) {
    const actor = actorKey(name);
    return db.transaction(() => replay(actor,requestId,{op:'order',id,quantity},() => {
      def(id); if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > CAPACITY) fail('invalid_order');
      const business = getBusiness.get(id);
      if (!business || business.owner !== actor) fail('not_owner');
      if (business.stock + quantity > CAPACITY) fail('capacity');
      if (db.prepare("SELECT 1 FROM business_deliveries WHERE business_id=? AND status IN ('open','claimed')").get(id)) fail('order_exists');
      const owner = load(actor,revision), cost = quantity*UNIT_COST + DELIVERY_FEE;
      if (owner.state.money < cost) fail('insufficient_funds');
      owner.state.money -= cost; save(owner);
      const result = db.prepare("INSERT INTO business_deliveries(business_id,owner,quantity,fee,status,created_at) VALUES (?,?,?,?,'open',?)").run(id,actor,quantity,DELIVERY_FEE,now);
      return {id:Number(result.lastInsertRowid),quantity,cost,revision:owner.row.revision+1};
    }))();
  }
  function claim(name, orderId, requestId, now = Date.now()) {
    const actor = actorKey(name);
    return db.transaction(() => replay(actor,requestId,{op:'claim',orderId},() => {
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(orderId) || orderId <= 0) fail('invalid_order');
      const job = getDelivery.get(orderId);
      if (!job || !(job.status === 'open' || (job.status === 'claimed' && job.lease_until <= now))) fail('unavailable');
      // Account existence, job eligibility and proximity must be enforced by the adapter.
      load(actor);
      const token = randomBytes(24).toString('hex');
      db.prepare("UPDATE business_deliveries SET status='claimed',driver=?,claim_token=?,lease_until=? WHERE id=?").run(actor,token,now+LEASE_MS,orderId);
      return { id:orderId,businessId:job.business_id,quantity:job.quantity,fee:job.fee,token,leaseUntil:now+LEASE_MS };
    }))();
  }
  function complete(name, revision, orderId, token, requestId, now = Date.now()) {
    const actor = actorKey(name);
    return db.transaction(() => replay(actor,requestId,{op:'complete',orderId,token},() => {
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(orderId) || orderId <= 0 || typeof token !== 'string') fail('invalid_order');
      const job = getDelivery.get(orderId);
      if (!job || job.status !== 'claimed' || job.driver !== actor || job.claim_token !== token || now >= job.lease_until) fail('unavailable');
      const business = getBusiness.get(job.business_id);
      if (!business || business.owner !== job.owner || business.stock + job.quantity > CAPACITY) fail('business_changed');
      const driver = load(actor,revision); driver.state.money += job.fee; save(driver);
      db.prepare('UPDATE business_registry SET stock=stock+? WHERE business_id=?').run(job.quantity,job.business_id);
      db.prepare("UPDATE business_deliveries SET status='completed',completed_at=?,claim_token=NULL WHERE id=?").run(now,orderId);
      return { id:orderId,stock:business.stock+job.quantity,fee:job.fee,revision:driver.row.revision+1 };
    }))();
  }
  function cancel(name, revision, orderId, requestId, now = Date.now()) {
    const actor = actorKey(name);
    return db.transaction(() => replay(actor,requestId,{op:'cancel',orderId},() => {
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(orderId) || orderId <= 0) fail('invalid_order');
      const job = getDelivery.get(orderId);
      if (!job || job.owner !== actor || !(job.status === 'open' || (job.status === 'claimed' && job.lease_until <= now))) fail('unavailable');
      const owner = load(actor,revision); const refund = job.quantity*UNIT_COST + job.fee;
      owner.state.money += refund; save(owner);
      db.prepare("UPDATE business_deliveries SET status='cancelled',claim_token=NULL,completed_at=? WHERE id=?").run(now,orderId);
      return {id:orderId,refund,revision:owner.row.revision+1};
    }))();
  }
  function get(id) { def(id); const b = getBusiness.get(id); return b ? { id,owner:b.owner,stock:b.stock } : {id,owner:null,stock:CAPACITY}; }
  function openOrders(now = Date.now(), limit = 100) {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('invalid_order');
    return db.prepare("SELECT id,business_id AS businessId,quantity,fee FROM business_deliveries WHERE status='open' OR (status='claimed' AND lease_until<=?) ORDER BY id LIMIT ?").all(now,limit);
  }
  return { purchaseBusiness,buyItem,order,claim,complete,cancel,get,openOrders };
}
module.exports = { createBusinessStore,CAPACITY,UNIT_COST,DELIVERY_FEE,LEASE_MS };
