import './domstub';
import {strict as assert} from 'node:assert';
import {generateLayout} from '../src/game/worldgen';
import {PedSystem} from '../src/game/npc';
import {AIDriver,type AICtx} from '../src/game/vehicles';
const L=generateLayout();
for(const kind of ['wall','parked','player','remote','ped'] as const){
 const sys=new PedSystem(L);const p=(sys as any).make('village',undefined,42);p.x=0;p.z=0;p.tx=0;p.tz=10;p.state='leave';p.speed=1.4;
 if(kind==='ped'){const other=(sys as any).make('village',undefined,43);other.x=0;other.z=4;other.state='stand';}
 const ctx={px:kind==='player'?0:30,pz:kind==='player'?4:30,py:0,playerVisible:kind==='player',otherPlayers:kind==='remote'?[{x:0,z:4}]:[],lightState:()=>'',hitPlayer:()=>false,inside:false,viewDist:100,obstacles:(x:number,z:number)=>kind==='wall'&&Math.hypot(x,z-4)<0.85,vehicles:kind==='parked'?[{x:0,z:4,r:1,speed:0}]:[]};
 for(let i=0;i<600 && p.state!=='gone';i++)sys.update(1/30,i/30,ctx);
 assert.equal(p.state,'gone',`не обошёл ${kind}: ${p.x}, ${p.z}`);sys.dispose();
}
const n=L.nodes.find(n=>n.gi===3 && n.gj===6 && !n.dead)!;const edge=L.adj[n.id][0],b=L.nodes[edge.n];
const heading=Math.atan2(b.x-n.x,b.z-n.z), fx=Math.sin(heading),fz=Math.cos(heading);
const vehicle=()=>({x:n.x,z:n.z,heading,speed:0,steer:0,rpm:0,shock:0,spec:{maxSpeed:28,accel:3.2,len:4.4,wid:1.9},model:{group:{visible:true}}}) as any;
function target(pedestrians:{x:number;z:number}[]){const v=vehicle(),ai=new AIDriver();ai.route=[n.id,edge.n];ai.mode='route';ai.obeyLights=false;const ctx:AICtx={L,vehicles:[v],player:{x:1e6,z:1e6,inVehicle:null},lightState:()=> 'green',rand:()=>0.5,pedestrians};return ai.step(v,1/30,ctx).target;}
assert(target([{x:n.x+fx*5,z:n.z+fz*5}])<target([]),'водитель не тормозит перед пешеходом');
console.log('✓ NPC: обход препятствия, стоящей машины, игрока и пешехода; водитель тормозит перед пешеходом');
