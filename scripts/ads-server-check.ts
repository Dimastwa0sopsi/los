/* Серверные правила рекламы: чужой щит не занять, частота, лимит щитов на
 * игрока, срок ставит сервер, мусор не проходит. База подменяется памятью —
 * запускается без better-sqlite3.  npm run check:ads-server
 */
import { createRequire } from 'module';
import { checkText } from '../src/game/moderation';

const req = createRequire(import.meta.url);
const { createAdsStore, AD_TTL, MAX_PER_PLAYER, COOLDOWN } = req('../server/ads.cjs') as {
  createAdsStore: (o: Record<string, unknown>) => {
    map: () => Record<string, { text: string; tag: string; who: string; until: number }>;
    buy: (name: string, id: string, text: string, tag: string) => { ok: boolean; error?: string; until?: number };
    drop: (name: string, id: string) => { ok: boolean; error?: string };
    clearAll: () => void;
  };
  AD_TTL: number; MAX_PER_PLAYER: number; COOLDOWN: number;
};

let now = 1_700_000_000_000;
const rows = new Map<string, { id: string; text: string; tag: string; who: string; until: number; created: number }>();
const store = {
  list: (t: number) => [...rows.values()].filter((r) => r.until > t),
  get: (id: string) => rows.get(id) ?? null,
  put: (r: { id: string }) => { rows.set(r.id, r as never); },
  del: (id: string) => { rows.delete(id); },
  countByWho: (who: string, t: number) => [...rows.values()].filter((r) => r.who === who && r.until > t).length,
  clearAll: () => rows.clear(),
};
const boards: Record<string, { kind: string; price: number }> = {};
for (let i = 1; i <= 6; i++) boards['city' + i] = { kind: 'city', price: 400 };
for (let i = 1; i <= 7; i++) boards['road' + i] = { kind: 'road', price: 700 };
let pushes = 0;
const ads = createAdsStore({ store, boards, checkText, onPush: () => { pushes++; }, now: () => now });

let fail = 0;
const t = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fail++;
};
const tick = (ms: number) => { now += ms; };

t('несуществующий щит', !ads.buy('Вася', 'city99', 'Кафе «Ракета»', 'biz').ok);
t('мат не проходит', !ads.buy('Вася', 'city1', 'хуй продаю', 'biz').ok);
t('ссылка не проходит', !ads.buy('Вася', 'city1', 'заходи на los.ru', 'biz').ok);

const ok1 = ads.buy('Вася', 'city1', 'Кафе «Ракета» · кофе за $100', 'biz');
t('нормальное объявление принято', ok1.ok, ok1.error ?? '');
const until = ok1.until ?? 0;
t('срок ставит сервер — ровно час', Math.abs(until - (now + AD_TTL)) < 5);
t('объявление в общем списке', ads.map()['city1']?.text.includes('кофе') === true);
t('автор записан', ads.map()['city1']?.who === 'Вася');

t('занятый щит не отдать', !ads.buy('Петя', 'city1', 'Своё объявление', 'sale').ok);
t('частота: сразу второй щит нельзя (кулдаун)', !ads.buy('Вася', 'city2', 'Второе объявление', 'job').ok, `${COOLDOWN / 1000} с`);
tick(COOLDOWN + 1);
const ok2 = ads.buy('Вася', 'city2', 'Работа грузчиком · $120 за рейс', 'job');
t('после кулдауна можно', ok2.ok, ok2.error ?? '');

tick(COOLDOWN + 1);
ads.buy('Вася', 'road1', 'Автосалон «Трасса»', 'auto');
tick(COOLDOWN + 1);
const fourth = ads.buy('Вася', 'road2', 'Четвёртый щит', 'fun');
t('больше трёх щитов на игрока нельзя', !fourth.ok, fourth.error ?? '');

t('чужой щит не снять', !ads.drop('Петя', 'city1').ok);
tick(10_000);
t('свой щит снимается', ads.drop('Вася', 'city1').ok);
t('после снятия щит свободен', !ads.map()['city1']);

// истечение аренды: через час объявление уходит само
const beforeCount = Object.keys(ads.map()).length;
tick(AD_TTL + 1000);
t('через час аренда кончилась', Object.keys(ads.map()).length === 0, `было ${beforeCount}`);
t('освободившийся щит можно занять', ads.buy('Петя', 'city1', 'Пиццерия «Сыр» · 2 по цене 1', 'fun').ok);
t('рассылка об изменениях была', pushes >= 4, `${pushes} шт.`);
t('лимит щитов на игрока = 3', MAX_PER_PLAYER === 3);

console.log(fail ? `✗ провалов: ${fail}` : '✓ серверные правила рекламы в порядке');
process.exit(fail ? 1 : 0);
