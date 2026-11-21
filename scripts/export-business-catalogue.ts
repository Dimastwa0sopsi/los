// Экспорт стабильных идентификаторов объектов из той же раскладки, что и клиент.
// Это справочник для аудита, а не разрешение на покупку или доверенная цена.
import fs from 'node:fs';
import { generateLayout, type BKind } from '../src/game/worldgen';
import { KIOSK_TYPES, ITEMS, SHOP_ITEMS, type ShopKind } from '../src/game/data';

const shopFor: Partial<Record<BKind, ShopKind>> = {
  shop24:'shop24', supermarket:'supermarket', cafe:'cafe', pharmacy:'pharmacy',
  vpharmacy:'pharmacy', gunshop:'gunshop', vguntruck:'gunshop', vshop:'vshop', gas:'gas', fishshop:'fishshop',
};
// Идентификатор АЗС общий для колонки и магазина. Прочие услуги обозначены,
// но их цены, условия и логика отпуска пока не перенесены на сервер.
const serviceKinds = new Set<BKind>(['dealer','market','service','clothes','barber','bar','scootershop']);
const L = generateLayout();
const items = (ids: string[]) => Object.fromEntries(ids.map(id => {
  const def = ITEMS[id]; if (!def || !Number.isSafeInteger(def.price) || def.price <= 0) throw Error(`Bad item ${id}`);
  return [id, def.price];
}));
const businesses = [
  ...L.kiosks.map(k => ({ id:`kiosk:${k.id}`, kind:'kiosk', name:KIOSK_TYPES[k.type].name,
    x:k.x, z:k.z, legacyPrice:KIOSK_TYPES[k.type].price, legacyIncome:KIOSK_TYPES[k.type].income,
    items:items(KIOSK_TYPES[k.type].items), services:[] as string[] })),
  ...L.buildings.filter(b => !b.removed && b.enter && (shopFor[b.kind] || serviceKinds.has(b.kind))).map(b => ({
    id:`building:${b.id}`, kind:b.kind, name:b.name, x:b.door.x, z:b.door.z,
    legacyPrice:null, legacyIncome:null, items:items(shopFor[b.kind] ? SHOP_ITEMS[shopFor[b.kind]!] : []),
    services:b.kind === 'gas' ? ['fuel'] : serviceKinds.has(b.kind) ? [b.kind] : [],
  })),
];
const manifest = {schema:1, note:'Experimental audit catalogue; not a purchase catalogue. Gas fuel and shop share one ID.', businesses};
const text = JSON.stringify(manifest,null,2)+'\n';
const file = 'server/business-catalogue.json';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== text) throw Error('business-catalogue.json is stale; regenerate and review world ID changes before migration');
  console.log(`✓ каталог соответствует раскладке: ${businesses.length} объектов`);
} else { fs.writeFileSync(file,text); console.log(`Экспортировано ${businesses.length} объектов в ${file}`); }
