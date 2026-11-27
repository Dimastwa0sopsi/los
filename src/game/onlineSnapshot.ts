import {SAVE_VERSION} from './config';
import {VEHICLES} from './data';

/** Conservative preflight: never replace a malformed remote account with defaults.
 * This checks shape only, not economic authenticity or every nested field. */
export function usableOnlineSnapshot(value:unknown):boolean {
 if(!value || typeof value!=='object' || Array.isArray(value))return false;
 const s=value as Record<string,unknown>;
 const obj=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
 if(!obj(s.look) || !obj(s.inventory) || !obj(s.pos) || !Array.isArray(s.vehicles) || !Array.isArray(s.properties) || !Array.isArray(s.kiosks))return false;
 // migrate() drops unknown car types and rewrites the version; refuse to load
 // rather than silently overwrite a newer or incompatible online account.
 if(s.version!==undefined && (!Number.isSafeInteger(s.version) || (s.version as number)<0 || (s.version as number)>SAVE_VERSION))return false;
 if(s.vehicles.some(v=>!obj(v) || typeof v.type!=='string' || !Object.prototype.hasOwnProperty.call(VEHICLES,v.type)))return false;
 return typeof s.money==='number' && Number.isFinite(s.money) && s.money>=0 &&
  typeof s.pos.x==='number' && Number.isFinite(s.pos.x) && typeof s.pos.z==='number' && Number.isFinite(s.pos.z) && typeof s.pos.a==='number' && Number.isFinite(s.pos.a);
}
