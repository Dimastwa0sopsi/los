import {strict as assert} from 'node:assert';
import {generateLayout} from '../src/game/worldgen';
import {AIDriver,type AICtx} from '../src/game/vehicles';
const L=generateLayout(),a=L.nodes.find(n=>n.gi===2&&n.gj===2)!, b=L.nodes.find(n=>n.gi===3&&n.gj===2)!, c=L.nodes.find(n=>n.gi===4&&n.gj===2)!;
const vehicle=(x:number,z:number,heading:number,speed:number)=>({x,z,heading,speed,steer:0,rpm:0,shock:0,spec:{maxSpeed:28,accel:3.2,len:4.4,wid:1.9},model:{group:{visible:true}}}) as any;
function trial(oncoming:boolean,person:boolean,wall:boolean,mode:'route'|'wander'='wander'){
 const v=vehicle(a.x+5,a.z+3,Math.PI/2,0),parked=vehicle(a.x+16,a.z+3,0,0),other=vehicle(a.x+40,a.z-3,-Math.PI/2,10);
 const ai=new AIDriver();ai.route=[a.id,b.id,c.id];ai.mode=mode;ai.obeyLights=false;
 const ctx:AICtx={L,vehicles:oncoming?[v,parked,other]:[v,parked],player:{x:1e6,z:1e6,inVehicle:null},pedestrians:person?[{x:a.x+22,z:a.z-3}]:[],lightState:()=> 'green',rand:()=>0.5,col:wall?{solidAt:()=>true} as any:undefined};
 return ai.step(v,0.5,ctx).desired;
}
const free=trial(false,false,false),oncoming=trial(true,false,false),person=trial(false,true,false),wall=trial(false,false,true);
assert(free>oncoming+0.05,'не объезжает стоящую машину, либо игнорирует встречную');
assert(free>person+0.05,'не учитывает человека на встречной полосе');
assert(free>wall+0.05,'не учитывает препятствие на полосе объезда');
assert(trial(false,false,false,'route')>trial(true,false,false,'route')+0.05,'машина по маршруту не обходит стоящую');
console.log('✓ водители: объезд стоящей машины на свободной полосе; встречная машина, пешеход и препятствие блокируют манёвр');
