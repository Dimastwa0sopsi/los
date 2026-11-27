import {VEHICLES,normalizePlate} from './data';
import {validVehicleSideText} from './vehicleSideText';
/** Visual snapshots only: never used as an ownership registry or for trades. */
export type ParkedVehicleVisual=[string,string,string,number,number,number,number,string];
export const MAX_PARKED_VEHICLES=12;
export function parseParkedVehicles(raw:unknown):ParkedVehicleVisual[]{
 if(!Array.isArray(raw))return [];
 const result:ParkedVehicleVisual[]=[],seen=new Set<string>();
 for(const row of raw.slice(0,MAX_PARKED_VEHICLES)){
  if(!Array.isArray(row)||row.length!==8)continue;
  const [id,type,color,x,y,z,a,text]=row;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||seen.has(id))continue;
  if(typeof type!=='string'||!Object.prototype.hasOwnProperty.call(VEHICLES,type))continue;
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))continue;
  if(![x,y,z,a].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000))continue;
  if(typeof text!=='string'||(text!==''&&(!['bus','truck','semi'].includes(VEHICLES[type].body)||!validVehicleSideText(text))))continue;
  seen.add(id);result.push([id,type,color,x,y,z,a,text]);
 }
 return result;
}
/** Cosmetic plate and independent attachment flags; not a legal plate registry. */
export type ParkedVehiclePlate=[string,string,0|1,0|1];
export function parseParkedPlates(raw:unknown):ParkedVehiclePlate[]{
 if(!Array.isArray(raw))return [];
 const out:ParkedVehiclePlate[]=[],seen=new Set<string>();
 for(const row of raw.slice(0,MAX_PARKED_VEHICLES)){
  if(!Array.isArray(row)||row.length!==4)continue;
  const [id,number,front,back]=row;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||seen.has(id))continue;
  if(typeof number!=='string'||(number!==''&&normalizePlate(number)!==number))continue;
  if((front!==0&&front!==1)||(back!==0&&back!==1))continue;
  seen.add(id);out.push([id,number,front,back]);
 }
 return out;
}
