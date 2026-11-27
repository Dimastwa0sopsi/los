import {VEHICLES} from './data';
import {validVehicleSideText} from './vehicleSideText';

// Cosmetic snapshots only: never use these as proof of ownership or for transactions.
export type ParkedInscribedVehicle = [string, string, string, number, number, number, number, string];
export const MAX_PARKED_INSCRIBED = 12;
export function parseParkedInscribed(value: unknown): ParkedInscribedVehicle[] {
  if (!Array.isArray(value)) return [];
  const result: ParkedInscribedVehicle[] = [], seen = new Set<string>();
  for (const item of value.slice(0, MAX_PARKED_INSCRIBED)) {
    if (!Array.isArray(item) || item.length !== 8) continue;
    const [id,type,color,x,y,z,a,text] = item;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(id) || seen.has(id)) continue;
    if (typeof type !== 'string' || !VEHICLES[type] || !['bus','truck','semi'].includes(VEHICLES[type].body)) continue;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) continue;
    if (![x,y,z,a].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 20000)) continue;
    if (!validVehicleSideText(text) || !text) continue;
    seen.add(id); result.push([id,type,color,x,y,z,a,text]);
  }
  return result;
}
