'use strict';
// Session-only experiment; safe points and player positions must come from the
// server, not a client. This is not a live protocol or persistent world state.
const PET_MS=900, RUN_MS=1400, HIDE_MS=120000, REACH=1.6;
function createHamsterWorldLab(points){
 if(!Array.isArray(points)||!points.length||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)))throw Error('validated server spawn points required');
 const spots=points.map(p=>({x:p.x,z:p.z}));let index=0,seq=1,event=null;
 function update(now){
  if(event&&now>=event.returnAt){index=(index+1)%spots.length;event=null;seq++;}
 }
 function snapshot(now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw Error('invalid server time');update(now);
  const origin=spots[index];
  if(!event)return {seq,phase:'idle',x:origin.x,z:origin.z,serverTime:now};
  let phase='pet',x=origin.x,z=origin.z;
  if(now>=event.start+PET_MS){const p=Math.min(1,(now-event.start-PET_MS)/RUN_MS);x+=event.dx*p*2;z+=event.dz*p*2;phase=p<1?'running':'hidden';}
  return {seq,phase,x,z,petter:event.petter,start:event.start,returnAt:event.returnAt,serverTime:now};
 }
 function pet(petter,position,now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-PET_MS-RUN_MS-HIDE_MS||typeof petter!=='string'||!petter.trim()||petter.length>80||!position||!Number.isFinite(position.x)||!Number.isFinite(position.z))return {ok:false,error:'invalid'};
  update(now);if(event)return {ok:false,error:'busy'};
  const origin=spots[index],dx=origin.x-position.x,dz=origin.z-position.z,d=Math.hypot(dx,dz);
  if(d>REACH)return {ok:false,error:'too_far'};
  event={petter,start:now,returnAt:now+PET_MS+RUN_MS+HIDE_MS,dx:d>0?dx/d:1,dz:d>0?dz/d:0};seq++;
  return {ok:true,world:snapshot(now)};
 }
 return {snapshot,pet};
}
module.exports={createHamsterWorldLab,PET_MS,RUN_MS,HIDE_MS,REACH};
