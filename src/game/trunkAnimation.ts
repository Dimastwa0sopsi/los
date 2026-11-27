import type {BodyKind} from './data';

/** Timing/pose math only: this does not create a lid or transfer inventory. */
export type TrunkMotionKind='hinged'|'rollup';
export interface TrunkMotionPose { progress:number; lidAngle:number; lidLift:number; armReach:number; }
export const TRUNK_OPEN_SECONDS={hinged:1.15,rollup:2.2} as const;

/** Unsupported vehicles deliberately have neither a trunk nor an opening animation. */
export function trunkMotionKind(body:BodyKind,variant?:string):TrunkMotionKind|null {
  if (body==='moto' || body==='scooter' || body==='quad' || body==='heli' || body==='combine' || body==='bus') return null;
  if (body==='truck' || body==='semi') return variant==='tank' || variant==='flat' ? null : 'rollup';
  if (body==='sedan' || body==='sport' || body==='hatch' || body==='suv' || body==='van' || body==='pickup') return 'hinged';
  return null;
}
const clamp01=(n:number)=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const smooth=(n:number)=>{const t=clamp01(n);return t*t*(3-2*t);};
/** elapsed is opening progress (0 closed, duration open); no mutation or wall-clock dependency. */
export function trunkMotionPose(kind:TrunkMotionKind,elapsed:number):TrunkMotionPose {
  const duration=TRUNK_OPEN_SECONDS[kind],p=clamp01(elapsed/duration);
  const position=smooth(p);
  if(kind==='rollup') {
    // The hand reaches upwards during the initial pull, releases before the door reaches the top.
    const arm=p<.5?smooth(p/.5):1-smooth((p-.5)/.28);
    return {progress:p,lidAngle:0,lidLift:position,armReach:arm};
  }
  const arm=p<.65?smooth(p/.65):1-smooth((p-.65)/.3);
  return {progress:p,lidAngle:position===0?0:1.25*position,lidLift:0,armReach:arm};
}
/** A reversible progress step, bounded even after large frame gaps. */
export function stepTrunkMotion(kind:TrunkMotionKind,elapsed:number,opening:boolean,dt:number):number {
  const duration=TRUNK_OPEN_SECONDS[kind],time=Number.isFinite(elapsed)?elapsed:0;
  const delta=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;
  return Math.max(0,Math.min(duration,time+(opening?delta:-delta)));
}
