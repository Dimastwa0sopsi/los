// Server-side merchandise metadata, derived from the exact game catalogue.
// Not an access-control list or a permission to trade online.
import fs from 'node:fs';
import {ITEMS,WEAPONS} from '../src/game/data';
const source=JSON.parse(fs.readFileSync('server/business-catalogue.json','utf8'));
const shops:Record<string,string[]>={}; const ids=new Set<string>();
for(const b of source.businesses){
  const keys=Object.keys(b.items);if(!keys.length)continue;
  shops[b.id]=keys; for(const id of keys) ids.add(id);
}
const items:Record<string,{price:number;weapon:boolean;firearm:boolean;ammo:number;ammoType:string|null}>={};
for(const id of [...ids].sort()){
  const it=ITEMS[id]; if(!it || !Number.isSafeInteger(it.price) || it.price<=0)throw Error('Invalid item '+id);
  const w=it.weapon ? WEAPONS[it.weapon] : null;
  if(it.weapon && !w) throw Error('Unknown weapon '+id);
  items[id]={price:it.price,weapon:!!w,firearm:!!w && !w.melee,ammo:it.ammo ?? 0,ammoType:it.ammo ? it.ammoType ?? 'p' : null};
}
const out=JSON.stringify({schema:1,shops,items},null,2)+'\n',path='server/shop-catalogue.json';
if(process.argv.includes('--check')){
 if(!fs.existsSync(path) || fs.readFileSync(path,'utf8')!==out)throw Error('Shop catalogue does not match game data');
 console.log(`✓ ассортимент сервера совпадает с игрой: ${Object.keys(shops).length} магазинов, ${ids.size} предметов`);
}else{fs.writeFileSync(path,out);console.log('Создан каталог товаров:',path);}
