/* печать карты кварталов: какие типы стоят в сетке (для выбора места под парк) */
import { generateLayout } from '../src/game/worldgen';
const L = generateLayout();
const N = 18;
const abbr: Record<string, string> = { res: 'res', down: 'dwn', private: 'prv', park: 'PRK' };
const grid: string[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => '?'));
for (const b of L.blocks) grid[b.j][b.i] = abbr[b.type] ?? b.type.slice(0, 3);
console.log('   ' + Array.from({ length: N }, (_, i) => String(i).padStart(4)).join(''));
for (let j = 0; j < N; j++) console.log(String(j).padStart(2) + ' ' + grid[j].map((c) => c.padStart(4)).join(''));
const free = (t: string) => t === 'res' || t === 'down' || t === 'private';
const wins: string[] = [];
for (let j = 0; j + 1 < N; j++) for (let i = 0; i + 1 < N; i++) {
  const ts = [grid[j][i], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1]];
  if (ts.every(free)) wins.push(`${i},${j}`);
}
console.log('\nсвободные окна 2x2: ' + wins.join(' | '));
