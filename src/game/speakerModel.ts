import * as THREE from 'three';
import {mat} from './textures';
import type {Speaker} from './speakers';
/** Desk coordinates are the computer's interaction point; dimensions are in game metres. */
export function makeHomeSpeaker(s:Speaker,desk:{x:number;z:number}):THREE.Group {
  const root=new THREE.Group();root.name='installed-home-speaker';
  const floor=s.placement==='floor', width=floor ? .30+s.height*.16 : .15+s.height*.15, depth=floor ? .30 : .14;
  const x=desk.x+(floor ? .94 : .48), z=desk.z+1.1, y=floor ? 0 : .77;
  const cabinet=new THREE.Group();cabinet.name='speaker-cabinet';cabinet.position.set(x,y,z);root.add(cabinet);
  const body=new THREE.Mesh(new THREE.BoxGeometry(width,s.height,depth),mat('c:'+s.color));body.position.y=s.height/2;cabinet.add(body);
  for(let i=0;i<s.drivers;i++){
    const r=Math.min(width*.34,s.height/(s.drivers*2.8));
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.018,16),mat('c:#111827'));rim.rotation.x=Math.PI/2;rim.position.set(0,s.height*(i+1)/(s.drivers+1),-depth/2-.01);cabinet.add(rim);
    const dust=new THREE.Mesh(new THREE.CylinderGeometry(r*.40,r*.40,.02,16),mat('c:#94a3b8'));dust.rotation.x=Math.PI/2;dust.position.set(0,rim.position.y,-depth/2-.023);cabinet.add(dust);
  }
  if(s.amplifier){
    const amp=new THREE.Group();amp.name='speaker-amplifier';amp.position.set(desk.x+.1,0,z);root.add(amp);
    const chassis=new THREE.Mesh(new THREE.BoxGeometry(.42,.15,.27),mat('c:#181c24'));chassis.position.y=.075;amp.add(chassis);
    const led=new THREE.Mesh(new THREE.BoxGeometry(.035,.018,.008),mat('glow:#22c55e'));led.position.set(.14,.09,-.14);amp.add(led);
  }
  return root;
}
/** The shapes own their geometries; material instances come from the shared cache. */
export function disposeHomeSpeaker(root:THREE.Object3D){root.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)m.geometry.dispose();});root.removeFromParent();}
