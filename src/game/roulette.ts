import type {GameState} from './state';
import {SAVE_KEY} from './config';
export type RouletteBet = 'red'|'black'|'green';
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const ROULETTE_MIN=1000, ROULETTE_MAX=1000000;
export const CASINO_ITEMS = {cigarettes:7, durman:200} as const;
export function rouletteColor(n:number):RouletteBet|null {
  if(!Number.isInteger(n)||n<0||n>36)return null;
  return n===0?'green':RED.has(n)?'red':'black';
}
/** Uniform 0..36 using rejection sampling; no Math.random for money. */
export function randomRouletteNumber(random: Pick<Crypto,'getRandomValues'>):number {
  const values=new Uint32Array(1), ceiling=Math.floor(4294967296/37)*37;
  for(let i=0;i<128;i++){random.getRandomValues(values);if(values[0]<ceiling)return values[0]%37;}
  throw Error('random source unavailable');
}
/** Solo-only. Save the final state once before applying it to the live state. */
export function spinRouletteSolo(state:GameState,bet:number,choice:RouletteBet,storage:Pick<Storage,'setItem'>,pick:()=>number):
  {ok:true;number:number;color:RouletteBet;payout:number}|{ok:false;error:'invalid'|'funds'|'storage'|'random'} {
  if(!Number.isSafeInteger(bet)||bet<ROULETTE_MIN||bet>ROULETTE_MAX||!['red','black','green'].includes(choice)||!Number.isSafeInteger(state.money)||state.money<0)return {ok:false,error:'invalid'};
  if(state.money<bet)return {ok:false,error:'funds'};
  let n:number;try{n=pick();}catch{return {ok:false,error:'random'};}
  const color=rouletteColor(n);if(!color)return {ok:false,error:'random'};
  const payout=choice===color?bet*(choice==='green'?36:2):0;
  const money=state.money-bet+payout;if(!Number.isSafeInteger(money))return {ok:false,error:'invalid'};
  try {storage.setItem(SAVE_KEY,JSON.stringify({...state,money}));}catch{return {ok:false,error:'storage'};}
  state.money=money;return {ok:true,number:n,color,payout};
}
