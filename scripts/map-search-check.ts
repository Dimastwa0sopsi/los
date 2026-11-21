import { generateLayout } from '../src/game/worldgen';
import { searchPlaces } from '../src/game/mapSearch';
const L=generateLayout(), p={x:510,z:500};
const assert=(v:unknown,m:string)=>{if(!v) throw Error(m);};
for (const [query, kind] of [['автосервис','service'],['мэрия','cityhall'],['АПТЕКА','pharmacy'],['аукцион','auction'],['азс','gas']] as const) {
 const rows=searchPlaces(L.buildings,query,p,20); assert(rows.some(r=>r.building.kind===kind),query);
 assert(rows.every((v,i)=>i===0 || rows[i-1].dist<=v.dist), 'порядок по расстоянию');
}
assert(searchPlaces(L.buildings,'несуществующее место',p).length===0,'пустой результат');
assert(searchPlaces(L.buildings,'  ',p).length===0,'пустой запрос');
console.log('✓ поиск карты: категории, мэрия/ё, расстояние, отсутствующие места');
