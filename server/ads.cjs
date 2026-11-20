// Логика рекламных щитов на сервере: без SQL и без WebSocket — только правила.
// Хранилище приходит снаружи (в server.js это SQLite, в проверках — память),
// поэтому правила можно прогнать тестом без базы.
//
// Что проверяет сервер, а не клиент:
//   • щит существует и он действительно свободен;
//   • текст проходит модерацию (мат, ссылки, ники, телефоны);
//   • частота: не чаще одного объявления в 20 секунд;
//   • не больше 3 щитов у одного игрока;
//   • срок аренды ставит сервер (час), а не клиент.
'use strict';

const AD_TTL = 60 * 60 * 1000;
const AD_TAGS = ['biz', 'sale', 'job', 'fun', 'auto'];
const COOLDOWN = 20_000;
const MAX_PER_PLAYER = 3;

/**
 * @param {object} o
 * @param {object} o.store    — { list(now), get(id), put(row), del(id), countByWho(who, now), clearAll() }
 * @param {object} o.boards   — { id: { kind, price } }
 * @param {function} o.checkText — (text, 'ad') => { ok, error, clean }
 * @param {function} [o.onPush]   — вызывается после изменения (разослать всем)
 * @param {function} [o.onLog]    — журнал для админ-панели
 * @param {function} [o.now]      — часы (для тестов)
 */
function createAdsStore({ store, boards, checkText, onPush, onLog, now = Date.now }) {
  const lastAt = new Map();                 // кто → время последней покупки

  const map = () => {
    const t = now();
    const out = {};
    for (const r of store.list(t)) out[r.id] = { text: r.text, tag: r.tag, who: r.who, until: r.until };
    return out;
  };

  const buy = (name, id, text, tag) => {
    const nick = String(name || '').slice(0, 16);
    const board = boards[id];
    if (!nick) return { ok: false, error: 'Нужен ник' };
    if (!board) return { ok: false, error: 'Такого щита нет' };
    const t = now();
    if (t - (lastAt.get(nick) || 0) < COOLDOWN) {
      return { ok: false, error: 'Слишком часто: новое объявление можно дать раз в 20 секунд' };
    }
    const busy = store.get(id);
    if (busy && busy.until > t) return { ok: false, error: 'Этот щит уже занят' };
    if (store.countByWho(nick, t) >= MAX_PER_PLAYER) {
      return { ok: false, error: `У вас уже ${MAX_PER_PLAYER} щита — дождитесь окончания аренды` };
    }
    const chk = checkText(String(text == null ? '' : text).slice(0, 120), 'ad');
    if (!chk.ok) return { ok: false, error: chk.error };
    const tg = AD_TAGS.includes(tag) ? tag : 'biz';
    store.put({ id, text: chk.clean, tag: tg, who: nick, until: t + AD_TTL, created: t });
    lastAt.set(nick, t);
    onLog?.(`📰 ${nick}: объявление «${chk.clean}» на щите ${id}`);
    onPush?.();
    return { ok: true, until: t + AD_TTL, ads: map() };
  };

  const drop = (name, id) => {
    const nick = String(name || '').slice(0, 16);
    const row = store.get(String(id || ''));
    if (!row) return { ok: false, error: 'Щит свободен' };
    if (row.who !== nick) return { ok: false, error: 'Это чужой щит' };
    store.del(row.id);
    onPush?.();
    return { ok: true, ads: map() };
  };

  return { map, buy, drop, boards, ttl: AD_TTL, tags: AD_TAGS, clearAll: () => { store.clearAll(); onPush?.(); } };
}

module.exports = { createAdsStore, AD_TTL, AD_TAGS, COOLDOWN, MAX_PER_PLAYER };
