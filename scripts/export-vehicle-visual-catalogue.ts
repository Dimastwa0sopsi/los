// Generated from the game catalogue. Cosmetic model classification only;
// it does not establish ownership, approve purchases, or grant access to cargo.
import fs from 'node:fs';
import {VEHICLES} from '../src/game/data';
const vehicles=Object.entries(VEHICLES).sort(([a],[b])=>a.localeCompare(b,'en')).map(([id,spec])=>{
 if(spec.id!==id || !/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !spec.body)throw Error(`Invalid vehicle ${id}`);
 return {id,body:spec.body};
});
const text=JSON.stringify({schema:1,vehicles},null,2)+'\n';
const file='server/vehicle-visual-catalogue.json';
if(process.argv.includes('--check')){
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)throw Error('vehicle-visual-catalogue.json differs from game catalogue; regenerate and review');
 console.log(`✓ визуальный каталог соответствует игре: ${vehicles.length} моделей`);
}else {fs.writeFileSync(file,text);console.log(`Создан ${file}: ${vehicles.length} моделей`);}
