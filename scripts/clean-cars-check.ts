import './domstub';
import { Vehicle } from '../src/game/vehicles';
import { VEHICLES, defaultTuning } from '../src/game/data';
import type { OwnedVehicle } from '../src/game/state';

for (const type of Object.keys(VEHICLES)) {
  const v = new Vehicle(type, 'traffic');
  let mud = false;
  v.model.group.traverse(o => { if (o.userData.matKey === 'c:#6b5540') mud = true; });
  if (mud) throw new Error(`${type}: создана грязь`);
}
const saved = { uid: 'old', type: 'lada', color: '#ffffff', tuning: defaultTuning(), condition: 1, fuel: 100, mileage: 0, missing: [], dirt: 0.9 } as OwnedVehicle;
new Vehicle('lada', 'owned', saved.color, saved);
if (saved.dirt !== undefined) throw new Error('старое загрязнение не очищено');
console.log(`✓ ${Object.keys(VEHICLES).length} моделей без грязи; старое загрязнение удаляется`);
