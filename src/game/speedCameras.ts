import { CITY_SIZE } from './config';
import type { WorldLayout } from './worldgen';
export interface SpeedCamera { id:string; x:number; z:number; poleX:number; poleZ:number; dx:number; dz:number; width:number; limit:number }
/** Стабильные точки на небольшом числе дорог; не все дороги покрыты. */
export function generateSpeedCameras(roads: WorldLayout['roadSegments']): SpeedCamera[] {
  const out: SpeedCamera[] = [];
  const targets = [
    {kind:'city',x:180,z:180}, {kind:'city',x:510,z:210}, {kind:'city',x:840,z:240},
    {kind:'city',x:210,z:750}, {kind:'city',x:510,z:690}, {kind:'city',x:840,z:810},
    {kind:'highway',x:1120,z:540}, {kind:'highway',x:1300,z:540},
  ] as const;
  for (const target of targets) {
    const choices = roads.map((r,i)=>({r,i,x:(r.ax+r.bx)/2,z:(r.az+r.bz)/2}))
      .filter(({r,x,z})=>r.kind===target.kind && Math.hypot(r.bx-r.ax,r.bz-r.az)>=20 && !out.some(c=>Math.hypot(c.x-x,c.z-z)<120))
      .sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z) || a.i-b.i);
    const chosen = choices[0]; if (!chosen) continue;
    const {r,i,x,z}=chosen, length=Math.hypot(r.bx-r.ax,r.bz-r.az);
    const dx=(r.bx-r.ax)/length, dz=(r.bz-r.az)/length;
    const city=x>=0 && x<=CITY_SIZE && z>=0 && z<=CITY_SIZE;
    out.push({id:`${target.kind}-${i}`,x,z,poleX:x-dz*(r.w/2+1.2),poleZ:z+dx*(r.w/2+1.2),dx,dz,width:r.w,limit:city?100:150});
  }
  return out;
}
export function cameraDetects(camera:SpeedCamera,x:number,z:number):boolean {
  const dx=x-camera.x, dz=z-camera.z;
  return Math.abs(dx*camera.dx+dz*camera.dz) <= 9 && Math.abs(-dx*camera.dz+dz*camera.dx) <= camera.width/2+2;
}
export function cameraFine(kmh:number,limit:number,hasPlate:boolean,roll:number): {amount:number;reason:'speed'|'no_plate'} | null {
  if (!Number.isFinite(kmh) || !Number.isFinite(limit) || !Number.isFinite(roll)) return null;
  if (!hasPlate) return roll < 0.3 ? {amount:10000,reason:'no_plate'} : null;
  return kmh > limit ? {amount:5000,reason:'speed'} : null;
}
