// Модерация пользовательских текстов: реклама на щитах, объявления в СМИ,
// подписи. Никакого мата и никаких ссылок/контактов — реклама живёт внутри
// игры и не должна уводить игроков на сторонние сайты.
//
// Проверка нарочно «злая»: приводит леет-запись (х0й, бл@ть, 6ля), схлопывает
// повторы букв (бляяять) и выкидывает разделители (б л я, б-л-я), чтобы нельзя
// было обойти фильтр одной звёздочкой. Английский мат проверяется отдельно —
// по «сырому» тексту, без перевода латиницы в кириллицу.

/** максимальная длина текста на щите */
export const AD_MAX = 48;
/** максимальная длина объявления в СМИ */
export const NEWS_MAX = 140;

export type CheckResult = { ok: boolean; error?: string; clean: string };

/** цифры и символы, которыми заменяют буквы */
const LEET: Record<string, string> = {
  '0': 'о', '1': 'и', '3': 'з', '4': 'ч', '6': 'б', '8': 'в', '9': 'д', '@': 'а', '$': 'с', '!': 'и', '|': 'л', '¥': 'у',
  a: 'а', b: 'б', c: 'с', e: 'е', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'и', h: 'н', '[': 'ш', ']': 'щ',
};

/** корни мата: ищем подстроку в нормализованном тексте */
const MAT_ROOTS = [
  'хуй', 'хуя', 'хую', 'хуе', 'хуи', 'пизд', 'пизж', 'бля', 'блят', 'бляд',
  'ебат', 'ебал', 'ебет', 'ебуч', 'ебли', 'ебан', 'ебаш', 'еблан', 'долбоеб', 'ебтво',
  'залуп', 'дроч', 'пидор', 'пидар', 'педик', 'шлюх', 'гандон', 'мудак', 'мудил',
  'мразь', 'уеб', 'наеб', 'съеб', 'отъеб', 'въеб', 'разъеб', 'заеб', 'выеб',
  'сука', 'сучк', 'говнюк', 'жоп', 'срак',
];

// \b в JS не работает с кириллицей — границы задаём классами символов
const NOTL = '[^а-яa-z]';
/** мат, который ловим как отдельное слово (короткие формы) */
const MAT_WORDS = new RegExp(`(?:^|${NOTL})(?:еб|хуй|хуя|бля|блят|сука|жопа|говно|срать|ссать)(?:$|${NOTL})`);

/** английский мат — по «сырому» нижнему регистру */
const MAT_EN = /\b(?:fuck|f\*ck|shit|bitch|cunt|asshole|dick|motherfucker)\w*/;

/** «чистые» слова, внутри которых встречается корень — их не трогаем */
const WHITELIST = ['хлеб', 'учеб', 'волшеб', 'себе', 'тебе', 'небез', 'колеб', 'потреб', 'требу', 'оскорб'];

/** ссылки, домены, мессенджеры и телефоны */
const LINK_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /https?:\/\//i, why: 'ссылки' },
  { re: /www\./i, why: 'ссылки' },
  { re: /\b[a-zа-я0-9-]{2,}\s?\.\s?(?:ru|com|net|org|io|me|gg|tv|xyz|site|online|shop|app|dev|info|biz|clan|top|fun|live|pro|рф|су)\b/i, why: 'ссылки' },
  { re: /\bt\.me\b|\bdiscord\.gg\b|\bwa\.me\b|\bvk\.com\b/i, why: 'ссылки' },
  { re: /@[a-zа-я0-9_]{3,}/i, why: 'контакты (@ник)' },
  { re: /\+?\d[\d\s()-]{8,}\d/, why: 'телефоны' },
  { re: /(?:^|[^а-яa-z])(?:tg|тг|телега|telegram|ватсап|whatsapp|дискорд|dsc)(?:$|[^а-яa-z])/i, why: 'контакты' },
];

/** «плоский» вид варианта: нижний регистр, без ё, без леета и разделителей */
function flat(raw: string, digits: string): string {
  const lower = raw.toLowerCase().replace(/ё/g, 'е');
  const letters = lower.replace(/[^a-zа-я0-9@$!|¥[\]]/gi, '');
  // неоднозначные символы: 0 → о/у, 4 → ч/а, @ → а/я, $ → с/з
  const leet = letters.split('').map((c) => {
    if (digits === 'u' && c === '0') return 'у';
    if (digits === 'u' && c === '4') return 'а';
    if (digits === 'u' && c === '@') return 'я';
    if (digits === 'u' && c === '$') return 'з';
    return LEET[c] ?? c;
  }).join('');
  return leet.replace(/([а-яa-z])\1{2,}/g, '$1$1');
}

/** основной (нулевой) вариант нормализации — для отладки и проверок */
export function normalize(raw: string): string { return flat(raw, 'o'); }

/** есть ли мат (русский по нормализованному тексту, английский — по сырому) */
export function hasProfanity(raw: string): boolean {
  for (const variant of [flat(raw, 'o'), flat(raw, 'u')]) {
    if (MAT_WORDS.test(variant)) return true;
    for (const root of MAT_ROOTS) {
      let from = 0;
      for (;;) {
        const i = variant.indexOf(root, from);
        if (i < 0) break;
        const hit = variant.slice(Math.max(0, i - 4), i + root.length + 4);
        if (!WHITELIST.some((w) => hit.includes(w))) return true;
        from = i + 1;
      }
    }
  }
  return MAT_EN.test(raw.toLowerCase());
}

/** первая найденная причина отказа по ссылкам/контактам */
export function findLink(raw: string): string | null {
  for (const p of LINK_PATTERNS) if (p.re.test(raw)) return p.why;
  return null;
}

/**
 * Проверка пользовательского текста.
 * kind: 'ad' — строка на щите (коротко), 'news' — объявление в СМИ.
 */
export function checkText(raw: string, kind: 'ad' | 'news' = 'ad'): CheckResult {
  const clean = raw.replace(/\s+/g, ' ').trim();
  const max = kind === 'ad' ? AD_MAX : NEWS_MAX;
  if (clean.length < 3) return { ok: false, error: 'Слишком короткий текст — нужно хотя бы 3 символа', clean };
  if (clean.length > max) return { ok: false, error: `Слишком длинно: максимум ${max} символов`, clean };
  if ((clean.match(/[а-яёa-z]/gi) ?? []).length < 3) return { ok: false, error: 'Нужны буквы, а не только символы', clean };
  if (/[<>{}]/.test(clean)) return { ok: false, error: 'Символы < > { } запрещены', clean };
  const link = findLink(clean);
  if (link) return { ok: false, error: `Уберите ${link}: ссылки, ники и телефоны в рекламе запрещены`, clean };
  if (hasProfanity(clean)) return { ok: false, error: 'Мат запрещён — перепишите прилично', clean };
  const letters = clean.replace(/[^а-яёa-z]/gi, '');
  if (letters.length > 12 && letters === letters.toUpperCase()) {
    return { ok: false, error: 'Не пишите всё заглавными — так реклама не проходит', clean };
  }
  return { ok: true, clean };
}
