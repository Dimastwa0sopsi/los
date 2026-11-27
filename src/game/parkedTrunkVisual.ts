import {VEHICLES} from './data';
import {TRUNK_OPEN_SECONDS,trunkMotionKind,trunkMotionPose} from './trunkAnimation';
import {validVehicleSideText} from './vehicleSideText';
// Untrusted cosmetic snapshots, not a vehicle registry or an inventory proof.
export type ParkedTrunkVisual=[string,string,string,number,number,number,number,number,string];
export const MAX_PARKED_TRUNKS=12;
export function parseParkedTrunks(value:unknown):ParkedTrunkVisual[]{
 if(!Array.isArray(value))return [];
 const out:ParkedTrunkVisual[]=[],seen=new Set<string>();
 for(const item of value.slice(0,MAX_PARKED_TRUNKS)){
  if(!Array.isArray(item)||item.length!==9)continue;
  const [id,type,color,x,y,z,a,elapsed,text]=item;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||seen.has(id))continue;
  if(typeof type!=='string'||!Object.prototype.hasOwnProperty.call(VEHICLES,type))continue;
  const spec=VEHICLES[type],kind=trunkMotionKind(spec.body,spec.variant);if(!kind)continue;
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))continue;
  if(![x,y,z,a].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20000))continue;
  if(typeof elapsed!=='number'||!Number.isFinite(elapsed)||elapsed<0||elapsed>TRUNK_OPEN_SECONDS[kind])continue;
  if(typeof text!=='string'||(text!==''&&(!['bus','truck','semi'].includes(spec.body)||!validVehicleSideText(text))))continue;
  seen.add(id);out.push([id,type,color,x,y,z,a,elapsed,text]);
 }
 return out;
}
/** A short-lived, cosmetic hand pose derived from a matching validated car. */
export function remoteTrunkHandReach(raw:unknown,id:unknown,ageMs:number,x:number,z:number,interior:string,pose:string):number|null {
 if(typeof id!=='string'||!Number.isFinite(ageMs)||ageMs<0||ageMs>400||!Number.isFinite(x)||!Number.isFinite(z)||interior||['swim','tread','fall','knock'].includes(pose))return null;
 const row=parseParkedTrunks(raw).find(v=>v[0]===id);if(!row)return null;
 const spec=VEHICLES[row[1]],kind=trunkMotionKind(spec.body,spec.variant);if(!kind)return null;
 const rearX=row[3]-Math.sin(row[6])*spec.len/2,rearZ=row[5]-Math.cos(row[6])*spec.len/2;
 if(Math.hypot(x-rearX,z-rearZ)>3.5)return null;
 const elapsed=row[7]+ageMs/1000;
 if(elapsed>=TRUNK_OPEN_SECONDS[kind])return null;
 return trunkMotionPose(kind,elapsed).armReach;
}
