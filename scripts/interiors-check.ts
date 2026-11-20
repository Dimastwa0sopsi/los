/* Проверка всех интерьеров: каждый тип собирается, спавн не в стене, выход
 * достижим, все точки действий доступны, свет есть. Ловит «мёртвые» комнаты,
 * где игрок застревает между мебелью и стеной.
 *
 * Вторая часть — про переделку 0.6.0: у каждого помещения должен быть тамбур
 * со свободным проходом от входа, свои светильники внутри стен, вывески и
 * разумное число объектов (чтобы не просаживать кадры).
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
function reachable(it: Interior, clearance = 0) {
  const b = it.bounds;
  const nx = Math.ceil((b.x1 - b.x0) / CELL), nz = Math.ceil((b.z1 - b.z0) / CELL);
  const sx = Math.floor((it.spawn.x - b.x0) / CELL), sz = Math.floor((it.spawn.z - b.z0) / CELL);
  const seen = new Uint8Array(nx * nz);
  const key = (i: number, j: number) => j * nx + i;
  const free = (i: number, j: number) => {
    const x = b.x0 + (i + 0.5) * CELL, z = b.z0 + (j + 0.5) * CELL;
    return !it.colliders.some(c => c.y1 > 0.12 && c.y0 < 1.8 && x > c.x0 - clearance && x < c.x1 + clearance && z > c.z0 - clearance && z < c.z1 + clearance);
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
  const walkableRoute = reachable(it, 0.35);
  const inside = (x: number, z: number) => x > b.x0 + 0.05 && x < b.x1 - 0.05 && z > b.z0 + 0.05 && z < b.z1 - 0.05;

  if (!inside(it.spawn.x, it.spawn.z)) problems.push('спавн вне границ');
  if (solidAt(it, it.spawn.x, it.spawn.z, it.spawn.y ?? 0, (it.spawn.y ?? 0) + 1.8)) problems.push('спавн в стене/мебели');
  if (!it.lights.length) problems.push('нет света');
  // лампы должны быть внутри комнаты, а не за стеной и не в полу
  const badLight = it.lights.filter((l) => {
    const p = l.position;
    return p.x < b.x0 - 0.3 || p.x > b.x1 + 0.3 || p.z < b.z0 - 0.3 || p.z > b.z1 + 0.3 || p.y < 0.6 || p.y > b.h + 0.3;
  }).length;
  if (badLight) problems.push(`светильников вне комнаты: ${badLight}`);
  const area = (b.x1 - b.x0) * (b.z1 - b.z0);
  const needFix = Math.max(1, Math.floor(area / 40));
  if (it.stats.fixtures < needFix) problems.push(`мало светильников: ${it.stats.fixtures} на ${Math.round(area)} м²`);
  const residential = ['apt_eco', 'apt_mid', 'apt_lux', 'house_city', 'house_village'].includes(kind);
  if (!residential && it.stats.signs < 1) problems.push('нет навигационных вывесок');
  if (it.stats.windows !== (kind === 'office' ? 1 : 0)) problems.push(`неверное число окон: ${it.stats.windows}`);
  let blueSky = 0;
  it.group.traverse(o => { if (o.userData.matKey === 'c:#bce5f7') blueSky++; });
  if ((kind === 'office') !== (blueSky > 0)) problems.push('голубое окно должно быть только в офисе');
  if (residential) {
    for (const action of ['bed', 'fridge', 'homepc']) if (!it.acts.some(a => a.action === action)) problems.push('нет действия ' + action);
    if (kind.startsWith('house_') && (!it.acts.some(a => a.action === 'basement') || !it.doorSpots.hatch)) problems.push('нет люка в подвал');
  }
  if (it.stats.doors < 1) problems.push('нет дверей');
  if (it.stats.meshes > 400) problems.push(`слишком много объектов: ${it.stats.meshes}`);
  const exit = it.acts.find((a) => a.action === 'exit');
  if (!exit) problems.push('нет выхода');

  // достижимы ли выход и все точки действий: точка считается доступной, если
  // игрок может подойти к ней хотя бы на радиус взаимодействия (мебель занимает
  // сам центр — это нормально, подходить надо рядом)
  const at = (x: number, z: number, r = 2.2, route = R) => {
    let best = -1;
    for (let j = 0; j < route.nz; j++) for (let i = 0; i < route.nx; i++) {
      if (route.seen[route.key(i, j)] !== 1) continue;
      const cx = b.x0 + (i + 0.5) * CELL, cz = b.z0 + (j + 0.5) * CELL;
      const d = Math.hypot(cx - x, cz - z);
      if (d < r && (best < 0 || d < best)) best = d;
    }
    return best >= 0;
  };
  {
    for (const a of it.acts) if (!at(a.x, a.z, a.r, walkableRoute)) problems.push('узкий проход к: ' + a.action + ' «' + a.label + '»');
    if (it.doorSpots.hatch && solidAt(it, it.doorSpots.hatch.x, it.doorSpots.hatch.z, 0, 1.8)) problems.push('возврат из подвала внутри мебели');
    if (it.bed && solidAt(it, it.bed.x + 1.2, it.bed.z, 0, 1.8)) problems.push('нельзя встать с кровати');
  }
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

  // дверной проём и площадка перед ним должны быть свободны, иначе в тамбур не войти
  const cxm = (b.x0 + b.x1) / 2;
  let blockedEntry = 0;
  for (let z = b.z1 - 0.9; z < b.z1 - 0.1; z += CELL / 2) for (let x = cxm - 1.2; x < cxm + 1.2; x += CELL / 2) {
    if (solidAt(it, x, z, 0, 1.8)) blockedEntry++;
  }
  if (blockedEntry) problems.push(`дверной проём заставлен (${blockedEntry} клеток)`);
  // и сам спавн не должен стоять в мебели с запасом по радиусу
  let spawnRing = 0;
  for (let a = 0; a < 8; a++) {
    const x = it.spawn.x + Math.cos((a / 8) * Math.PI * 2) * 0.55, z = it.spawn.z + Math.sin((a / 8) * Math.PI * 2) * 0.55;
    if (solidAt(it, x, z, 0, 1.8)) spawnRing++;
  }
  if (spawnRing > 2) problems.push(`у спавна тесно (${spawnRing}/8)`);

  const size = `${(b.x1 - b.x0).toFixed(0)}×${(b.z1 - b.z0).toFixed(0)} м`;
  if (problems.length) { fail++; console.log(`  ✗ ${kind.padEnd(12)} ${size}: ${problems.join('; ')}`); }
  else console.log(`  ✓ ${kind.padEnd(12)} ${size}, действий ${String(it.acts.length).padStart(2)}, светильников ${it.stats.fixtures}, вывесок ${String(it.stats.signs).padStart(2)}, объектов ${it.stats.meshes}`);
  it.dispose();
}
console.log(fail ? `\n✗ проблемных интерьеров: ${fail}` : '\n✓ все интерьеры проходимы и освещены');
process.exit(fail ? 1 : 0);
