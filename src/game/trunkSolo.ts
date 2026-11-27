import {SAVE_KEY} from './config';
import {prepareOwnedTrunkTransfer} from './trunkTransaction';
import type {GameState} from './state';

/** Single-player persistence. The caller verifies proximity, ownership,
 * open lid and eligible items; online accounts must not use this operation. */
export function transferTrunkSolo(state:GameState,uid:string,id:string,count:number,direction:'put'|'take',allowed:ReadonlySet<string>,storage:Pick<Storage,'setItem'>) {
  const prepared=prepareOwnedTrunkTransfer(state,uid,id,count,direction,allowed);
  if(!prepared.ok)return prepared;
  try {storage.setItem(SAVE_KEY,JSON.stringify(prepared.state));} catch {return {ok:false as const,error:'storage' as const};}
  // Preserve the existing owned-vehicle objects referenced by live Vehicle instances.
  const saved=prepared.state.vehicles.find(v=>v.uid===uid),live=state.vehicles.find(v=>v.uid===uid);
  if(!saved || !live)throw Error('invalid prepared transfer');
  state.inventory=prepared.state.inventory;live.trunk=saved.trunk;
  return {ok:true as const};
}
