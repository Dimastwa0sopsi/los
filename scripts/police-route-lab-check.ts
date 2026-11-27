import './domstub';
import {strict as assert} from 'node:assert';
import {Game} from '../src/game/game';
import {generateLayout,nearestRoadPoint} from '../src/game/worldgen';
const L=generateLayout(), station=L.buildings.find(b=>b.kind==='police'&&!b.removed);assert(station);
const road=nearestRoadPoint(L,station.door.x,station.door.z), edge=L.edges[road.e];
const game=Object.create(Game.prototype) as any;game.L=L;
let found=0,unreachable=0;
const candidates=L.nodes.filter(n=>!n.dead && L.adj[n.id]?.length>0 && Math.hypot(n.x-station.x,n.z-station.z)>150);
const samples=Array.from({length:Math.min(20,candidates.length)},(_,i)=>candidates[Math.floor(i*candidates.length/Math.min(20,candidates.length))]);
for(const node of samples){
 const car={x:node.x,z:node.z,forward:()=>({x:0,z:1})};
 const route=game.routeFor(car,station.door);
 if(!route){unreachable++;continue;}
 assert(route.final && Number.isFinite(route.final.x) && Number.isFinite(route.final.z));
 assert(route.route.length>=2 && route.mode==='route' && !route.arrived);
 assert(route.route.includes(edge.a)||route.route.includes(edge.b),'маршрут должен вести к дороге у участка');
 for(let i=1;i<route.route.length;i++)assert(L.adj[route.route[i-1]].some((a:any)=>a.n===route.route[i]),'звенья маршрута должны быть связаны');
 found++;
}
assert(found>0,'не удалось построить ни одного маршрута');
console.log(`✓ лаборатория маршрута к участку: ${found} маршрутов, ${unreachable} недоступных; реальное движение не проверено`);
