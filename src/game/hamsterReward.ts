import type { GameState } from './state';
import { SAVE_KEY } from './config';

export const HAMSTER_REWARD = 10_000;
export const HAMSTER_PET_MS = 900;
export const HAMSTER_RUN_MS = 1400;
export const HAMSTER_HIDE_MS = 120_000;
export type HamsterSaveStorage = Pick<Storage, 'setItem'>;

/** Only solo saves: persist balance and claim as one localStorage write. Online
 * requires an authoritative server operation and is deliberately not handled. */
export function petHamsterSolo(state: GameState, storage: HamsterSaveStorage, now: number): {ok:true;reward:number;hiddenUntil:number}|{ok:false} {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(state.money) || state.money < 0 || (typeof state.hamsterHiddenUntil === 'number' && Number.isFinite(state.hamsterHiddenUntil) && now < state.hamsterHiddenUntil)) return {ok:false};
  const reward = state.hamsterRewardClaimed === true ? 0 : HAMSTER_REWARD;
  const hiddenUntil = now + HAMSTER_PET_MS + HAMSTER_RUN_MS + HAMSTER_HIDE_MS;
  if (!Number.isSafeInteger(hiddenUntil) || state.money + reward > Number.MAX_SAFE_INTEGER) return {ok:false};
  const snapshot = {...state, money:state.money + reward, hamsterRewardClaimed:true, hamsterHiddenUntil:hiddenUntil};
  try { storage.setItem(SAVE_KEY, JSON.stringify(snapshot)); } catch { return {ok:false}; }
  state.money = snapshot.money; state.hamsterRewardClaimed = true; state.hamsterHiddenUntil = hiddenUntil;
  return {ok:true,reward,hiddenUntil};
}
