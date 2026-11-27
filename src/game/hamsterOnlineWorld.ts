import {HAMSTER_PET_MS,HAMSTER_RUN_MS,HAMSTER_HIDE_MS} from './hamsterReward';
export type HamsterWorld = {version:1;seq:number;x:number;z:number;serverTime:number;event:null|{petter:number;start:number;returnAt:number;dx:number;dz:number}};
export function parseHamsterWorld(raw:unknown,validSpot:(x:number,z:number)=>boolean):HamsterWorld|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const w=raw as any;
 if(w.version!==1||!Number.isSafeInteger(w.seq)||w.seq<1||!Number.isFinite(w.x)||!Number.isFinite(w.z)||!Number.isSafeInteger(w.serverTime)||w.serverTime<0||!validSpot(w.x,w.z))return null;
 if(w.event===null)return {version:1,seq:w.seq,x:w.x,z:w.z,serverTime:w.serverTime,event:null};
 const e=w.event;
 if(!e||typeof e!=='object'||!Number.isSafeInteger(e.petter)||e.petter<1||!Number.isSafeInteger(e.start)||e.start<0||!Number.isSafeInteger(e.returnAt)||e.returnAt!==e.start+HAMSTER_PET_MS+HAMSTER_RUN_MS+HAMSTER_HIDE_MS||!Number.isFinite(e.dx)||!Number.isFinite(e.dz)||Math.abs(Math.hypot(e.dx,e.dz)-1)>0.001||w.serverTime<e.start||w.serverTime>=e.returnAt)return null;
 return {version:1,seq:w.seq,x:w.x,z:w.z,serverTime:w.serverTime,event:{petter:e.petter,start:e.start,returnAt:e.returnAt,dx:e.dx,dz:e.dz}};
}
export function hamsterWorldPose(w:HamsterWorld,elapsedMs:number){
 const now=w.serverTime+Math.max(0,elapsedMs); const e=w.event;
 if(!e||now>=e.returnAt)return {phase:'idle' as const,x:w.x,z:w.z};
 const age=now-e.start;
 if(age<HAMSTER_PET_MS)return {phase:'pet' as const,x:w.x,z:w.z};
 if(age<HAMSTER_PET_MS+HAMSTER_RUN_MS){const t=(age-HAMSTER_PET_MS)/HAMSTER_RUN_MS;return {phase:'running' as const,x:w.x+e.dx*t*2,z:w.z+e.dz*t*2};}
 return {phase:'hidden' as const,x:w.x+e.dx*2,z:w.z+e.dz*2};
}
