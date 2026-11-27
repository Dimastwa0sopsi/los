import './domstub';
import {strict as assert} from 'node:assert';
import {buildInterior} from '../src/game/interiors';
import {Collision} from '../src/game/collision';

const room=buildInterior('police',{seed:7}), spot=room.doorSpots.custody;
assert(spot,'точка камеры');
const col=new Collision(room.colliders,4), pos={x:spot.x,z:spot.z};
assert(!col.pushCircle({...pos},0.32,0,1.8,0.5),'точка внутри стены или мебели');
assert.equal(col.groundAt(pos.x,pos.z,0),0,'камера не над полом');
// Ensure normal movement cannot walk through the front bars. This is not a
// proof against jumping, teleporting, relogging or adversarial network clients.
let p={...pos};for(let i=0;i<80;i++){p.z+=0.05;col.pushCircle(p,0.32,0,1.8,0.5);}
assert(p.z<room.bounds.z0+3.0,'решётка удерживает персонажа');
assert(room.acts.some(a=>a.action==='exit'),'обычный выход из участка сохранён');
room.dispose();console.log('✓ камера участка: безопасное место, пол и решётка при обычном движении');
