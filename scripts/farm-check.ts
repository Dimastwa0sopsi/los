/* Проверка фермерских работ: точки, к которым обязан подойти игрок,
 * не должны быть замурованы в коллайдерах, а техника — стоять не в стене.
 *   npm run check:farm
 */
import { generateLayout } from '../src/game/worldgen';

const L = generateLayout();
const blocked = (x: number, z: number, y0 = 0.2, y1 = 1.8) =>
  L.colliders.some((c) => x > c.x0 - 0.15 && x < c.x1 + 0.15 && z > c.z0 - 0.15 && z < c.z1 + 0.15 && c.y1 > y0 && c.y0 < y1);

let bad = 0;
const check = (label: string, x: number, z: number) => {
  const b = blocked(x, z);
  // свободный подход: ищем точку в радиусе 2.5 м, где можно стоять
  let approach = false;
  for (let a = 0; a < 16 && !approach; a++) {
    const ang = (a / 16) * Math.PI * 2;
    for (const r of [1.2, 1.8, 2.4]) {
      if (!blocked(x + Math.cos(ang) * r, z + Math.sin(ang) * r)) { approach = true; break; }
    }
  }
  const ok = !b && approach;
  if (!ok) bad++;
  console.log(`   ${ok ? '✓' : '✗'} ${label.padEnd(26)} (${Math.round(x)}, ${Math.round(z)})${b ? ' — точка внутри коллайдера' : ''}${!approach ? ' — нет свободного подхода' : ''}`);
};

const LV = L.livestock;
console.log('  ферма «Зорька» (работа с кормом и яйцами):');
check('контора · вход', LV.office.x, LV.office.z - 1.6);
check('стог сена (корм)', LV.feed.x, LV.feed.z);
LV.troughs.forEach((t, i) => check(`кормушка №${i + 1}`, t.x, t.z));
check('курятник · сбор яиц', LV.coop.x - 1.6, LV.coop.z);
check('ящик для яиц', LV.crate.x, LV.crate.z + 1.6);

const F = L.farm;
console.log('  агрохолдинг «Нива» (комбайн):');
check('комбайн · место водителя', F.combineSpawn.x, F.combineSpawn.z);
check('контора поля', F.office.x, F.office.z);
// комбайн должен стоять в поле или рядом, а не в стене ангара
const inField = F.combineSpawn.x > F.x0 - 25 && F.combineSpawn.x < F.x1 + 25 && F.combineSpawn.z > F.z0 - 25 && F.combineSpawn.z < F.z1 + 25;
console.log(`   ${inField ? '✓' : '✗'} комбайн у поля (${F.combineSpawn.x}, ${F.combineSpawn.z})`);
if (!inField) bad++;

// поле пшеницы: участки не должны попадать в здания
const cw = (F.x1 - F.x0) / F.cols, ch = (F.z1 - F.z0) / F.rows;
let inBuilding = 0;
for (let r = 0; r < F.rows; r++) for (let c = 0; c < F.cols; c++) {
  const x = F.x0 + cw * (c + 0.5), z = F.z0 + ch * (r + 0.5);
  if (L.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2)) inBuilding++;
}
console.log(`   ${inBuilding ? '✗' : '✓'} поле ${F.cols}×${F.rows}: участков внутри зданий ${inBuilding}`);
if (inBuilding) bad++;

// живность: коровы и куры не должны стоять в стенах
const animals = L.props.filter((p) => p.t === 'cow' || p.t === 'chicken');
const stuck = animals.filter((p) => L.buildings.some((b) => Math.abs(p.x - b.x) < b.w / 2 + 0.3 && Math.abs(p.z - b.z) < b.d / 2 + 0.3));
console.log(`   ${stuck.length ? '✗' : '✓'} животные: ${animals.length}, в стенах ${stuck.length}`);
for (const p of stuck.slice(0, 8)) {
  const b = L.buildings.find((q) => Math.abs(p.x - q.x) < q.w / 2 + 0.3 && Math.abs(p.z - q.z) < q.d / 2 + 0.3);
  console.log(`      ${p.t} (${Math.round(p.x)}, ${Math.round(p.z)}) в «${b?.name}»`);
}
if (stuck.length) bad++;

process.exit(bad ? 1 : 0);
