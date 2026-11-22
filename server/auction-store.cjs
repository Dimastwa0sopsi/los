'use strict';
/* Экспериментальный слой транзакций аукциона. Пока НЕ подключать к игре:
 * обычные account_save и покупки ещё принимают клиентские снимки и способны
 * вернуть имущество из эскроу. Потребуется серверный контроль сохранений и
 * безопасная синхронизация активных клиентов до включения этого модуля. */
const { normalizeLogin, MAX_STATE_BYTES } = require('./account-store.cjs');
const { createRevisionHistory } = require('./account-revisions.cjs');
const DURATION = 10 * 60 * 1000;
const MAX_MONEY = 2147483647;
const STEPS = Object.freeze({ vehicle: 1000, business: 10000, apartment: 10000, house: 20000 });
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function amount(n) { return Number.isSafeInteger(n) && n > 0 && n <= MAX_MONEY; }

function createAuctionStore(db, { authorizeListing, businessAdapter } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS auction_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, seller TEXT NOT NULL, kind TEXT NOT NULL,
    asset_key TEXT NOT NULL, asset_json TEXT NOT NULL, start_price INTEGER NOT NULL,
    step INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL,
    bidder TEXT, bid INTEGER, finished_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS auction_active_asset ON auction_lots(kind,asset_key) WHERE status='active';
  CREATE UNIQUE INDEX IF NOT EXISTS auction_active_home ON auction_lots(asset_key) WHERE status='active' AND kind IN ('apartment','house');
  CREATE TABLE IF NOT EXISTS auction_requests (
    actor TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(actor,request_id)
  );`);
  const history = createRevisionHistory(db);
  const getAccount = db.prepare('SELECT login_key,state_json,revision FROM accounts WHERE login_key=?');
  const updateAccount = db.prepare('UPDATE accounts SET state_json=?,revision=revision+1,save_id=NULL WHERE login_key=? AND revision=?');
  const getLot = db.prepare('SELECT * FROM auction_lots WHERE id=?');
  const insertLot = db.prepare("INSERT INTO auction_lots(seller,kind,asset_key,asset_json,start_price,step,ends_at,status) VALUES (?,?,?,?,?,?,?,'active')");
  const getRequest = db.prepare('SELECT payload,result FROM auction_requests WHERE actor=? AND request_id=?');
  const putRequest = db.prepare('INSERT INTO auction_requests(actor,request_id,payload,result) VALUES (?,?,?,?)');
  function load(actor, expected) {
    const row = getAccount.get(actor);
    if (!row || !row.state_json) fail('no_account_state');
    if (expected !== undefined && row.revision !== expected) fail('conflict');
    let state; try { state = JSON.parse(row.state_json); } catch { fail('invalid_state'); }
    if (!state || !Number.isSafeInteger(state.money) || state.money < 0 || state.money > MAX_MONEY) fail('invalid_money');
    return { row, state };
  }
  function save(a) {
    if (!Number.isSafeInteger(a.state.money) || a.state.money < 0 || a.state.money > MAX_MONEY) fail('money_limit');
    const json = JSON.stringify(a.state);
    if (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) fail('state_too_large');
    if (!updateAccount.run(json, a.row.login_key, a.row.revision).changes) fail('conflict');
    history.record(a.row.login_key, a.row.revision, a.row.state_json);
    history.record(a.row.login_key, a.row.revision + 1, json);
  }
  function request(actor, id, payload, action) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) fail('invalid_request');
    const encoded = JSON.stringify(payload), prev = getRequest.get(actor, id);
    if (prev) { if (prev.payload !== encoded) fail('request_reused'); return JSON.parse(prev.result); }
    const result = action();
    putRequest.run(actor, id, encoded, JSON.stringify(result));
    return result;
  }
  function removeAsset(state, kind, key) {
    if (kind === 'vehicle') {
      if (!Array.isArray(state.vehicles)) fail('invalid_state');
      if (state.listings?.some(x => x.uid === key)) fail('already_listed');
      const matches = state.vehicles.filter(v => v.uid === key);
      if (!matches.length) fail('not_owned');
      if (matches.length !== 1) fail('asset_conflict');
      const index = state.vehicles.indexOf(matches[0]);
      const [item] = state.vehicles.splice(index, 1);
      const lastCar = state.lastCar === key;
      if (lastCar) state.lastCar = null;
      return { item: { ...item, pos: null }, lastCar }; 
    }
    if (kind === 'business') {
      if (!/^\d+$/.test(key) || !Array.isArray(state.kiosks)) fail('invalid_asset');
      const matches = state.kiosks.filter(v => v.id === Number(key));
      if (!matches.length) fail('not_owned');
      if (matches.length !== 1) fail('asset_conflict');
      const index = state.kiosks.indexOf(matches[0]);
      return { item: state.kiosks.splice(index, 1)[0] };
    }
    if (kind === 'apartment' || kind === 'house') {
      if (!/^\d+:\d+$/.test(key) || !Array.isArray(state.properties)) fail('invalid_asset');
      const index = state.properties.indexOf(key);
      if (index < 0) fail('not_owned');
      if (state.properties.lastIndexOf(key) !== index) fail('asset_conflict');
      // Содержимое холодильника остаётся в эскроу вместе с недвижимостью.
      const fridge = state.fridges?.[key] ?? null;
      if (state.fridges) delete state.fridges[key];
      const spawnHome = state.spawnHome === key;
      if (spawnHome) delete state.spawnHome;
      state.properties.splice(index, 1);
      return { item: key, fridge, spawnHome };
    }
    fail('invalid_kind');
  }
  function addAsset(state, kind, asset, now, sold) {
    if (kind === 'vehicle') {
      if (!Array.isArray(state.vehicles) || state.vehicles.some(x => x.uid === asset.item.uid)) fail('asset_conflict');
      state.vehicles.push(asset.item);
      if (!sold && asset.lastCar && !state.lastCar) state.lastCar = asset.item.uid;
    } else if (kind === 'business') {
      if (!Array.isArray(state.kiosks) || state.kiosks.some(x => x.id === asset.item.id)) fail('asset_conflict');
      state.kiosks.push(sold ? { ...asset.item, last: now } : asset.item);
    } else {
      if (!Array.isArray(state.properties) || state.properties.includes(asset.item)) fail('asset_conflict');
      state.properties.push(asset.item);
      if (!sold && asset.spawnHome && !state.spawnHome) state.spawnHome = asset.item;
      if (asset.fridge) { state.fridges ??= {}; if (state.fridges[asset.item]) fail('asset_conflict'); state.fridges[asset.item] = asset.fridge; }
    }
  }
  const listTx = db.transaction((name, revision, kind, key, price, requestId, now) => {
    const actor = normalizeLogin(name);
    return request(actor, requestId, { op: 'list', kind, key, price }, () => {
      if (!Number.isSafeInteger(revision) || revision < 0) fail('invalid_revision');
      if (!Object.hasOwn(STEPS, kind) || typeof key !== 'string' || !key || key.length > 128 || !amount(price)) fail('invalid_lot');
      const seller = load(actor, revision);
      // Fail closed: public lot viewing remains available, but a future adapter
      // must explicitly supply the server-side listing policy.
      if (typeof authorizeListing !== 'function') fail('listing_disabled');
      if (kind === 'business' && businessAdapter) businessAdapter.authorize({actor,key});
      else authorizeListing({actor,kind,key});
      if (db.prepare("SELECT 1 FROM auction_lots WHERE kind=? AND asset_key=? AND status='active'").get(kind, key)) fail('already_listed');
      if ((kind === 'apartment' || kind === 'house') && db.prepare("SELECT 1 FROM auction_lots WHERE kind IN ('apartment','house') AND asset_key=? AND status='active'").get(key)) fail('already_listed');
      const asset = kind === 'business' && businessAdapter ? businessAdapter.reserve({actor,key}) : removeAsset(seller.state, kind, key);
      const r = insertLot.run(actor, kind, key, JSON.stringify(asset), price, STEPS[kind], now + DURATION);
      save(seller);
      return { id: Number(r.lastInsertRowid), endsAt: now + DURATION, revision: seller.row.revision + 1 };
    });
  });
  const bidTx = db.transaction((name, revision, id, bid, requestId, now) => {
    const actor = normalizeLogin(name);
    return request(actor, requestId, { op: 'bid', id, bid }, () => {
      if (!Number.isSafeInteger(revision) || revision < 0) fail('invalid_revision');
      if (!Number.isSafeInteger(id) || id <= 0 || !amount(bid)) fail('invalid_bid');
      const lot = getLot.get(id);
      if (!lot || lot.status !== 'active' || now >= lot.ends_at) fail('closed');
      if (lot.seller === actor) fail('own_lot');
      if (lot.bidder === actor) fail('already_highest');
      if (bid < (lot.bid === null ? lot.start_price : lot.bid + lot.step)) fail('bid_too_low');
      const buyer = load(actor, revision);
      if (buyer.state.money < bid) fail('insufficient_funds');
      buyer.state.money -= bid;
      if (lot.bidder) { const previous = load(lot.bidder); previous.state.money += lot.bid; save(previous); }
      save(buyer);
      db.prepare('UPDATE auction_lots SET bidder=?,bid=? WHERE id=?').run(actor, bid, id);
      return { id, bid, revision: buyer.row.revision + 1 };
    });
  });
  const finishTx = db.transaction((id, now) => {
    const lot = getLot.get(id);
    if (!lot || lot.status !== 'active' || now < lot.ends_at) return false;
    const asset = JSON.parse(lot.asset_json), seller = load(lot.seller);
    // Status and registry transfer share this transaction; on any failure both roll back.
    db.prepare("UPDATE auction_lots SET status=?,finished_at=? WHERE id=?").run(lot.bidder ? 'sold' : 'unsold', now, id);
    if (lot.kind === 'business' && businessAdapter) {
      businessAdapter.settle({key:lot.asset_key,seller:lot.seller,winner:lot.bidder,asset});
      if (lot.bidder) { const winner = load(lot.bidder); seller.state.money += lot.bid; save(winner); }
      save(seller);
      return true;
    }
    if (lot.bidder) {
      const winner = load(lot.bidder);
      addAsset(winner.state, lot.kind, asset, now, true);
      seller.state.money += lot.bid;
      save(winner); save(seller);
    } else { addAsset(seller.state, lot.kind, asset, now, false); save(seller); }
    return true;
  });
  // Ограниченный публичный снимок: не выдаём сохранённое имущество, холодильник,
  // инвентарь или другие персональные поля из asset_json.
  function publicLots(now = Date.now()) {
    return db.prepare(`SELECT id,kind,asset_key,asset_json,start_price,step,ends_at,bid,bidder,seller
      FROM auction_lots WHERE status='active' AND ends_at>? ORDER BY ends_at,id LIMIT 100`).all(now).map(lot => {
      let vehicleType = '';
      if (lot.kind === 'vehicle') {
        try { const item = JSON.parse(lot.asset_json).item; if (typeof item?.type === 'string' && /^[a-z0-9_-]{1,40}$/.test(item.type)) vehicleType = item.type; } catch { /* повреждённый лот показывается без модели */ }
      }
      return { id: lot.id, kind: lot.kind, assetKey: lot.asset_key, vehicleType,
        seller: lot.seller, startPrice: lot.start_price, step: lot.step,
        endsAt: lot.ends_at, bid: lot.bid, bidder: lot.bidder };
    });
  }
  return {
    list: (name, revision, kind, key, price, requestId, now = Date.now()) => listTx(name, revision, kind, key, price, requestId, now),
    bid: (name, revision, id, bid, requestId, now = Date.now()) => bidTx(name, revision, id, bid, requestId, now),
    finish: (id, now = Date.now()) => finishTx(id, now),
    due: (now = Date.now()) => db.prepare("SELECT id FROM auction_lots WHERE status='active' AND ends_at<=? ORDER BY ends_at,id").all(now).map(x => x.id),
    get: id => getLot.get(id),
    publicLots,
    active: () => db.prepare("SELECT id,seller,kind,asset_key,start_price,step,ends_at,bidder,bid FROM auction_lots WHERE status='active' ORDER BY ends_at,id").all(),
  };
}
module.exports = { createAuctionStore, DURATION, STEPS };
