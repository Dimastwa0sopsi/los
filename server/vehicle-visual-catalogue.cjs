'use strict';
// This only classifies existing client models for cosmetic projections.
// It MUST NOT be used as a purchase, ownership, or authorization catalogue.
const fs=require('node:fs'),path=require('node:path');
const bodies=new Set(['sedan','hatch','suv','pickup','van','truck','semi','bus','sport','moto','quad','heli','combine','scooter']);
function parseVehicleVisualCatalogue(raw){
 if(!raw || typeof raw!=='object' || raw.schema!==1 || !Array.isArray(raw.vehicles) || raw.vehicles.length<1 || raw.vehicles.length>5000)throw Error('invalid vehicle visual catalogue');
 const catalog=new Map();
 for(const item of raw.vehicles){
  if(!item || typeof item.id!=='string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(item.id) || ['__proto__','constructor','prototype'].includes(item.id) || !bodies.has(item.body) || catalog.has(item.id))throw Error('invalid vehicle visual catalogue');
  catalog.set(item.id,item.body);
 }
 return catalog;
}
function loadVehicleVisualCatalogue(){return parseVehicleVisualCatalogue(JSON.parse(fs.readFileSync(path.join(__dirname,'vehicle-visual-catalogue.json'),'utf8')));}
module.exports={loadVehicleVisualCatalogue,parseVehicleVisualCatalogue};
