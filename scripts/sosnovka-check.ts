import { generateLayout, astar } from '../src/game/worldgen';
import { newState, loadState, saveState } from '../src/game/state';
import { SOSNOVKA_DZ } from '../src/game/sosnovka';
const assert = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); console.log('✓ ' + msg); };
const L = generateLayout();
const find = (x: number, z: number) => L.nodes.find(n => n.x === x && n.z === z)!;
assert(!!astar(L, find(300, 0).id, find(540, -340).id), 'дорога от города до Сосновки связана');
assert(!!astar(L, find(540, -340).id, find(680, -290).id), 'дорога от Сосновки до Егоровки связана');
for (const h of L.buildings.filter(b => b.kind === 'vhouse')) {
  assert(!L.colliders.some(c => c.tag !== 'b' + h.id && c.y1 > 0.5 && h.door.x > c.x0 - 0.35 && h.door.x < c.x1 + 0.35 && h.door.z > c.z0 - 0.35 && h.door.z < c.z1 + 0.35), `вход дома ${h.id} не заблокирован`);
}
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
const s = newState('m', { x: 330, z: -248, a: 0 }); delete s.sosnovkaShifted;
s.properties = ['1120:0']; s.garages = [22]; s.vehicles = [{ uid: 'test', type: 'lada', color: '#fff', tuning: {} as any, condition: 1, mileage: 0, year: 2026, fuel: 50, pos: { x: 330, z: -240, a: 0 }, missing: [], paid: 1 }];
saveState(s); const migrated = loadState()!;
assert(migrated.pos.z === -248 + SOSNOVKA_DZ && migrated.vehicles[0].pos?.z === -240 + SOSNOVKA_DZ, 'позиции игрока и машины перенесены из старого сохранения');
assert(migrated.properties[0] === '1120:0' && migrated.garages[0] === 22, 'сохранены ID недвижимости и гаража');
saveState(migrated); const twice = loadState()!;
assert(twice.pos.z === migrated.pos.z && twice.vehicles[0].pos?.z === migrated.vehicles[0].pos?.z, 'повторная загрузка не сдвигает ещё раз');
