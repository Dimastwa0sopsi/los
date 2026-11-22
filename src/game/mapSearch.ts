import type { Building, BKind } from './worldgen';
import { availableInMode } from './auctionMode';
const aliases: Partial<Record<BKind, string>> = {
  service:'автосервис автомастерская механик ремонт тюнинг', cityhall:'мэрия администрация документы паспорт лицензия', vadmin:'администрация деревня',
  police:'полиция полицейский отдел гибдд номера', hospital:'больница врач госпиталь',
  pharmacy:'аптека лекарство аптечка', vpharmacy:'аптека лекарство аптечка',
  shop24:'магазин продукты супермаркет', supermarket:'магазин продукты супермаркет', vshop:'магазин сельмаг продукты',
  gas:'азс заправка бензин топливо магазин', dealer:'автосалон машины авто транспорт', market:'авторынок машины авто',
  cafe:'кафе еда ресторан', bar:'бар напитки кафе', bank:'банк', auction:'аукцион торги',
  clothes:'магазин одежда', barber:'парикмахерская прическа', fishshop:'рыболовный магазин рыбалка',
  gunshop:'оружейный магазин оружие', vguntruck:'оружейный магазин оружие',
  office:'офис работа бизнес центр', depot:'терминал дальнобойщик работа', factory:'завод работа',
};
const normalize = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function searchPlaces(buildings: Building[], query: string, origin: {x:number;z:number}, limit = 8, online = true) {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (!terms.length || query.length > 100) return [];
  return buildings.filter(b => !b.removed && availableInMode(b.kind, online) && b.enter && !!aliases[b.kind])
    .map(b => ({building:b, text:normalize(`${b.name} ${aliases[b.kind]}`), dist:Math.hypot(b.door.x-origin.x,b.door.z-origin.z)}))
    .filter(x => terms.every(t => x.text.includes(t)))
    .sort((a,b) => a.dist - b.dist || a.building.id - b.building.id)
    .slice(0,Math.max(0,Math.min(20,limit)));
}
