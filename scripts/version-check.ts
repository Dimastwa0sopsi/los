/* Проверка версии и журнала обновлений: номер сборки подставляется, CHANGELOG
 * читается, верхняя запись совпадает с версией package.json.
 *   npm run check:version
 */
import fs from 'fs';
import path from 'path';
import { parseChangelog } from '../src/version';

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
const list = parseChangelog(fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8'));
let fail = 0;
const t = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fail++;
};

t('версия в package.json есть', !!pkg.version, pkg.version);
t('журнал обновлений разобран', list.length >= 3, `${list.length} записей`);
t('у каждой записи есть пункты', list.every((e) => e.items.length > 0));
t('верхняя запись = текущая версия', !!pkg.version && list[0]?.version === pkg.version, `журнал ${list[0]?.version}`);
t('дата у верхней записи', !!list[0]?.date, list[0]?.date);

// сборка подставляет те же значения, что видит игрок
const built = fs.existsSync(path.join(process.cwd(), 'dist/index.html'))
  ? fs.readFileSync(path.join(process.cwd(), 'dist/index.html'), 'utf8') : '';
if (built) t('версия попала в сборку', !!pkg.version && built.includes(pkg.version), pkg.version);

console.log(fail ? `✗ провалов: ${fail}` : '✓ версия и журнал обновлений в порядке');
process.exit(fail ? 1 : 0);
