import './domstub';
import {generateLayout} from '../src/game/worldgen';
import {PedSystem} from '../src/game/npc';
import {RNG} from '../src/game/config';
import assert from 'node:assert/strict';
const L=generateLayout();
function make(seed:number){const p=new PedSystem(L);(p as any).beachRandom=new RNG(seed);p.init(0,0,0);return p;}
const p=make(101), other=make(202);
const a=p.peds.filter(x=>x.kind==='beach'), b=other.peds.filter(x=>x.kind==='beach');
assert.equal(a.length,26);assert(a.some((x,i)=>x.x!==b[i].x || x.z!==b[i].z));
const swimmers=a.filter(x=>x.state==='swim');assert(swimmers.length>0);
for(const s of swimmers){const bank=L.river.center(s.z)+L.river.half;assert(s.x<bank && s.x>bank-L.river.half);assert(L.river.depth(s.x,s.z)>0);}
const s=swimmers[0],z=s.z;
const ctx={px:s.x,pz:s.z,py:0,playerVisible:false,lightState:()=>'',hitPlayer:()=>false,inside:false,viewDist:100,obstacles:()=>false,vehicles:[]};
for(let i=0;i<60;i++)p.update(1/30,i/30,ctx);
assert(Math.abs(s.z-z)>0.1);assert.equal(s.lastPose,'swim');assert.equal(s.char.root.position.y,L.waterY);
p.setBeachDay(false);assert.equal(s.state,'leave');p.setBeachDay(true);assert.equal(s.state,'walk');assert.equal(s.timer,-1);
console.log('✓ пляж: случайные позиции при запуске, купальщики в воде двигаются и дневной цикл сохраняется');
