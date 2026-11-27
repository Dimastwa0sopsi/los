import './domstub';
import {strict as assert} from 'node:assert';
import {generateLayout} from '../src/game/worldgen';
import {Collision} from '../src/game/collision';
import {hamsterSpot,makeHamster} from '../src/game/hamster';
import {nextImmersion} from '../src/game/vehicleSinking';
import {segDist} from '../src/game/config';
const layout=generateLayout(), collision=new Collision(layout.colliders);
for (let run=0;run<30;run++) {
  const p=hamsterSpot(layout,collision); assert(p,'Не найдена безопасная точка');
  assert.equal(layout.river.depth(p.x,p.z),0);
  assert(!collision.query(p.x,p.z,1).some(b=>b.y0<0.5 && b.y1>0.15));
  assert(!layout.roadSegments.some(r=>segDist(p.x,p.z,r.ax,r.az,r.bx,r.bz).d<r.w/2+1));
}
const hamster=makeHamster();let pieces=0;hamster.group.traverse(()=>pieces++);assert(pieces>15);hamster.animate(1);
let depth=0;for(let i=0;i<300;i++)depth=nextImmersion(depth,3,0.05);
assert(depth>2); assert(depth<3); assert.equal(nextImmersion(depth,0,0.05),0);
assert.equal(nextImmersion(0,0.5,0.05),0); assert.equal(nextImmersion(0,3,0),0);
assert.equal(nextImmersion(NaN,3,0.05),0);
console.log('✓ хомяк в открытой точке парка вне дорог; постепенное погружение и выход на сушу');
