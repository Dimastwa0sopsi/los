'use strict';
/* Read-only cosmetic projection. The network adapter must authenticate
 * requests, determine online/offline ownership, and limit broadcasts.
 * A visual projection is not proof of ownership and cannot authorize actions.
 * The current account_save trusts clients: these coordinates remain untrusted. */
const {normalizeLogin}=require('./account-store.cjs');
const {checkChat}=require('./moderation.cjs');
const MAX=12;
const badIds=new Set(['__proto__','constructor','prototype']);
const validId=id=>typeof id==='string' && /^[a-zA-Z0-9_-]{1,48}$/.test(id) && !badIds.has(id);
const validText=v=>typeof v==='string' && v.length<=48 && v===v.replace(/\s+/g,' ').trim() && !checkChat(v);
const validPlate=v=>v==='' || (typeof v==='string' && /^[АВЕКМНОРСТУХABEKMHOPCTYX][0-9]{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2} [0-9]{2}$/u.test(v));
function createParkedVehiclesLab(db,catalog){
 if(!(catalog instanceof Map))throw Error('trusted vehicle catalogue required');
 const read=db.prepare('SELECT revision,state_json FROM accounts WHERE login_key=?');
 function project(name){
  const key=normalizeLogin(name);if(!key)return {ok:false,error:'invalid'};
  const account=read.get(key);if(!account || !account.state_json)return {ok:false,error:'no_state'};
  let state;try{state=JSON.parse(account.state_json);}catch{return {ok:false,error:'invalid_state'};}
  if(!state || typeof state!=='object' || Array.isArray(state) || !Array.isArray(state.vehicles) || (state.listings!==undefined && !Array.isArray(state.listings)))return {ok:false,error:'invalid_state'};
  const listed=new Set((state.listings || []).filter(x=>x && validId(x.uid)).map(x=>x.uid));
  const counts=new Map();for(const car of state.vehicles)if(car && validId(car.uid))counts.set(car.uid,(counts.get(car.uid)||0)+1);
  const vehicles=[],plates=[];let complete=true;
  for(const car of state.vehicles){
   if(!car || typeof car!=='object' || Array.isArray(car) || !validId(car.uid) || counts.get(car.uid)!==1){complete=false;continue;}
   if(listed.has(car.uid) || car.pos===null || car.pos===undefined)continue;
   const body=typeof car.type==='string'?catalog.get(car.type):undefined;
   if(typeof body!=='string' || !car.pos || typeof car.pos!=='object' || Array.isArray(car.pos) || ![car.pos.x,car.pos.z,car.pos.a].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000) || (car.pos.y!==undefined && (typeof car.pos.y!=='number'||!Number.isFinite(car.pos.y)||car.pos.y< -100||car.pos.y>1000))){complete=false;continue;}
   const tuning=car.tuning && typeof car.tuning==='object' && !Array.isArray(car.tuning)?car.tuning:{};
   const color=tuning.paint ?? car.color;
   if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)){complete=false;continue;}
   const text=car.sideText ?? '';
   if(!validText(text) || (text && !['bus','truck','semi'].includes(body))){complete=false;continue;}
   const plate=tuning.plate ?? '';
   if(!validPlate(plate) || (tuning.plateFront!==undefined && typeof tuning.plateFront!=='boolean') || (tuning.plateBack!==undefined && typeof tuning.plateBack!=='boolean')){complete=false;continue;}
   if(vehicles.length>=MAX){complete=false;continue;}
   // Newer snapshots carry height; null marks a legacy snapshot whose height
   // cannot be known reliably for stacked roads or bridges. Still untrusted.
   vehicles.push({id:car.uid,type:car.type,color,x:car.pos.x,y:car.pos.y ?? null,z:car.pos.z,a:car.pos.a,text});
   plates.push({id:car.uid,number:plate,front:tuning.plateFront!==false,back:tuning.plateBack!==false});
  }
  return {ok:true,revision:account.revision,complete,vehicles,plates};
 }
 return {project};
}
module.exports={createParkedVehiclesLab,MAX_PARKED_VEHICLES:MAX};
