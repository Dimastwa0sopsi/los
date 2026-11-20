/* Проверка рекламных щитов и модерации: щиты есть в городе и за городом,
 * объявление арендуется на час, по истечении снимается само, мат и ссылки
 * не проходят.  npm run check:ads
 */
import './domstub';
import * as THREE from 'three';
import { generateLayout } from '../src/game/worldgen';
import { AdsSystem, AD_HOUR } from '../src/game/ads';
import { checkText, hasProfanity, AD_MAX } from '../src/game/moderation';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const L = generateLayout();
let fail = 0;
const t = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fail++;
};

// --- щиты в мире ---
const city = L.billboards.filter((b) => b.kind === 'city');
const road = L.billboards.filter((b) => b.kind === 'road');
t('щиты в городе', city.length >= 4, `${city.length} шт.`);
t('щиты за городом', road.length >= 4, `${road.length} шт.`);
t('у каждого щита есть цена часа', L.billboards.every((b) => b.price > 0), `от $${Math.min(...L.billboards.map((b) => b.price))}`);
t('дорогие щиты — на трассе', Math.min(...road.map((b) => b.price)) >= Math.max(...city.map((b) => b.price)));

// --- система рекламы ---
const faces = L.billboards.map((b) => ({ id: b.id, mesh: new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshStandardMaterial()) }));
const ads = new AdsSystem(L.billboards, faces);
t('пустые щиты показывают заглушку', ads.defs.every((d) => !ads.isBusy(d.id)));

const first = L.billboards[0];
t('аренда проходит', ads.place(first.id, 'Кафе «Ракета» · кофе за $100', 'biz', 'Игрок123'));
const a = ads.ad(first.id);
t('объявление висит', !!a && a.text.includes('кофе'));
t('срок — час', !!a && Math.abs((a.until - Date.now()) - AD_HOUR) < 2000, a ? `${Math.round((a.until - Date.now()) / 60000)} мин` : '');
t('занятый щит нельзя занять снова', ads.isBusy(first.id));
t('осталось минут', ads.leftMin(first.id) > 50, `${ads.leftMin(first.id)}`);

// протухание: ставим «просроченный» ад и просим обновление
const second = L.billboards[1];
(ads as unknown as { ads: Map<string, { text: string; tag: string; who: string; until: number }> }).ads
  .set(second.id, { text: 'старое', tag: 'sale', who: 'кто-то', until: Date.now() - 1000 });
let expired = '';
ads.onExpire = (id) => { expired = id; };
ads.update();
t('просроченная аренда снимается', ads.ad(second.id) === null);
t('событие об истечении пришло', expired === second.id);

// снятие вручную
ads.clear(first.id);
t('снять можно', ads.ad(first.id) === null);

// --- модерация ---
for (const bad of ['хуй', 'х0й', 'бл@ть', 'fuck это', 'my site los.ru', 'пиши @nick', 'звони +7 999 123-45-67', 'тг: kanal'])
  t(`отказ: ${bad}`, !checkText(bad, 'ad').ok, checkText(bad, 'ad').error ?? '');
for (const good of ['Кафе «Ракета»: кофе за $100', 'Скидка 20% на шины', 'Хлеб свежий каждый день', 'Учебный центр «Орбита»'])
  t(`принято: ${good}`, checkText(good, 'ad').ok, checkText(good, 'ad').error ?? '');
t('длинный текст не проходит', !checkText('а'.repeat(AD_MAX + 1), 'ad').ok);
t('мат в объявлении СМИ не проходит', !checkText('продаю хуйню дешево', 'news').ok);
t('нормальное объявление СМИ проходит', checkText('Кафе «Ракета» приглашает на кофе', 'news').ok);
t('фильтр не ломает слово «хлеб»', !hasProfanity('свежий хлеб'));

console.log(fail ? `✗ провалов: ${fail}` : '✓ щиты, аренда и модерация в порядке');
process.exit(fail ? 1 : 0);
