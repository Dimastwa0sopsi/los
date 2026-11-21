// Аукционные идентификаторы из той же неизменной раскладки мира и автопарка.
// Только классификация имущества; не выдаёт права владения и не назначает цены.
import fs from 'node:fs';
import { generateLayout } from '../src/game/worldgen';
import { VEHICLES } from '../src/game/data';
const L=generateLayout();
const housing: Record<string, 'apartment'|'house'> = {};
for (const b of L.buildings) {
  if (!b.enter || b.removed) continue;
  if (b.kind === 'apartment') for (let i=0;i<4;i++) housing[`${b.id}:${i}`]='apartment';
  else if ((b.kind==='house' || b.kind==='vhouse') && b.forSale) housing[`${b.id}:0`]='house';
}
const manifest={schema:1,housing,kiosks:L.kiosks.map(k=>String(k.id)),vehicles:Object.keys(VEHICLES).sort()};
const text=JSON.stringify(manifest,null,2)+'\n', file='server/auction-catalogue.json';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file,'utf8')!==text) throw Error('Auction catalogue differs from world layout');
  console.log(`✓ каталог аукциона совпадает с миром: ${Object.keys(housing).length} квартир и домов, ${L.kiosks.length} ларьков`);
} else {fs.writeFileSync(file,text);console.log(`Сохранён каталог: ${file}`);}
