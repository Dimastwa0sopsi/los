import {SAVE_KEY} from './config';

/** Только локальные одиночные слоты; сетевые слоты, аккаунты и настройки не затрагиваются. */
export function wipeOfflineSaves(storage: Pick<Storage,'length'|'key'|'removeItem'>): {ok:true;removed:number}|{ok:false;removed:number} {
 let removed=0;
 try {
  const keys:string[]=[];
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i);
   if(key===SAVE_KEY || key===`${SAVE_KEY}_owner` || key?.startsWith(`${SAVE_KEY}_acc_`)) keys.push(key);
  }
  for(const key of keys){storage.removeItem(key);removed++;}
  return {ok:true,removed};
 } catch {return {ok:false,removed};}
}
