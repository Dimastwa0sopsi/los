'use strict';
// Cosmetic, bounded, read-only projection from acknowledged account saves.
// This is not an ownership registry, inventory access or an anti-cheat system.
const {normalizeLogin}=require('./account-store.cjs');
const {createParkedVehiclesLab}=require('./parked-vehicles-lab.cjs');
const {loadVehicleVisualCatalogue}=require('./vehicle-visual-catalogue.cjs');
const MAX_OWNERS=250, MAX_VISIBLE=48, RADIUS=220;
function createOfflineVehicles(db){
 const projector=createParkedVehiclesLab(db,loadVehicleVisualCatalogue());
 const lookup=db.prepare('SELECT id,name FROM players WHERE name=?');
 const initial=db.prepare('SELECT a.display_name FROM accounts a JOIN players p ON p.name=a.display_name WHERE a.state_json IS NOT NULL ORDER BY p.updated_at DESC LIMIT ?');
 const cache=new Map();
 function refresh(name){
  const key=normalizeLogin(name);if(!key)return;
  // Never keep an outdated copy if reading the latest save fails.
  cache.delete(key);
  const player=lookup.get(name);if(!player)return;
  const result=projector.project(name);
  // Dropping an invalid visual record never modifies the account itself.
  if(!result.ok || !result.vehicles.length)return;
  cache.set(key,{owner:player.id,vehicles:result.vehicles,plates:result.plates});
  while(cache.size>MAX_OWNERS)cache.delete(cache.keys().next().value);
 }
 function load(){for(const row of initial.all(MAX_OWNERS))refresh(row.display_name);}
 function nearby(x,z,active){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!(active instanceof Set))return [];
  const candidates=[];
  for(const owner of cache.values()){
   if(active.has(owner.owner))continue;
   const plates=new Map(owner.plates.map(p=>[p.id,p]));
   for(const v of owner.vehicles){const dist=Math.hypot(v.x-x,v.z-z);if(dist<=RADIUS)candidates.push({owner:owner.owner,v,p:plates.get(v.id),dist});}
  }
  candidates.sort((a,b)=>a.dist-b.dist || a.owner-b.owner || a.v.id.localeCompare(b.v.id));
  const owners=new Map();
  for(const {owner,v,p} of candidates.slice(0,MAX_VISIBLE)){
   let group=owners.get(owner);if(!group){group={owner,vehicles:[],plates:[]};owners.set(owner,group);}
   group.vehicles.push([v.id,v.type,v.color,v.x,v.y,v.z,v.a,v.text]);
   if(p)group.plates.push([p.id,p.number,p.front?1:0,p.back?1:0]);
  }
  return [...owners.values()];
 }
 return {load,refresh,nearby,drop:name=>cache.delete(normalizeLogin(name))};
}
module.exports={createOfflineVehicles,MAX_OWNERS,MAX_VISIBLE,RADIUS};
