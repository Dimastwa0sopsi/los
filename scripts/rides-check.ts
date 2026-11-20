/* Проверка аттракционов парка «Ракета»: модели собираются, крутятся, а место
 * пассажира всегда остаётся в разумных координатах (не улетает и не проваливается).
 *   npm run check:rides
 */
import { generateLayout } from '../src/game/worldgen';
import { ParkRides } from '../src/game/rides';

const L = generateLayout();
if (L.parkRides.length) throw new Error('Парк должен быть без аттракционов');
// Движок аттракционов тестируем на отдельном фиктивном наборе, не размещая их в мире.
const definitions: typeof L.parkRides = [
  { id: 'ferris', kind: 'ferris', name: 'Колесо', x: 0, z: 0, w: 3.4, h: 12, board: { x: 0, z: 11 }, price: 6 },
  { id: 'carousel', kind: 'carousel', name: 'Карусель', x: 100, z: 0, w: 9, h: 8, board: { x: 100, z: 10 }, price: 4 },
  { id: 'tower', kind: 'tower', name: 'Башня', x: 200, z: 0, w: 1.8, h: 22, board: { x: 206, z: 0 }, price: 7 },
  { id: 'coaster', kind: 'coaster', name: 'Горки', x: 300, z: 0, w: 52, h: 9, board: { x: 300, z: -8 }, price: 9 },
];
const rides = new ParkRides(definitions);
let fail = 0;
const bad = (msg: string) => { console.log(`  ✗ ${msg}`); fail++; };

for (const def of definitions) {
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
  // посадка начинается у платформы, а не в воздухе
  rides.start(def.id);
  const startSeat = rides.seat(def.id)!;
  if (startSeat.y > 3.2) bad(`${def.name}: посадка в воздухе — сиденье на ${startSeat.y.toFixed(1)} м`);
  // место пассажира не вылетает за габариты аттракциона
  const maxOff = Math.max(def.w, def.h) + 26;
  if (Math.max(...xs.map((x, i) => Math.hypot(x - def.x, zs[i] - def.z))) > maxOff) bad(`${def.name}: сиденье уходит за габариты`);
  // горки: на спуске вагонетка наклоняется (пассажир едет «носом вниз»)
  if (def.kind === 'coaster') {
    const pitches: number[] = [];
    rides.start(def.id);
    for (let i = 0; i < 900; i++) { rides.update(1 / 60); pitches.push(rides.seat(def.id)!.pitch); }
    const spread = Math.max(...pitches) - Math.min(...pitches);
    console.log(`    горки: наклон вагонетки ${(spread * 57.3).toFixed(1)}°`);
    if (spread < 0.2) bad('вагонетка горок не наклоняется на спуске');
  }
  // карусель: лошадка покачивается, значит сиденье «дышит» по высоте
  if (def.kind === 'carousel') {
    rides.start(def.id);
    const ys2: number[] = [];
    for (let i = 0; i < 400; i++) { rides.update(1 / 60); ys2.push(rides.seat(def.id)!.y); }
    if (Math.max(...ys2) - Math.min(...ys2) < 0.1) bad('сиденье карусели не повторяет покачивание лошадки');
  }
  if (def.kind === 'tower' && dy < 10) bad('башня не поднимает кабину');
  if ((def.kind === 'coaster' || def.kind === 'carousel') && dx + dz < 4) bad(`${def.name}: пассажир не двигается`);
  rides.stop(def.id);
}
// остановленный аттракцион не «дёргается» и не теряет сиденье
const first = definitions[0];
rides.stop(first.id);
const a = rides.seat(first.id)!, b = (rides.update(0.016), rides.seat(first.id)!);
if (Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y) > 1) bad('остановленный аттракцион прыгает');

console.log(fail ? `✗ провалов: ${fail}` : '✓ аттракционы в порядке');
process.exit(fail ? 1 : 0);
