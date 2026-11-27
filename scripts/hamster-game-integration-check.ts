import './domstub';
import {strict as assert} from 'node:assert';
import {generateLayout} from '../src/game/worldgen';
import {Collision} from '../src/game/collision';
import {makeHamster} from '../src/game/hamster';
import {Game} from '../src/game/game';
import {newState} from '../src/game/state';
const {hamsterSpawn}=require('../server/hamster-spawn.cjs');
const spot=hamsterSpawn(),layout=generateLayout(),col=new Collision(layout.colliders);
function make(id:number){
 const messages:string[]=[];const g=Object.create(Game.prototype) as any;
 Object.assign(g,{L:layout,col,hamster:makeHamster(),online:true,onlineHamsterReady:false,hamsterWaiting:false,hamsterAction:null,hamsterWorld:null,hamsterPetRequestAt:-Infinity,state:newState('m',{x:0,z:0,a:0}),px:spot.x-1,pz:spot.z,net:{id,sessionReady:true,hamsterWorldSupported:true,sendMove:()=>messages.push('move'),petHamster:()=>messages.push('pet')},toast:()=>{},playerWorldPos:()=>({x:spot.x-1,z:spot.z,a:0})});
 g.applyOnlineHamsterSpawn(spot);return {g,messages};
}
const a=make(1),b=make(2),base={version:1,seq:1,x:spot.x,z:spot.z,serverTime:1000,event:null};
a.g.applyOnlineHamsterWorld(base);b.g.applyOnlineHamsterWorld(base);
a.g.updateHamster(Date.now());b.g.updateHamster(Date.now());assert(a.g.hamster.group.visible&&b.g.hamster.group.visible);
a.g.petHamster();assert.deepEqual(a.messages,['move','pet']);
const event={petter:1,start:1000,returnAt:123300,dx:1,dz:0},world={...base,seq:2,event};
a.g.applyOnlineHamsterWorld(world);b.g.applyOnlineHamsterWorld(world);assert(a.g.hamsterAction);assert.equal(b.g.hamsterAction,null);
b.g.petHamster();assert.deepEqual(b.messages,[],'хомяка нельзя погладить во время чужого события');
function advance(g:any,ms:number){g.hamsterWorld.received=performance.now()-ms;g.updateHamster(Date.now()+ms);}
advance(a.g,1600);advance(b.g,1600);assert(Math.abs(a.g.hamster.group.position.x-(spot.x+1))<.02);assert(Math.abs(b.g.hamster.group.position.x-a.g.hamster.group.position.x)<.02);assert(a.g.hamster.group.position.y>0);
advance(a.g,3000);advance(b.g,3000);assert(!a.g.hamster.group.visible&&!b.g.hamster.group.visible);
// Reconnection receives a snapshot of the same active event, even without the original animation.
b.g.net.sessionReady=false;b.g.updateHamster(Date.now());assert(!b.g.hamster.group.visible);b.g.net.sessionReady=true;b.g.applyOnlineHamsterSpawn(spot);b.g.applyOnlineHamsterWorld({...world,serverTime:4000});b.g.updateHamster(Date.now());assert(!b.g.hamster.group.visible);
b.g.applyOnlineHamsterWorld({...base,seq:1});assert.equal(b.g.hamsterWorld.world.seq,2,'устаревший снимок игнорируется');
advance(a.g,122301);assert(a.g.hamster.group.visible);assert(Math.abs(a.g.hamster.group.position.x-spot.x)<.001);
console.log('✓ Game: два клиента, блокировка повторного поглаживания, прыжки, исчезновение и переподключение');
