import * as THREE from 'three';
import {CITY_SIZE} from './config';
import type {Village} from './worldgen';

export type CampPosition={x:number;y:number;z:number;a:number};
export function parseCamp(value:unknown):CampPosition|null {
 if(!value || typeof value!=='object' || Array.isArray(value))return null;
 const p=value as Record<string,unknown>;
 if(![p.x,p.y,p.z,p.a].every(n=>typeof n==='number'&&Number.isFinite(n)))return null;
 const {x,y,z,a}=p as CampPosition;
 return Math.abs(x)<=4000 && Math.abs(z)<=4000 && y>=-5 && y<=1000 && Math.abs(a)<=100 ? {x,y,z,a}:null;
}
/** Village bounds include roadside homes even if village endpoints form a line. */
export function campOutsideCity(x:number,z:number,villages:Village[]):boolean {
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 const village=villages.some(v=>x>=Math.min(v.sx,v.ex)-40 && x<=Math.max(v.sx,v.ex)+40 && z>=Math.min(v.sz,v.ez)-40 && z<=Math.max(v.sz,v.ez)+40);
 return village || x<0 || x>CITY_SIZE || z<0 || z>CITY_SIZE;
}
/** Camp origin is exactly the player's placement point; fire is beside the tent. */
export function makeCamp():THREE.Group {
 const group=new THREE.Group();group.name='camp';
 const tent=new THREE.Mesh(new THREE.ConeGeometry(1.45,1.8,4),new THREE.MeshLambertMaterial({color:0x46725b,side:THREE.DoubleSide}));
 tent.position.y=.9;tent.rotation.y=Math.PI/4;tent.scale.z=1.25;group.add(tent);
 const door=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshLambertMaterial({color:0x17291e,side:THREE.DoubleSide}));
 door.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.49,.05,1.032,.49,.05,1.032,0,1.19,.25],3));door.geometry.computeVertexNormals();group.add(door);
 const fire=new THREE.Group();fire.position.set(2.2,0,0);group.add(fire);
 const stoneMat=new THREE.MeshLambertMaterial({color:0x777268}),stoneGeo=new THREE.SphereGeometry(.18,7,5);
 for(let i=0;i<9;i++){const stone=new THREE.Mesh(stoneGeo,stoneMat);const a=i*Math.PI*2/9;stone.position.set(Math.sin(a)*.52,.13,Math.cos(a)*.52);stone.scale.y=.65;fire.add(stone);}
 const logGeo=new THREE.CylinderGeometry(.08,.1,.9,7),logMat=new THREE.MeshLambertMaterial({color:0x563b27});
 for(const a of [-.7,.7]){const log=new THREE.Mesh(logGeo,logMat);log.rotation.z=Math.PI/2;log.rotation.y=a;log.position.y=.16;fire.add(log);}
 const flame=new THREE.Mesh(new THREE.ConeGeometry(.29,.7,7),new THREE.MeshBasicMaterial({color:0xff7624}));flame.position.y=.52;flame.name='flame';fire.add(flame);
 const inner=new THREE.Mesh(new THREE.ConeGeometry(.16,.45,6),new THREE.MeshBasicMaterial({color:0xffd451}));inner.position.y=.4;fire.add(inner);
 const light=new THREE.PointLight(0xff8a36,7,8,2);light.position.y=.8;fire.add(light);
 return group;
}
export function disposeCamp(group:THREE.Group){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 group.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;geometries.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material])materials.add(mat);});
 group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
}
