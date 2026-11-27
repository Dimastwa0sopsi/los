import './domstub';
import {strict as assert} from 'node:assert';
import {generateLayout} from '../src/game/worldgen';
import {Collision} from '../src/game/collision';
import {isHamsterSpot,makeHamster} from '../src/game/hamster';
import {Game} from '../src/game/game';
import {newState} from '../src/game/state';
// Server location must stay valid for the actual generated city and static colliders.
const {hamsterSpawn}=require('../server/hamster-spawn.cjs');
const layout=generateLayout(),col=new Collision(layout.colliders),spawn=hamsterSpawn();
assert(isHamsterSpot(layout,col,spawn.x,spawn.z));assert.deepEqual(spawn,hamsterSpawn());
assert(!isHamsterSpot(layout,col,-1,spawn.z));assert(!isHamsterSpot(layout,col,NaN,spawn.z));
const make=()=>{const g=Object.create(Game.prototype) as any;Object.assign(g,{L:layout,col,hamster:makeHamster(),online:true,onlineHamsterReady:false,hamsterWaiting:false,hamsterAction:null,state:newState('m',{x:0,z:0,a:0}),net:{sessionReady:true}});return g;};
const a=make(),b=make();a.applyOnlineHamsterSpawn(spawn);b.applyOnlineHamsterSpawn(spawn);a.updateHamster(Date.now());b.updateHamster(Date.now());
assert(a.hamster.group.visible&&b.hamster.group.visible);assert.equal(a.hamster.group.position.x,b.hamster.group.position.x);assert.equal(a.hamster.group.position.z,b.hamster.group.position.z);
a.net.sessionReady=false;a.updateHamster(Date.now());assert(!a.hamster.group.visible);a.net.sessionReady=true;a.applyOnlineHamsterSpawn(undefined);a.updateHamster(Date.now());assert(!a.hamster.group.visible);
a.applyOnlineHamsterSpawn({...spawn,version:2});a.updateHamster(Date.now());assert(!a.hamster.group.visible);
a.applyOnlineHamsterSpawn(spawn);a.updateHamster(Date.now());assert(a.hamster.group.visible);
console.log('✓ серверная точка в городском парке, одинакова для клиентов; старый сервер, обрыв и несовпадение карты скрывают хомяка');
