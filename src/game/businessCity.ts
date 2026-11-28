import type {Building,Box} from './worldgen';

/** Fixed existing tower footprints: no building IDs or saved properties change. */
const towers: readonly [number,number,number,string][]=[
 [499.5,559.5,122,'Башня «Горизонт»'],[520.5,559.5,148,'Башня «Спектр»'],
 [499.5,580.5,155,'Башня «Сияние»'],[520.5,580.5,135,'Лос-Сити · смотровая'],
 [559.5,580.5,105,'Башня «Импульс»'],[580.5,580.5,162,'Башня «Вектор»'],
 [559.5,619.5,135,'Башня «Люмен»'],[559.5,640.5,108,'Башня «Неон»'],
 [640.5,619.5,150,'Башня «Вершина»'],[619.5,640.5,123,'Башня «Меридиан»'],
 [640.5,640.5,175,'Башня «Зенит»'],[580.5,499.5,130,'Башня «Рассвет»'],
];
export const DECK_HEIGHT=4.2;
export function applyBusinessCity(buildings:Building[],colliders:Box[]) {
 for(const [x,z,height,name] of towers){
  const building=buildings.find(b=>b.kind==='tower' && Math.abs(b.x-x)<.1 && Math.abs(b.z-z)<.1);
  if(!building)continue;
  building.h=height;building.facade='glass';building.name=name;building.businessCity=true;
  if(name.includes('смотровая'))building.observation=true;
  const body=colliders.find(c=>c.tag==='b'+building.id);if(body)body.y1=height;
  if(!building.observation)continue;
  const hw=building.w/2,hd=building.d/2,t=.22,y0=height,y1=height+DECK_HEIGHT;
  colliders.push(
   {x0:x-hw,x1:x+hw,z0:z-hd,z1:z+hd,y0:height,y1:height+.35,tag:'observation-floor'},
   {x0:x-hw,x1:x-hw+t,z0:z-hd,z1:z+hd,y0,y1,tag:'observation-glass'},
   {x0:x+hw-t,x1:x+hw,z0:z-hd,z1:z+hd,y0,y1,tag:'observation-glass'},
   {x0:x-hw,x1:x+hw,z0:z-hd,z1:z-hd+t,y0,y1,tag:'observation-glass'},
   {x0:x-hw,x1:x+hw,z0:z+hd-t,z1:z+hd,y0,y1,tag:'observation-glass'},
  );
 }
}
export function observationTower(buildings:readonly Building[]):Building|undefined{return buildings.find(b=>b.observation);}
export function onObservationDeck(b:Building|undefined,x:number,y:number,z:number):boolean {
 return !!b && x>b.x-b.w/2 && x<b.x+b.w/2 && z>b.z-b.d/2 && z<b.z+b.d/2 && y>=b.h-.2 && y<b.h+DECK_HEIGHT+1;
}
