/* Серверная и клиентская модерация должны говорить одно и то же: клиент
 * показывает ошибку до покупки, сервер проверяет текст ещё раз. Если правила
 * разъедутся, игрок увидит «принято», а сервер откажет (или наоборот).
 *   npm run check:moderation
 */
import { createRequire } from 'module';
import { checkText as clientCheck, hasProfanity as clientProf } from '../src/game/moderation';

const require2 = createRequire(import.meta.url);
const server = require2('../server/moderation.cjs') as {
  checkText: (t: string, k?: string) => { ok: boolean; error?: string; clean: string };
  hasProfanity: (t: string) => boolean;
};

let fail = 0;
const t = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fail++;
};

const corpus = [
  'Кафе «Ракета»: кофе за $100', 'Скидка 20% на шины', 'Хлеб свежий каждый день',
  'Учебный центр «Орбита»', 'Тебе сюда: скидки', 'Колебания цен', 'Небеса ждут',
  'Работа грузчиком · $120 за рейс', 'Автосалон «Трасса» — новые машины',
  'хуй', 'ХУЙ', 'х0й', 'бляяять', 'б л я д ь', 'еб@ть', 'п и з д а', 'fuck you',
  'сука', 'бл@ть', '6лядь', 'жопа', 'говно', 'долбоёб', 'наебал', 'уёбок',
  'http://x.ru', 'мой сайт los.ru', 'пиши @super', 'звони +7 999 123-45-67',
  'тг: losgorod', 'Скидка на шины 20%', 'КАПСОМ ОЧЕНЬ ДЛИННЫЙ ТЕКСТ РЕКЛАМЫ',
  'аа', '12 34', '<script>', 'а'.repeat(60), 'норм', 'Пицца «Сыр» · 2 по цене 1',
];

for (const text of corpus) {
  const a = clientCheck(text, 'ad'), b = server.checkText(text, 'ad');
  const same = a.ok === b.ok;
  if (!same) { console.log(`  ✗ расхождение на «${text}»: клиент ${a.ok ? 'ок' : 'отказ'} / сервер ${b.ok ? 'ок' : 'отказ'}`); fail++; }
  const pa = clientProf(text), pb = server.hasProfanity(text);
  if (pa !== pb) { console.log(`  ✗ мат на «${text}»: клиент ${pa} / сервер ${pb}`); fail++; }
  // принятый текст должен прийти одинаково «чистым» — сервер его и сохраняет
  if (a.ok && b.ok && a.clean !== b.clean) { console.log(`  ✗ чистка текста разошлась на «${text}»`); fail++; }
}
t(`корпус ${corpus.length} текстов: решения совпадают`, fail === 0);

// сервер обязан отклонять то, что клиент мог бы пропустить намеренно (обход UI)
for (const bad of ['пиши на сайт los-gorod.ru', 'vk.com/group', 'discord.gg/abc', 'звони 89991234567'])
  t(`сервер режет «${bad}»`, !server.checkText(bad, 'ad').ok);
for (const kind of ['ad', 'news']) {
  t(`сервер: длина ${kind}-текста ограничена`, !server.checkText('я'.repeat(kind === 'ad' ? 60 : 160), kind).ok);
}
t('сервер: объявление СМИ принимается', server.checkText('Кафе «Ракета» приглашает на кофе', 'news').ok);
t('сервер: слишком короткий текст не проходит', !server.checkText('а', 'ad').ok);

console.log(fail ? `✗ провалов: ${fail}` : '✓ модерация клиента и сервера совпадает');
process.exit(fail ? 1 : 0);
