/* Проверка всех интерьеров: каждый тип собирается, спавн не в стене, выход
 * достижим, все точки действий доступны, свет есть. Ловит «мёртвые» комнаты,
 * где игрок застревает между мебелью и стеной.
 *   npm run check:interiors
 */
import './domstub';
import { buildInterior, type InteriorKind, type Interior } from '../src/game/interiors';

const KINDS: InteriorKind[] = ['shop24', 'supermarket', 'cafe', 'pharmacy', 'gunshop', 'clothes', 'barber', 'police', 'hospital',
  'cityhall', 'bank', 'fishshop', 'dealer', 'service', 'mall', 'hall', 'apt_eco', 'apt_mid', 'apt_lux', 'house_city', 'house_village',
  'vshop', 'vpharmacy', 'vguntruck', 'vadmin', 'checkpoint', 'fire', 'gas', 'mallfood', 'basement', 'truckoffice', 'office',
  'scootershop', 'greenhouse', 'bar', 'ozgim', 'mine', 'casino'];

const CELL = 0.3;
const solidAt = (it: Interior, x: number, z: number, y0: number, y1: number) =>
  it.colliders.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.y1 > y0 + 0.12 && c.y0 < y1);

/** волна от спавна по свободным клеткам: какие точки достижимы пешком */
function reachable(it: Interior) {
  const b = it.bounds;
  const nx = Math.ceil((b.x1 - b.x0) / CELL), nz = Math.ceil((b.z1 - b.z0) / CELL);
  const sx = Math.floor((it.spawn.x - b.x0) / CELL), sz = Math.floor((it.spawn.z - b.z0) / CELL);
  const seen = new Uint8Array(nx * nz);
  const key = (i: number, j: number) => j * nx + i;
  const free = (i: number, j: number) => {
    const x = b.x0 + (i + 0.5) * CELL, z = b.z0 + (j + 0.5) * CELL;
    return !solidAt(it, x, z, 0, 1.8);
  };
  const q: [number, number][] = [[sx, sz]];
  if (free(sx, sz)) seen[key(sx, sz)] = 1;
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const k = key(ni, nj);
      if (seen[k] || !free(ni, nj)) continue;
      seen[k] = 1; q.push([ni, nj]);
    }
  }
  return { seen, nx, nz, key, b };
}

let fail = 0;
console.log('  интерьеры:');
for (const kind of KINDS) {
  const problems: string[] = [];
  let it: Interior;
  try { it = buildInterior(kind, { seed: 3, name: 'Тест' }); }
  catch (e) { console.log(`  ✗ ${kind}: сборка упала — ${(e as Error).message}`); fail++; continue; }

  const b = it.bounds;
  const R = reachable(it);
  const inside = (x: number, z: number) => x > b.x0 + 0.05 && x < b.x1 - 0.05 && z > b.z0 + 0.05 && z < b.z1 - 0.05;

  if (!inside(it.spawn.x, it.spawn.z)) problems.push('спавн вне границ');
  if (solidAt(it, it.spawn.x, it.spawn.z, it.spawn.y ?? 0, (it.spawn.y ?? 0) + 1.8)) problems.push('спавн в стене/мебели');
  if (!it.lights.length) problems.push('нет света');
  const exit = it.acts.find((a) => a.action === 'exit');
  if (!exit) problems.push('нет выхода');

  // достижимы ли выход и все точки действий: точка считается доступной, если
  // игрок может подойти к ней хотя бы на радиус взаимодействия (мебель занимает
  // сам центр — это нормально, подходить надо рядом)
  const at = (x: number, z: number, r = 2.2) => {
    let best = -1;
    for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) {
      if (R.seen[R.key(i, j)] !== 1) continue;
      const cx = b.x0 + (i + 0.5) * CELL, cz = b.z0 + (j + 0.5) * CELL;
      const d = Math.hypot(cx - x, cz - z);
      if (d < r && (best < 0 || d < best)) best = d;
    }
    return best >= 0;
  };
  if (exit && !at(exit.x, exit.z, 2.4)) problems.push('выход недостижим');
  const deadActs = it.acts.filter((a) => a.action !== 'exit' && !at(a.x, a.z)).map((a) => a.label.slice(0, 26));
  if (deadActs.length) problems.push(`недостижимо: ${deadActs.join(', ')}`);

  // не осталось ли отрезанных зон (комнат, куда нельзя войти) — считаем крупные
  let free = 0, open = 0;
  for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) {
    const x = b.x0 + (i + 0.5) * CELL, z = b.z0 + (j + 0.5) * CELL;
    if (x < b.x0 + 0.6 || x > b.x1 - 0.6 || z < b.z0 + 0.6 || z > b.z1 - 0.6) continue;
    if (solidAt(it, x, z, 0, 1.8)) continue;
    free++;
    if (R.seen[R.key(i, j)]) open++;
  }
  const isolated = free ? 1 - open / free : 0;
  if (isolated > 0.28) problems.push(`${Math.round(isolated * 100)}% площади недоступно`);

  const size = `${(b.x1 - b.x0).toFixed(0)}×${(b.z1 - b.z0).toFixed(0)} м`;
  if (problems.length) { fail++; console.log(`  ✗ ${kind.padEnd(12)} ${size}: ${problems.join('; ')}`); }
  else console.log(`  ✓ ${kind.padEnd(12)} ${size}, точек действий ${it.acts.length}, свет ${it.lights.length}`);
  it.dispose();
}
console.log(fail ? `\n✗ проблемных интерьеров: ${fail}` : '\n✓ все интерьеры проходимы и освещены');
process.exit(fail ? 1 : 0);
