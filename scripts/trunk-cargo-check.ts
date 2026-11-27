import './domstub';
import {strict as assert} from 'node:assert';
import {VehicleModel} from '../src/game/vehicleModel';
import {VEHICLES} from '../src/game/data';
import {TRUNK_OPEN_SECONDS} from '../src/game/trunkAnimation';
const supported=Object.values(VEHICLES).filter(s=>(s.body==='truck'||s.body==='semi') && s.variant!=='flat' && s.variant!=='tank');
assert(supported.length>0);
for(const spec of supported){
  const model=new VehicleModel(spec.id);const cargo=model.parts.find(p=>p.name==='cargo');
  assert(cargo && cargo.items.length>=5,`${spec.id}: walls, floor, roof`);
  assert(model.parts.some(p=>p.name==='cargoDoor'),spec.id);
  assert(model.setExperimentalTrunkAnimation(true));
  const door=model.body.getObjectByName('experimental-trunk-pivot')!;assert(door,spec.id);
  const y=door.position.y;model.setExperimentalTrunkElapsed(TRUNK_OPEN_SECONDS.rollup);assert(door.position.y>y+1,spec.id);
  model.setLights(true);assert(model.body.getObjectByName('experimental-trunk-pivot')!.position.y>y+1,spec.id);
  const detached=model.detach('cargoDoor');assert(detached,spec.id);assert(!model.body.getObjectByName('experimental-trunk-pivot'));
  detached.mesh.traverse((o:any)=>{if(o.isMesh)o.geometry.dispose();});
  model.repairParts();assert(model.body.getObjectByName('experimental-trunk-pivot'));model.dispose();
}
for(const spec of Object.values(VEHICLES).filter(s=>s.body==='semi'&&(s.variant==='flat'||s.variant==='tank'))){const model=new VehicleModel(spec.id);assert(!model.setExperimentalTrunkAnimation(true));model.dispose();}
console.log('✓ закрытые грузовики: полый кузов, подъём двери, перестройка и ремонт; цистерны исключены');
