import './domstub';
import {strict as assert} from 'node:assert';
import {NetClient} from '../src/game/net';
(globalThis as any).WebSocket={OPEN:1};
function setup(full:boolean){const n=new NetClient('Tester','m','ws://test',{mode:'login',password:'password-test'}) as any;n.ws={readyState:1,send:()=>{}};n.handshake=true;n.handle(JSON.stringify({type:'login_success',caps:{accounts:1,fullPlayers:full?1:0},accountRevision:0,player:{id:1,name:'Tester'}}));return n;}
const n=setup(true);const player={id:2,name:'Other',x:1,z:1};n.handle(JSON.stringify({type:'players_list',players:[player]}));assert(n.players.has(2));
for(const bad of [null,{},[null],[{id:'2'}],[{id:0}]]){n.handle(JSON.stringify({type:'players_list',players:bad}));assert(n.players.has(2),'повреждённый список не удаляет игроков');}
n.handle(JSON.stringify({type:'players_list',players:[]}));assert(!n.players.has(2),'полный список удаляет вышедшего сразу');
const old=setup(false);old.handle(JSON.stringify({type:'players_list',players:[player]}));old.handle(JSON.stringify({type:'players_list',players:[]}));assert(old.players.has(2),'старый сервер сохраняет прежнюю задержку');
console.log('✓ полный список игроков: выход, повреждённые сообщения, совместимость со старым сервером');
