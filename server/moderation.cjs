// Серверная модерация текста — точный «близнец» src/game/moderation.ts.
// Клиент проверяет текст до покупки (чтобы игрок сразу видел ошибку), но
// доверять клиенту нельзя: объявление приходит на сервер и проверяется здесь
// ещё раз, теми же правилами. Совпадение двух реализаций сторожит
// `npm run check:moderation` (гоняет корпус текстов через обе).
'use strict';

const AD_MAX = 48;
const NEWS_MAX = 140;

const LEET = {
  '0': 'о', '1': 'и', '3': 'з', '4': 'ч', '6': 'б', '8': 'в', '9': 'д', '@': 'а', '$': 'с', '!': 'и', '|': 'л', '¥': 'у',
  a: 'а', b: 'б', c: 'с', e: 'е', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'и', h: 'н', '[': 'ш', ']': 'щ',
};

const MAT_ROOTS = [
  'хуй', 'хуя', 'хую', 'хуе', 'хуи', 'пизд', 'пизж', 'бля', 'блят', 'бляд',
  'ебат', 'ебал', 'ебет', 'ебуч', 'ебли', 'ебан', 'ебаш', 'еблан', 'долбоеб', 'ебтво',
  'залуп', 'дроч', 'пидор', 'пидар', 'педик', 'шлюх', 'гандон', 'мудак', 'мудил',
  'мразь', 'уеб', 'наеб', 'съеб', 'отъеб', 'въеб', 'разъеб', 'заеб', 'выеб',
  'сука', 'сучк', 'говнюк', 'жоп', 'срак',
];

const NOTL = '[^а-яa-z]';
const MAT_WORDS = new RegExp(`(?:^|${NOTL})(?:еб|хуй|хуя|бля|блят|сука|жопа|говно|срать|ссать)(?:$|${NOTL})`);
const MAT_EN = /\b(?:fuck|f\*ck|shit|bitch|cunt|asshole|dick|motherfucker)\w*/;
const WHITELIST = ['хлеб', 'учеб', 'волшеб', 'себе', 'тебе', 'небез', 'колеб', 'потреб', 'требу', 'оскорб'];

const LINK_PATTERNS = [
  { re: /https?:\/\//i, why: 'ссылки' },
  { re: /www\./i, why: 'ссылки' },
  { re: /\b[a-zа-я0-9-]{2,}\s?\.\s?(?:ru|com|net|org|io|me|gg|tv|xyz|site|online|shop|app|dev|info|biz|clan|top|fun|live|pro|рф|су)\b/i, why: 'ссылки' },
  { re: /\bt\.me\b|\bdiscord\.gg\b|\bwa\.me\b|\bvk\.com\b/i, why: 'ссылки' },
  { re: /@[a-zа-я0-9_]{3,}/i, why: 'контакты (@ник)' },
  { re: /\+?\d[\d\s()-]{8,}\d/, why: 'телефоны' },
  { re: /(?:^|[^а-яa-z])(?:tg|тг|телега|telegram|ватсап|whatsapp|дискорд|dsc)(?:$|[^а-яa-z])/i, why: 'контакты' },
];

function flat(raw, digits) {
  const lower = String(raw).toLowerCase().replace(/ё/g, 'е');
  const letters = lower.replace(/[^a-zа-я0-9@$!|¥[\]]/gi, '');
  const leet = letters.split('').map((c) => {
    if (digits === 'u' && c === '0') return 'у';
    if (digits === 'u' && c === '4') return 'а';
    if (digits === 'u' && c === '@') return 'я';
    if (digits === 'u' && c === '$') return 'з';
    return LEET[c] || c;
  }).join('');
  return leet.replace(/([а-яa-z])\1{2,}/g, '$1$1');
}

const normalize = (raw) => flat(raw, 'o');

function hasProfanity(raw) {
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
  return MAT_EN.test(String(raw).toLowerCase());
}

function findLink(raw) {
  for (const p of LINK_PATTERNS) if (p.re.test(raw)) return p.why;
  return null;
}

/** kind: 'ad' — текст на щите, 'news' — объявление в СМИ */
function checkText(raw, kind) {
  const clean = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  const max = kind === 'news' ? NEWS_MAX : AD_MAX;
  if (clean.length < 3) return { ok: false, error: 'Слишком короткий текст — нужно хотя бы 3 символа', clean };
  if (clean.length > max) return { ok: false, error: `Слишком длинно: максимум ${max} символов`, clean };
  if ((clean.match(/[а-яёa-z]/gi) || []).length < 3) return { ok: false, error: 'Нужны буквы, а не только символы', clean };
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

module.exports = { AD_MAX, NEWS_MAX, normalize, hasProfanity, findLink, checkText };
