/** Custody state machine used by solo play; NOT authoritative online.
 * Online callers must authenticate actors, verify the actual police vehicle/route,
 * persist each transition and supply trusted server time before online use. */
export const JAIL_SENTENCE_MS = 60_000;
export type CustodyState =
  | {phase:'free'}
  | {phase:'transport'; custodyId:string; stationId:number; startedAt:number}
  | {phase:'jailed'; custodyId:string; stationId:number; arrivedAt:number; releaseAt:number};
export type CustodyEvent =
  | {type:'arrest'; custodyId:string; stationId:number; wanted:number; policePresent:boolean; stopped:boolean; now:number}
  | {type:'arrive'; custodyId:string; stationId:number; now:number}
  | {type:'release'; custodyId:string; now:number};
type Result = {ok:true;state:CustodyState} | {ok:false;error:string};
const validTime=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER-JAIL_SENTENCE_MS;
const validId=(id:string)=>typeof id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(id);
const validStation=(id:number)=>Number.isSafeInteger(id)&&id>=0;
/** Reject broken persisted state instead of releasing or inventing a sentence. */
export function validCustodyState(value:unknown): value is CustodyState {
 if(!value || typeof value!=='object' || Array.isArray(value))return false;
 const s=value as Record<string,unknown>;
 if(s.phase==='free')return Object.keys(s).sort().join(',')==='phase';
 if(!validId(s.custodyId as string)||!validStation(s.stationId as number))return false;
 if(s.phase==='transport')return Object.keys(s).sort().join(',')==='custodyId,phase,startedAt,stationId' && validTime(s.startedAt as number);
 if(s.phase==='jailed')return Object.keys(s).sort().join(',')==='arrivedAt,custodyId,phase,releaseAt,stationId' && validTime(s.arrivedAt as number) && s.releaseAt===(s.arrivedAt as number)+JAIL_SENTENCE_MS;
 return false;
}
/** Pure decision only: do not treat this function as authorization. */
export function stepCustody(state:CustodyState,event:CustodyEvent):Result {
 if(!validCustodyState(state)) return {ok:false,error:'invalid_state'};
 if(!event || !['arrest','arrive','release'].includes(event.type)) return {ok:false,error:'invalid_event'};
 if(!validTime(event.now)) return {ok:false,error:'invalid_time'};
 if(!validId(event.custodyId)) return {ok:false,error:'invalid_id'};
 if(event.type==='arrest') {
  if(state.phase!=='free') return {ok:false,error:'already_detained'};
  if(!validStation(event.stationId)||!Number.isInteger(event.wanted)||event.wanted!==3) return {ok:false,error:'not_eligible'};
  if(event.policePresent!==true||event.stopped!==true) return {ok:false,error:'not_captured'};
  return {ok:true,state:{phase:'transport',custodyId:event.custodyId,stationId:event.stationId,startedAt:event.now}};
 }
 if(state.phase==='free' || state.custodyId!==event.custodyId) return {ok:false,error:'unexpected_custody'};
 if(event.type==='arrive') {
  if(state.phase!=='transport') return {ok:false,error:'already_arrived'};
  if(event.stationId!==state.stationId) return {ok:false,error:'wrong_station'};
  if(event.now<state.startedAt) return {ok:false,error:'clock_reversed'};
  return {ok:true,state:{phase:'jailed',custodyId:state.custodyId,stationId:state.stationId,arrivedAt:event.now,releaseAt:event.now+JAIL_SENTENCE_MS}};
 }
 if(state.phase!=='jailed') return {ok:false,error:'not_in_jail'};
 if(event.now<state.arrivedAt) return {ok:false,error:'clock_reversed'};
 if(event.now<state.releaseAt) return {ok:false,error:'sentence_active'};
 return {ok:true,state:{phase:'free'}};
}
