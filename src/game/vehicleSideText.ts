import {checkChat} from './moderation';
/** Reject untrusted network/save data instead of truncating around a filter. */
export function validVehicleSideText(value: unknown): value is string {
  return typeof value==='string' && value.length<=48 && value===value.replace(/\s+/g,' ').trim() && !checkChat(value);
}
