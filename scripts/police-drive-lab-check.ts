import './domstub';
import {strict as assert} from 'node:assert';
import {Game} from '../src/game/game';
import {generateLayout} from '../src/game/worldgen';
import {Vehicle} from '../src/game/vehicles';
const L=generateLayout(), station=L.buildings.find(b=>b.kind==='police'&&b.enter&&!b.removed);assert(station);
const game=Object.create(Game.prototype) as any;game.L=L;
const candidates=L.nodes.filter(n=>!n.dead && L.adj[n.id]?.length && Math.hypot(n.x-station.x,n.z-station.z)>150);
let arrived=0,stuck=0;
for(let i=0;i<10;i++){
 const n=candidates[Math.floor(i*candidates.length/10)], next=L.nodes[L.adj[n.id][0].n];
 const v=new Vehicle('police','police');v.place(n.x,n.z,Math.atan2(next.x-n.x,next.z-n.z));
 const ai=game.routeFor(v,station.door);assert(ai);v.ai=ai;ai.obeyLights=false;
 const ctx={L,vehicles:[v],player:{x:v.x,z:v.z,inVehicle:v},lightState:()=> 'green',rand:()=>0.5};
 let callbacks=0;ai.onArrive=()=>{callbacks++;};
 for(let t=0;t<6000&&!ai.arrived;t++)ai.step(v,0.05,ctx);
 if(ai.arrived){arrived++;assert.equal(callbacks,1);assert(Math.hypot(v.x-ai.final.x,v.z-ai.final.z)<=3.1);}
 else stuck++;
 v.dispose();
}
console.log(`Симуляция движения к участку без трафика и физики стен: прибыли ${arrived}/10, не прибыли за 300 с: ${stuck}/10`);
assert(arrived>0,'ни одна машина не прибыла');
