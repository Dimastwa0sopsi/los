import './domstub';
import {strict as assert} from 'node:assert';
import {IB} from '../src/game/interiors';
import {dressInterior} from '../src/game/interiorDetail';

const ib=new IB(); ib.plant(0,0);
const pot=ib.cols[0]; assert(Math.abs((pot.x1-pot.x0)-0.32)<1e-6); assert.equal(pot.y1,0.32);
for(const ry of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
  const painter=new IB(); painter.painting(0,2,0,ry,'#123456');
  const frame=painter.b.bufs.get('c:#1c1917')!.pos, art=painter.b.bufs.get('meme:0')!.pos;
  const mean=(xs:number[],axis:number)=>xs.filter((_,i)=>i%3===axis).reduce((a,b)=>a+b,0)/(xs.length/3);
  const dx=mean(art,0)-mean(frame,0),dz=mean(art,2)-mean(frame,2);
  assert(Math.abs(dx-Math.sin(ry)*0.01)<1e-6);assert(Math.abs(dz-Math.cos(ry)*0.01)<1e-6);
}
const room=new IB(), calls:{mk:string;w:number;d:number;ry:number}[]=[];
const f=room.f.bind(room);
room.f=(mk,x,y,z,w,h,d,collide=true,ry=0)=>{calls.push({mk,w,d,ry});f(mk,x,y,z,w,h,d,collide,ry)};
dressInterior(room,'shop24',{W:14,D:11,H:3,venue:'',seed:1});
const fire=calls.find(c=>c.mk==='c:#b91c1c'&&c.w===0.16&&c.d===1.3);
assert(fire && fire.ry===0,'пожарный щит расположен вдоль боковой стены, не поперёк');
console.log('✓ компактные растения, рамки по нормали стены и настенный декор вдоль стены');
