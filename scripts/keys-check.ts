// Проверка управления: одна клавиша — одно действие в своём контексте,
// и в игре не осталось «висячих» клавиш, которых нет в карте.
// Запуск: npm run check:keys
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BINDINGS, duplicateKeys, K, keyLabel } from '../src/game/keys';

const CODES = new Set(Object.values(K));
// клавиши, которые обрабатываются не картой, а точечно (мышь, цифры оружия/передач, стрелки)
const EXTRA = new Set(['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'ControlLeft', 'ShiftLeft']);

const root = join(process.cwd(), 'src', 'game');
const files = readdirSync(root).filter((f) => f.endsWith('.ts') && f !== 'keys.ts');
const re = /(?:pressed|down)\(\s*'([A-Za-z0-9]+)'\s*\)|code === '((?:Key|Digit|F\d|Page|Arrow)[A-Za-z0-9]*)'/g;
const kRe = /\bK\.([A-Za-z0-9]+)\b/g;

const unknown: string[] = [];
const used = new Map<string, string[]>();
const usedActions = new Set<string>();
for (const f of files) {
  const src = readFileSync(join(root, f), 'utf8');
  for (const m of src.matchAll(kRe)) usedActions.add(m[1]);
  for (const m of src.matchAll(re)) {
    const code = m[1] ?? m[2];
    if (!code) continue;
    if (!CODES.has(code) && !EXTRA.has(code)) unknown.push(`${f}: ${code}`);
    const list = used.get(code) ?? [];
    list.push(f);
    used.set(code, list);
  }
}

// 1) карта сама по себе без повторов
const dup = duplicateKeys();
// 2) все коды в игре есть в карте
const n = BINDINGS.length;
console.log(`клавиш в карте: ${n}`);
for (const b of BINDINGS) console.log(`  ${b.ctx.padEnd(4)} ${keyLabel(b.code).padEnd(6)} ${b.what}`);

let bad = 0;
if (K.enterVehicle !== 'KeyF' || K.interact !== 'KeyE') { bad++; console.error('✗ посадка должна быть на F, действие — на E'); }
else console.log('✓ F — посадка в транспорт, E — действие');
if (dup.length) { bad++; console.error('\n✗ повтор клавиши в одном контексте:'); for (const d of dup) console.error('   ' + d); }
else console.log('\n✓ повторов нет: каждая клавиша занята одним действием');

if (unknown.length) { bad++; console.error('\n✗ клавиши вне карты:') ; for (const u of unknown) console.error('   ' + u); }
else console.log('✓ все клавиши в коде описаны в карте');

// 3) клавиши, которые объявлены, но нигде не используются — подсказка (не ошибка)
const unused = BINDINGS.filter((b) => !used.has(b.code) && !usedActions.has(b.action)).map((b) => `${b.ctx}/${keyLabel(b.code)}`);
if (unused.length) console.log('\n· объявлены, но не встречаются в коде: ' + unused.join(', '));

process.exit(bad ? 1 : 0);
