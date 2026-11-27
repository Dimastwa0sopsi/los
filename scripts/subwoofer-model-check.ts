import './domstub';
import {strict as assert} from 'node:assert';
import {VehicleModel} from '../src/game/vehicleModel';
import {VEHICLES,defaultTuning,hasSubwooferTrunk} from '../src/game/data';
for (const spec of Object.values(VEHICLES)) {
  if(!hasSubwooferTrunk(spec.body))continue;
  const model=new VehicleModel(spec.id,undefined,{...defaultTuning(),subwoofer:true});
  const sub=model.body.getObjectByName('trunk-subwoofer');assert(sub,spec.id);
  assert(sub.position.z<0 && sub.position.z>=-spec.len/2,spec.id);
  assert(sub.position.y>0 && sub.position.y<spec.hei,spec.id);
  model.applyTuning({...defaultTuning(),subwoofer:false});assert.equal(model.body.getObjectByName('trunk-subwoofer'),undefined,spec.id);
  model.applyTuning({...defaultTuning(),subwoofer:true});assert(model.body.getObjectByName('trunk-subwoofer'),spec.id);
  model.dispose();
}
console.log('✓ сабвуфер расположен внутри задней части совместимых машин, включение и снятие модели');
