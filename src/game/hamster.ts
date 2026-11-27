import * as THREE from 'three';
import { T } from './geom';
import { mat } from './textures';
import { CITY_SIZE, segDist } from './config';
import type { WorldLayout } from './worldgen';
import type { Collision } from './collision';

/** Validate server-provided world locations against this client's map version. */
export function isHamsterSpot(layout: WorldLayout, collision: Collision, x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && x>0 && x<CITY_SIZE && z>0 && z<CITY_SIZE &&
    layout.parks.some(p=>x>=p.x0+3 && x<=p.x1-3 && z>=p.z0+3 && z<=p.z1-3) &&
    layout.river.depth(x,z)<=0.05 && !collision.query(x,z,1).some(b=>b.y0<0.5 && b.y1>0.15) &&
    !layout.roadSegments.some(r=>segDist(x,z,r.ax,r.az,r.bx,r.bz).d<r.w/2+1);
}

/** Find one random open place in a city park; never place the hamster on a road. */
export function hamsterSpot(layout: WorldLayout, collision: Collision, random: () => number = Math.random): {x:number;z:number} | null {
  // Intersect parks with city bounds; parks in villages or outside the city
  // must never be selected. Keep a margin from both park and city edges.
  const parks=layout.parks.map(p=>({x0:Math.max(p.x0+3,1),z0:Math.max(p.z0+3,1),x1:Math.min(p.x1-3,CITY_SIZE-1),z1:Math.min(p.z1-3,CITY_SIZE-1)})).filter(p=>p.x0<=p.x1 && p.z0<=p.z1);
  if (!parks.length) return null;
  for (let i=0;i<500;i++) {
    const park=parks[Math.min(parks.length-1,Math.floor(random()*parks.length))];
    const x=park.x0+random()*(park.x1-park.x0);
    const z=park.z0+random()*(park.z1-park.z0);
    if (layout.river.depth(x,z)>0.05 || collision.query(x,z,1).some(b=>b.y0<0.5 && b.y1>0.15)) continue;
    if (layout.roadSegments.some(r=>segDist(x,z,r.ax,r.az,r.bx,r.bz).d<r.w/2+1)) continue;
    return {x,z};
  }
  return null;
}

/** Little golden hamster holding a sunflower seed. Shared geometries/materials. */
export function makeHamster() {
  const group = new THREE.Group(); group.name = 'hamster'; group.scale.y = 1.23;
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
  const paws = [-1,1].map(side => sphere('#e4b98b',side*0.11,0.035,0.08,0.05,0.035,0.06));
  return {group, animate(t:number,running=false){
    head.rotation.x=Math.sin(t*7)*0.055; seed.rotation.z=0.32+Math.sin(t*7)*0.1;
    for (let i=0;i<paws.length;i++) { paws[i].position.y=0.035+(running?Math.max(0,Math.sin(t*24+i*Math.PI))*.04:0); paws[i].position.z=.08+(running?Math.sin(t*24+i*Math.PI)*.03:0); }
  }};
}
