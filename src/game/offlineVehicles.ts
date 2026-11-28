import {parseParkedVehicles,parseParkedPlates,type ParkedVehicleVisual,type ParkedVehiclePlate} from './parkedVehicleVisual';
export type OfflineVehicleGroup={owner:number;vehicles:ParkedVehicleVisual[];plates:ParkedVehiclePlate[]};
/** The server result is cosmetic and untrusted; it never authorizes interaction. */
export function parseOfflineVehicles(raw:unknown,ground:(x:number,z:number)=>number):OfflineVehicleGroup[]{
 if(!Array.isArray(raw)||raw.length>48)return [];
 const groups:OfflineVehicleGroup[]=[],seen=new Set<number>();let total=0;
 for(const entry of raw){
  if(!entry || typeof entry!=='object' || !Number.isSafeInteger(entry.owner) || entry.owner<1 || seen.has(entry.owner) || !Array.isArray(entry.vehicles) || entry.vehicles.length>12)continue;
  const rows:unknown[]=[];
  for(const item of entry.vehicles){
   if(!Array.isArray(item)||item.length!==8)continue;
   let y=item[4];
   if(y===null){if(typeof item[3]!=='number'||!Number.isFinite(item[3])||typeof item[5]!=='number'||!Number.isFinite(item[5]))continue;y=ground(item[3],item[5]);}
   if(typeof y!=='number'||!Number.isFinite(y)||y< -100||y>1000)continue;
   rows.push([item[0],item[1],item[2],item[3],y,item[5],item[6],item[7]]);
  }
  const vehicles=parseParkedVehicles(rows);total+=vehicles.length;if(total>48)return [];
  const ids=new Set(vehicles.map(v=>v[0])),plates=parseParkedPlates(entry.plates).filter(p=>ids.has(p[0]));
  seen.add(entry.owner);if(vehicles.length)groups.push({owner:entry.owner,vehicles,plates});
 }
 return groups;
}
