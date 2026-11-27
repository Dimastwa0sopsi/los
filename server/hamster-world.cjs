'use strict';
// Visual shared state only. Client-reported movement is not authoritative;
// this module MUST NOT grant money or other economic rewards.
const PET_MS=900, RUN_MS=1400, HIDE_MS=120000, REACH=1.6;
function validEvent(e){
 return e===null || !!e && typeof e==='object' && !Array.isArray(e) &&
  Number.isSafeInteger(e.petter) && e.petter>0 && Number.isSafeInteger(e.start) && e.start>=0 &&
  Number.isSafeInteger(e.returnAt) && e.returnAt===e.start+PET_MS+RUN_MS+HIDE_MS &&
  Number.isFinite(e.dx) && Number.isFinite(e.dz) && Math.abs(Math.hypot(e.dx,e.dz)-1)<0.001;
}
/** db is optional for isolated tests. The live server uses a single SQLite writer. */
function createHamsterWorld(point,db){
 if(!point || !Number.isFinite(point.x) || !Number.isFinite(point.z))throw Error('invalid hamster point');
 const origin={x:point.x,z:point.z};let seq=1,event=null,write=null;
 if(db){
  db.exec('CREATE TABLE IF NOT EXISTS hamster_world (id INTEGER PRIMARY KEY CHECK(id=1), seq INTEGER NOT NULL, event_json TEXT NOT NULL)');
  const row=db.prepare('SELECT seq,event_json FROM hamster_world WHERE id=1').get();
  write=db.prepare('INSERT INTO hamster_world (id,seq,event_json) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET seq=excluded.seq,event_json=excluded.event_json');
  if(row){
   let decoded;try{decoded=JSON.parse(row.event_json);}catch{throw Error('invalid persisted hamster state');}
   if(!Number.isSafeInteger(row.seq)||row.seq<1||!validEvent(decoded))throw Error('invalid persisted hamster state');
   seq=row.seq;event=decoded;
  }
 }
 // Persist before publishing the new state: a write failure cannot create a
 // cosmetic event that vanishes on restart while clients believe it succeeded.
 function commit(nextSeq,nextEvent){
  if(!Number.isSafeInteger(nextSeq))throw Error('hamster sequence exhausted');
  if(write)write.run(nextSeq,JSON.stringify(nextEvent));
  seq=nextSeq;event=nextEvent;
 }
 function snapshot(now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw Error('invalid time');
  if(event && now>=event.returnAt)commit(seq+1,null);
  return {version:1,seq,x:origin.x,z:origin.z,serverTime:now,event:event?{...event}:null};
 }
 function pet(id,position,now=Date.now()){
  if(!Number.isSafeInteger(id)||id<1||!position||!Number.isFinite(position.x)||!Number.isFinite(position.z)||!Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-PET_MS-RUN_MS-HIDE_MS)return {ok:false,error:'invalid'};
  snapshot(now);if(event)return {ok:false,error:'busy'};
  const dx=origin.x-position.x,dz=origin.z-position.z,d=Math.hypot(dx,dz);
  if(d>REACH)return {ok:false,error:'too_far'};
  const next={petter:id,start:now,returnAt:now+PET_MS+RUN_MS+HIDE_MS,dx:d>1e-8?dx/d:1,dz:d>1e-8?dz/d:0};
  commit(seq+1,next);
  return {ok:true,world:snapshot(now)};
 }
 return {snapshot,pet};
}
module.exports={createHamsterWorld,PET_MS,RUN_MS,HIDE_MS,REACH};
