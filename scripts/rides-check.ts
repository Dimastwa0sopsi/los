/* Проверка аттракционов парка «Ракета»: модели собираются, крутятся, а место
 * пассажира всегда остаётся в разумных координатах (не улетает и не проваливается).
 *   npm run check:rides
 */
import { generateLayout } from '../src/game/worldgen';
import { ParkRides } from '../src/game/rides';

const L = generateLayout();
if (!L.parkRides.length) { console.error('✗ в лейауте нет аттракционов'); process.exit(1); }

const rides = new ParkRides(L.parkRides);
let fail = 0;
const bad = (msg: string) => { console.log(`  ✗ ${msg}`); fail++; };

for (const def of L.parkRides) {
  rides.start(def.id);
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const steps = def.kind === 'ferris' ? 4000 : 1200;
  for (let i = 0; i < steps; i++) {
    rides.update(1 / 60);
    const s = rides.seat(def.id);
    if (!s) { bad(`${def.name}: нет места пассажира`); break; }
    if (!Number.isFinite(s.x + s.y + s.z)) { bad(`${def.name}: координаты сиденья NaN`); break; }
    xs.push(s.x); ys.push(s.y); zs.push(s.z);
  }
  const dx = Math.max(...xs) - Math.min(...xs);
  const dy = Math.max(...ys) - Math.min(...ys);
  const dz = Math.max(...zs) - Math.min(...zs);
  const inPark = xs.every((x, i) => Math.hypot(x - def.x, zs[i] - def.z) < Math.max(def.w, 30) + 20);
  const sane = xs.every((x) => Math.abs(x) < 5000) && zs.every((z) => Math.abs(z) < 5000) && ys.every((y) => y > -0.5 && y < 60);
  console.log(`  ${inPark && sane ? '✓' : '✗'} ${def.name}: ход ${dx.toFixed(1)}×${dz.toFixed(1)} м, подъём ${dy.toFixed(1)} м, билет $${def.price}`);
  if (!inPark) bad(`${def.name}: сиденье уходит далеко от аттракциона`);
  if (!sane) bad(`${def.name}: сиденье вне разумных координат`);
  if (def.kind === 'ferris' && dy < def.h) bad('колесо не поднимает пассажира на высоту');
  if (def.kind === 'tower' && dy < 10) bad('башня не поднимает кабину');
  if ((def.kind === 'coaster' || def.kind === 'carousel') && dx + dz < 4) bad(`${def.name}: пассажир не двигается`);
  rides.stop(def.id);
}
// остановленный аттракцион не «дёргается» и не теряет сиденье
const first = L.parkRides[0];
rides.stop(first.id);
const a = rides.seat(first.id)!, b = (rides.update(0.016), rides.seat(first.id)!);
if (Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y) > 1) bad('остановленный аттракцион прыгает');

console.log(fail ? `✗ провалов: ${fail}` : '✓ аттракционы в порядке');
process.exit(fail ? 1 : 0);
