import { generateLayout } from '../src/game/worldgen';
const w = generateLayout();
const p = w.buildings.find(b => b.village === 'Кленовка' && b.kind === 'vpharmacy');
if (!p) throw Error('Нет аптеки');
for (const b of w.buildings.filter(b => b.village === 'Кленовка' && b.kind === 'vhouse')) {
  const dx = Math.abs(b.x - p.x), dz = Math.abs(b.z - p.z);
  if (dx < (b.w + p.w)/2 + 5 && dz < (b.d + p.d)/2 + 5) throw Error('Аптека слишком близка к дому ' + b.id);
}
if (w.colliders.some(c => c.tag !== 'b'+p.id && c.y1 > .5 && p.door.x > c.x0-.35 && p.door.x < c.x1+.35 && p.door.z > c.z0-.35 && p.door.z < c.z1+.35)) throw Error('Вход аптеки заблокирован');
console.log('✓ аптека Кленовки отделена от домов, вход доступен');
