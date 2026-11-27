/** Experimental dispatch planner. It builds routes but does not move or detain players. */
export type CustodyStation = {id:number; kind:string; enter?:boolean; removed?:boolean; door:{x:number;z:number}};
export type CustodyPatrol = {x:number;z:number; speed:number; role:string; sirens:boolean};
export function planCustodyRoute<P extends CustodyPatrol,S extends CustodyStation,R>(
 patrols:readonly P[], stations:readonly S[], player:{x:number;z:number},
 routeFor:(patrol:P, destination:{x:number;z:number})=>R|null,
):{patrol:P;station:S;route:R}|null {
 if(!Number.isFinite(player.x)||!Number.isFinite(player.z))return null;
 const eligible=patrols.filter(p=>p.role==='police' && p.sirens && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.speed) && Math.abs(p.speed)<3 && Math.hypot(p.x-player.x,p.z-player.z)<7.5)
  .slice().sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z));
 for(const patrol of eligible){
  const available=stations.filter(s=>s.kind==='police' && s.enter===true && !s.removed && Number.isFinite(s.door?.x) && Number.isFinite(s.door?.z))
   .slice().sort((a,b)=>Math.hypot(a.door.x-patrol.x,a.door.z-patrol.z)-Math.hypot(b.door.x-patrol.x,b.door.z-patrol.z));
  for(const station of available){const route=routeFor(patrol,station.door);if(route!==null)return {patrol,station,route};}
 }
 return null;
}
