'use strict';
const {checkChat}=require('./moderation.cjs');
const validText = v => typeof v==='string' && v.length<=48 && v===v.replace(/\s+/g,' ').trim() && !checkChat(v);
/** Cosmetic relay validation, not an ownership or account-save authority. */
function cleanVehicleStateMessage(raw){
 if(typeof raw!=='string'||!raw.startsWith('§LG{'))return raw;
 let state;try{state=JSON.parse(raw.slice(3));}catch{return raw;}
 if(!state||typeof state!=='object'||Array.isArray(state))return raw;
 if(Object.prototype.hasOwnProperty.call(state,'vt') && !validText(state.vt))delete state.vt;
 if(Object.prototype.hasOwnProperty.call(state,'vp')) {
   const seen=new Set();
   state.vp=Array.isArray(state.vp)?state.vp.slice(0,12).filter(row=>{
     if(!Array.isArray(row)||row.length!==8)return false;
     const [id,type,color,x,y,z,a,text]=row;
     if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||seen.has(id))return false;
     if(typeof type!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(type)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))return false;
     if(![x,y,z,a].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000)||!validText(text)||!text)return false;
     seen.add(id);return true;
   }):[];
 }
 return '§LG'+JSON.stringify(state);
}
module.exports={cleanVehicleStateMessage};
