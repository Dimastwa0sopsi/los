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
 if(Object.prototype.hasOwnProperty.call(state,'pv')) {
   const seen=new Set();
   state.pv=Array.isArray(state.pv)?state.pv.slice(0,12).filter(row=>{
     if(!Array.isArray(row)||row.length!==8)return false;
     const [id,type,color,x,y,z,a,text]=row;
     if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||seen.has(id))return false;
     if(typeof type!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(type)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))return false;
     if(![x,y,z,a].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000)||!validText(text))return false;
     seen.add(id);return true;
   }):[];
 }
 if(Object.prototype.hasOwnProperty.call(state,'pp')) {
   const seen=new Set(), ids=new Set(Array.isArray(state.pv)?state.pv.map(row=>row[0]):[]);
   state.pp=Array.isArray(state.pp)?state.pp.slice(0,12).filter(row=>{
     if(!Array.isArray(row)||row.length!==4)return false;
     const [id,plate,front,back]=row;
     if(typeof id!=='string'||!ids.has(id)||seen.has(id))return false;
     if(typeof plate!=='string'||(plate!==''&&!/^[АВЕКМНОРСТУХABEKMHOPCTYX][0-9]{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2} [0-9]{2}$/u.test(plate)))return false;
     if((front!==0&&front!==1)||(back!==0&&back!==1))return false;
     seen.add(id);return true;
   }):[];
 }
 if(Object.prototype.hasOwnProperty.call(state,'tr')) {
   const seen=new Set();
   state.tr=Array.isArray(state.tr)?state.tr.slice(0,12).filter(row=>{
     if(!Array.isArray(row)||row.length!==9)return false;
     const [id,type,color,x,y,z,a,elapsed,text]=row;
     if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||seen.has(id))return false;
     if(typeof type!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(type)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))return false;
     if(![x,y,z,a].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000))return false;
     if(typeof elapsed!=='number'||!Number.isFinite(elapsed)||elapsed<0||elapsed>2.2||!validText(text))return false;
     seen.add(id);return true;
   }):[];
 }
 if(Object.prototype.hasOwnProperty.call(state,'th') && (typeof state.th!=='string' || !Array.isArray(state.tr) || !state.tr.some(row=>row[0]===state.th)))delete state.th;
 if(Object.prototype.hasOwnProperty.call(state,'camp')) {
   const p=state.camp;
   if(!p || typeof p!=='object' || Array.isArray(p) || ![p.x,p.y,p.z,p.a].every(n=>typeof n==='number'&&Number.isFinite(n)) || Math.abs(p.x)>4000 || Math.abs(p.z)>4000 || p.y< -5 || p.y>1000 || Math.abs(p.a)>100)state.camp=null;
   else state.camp={x:p.x,y:p.y,z:p.z,a:p.a};
 }
 if(state.fl!==1)delete state.fl;
 return '§LG'+JSON.stringify(state);
}
module.exports={cleanVehicleStateMessage};
