import {strict as assert} from 'node:assert';
import {generateLayout} from '../src/game/worldgen';
import {AIDriver,trafficCrash,type AICtx} from '../src/game/vehicles';
const L=generateLayout(),a=L.nodes.find(n=>n.gi===2&&n.gj===2)!, b=L.nodes.find(n=>n.gi===3&&n.gj===2)!, c=L.nodes.find(n=>n.gi===4&&n.gj===2)!;
const car=(x:number,z:number,speed:number)=>({x,z,heading:Math.PI/2,speed,steer:0,rpm:0,shock:0,spec:{maxSpeed:28,accel:3.2,len:4.4,wid:1.9},model:{group:{visible:true}}}) as any;
const v=car(a.x+5,a.z+3,6),obstacle=car(a.x+26,a.z+3,0),ai=new AIDriver();ai.route=[a.id,b.id,c.id];ai.obeyLights=false;v.ai=ai;
const ctx:AICtx={L,vehicles:[v,obstacle],player:{x:1e6,z:1e6,inVehicle:null},lightState:()=> 'green',rand:()=>0.5};
let crashed=false,min=100;
for(let i=0;i<1200;i++){ai.step(v,1/30,ctx);min=Math.min(min,Math.hypot(v.x-obstacle.x,v.z-obstacle.z));if(trafficCrash(v,obstacle))crashed=true;if(v.x>obstacle.x+9)break;}
console.log(`проезд: x=${(v.x-a.x).toFixed(1)}, z=${(v.z-a.z).toFixed(1)}, минимальная дистанция ${min.toFixed(1)}, столкновение ${crashed}`);
assert(!crashed,'столкнулся со стоящей машиной');assert(v.x>obstacle.x+9,'не объехал стоящую машину');
// Встречный автомобиль появляется уже после начала манёвра: ИИ должен тормозить.
{
 const moving=car(a.x+5,a.z+3,8), parked=car(a.x+24,a.z+3,0), driver=new AIDriver();
 driver.route=[a.id,b.id,c.id];driver.obeyLights=false;moving.ai=driver;
 const context:AICtx={...ctx,vehicles:[moving,parked]};
 for(let i=0;i<25;i++)driver.step(moving,1/30,context);
 const incoming=car(moving.x+24,moving.z-4,8);incoming.heading=-Math.PI/2;context.vehicles.push(incoming);
 const result=driver.step(moving,1/30,context);assert.equal(result.target,0,'не тормозит перед внезапной встречной машиной');
 driver.panic(moving.x,moving.z,8);
 assert.equal(driver.step(moving,1/30,context).target,0,'паника не должна отменять торможение при встречной машине во время манёвра');
}
console.log('✓ проезд вокруг стоящей машины и торможение при внезапной встречной в симуляции');
