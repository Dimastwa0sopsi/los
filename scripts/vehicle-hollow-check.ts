import './domstub';
import {strict as assert} from 'node:assert';
import * as THREE from 'three';
import {VehicleModel} from '../src/game/vehicleModel';
import {VEHICLES} from '../src/game/data';

// Probe chassis volumes directly: no paint block may occupy seat or boot space.
function contains(item: {tpl: THREE.BufferGeometry; m: THREE.Matrix4}, point: THREE.Vector3) {
  if (!item.tpl.boundingBox) item.tpl.computeBoundingBox();
  const local=point.clone().applyMatrix4(item.m.clone().invert());
  return item.tpl.boundingBox!.containsPoint(local);
}
let count=0;
for(const spec of Object.values(VEHICLES)) {
  if(!['sedan','sport','hatch','suv','pickup','van','truck','semi','bus'].includes(spec.body)) continue;
  const model=new VehicleModel(spec.id);
  const chassis=model.parts.filter(p=>p.name==='chassis').flatMap(p=>p.items);
  const seat=new THREE.Vector3(model.driver.x,model.driver.y+0.16,model.driver.z);
  assert(!chassis.some(item=>contains(item,seat)),`${spec.id}: кузов внутри места водителя`);
  if(spec.body==='sedan'||spec.body==='sport') {
    const clear=spec.body==='sedan'?0.3:0.2, belt=spec.hei*(spec.body==='sedan'?0.64:0.62), z0=spec.len*(spec.body==='sedan'?-0.3:-0.22);
    const boot=new THREE.Vector3(0,clear+(belt-clear)*0.55,(-spec.len/2+0.12+z0-0.08)/2);
    assert(!chassis.some(item=>contains(item,boot)),`${spec.id}: багажник заполнен кузовом`);
    assert(model.parts.some(p=>p.name==='trunk'),`${spec.id}: крышка`);
  }
  model.dispose(); count++;
}
console.log(`✓ пустое место для водителя у ${count} моделей; ниши седанов и спорткаров свободны от кузова`);
