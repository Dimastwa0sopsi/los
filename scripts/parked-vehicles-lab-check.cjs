'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {createAccountStore}=require('../server/account-store.cjs');
const {createParkedVehiclesLab}=require('../server/parked-vehicles-lab.cjs');
const {loadVehicleVisualCatalogue,parseVehicleVisualCatalogue}=require('../server/vehicle-visual-catalogue.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'los-parked-lab-')),file=path.join(dir,'game.db');let db;
 try{
  db=new Database(file);let accounts=createAccountStore(db);const catalog=loadVehicleVisualCatalogue();assert.equal(catalog.get('lada'),'sedan');assert.equal(catalog.get('titan'),'truck');
  for(const invalid of [null,{schema:2,vehicles:[]},{schema:1,vehicles:[{id:'lada',body:'sedan'},{id:'lada',body:'truck'}]},{schema:1,vehicles:[{id:'__proto__',body:'sedan'}]},{schema:1,vehicles:[{id:'x',body:'invalid'}]}])assert.throws(()=>parseVehicleVisualCatalogue(invalid),/invalid vehicle visual catalogue/);
  const car=(uid,type='lada')=>({uid,type,color:'#aabbcc',pos:{x:10,z:20,a:1},tuning:{plate:'А123ВС 77',plateFront:true,plateBack:false},trunk:{water:7},secret:'private'});
  for(const name of ['Alice','Bob'])assert((await accounts.register(name,'test-password-123')).ok);
  const alice={money:20000,inventory:{water:3},vehicles:[car('same'),{...car('sell'),pos:{x:11,z:20,a:1}}],listings:[{uid:'sell'}],privateMessage:'secret'};
  const bob={money:9000,vehicles:[car('same','titan')]};
  assert(accounts.save('Alice',alice,0).ok);assert(accounts.save('Bob',bob,0).ok);
  let lab=createParkedVehiclesLab(db,catalog),a=lab.project('alice'),b=lab.project('BOB');
  assert(a.ok&&b.ok&&a.complete&&b.complete);assert.equal(a.revision,1);assert.equal(a.vehicles.length,1);assert.equal(b.vehicles.length,1);assert.notEqual(a.vehicles[0].type,b.vehicles[0].type);
  assert.deepEqual(a.vehicles[0],{id:'same',type:'lada',color:'#aabbcc',x:10,y:null,z:20,a:1,text:''});assert.deepEqual(a.plates[0],{id:'same',number:'А123ВС 77',front:true,back:false});
  assert(!JSON.stringify(a).includes('secret'));assert(!JSON.stringify(a).includes('water'));assert.equal(lab.project('missing').error,'no_state');
  db.close();db=new Database(file);accounts=createAccountStore(db);lab=createParkedVehiclesLab(db,catalog);assert.deepEqual(lab.project('Alice'),a,'снимок после рестарта читается из сохранённого аккаунта');
  const changed={...alice,vehicles:[{...car('new'),pos:{x:30,y:7,z:40,a:0}}],listings:[]};assert(accounts.save('Alice',changed,1).ok);a=lab.project('Alice');assert.equal(a.revision,2);assert.equal(a.vehicles[0].id,'new');assert.equal(a.vehicles[0].x,30);assert.equal(a.vehicles[0].y,7);
  const invalid={...changed,vehicles:[car('duplicate'),car('duplicate'),{...car('bad'),sideText:'site.com'}, {...car('absent'),pos:null}, {...car('unknown'),type:'not_in_catalog'}]};assert(accounts.save('Alice',invalid,2).ok);a=lab.project('Alice');assert.equal(a.complete,false);assert.deepEqual(a.vehicles,[],'не показывать неоднозначные или некорректные записи');
  assert.deepEqual((await accounts.login('Alice','test-password-123')).state,invalid,'проекция не изменяет аккаунт');
  const many={...changed,vehicles:Array.from({length:14},(_,i)=>car('car'+i))};assert(accounts.save('Alice',many,3).ok);a=lab.project('Alice');assert.equal(a.complete,false);assert.equal(a.vehicles.length,12);
  assert.throws(()=>createParkedVehiclesLab(db,{}),/trusted vehicle catalogue/);
  console.log('✓ стенд постоянного транспорта: чтение аккаунтов, рестарт, изоляция, фильтрация и отсутствие изменений прогресса');
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
