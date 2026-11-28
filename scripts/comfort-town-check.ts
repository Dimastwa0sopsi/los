import './domstub';
import { generateLayout, COMFORT_TOWN, astar } from '../src/game/worldgen';
import { buildInterior, interiorForBuilding } from '../src/game/interiors';
import { Collision } from '../src/game/collision';
import { strict as assert } from 'node:assert';
const L = generateLayout();
const towers = L.buildings.filter(b => b.comfort);
const shops = L.buildings.filter(b => b.name.includes('«Уютный»') && !b.comfort);
assert.equal(towers.length, 6); assert.equal(shops.length, 4);
assert(towers.every(b => b.kind === 'apartment' && b.enter && interiorForBuilding(b.kind) === 'hall'));
assert(shops.every(b => b.enter && interiorForBuilding(b.kind)));
assert(L.lots.some(l => l.name.includes('Уютный') && l.spaces.length >= 20));
for (const b of [...towers, ...shops]) {
  assert(b.x >= COMFORT_TOWN.x0 && b.x <= COMFORT_TOWN.x1 && b.z >= COMFORT_TOWN.z0 && b.z <= COMFORT_TOWN.z1);
  assert(!L.colliders.some(c => c.tag !== 'b' + b.id && c.y1 > 1 && b.door.x > c.x0 - .35 && b.door.x < c.x1 + .35 && b.door.z > c.z0 - .35 && b.door.z < c.z1 + .35), `${b.name}: заблокирован вход`);
}
const townNode=L.nodes.find(n=>n.x===1250 && n.z===-190); const cityNode=L.nodes.find(n=>n.gi===18 && n.gj===0);
assert(townNode && cityNode && astar(L, cityNode.id, townNode.id), 'нет связи с городом');
const it = buildInterior('hall', { seed: 1 });
const col = new Collision(it.colliders,4);
const cx = (it.bounds.x0+it.bounds.x1)/2, cz=(it.bounds.z0+it.bounds.z1)/2;
for (let z=5.8,y=0; z>=-2.2; z-=.05) {
  const p={x:cx+2.9,z:cz+z}; col.pushCircle(p,.33,y,1.7,.45);
  assert(Math.abs(p.z-(cz+z))<.02, `лестница заблокирована на ${z}`);
  y=col.groundAt(p.x,p.z,y,.45,.25);
  if(z < -2.1) assert.equal(y,3);
}
for (const key of ['apt0','apt1','apt2','apt3','lift0','lift1']) {
  const p=it.doorSpots[key]; assert(p, `нет точки ${key}`);
  assert(!col.solidAt(p.x,p.y+1,p.z), `${key}: точка внутри стены`);
}
assert.equal(it.doorSpots.lift0.y,0); assert.equal(it.doorSpots.lift1.y,3);
it.dispose(); console.log('✓ «Уютный»: дома, магазины, парковка, дороги и подъезд');
