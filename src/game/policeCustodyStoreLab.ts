import {stepCustody, validCustodyState, type CustodyState, type CustodyEvent} from './policeCustodyLab';

/** Experimental single-writer storage adapter, not wired into the game or suitable for online authority. */
export interface CustodyStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
export type CustodyRead = {ok:true;state:CustodyState} | {ok:false;error:'read_failed'|'invalid_record'};
export type CustodyWrite = {ok:true;state:CustodyState} | {ok:false;error:string};

export function readCustody(storage:CustodyStorage,key:string):CustodyRead {
 let raw:string|null;
 try { raw=storage.getItem(key); } catch { return {ok:false,error:'read_failed'}; }
 if(raw===null)return {ok:true,state:{phase:'free'}};
 try {
  const record:unknown=JSON.parse(raw);
  if(!record || typeof record!=='object' || Array.isArray(record))return {ok:false,error:'invalid_record'};
  const obj=record as Record<string,unknown>;
  if(Object.keys(obj).sort().join(',')!=='state,version' || obj.version!==1 || !validCustodyState(obj.state))return {ok:false,error:'invalid_record'};
  return {ok:true,state:obj.state};
 } catch { return {ok:false,error:'invalid_record'}; }
}

/** Read and persist before reporting success. Never infer freedom from malformed data or storage errors. */
export function transitionCustody(storage:CustodyStorage,key:string,event:CustodyEvent):CustodyWrite {
 const current=readCustody(storage,key); if(!current.ok)return current;
 const next=stepCustody(current.state,event); if(!next.ok)return next;
 try { storage.setItem(key,JSON.stringify({version:1,state:next.state})); }
 catch { return {ok:false,error:'write_failed'}; }
 return next;
}
