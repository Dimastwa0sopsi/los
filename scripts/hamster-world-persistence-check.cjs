'use strict';
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createHamsterWorld,PET_MS,RUN_MS,HIDE_MS}=require('../server/hamster-world.cjs');
const db=new Database(':memory:'),spot={x:10,z:5};
let world=createHamsterWorld(spot,db);
const result=world.pet(42,{x:9,z:5},1000);assert(result.ok);
const reload=createHamsterWorld(spot,db);assert.deepEqual(reload.snapshot(2000).event,result.world.event);
assert.equal(reload.pet(43,{x:10,z:5},2000).error,'busy');
assert(reload.snapshot(1000+PET_MS+RUN_MS+HIDE_MS-1).event);
assert.equal(reload.snapshot(1000+PET_MS+RUN_MS+HIDE_MS).event,null);
assert.equal(createHamsterWorld(spot,db).snapshot(200000).event,null);
// A failed database write must not start a ghost event in memory.
const broken={exec:()=>{},prepare:(sql)=>sql.startsWith('SELECT')?{get:()=>undefined}:{run:()=>{throw Error('disk full');}}};
world=createHamsterWorld(spot,broken);assert.throws(()=>world.pet(1,{x:10,z:5},1000),/disk full/);assert.equal(world.snapshot(1001).event,null);
db.prepare('UPDATE hamster_world SET event_json=? WHERE id=1').run('{');assert.throws(()=>createHamsterWorld(spot,db),/invalid persisted hamster state/);
db.close();console.log('✓ общий хомяк: сохранение, перезапуск, окончание срока и отказ записи');
