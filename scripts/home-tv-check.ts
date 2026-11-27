import './domstub';
import {strict as assert} from 'node:assert';
import {buildInterior} from '../src/game/interiors';
import {HOME_TV_VIDEO} from '../src/game/homeTv';
import {Game} from '../src/game/game';
const videos:any[]=[];
const original=document.createElement.bind(document);
(document as any).createElement=(tag:string)=>{
 if(tag!=='video')return original(tag);
 const v:any={src:'',muted:false,playing:false,paused:false,removed:false,onerror:null,play(){this.playing=true;return Promise.resolve();},pause(){this.paused=true;},load(){},removeAttribute(){this.removed=true;},addEventListener(){},removeEventListener(){}};videos.push(v);return v;
};
for(const kind of ['apt_eco','apt_mid','apt_lux','house_city','house_village'] as const){
 const i=buildInterior(kind);assert(i.homeTv);assert(i.group.getObjectByName('home-tv-screen'));const sofa=i.seats.find(s=>s.kind==='sofa')!;
 const act=i.acts.find(a=>a.action==='home_tv');assert(act);
 const g=Object.create(Game.prototype) as any;Object.assign(g,{L:{buildings:[{}]},state:{location:{b:0}},interior:i,px:sofa.x,pz:sofa.z,furnitureSeat:null,lying:false,rideOn:null,fallT:0,remotes:new Map(),interiorKey:()=>'',toast:()=>{}});
 const before=videos.length;g.toggleFurnitureSeat();assert.equal(videos.length,before);g.toggleFurnitureSeat();
 let prompt=g.actPrompt(act.action,act.label);assert.match(prompt.text,/включить/);assert.deepEqual(prompt.keys,['E']);prompt.act();
 const v=videos.at(-1);assert(v && v.src===HOME_TV_VIDEO && v.playing);assert.equal(v.crossOrigin,'anonymous');
 g.toggleFurnitureSeat();g.toggleFurnitureSeat();assert(!v.paused,'диван не выключает телевизор');
 prompt=g.actPrompt(act.action,act.label);assert.match(prompt.text,/выключить/);prompt.act();assert(v.paused && v.removed);
 g.actPrompt(act.action,act.label).act();const next=videos.at(-1);i.dispose();assert(next.paused && next.removed);
}
const bath=buildInterior('banya');assert.equal(bath.homeTv,undefined);bath.dispose();
console.log('✓ E у домашнего телевизора включает и выключает видео; диван не влияет, выход из интерьера освобождает ресурсы');
