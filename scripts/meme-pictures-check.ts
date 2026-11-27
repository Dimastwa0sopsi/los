import './domstub';
import {strict as assert} from 'node:assert';
import {existsSync} from 'node:fs';
import * as THREE from 'three';
import {MEME_PICTURES,memeUrl,streetMeme} from '../src/game/memePictures';
import {mat} from '../src/game/textures';
import {buildInterior} from '../src/game/interiors';
import {generateLayout} from '../src/game/worldgen';

const loaded:string[]=[];
(globalThis as any).Image=class {
  naturalWidth=800;naturalHeight=600;onload=()=>{};
  set src(value:string){loaded.push(value);this.onload();}
};
assert.equal(MEME_PICTURES.length,7);
for(let i=0;i<MEME_PICTURES.length;i++){
 assert(existsSync('public/1/'+MEME_PICTURES[i]));
 const material=mat('meme:'+i) as THREE.MeshBasicMaterial;
 assert(material.map && material.map.colorSpace===THREE.SRGBColorSpace);
 assert.equal(mat('meme:'+i),material,'материал используется повторно');
 assert.equal(loaded[i],memeUrl(i));assert(loaded[i].startsWith('./1/'));
}
const home=buildInterior('house_city',{seed:3});let art=0;
home.group.traverse(o=>{if(typeof o.userData.matKey==='string' && o.userData.matKey.startsWith('meme:'))art++});
assert(art>0,'в доме есть картины с изображениями');home.dispose();
const world=generateLayout();const posters=world.buildings.map(streetMeme).filter(p=>p!==null);
assert(posters.length>0 && posters.length<world.buildings.length/10,'редкие уличные изображения');
for(const p of posters)assert(Number.isFinite(p.x) && Number.isFinite(p.z) && p.index>=0 && p.index<MEME_PICTURES.length);
console.log(`✓ 7 фото из папки 1, картины в интерьере и ${posters.length} редких уличных изображений`);
