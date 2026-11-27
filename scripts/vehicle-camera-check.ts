import './domstub';
import {strict as assert} from 'node:assert';
import {Game} from '../src/game/game';
const g=Object.create(Game.prototype) as any;let msg='';Object.assign(g,{firstPerson:false,inVeh:null,rideRemote:null,rideOn:null,toast:(s:string)=>msg=s});
g.toggleFirstPerson();assert.equal(g.firstPerson,true);g.toggleFirstPerson();assert.equal(g.firstPerson,false);
for(const mode of ['inVeh','rideRemote','rideOn']) {g[mode]={};g.toggleFirstPerson();assert.equal(g.firstPerson,false);assert(msg.includes('третьего лица'));g[mode]=null;}
console.log('✓ первое лицо пешком доступно, переключение в транспорте запрещено');
