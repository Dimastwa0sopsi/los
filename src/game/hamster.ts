import * as THREE from 'three';
import { T } from './geom';
import { mat } from './textures';
import { segDist } from './config';
import type { WorldLayout } from './worldgen';
import type { Collision } from './collision';

/** Find one random open place in a city park; never place the hamster on a road. */
export function hamsterSpot(layout: WorldLayout, collision: Collision, random: () => number = Math.random): {x:number;z:number} | null {
  if (!layout.parks.length) return null;
  for (let i=0;i<500;i++) {
    const park=layout.parks[Math.min(layout.parks.length-1,Math.floor(random()*layout.parks.length))];
    const x=park.x0+3+random()*Math.max(0,park.x1-park.x0-6);
    const z=park.z0+3+random()*Math.max(0,park.z1-park.z0-6);
    if (layout.river.depth(x,z)>0.05 || collision.query(x,z,1).some(b=>b.y0<0.5 && b.y1>0.15)) continue;
    if (layout.roadSegments.some(r=>segDist(x,z,r.ax,r.az,r.bx,r.bz).d<r.w/2+1)) continue;
    return {x,z};
  }
  return null;
}

/** Little golden hamster holding a sunflower seed. Shared geometries/materials. */
export function makeHamster() {
  const group = new THREE.Group(); group.name = 'hamster';
  const sphere=(color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,parent:THREE.Object3D=group)=>{
    const mesh=new THREE.Mesh(T.sphere,mat('c:'+color)); mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
  };
  sphere('#c98742',0,0.13,0,0.17,0.13,0.22);
  sphere('#f5e2bb',0,0.11,0.12,0.13,0.085,0.12);
  const head=new THREE.Group();head.position.set(0,0.22,0.15);group.add(head);
  sphere('#d99b53',0,0,0,0.14,0.12,0.13,head);
  for (const side of [-1,1]) {
    sphere('#bd7b40',side*0.10,0.095,-0.03,0.055,0.068,0.03,head);
    sphere('#edb6a5',side*0.102,0.102,-0.001,0.031,0.041,0.012,head);
    sphere('#fff1d7',side*0.074,-0.027,0.091,0.063,0.052,0.045,head);
    sphere('#1c1513',side*0.065,0.032,0.111,0.018,0.021,0.015,head);
    sphere('#fffdf1',side*0.059,0.04,0.125,0.006,0.006,0.005,head);
    sphere('#e7b992',side*0.07,-0.09,0.13,0.035,0.04,0.03,head);
  }
  sphere('#e99498',0,-0.005,0.145,0.018,0.014,0.012,head);
  const seed=sphere('#3a2b22',0,-0.075,0.16,0.027,0.043,0.014,head);seed.rotation.z=0.32;
  for (const side of [-1,1]) sphere('#e4b98b',side*0.11,0.035,0.08,0.05,0.035,0.06);
  return {group, animate(t:number){ head.rotation.x=Math.sin(t*7)*0.055; seed.rotation.z=0.32+Math.sin(t*7)*0.1; }};
}
