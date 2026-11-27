import type {Character} from './character';
import {hamsterWorldPose, type HamsterWorld} from './hamsterOnlineWorld';

/** Cosmetic only: the server event identifies the actor, never grants money. */
export function remoteHamsterPetActive(world:HamsterWorld|null, elapsedMs:number, playerId:number, interiorKey:string, pose:string):boolean {
 return !!world?.event && world.event.petter===playerId && !interiorKey && pose!=='swim' && pose!=='tread' && hamsterWorldPose(world,elapsedMs).phase==='pet';
}
export function applyHamsterPetVisual(character:Pick<Character,'torso'|'shR'|'elR'>,timeMs:number):void {
 character.torso.rotation.x=.34;
 character.shR.rotation.x=-1.15+Math.sin(timeMs/120)*.12;
 character.elR.rotation.x=-.45;
}
