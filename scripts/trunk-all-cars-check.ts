import './domstub';
import {strict as assert} from 'node:assert';
import {VehicleModel} from '../src/game/vehicleModel';
import {VEHICLES} from '../src/game/data';
import {trunkMotionKind,TRUNK_OPEN_SECONDS} from '../src/game/trunkAnimation';
import {prepareOwnedTrunkTransfer} from '../src/game/trunkTransaction';
import {newState} from '../src/game/state';
import {defaultTuning} from '../src/game/data';
let count=0;
for(const spec of Object.values(VEHICLES)) {
  const wanted=['sedan','sport','hatch','suv','pickup','van','bus','truck','semi'].includes(spec.body);
  const kind=trunkMotionKind(spec.body,spec.variant);
  assert.equal(!!kind,wanted,spec.id);
  if(!wanted) continue;
  const state=newState('m',{x:0,z:0,a:0});state.inventory={water:1};
  state.vehicles=[{uid:'own',type:spec.id,color:'#ffffff',tuning:defaultTuning(),condition:1,mileage:0,year:2026,fuel:100,pos:null,missing:[],paid:0}];
  const transfer=prepareOwnedTrunkTransfer(state,'own','water',1,'put',new Set(['water']));assert(transfer.ok,`${spec.id}: хранение`);
  const m=new VehicleModel(spec.id);assert(m.setExperimentalTrunkAnimation(true),spec.id);
  const p=m.body.getObjectByName('experimental-trunk-pivot');assert(p,`${spec.id}: крышка`);
  const closedY=p.position.y; m.setExperimentalTrunkElapsed(TRUNK_OPEN_SECONDS[kind!]);
  if(kind==='rollup') assert(p.position.y>closedY,`${spec.id}: ворота`);
  else assert(Math.abs(p.rotation.x)>1,`${spec.id}: петля`);
  if(spec.body==='pickup') assert(p.rotation.x<0,`${spec.id}: борт опускается назад`);
  m.setLights(true);assert(m.body.getObjectByName('experimental-trunk-pivot'),`${spec.id}: перестройка`);
  m.dispose();count++;
}
console.log(`✓ багажники: крышка или задний ящик у ${count} моделей автомобилей, автобусов и грузовиков; мототехника исключена`);
