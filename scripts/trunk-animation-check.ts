import {strict as assert} from 'node:assert';
import {trunkMotionKind,trunkMotionPose,stepTrunkMotion,TRUNK_OPEN_SECONDS} from '../src/game/trunkAnimation';
import {VEHICLES} from '../src/game/data';
for (const spec of Object.values(VEHICLES)) {
  const kind=trunkMotionKind(spec.body,spec.variant);
  if(spec.body==='moto'||spec.body==='scooter')assert.equal(kind,null,spec.id);
  if(!kind)continue;
  const duration=TRUNK_OPEN_SECONDS[kind],a=trunkMotionPose(kind,0),m=trunkMotionPose(kind,duration*.5),b=trunkMotionPose(kind,duration);
  assert.equal(a.progress,0);assert.equal(b.progress,1);assert.equal(b.armReach,0);
  if(kind==='rollup'){
    const pull=trunkMotionPose(kind,duration*.2);
    assert(pull.armReach>.9,spec.id); assert.equal(pull.lidLift,0); assert(m.lidLift>0); assert.equal(m.armReach,0);
    assert.equal(a.lidLift,0);assert.equal(b.lidLift,1);assert.equal(b.lidAngle,0);
  }
  else {assert.equal(a.lidAngle,0);assert(b.lidAngle>0);assert.equal(b.lidLift,0);}
  let t=0;for(let i=0;i<100;i++)t=stepTrunkMotion(kind,t,true,.1);assert.equal(t,duration);
  for(let i=0;i<100;i++)t=stepTrunkMotion(kind,t,false,.1);assert.equal(t,0);
}
assert.equal(trunkMotionKind('truck','tank'),'hinged');assert.equal(trunkMotionKind('truck','box'),'rollup');
assert.equal(stepTrunkMotion('hinged',0,true,Infinity),0);
console.log('✓ прототип анимации багажника: рука, удержание, движение крышки, грузовые ворота и запрет для мотоциклов');
