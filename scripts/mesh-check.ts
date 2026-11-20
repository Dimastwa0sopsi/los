/* Сборка геометрии мира без браузера: щиты действительно строятся, панель висит
 * над землёй, столбы доходят до рамы, чанки собираются.  npm run check:mesh
 */
import './domstub';
import * as THREE from 'three';
import { generateLayout } from '../src/game/worldgen';
import { buildWorldMeshes } from '../src/game/worldMesh';

const L = generateLayout();
let fail = 0;
const t = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fail++;
};

async function main() {
const W = await buildWorldMeshes(L, () => {});
t('чанки мира собраны', W.chunks.length > 100, `${W.chunks.length}`);
t('щитов в геометрии столько же, сколько в лейауте', W.billboards.length === L.billboards.length, `${W.billboards.length}`);
t('у щитов есть лицевые панели', W.billboards.every((b) => b.mesh && b.mesh.isMesh));
const heights = W.billboards.map((b) => b.mesh.position.y);
t('панели висят над землёй', Math.min(...heights) > 3, `низ ${Math.min(...heights).toFixed(1)} м`);
t('панели не выше столбов', W.billboards.every((b) => {
  const def = L.billboards.find((d) => d.id === b.id)!;
  return b.mesh.position.y + def.h / 2 <= 3.2 + def.h + 0.7;
}));
t('все панели повёрнуты лицом к дороге', W.billboards.every((b) => {
  const def = L.billboards.find((d) => d.id === b.id)!;
  return Math.abs(b.mesh.rotation.y - def.rot) < 1e-6;
}));
t('светофоры в парке не строятся', W.lights.every((l) => {
  const bp = L.bigParks[0];
  return !(l.x > bp.x0 - 1 && l.x < bp.x1 + 1 && l.z > bp.z0 - 1 && l.z < bp.z1 + 1);
}), `${W.lights.length} перекрёстков со светофором`);

W.root.updateMatrixWorld(true);
const ground: THREE.Object3D[] = [];
W.root.traverse(o => { if (o.userData.matKey === 'tex:grass' || o.userData.matKey === 'tex:asphalt') ground.push(o); });
const ray = new THREE.Raycaster();
let covered = 0;
for (const pool of L.pools) {
  ray.set(new THREE.Vector3(pool.x, 2, pool.z), new THREE.Vector3(0, -1, 0));
  if (ray.intersectObjects(ground, false).some(hit => hit.point.y > -0.1)) covered++;
}
t('земля не перекрывает городские бассейны', covered === 0, `закрыто ${covered} из ${L.pools.length}`);

console.log(fail ? `✗ провалов: ${fail}` : '✓ геометрия мира в порядке');
process.exit(fail ? 1 : 0);
}
void main();
