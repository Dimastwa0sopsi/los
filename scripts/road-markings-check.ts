import './domstub';
import {strict as assert} from 'node:assert';
import {getTex} from '../src/game/textures';
const original=document.createElement.bind(document);const marks:{style:string;x:number;y:number;w:number;h:number}[]=[];
(document as any).createElement=(tag:string)=>{
 const c=original(tag);if(tag!=='canvas')return c;
 const get=(c as any).getContext.bind(c);const ctx=get('2d');const fill=ctx.fillRect.bind(ctx);
 ctx.fillRect=(x:number,y:number,w:number,h:number)=>{marks.push({style:String(ctx.fillStyle),x,y,w,h});return fill(x,y,w,h);};
 return c;
};
for(const key of ['road_city','road_city2','road_city3','road_highway','road_highway6','road_village','road_industrial']){
 marks.length=0;getTex(key);
 assert(marks.some(m=>m.x>=116&&m.x<=136&&m.w<=6&&m.h>=90),`${key}: нет центральной линии`);
}
console.log('✓ разметка: разделительные линии на городских, загородных и промышленных дорогах');
