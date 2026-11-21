import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateLayout} from '../src/game/worldgen';
import {ITEMS, KIOSK_TYPES, SHOP_ITEMS} from '../src/game/data';
const cat = JSON.parse(fs.readFileSync('server/business-catalogue.json','utf8'));
const L=generateLayout();
assert.equal(cat.schema,1);
assert.equal(new Set(cat.businesses.map((x:any)=>x.id)).size,cat.businesses.length);
assert.equal(cat.businesses.filter((x:any)=>x.kind==='kiosk').length,L.kiosks.length);
for (const k of L.kiosks) {
  const b=cat.businesses.find((x:any)=>x.id===`kiosk:${k.id}`);
  assert.equal(b.legacyPrice,KIOSK_TYPES[k.type].price);
  assert.deepEqual(Object.keys(b.items),KIOSK_TYPES[k.type].items);
  for (const [id, price] of Object.entries(b.items)) assert.equal(price,ITEMS[id].price);
}
for (const gas of L.buildings.filter(b=>b.kind==='gas' && b.enter && !b.removed)) {
  const rows=cat.businesses.filter((x:any)=>x.id===`building:${gas.id}`);
  assert.equal(rows.length,1); assert.deepEqual(rows[0].services,['fuel']);
  assert.deepEqual(Object.keys(rows[0].items),SHOP_ITEMS.gas);
  assert.equal(rows[0].legacyPrice,null); // Цена покупки АЗС ещё не определена.
}
for (const kind of ['cafe','dealer','service','supermarket']) assert(cat.businesses.some((x:any)=>x.kind===kind),kind);
console.log('✓ справочник: реальные ларьки и ассортимент, АЗС и магазин — один ID, услуги обозначены без выдуманных цен');
