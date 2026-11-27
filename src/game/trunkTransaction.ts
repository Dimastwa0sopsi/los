import {trunkMotionKind} from './trunkAnimation';
import {transferTrunk} from './trunk';
import type {GameState} from './state';
import {VEHICLES} from './data';

/** Pure preparation only: caller still must authorize the session, lock the
 * vehicle, persist both containers together, and handle save conflicts. */
export type PreparedTrunkTransfer = {ok:true;state:GameState} | {ok:false;error:'invalid'|'not_enough'|'full'|'overflow'|'vehicle'};
export function prepareOwnedTrunkTransfer(state:GameState,uid:string,id:string,count:number,direction:'put'|'take',allowed:ReadonlySet<string>):PreparedTrunkTransfer {
  if(!state || !Array.isArray(state.vehicles) || typeof uid!=='string')return {ok:false,error:'vehicle'};
  const matches=state.vehicles.filter(v=>v && v.uid===uid);
  if(matches.length!==1)return {ok:false,error:'vehicle'};
  const car=matches[0],spec=VEHICLES[car.type];
  if(!spec || !trunkMotionKind(spec.body,spec.variant))return {ok:false,error:'vehicle'};
  const result=transferTrunk(state.inventory,car.trunk ?? {},id,count,direction,allowed);
  if(!result.ok)return result;
  return {ok:true,state:{...state,inventory:result.inventory,vehicles:state.vehicles.map(v=>v===car?{...v,trunk:result.trunk}:v)}};
}
