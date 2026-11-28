import './domstub';
import {strict as assert} from 'node:assert';
import {Game} from '../src/game/game';
async function main(){
 const g=Object.create(Game.prototype) as any;let hud=0,exits=0;
 Object.assign(g,{onlineRequired:true,online:false,intro:null,economyLabPaused:false,state:{},emitHud:()=>{hud++;},cb:{onOnlineExit:()=>exits++}});
 g.update(0.05);assert.equal(hud,1,'без входа игровой цикл должен быть остановлен');
 g.save(); // Не читает и не записывает одиночное сохранение.
 g.online=true;g.net={ready:false,sessionReady:false};g.update(0.05);assert.equal(hud,2,'при потере соединения игровой цикл должен быть остановлен');
 g.net={ready:true,sessionReady:false};g.update(0.05);assert.equal(hud,3,'открытый сокет без авторизации не должен возобновлять игру');
 let saved=0;g.net={ready:true,sessionReady:true,accountSaved:true};g.save=()=>saved++;await g.leaveOnline();assert.equal(saved,1);assert.equal(exits,1);assert.equal(g.online,true,'не переключаемся на соло');
 const pending=Object.create(Game.prototype) as any;Object.assign(pending,{onlineRequired:true,online:true,economyLabPaused:false,net:{ready:true,sessionReady:true,accountSaved:true},save:()=>{},cb:{onOnlineExit:()=>exits++}});await pending.leaveOnline();assert.equal(exits,2);
 let savedPending=0,released=0;const slowNet={sessionReady:true,accountSaved:false};
 const slow=Object.create(Game.prototype) as any;Object.assign(slow,{onlineRequired:true,online:true,economyLabPaused:false,net:slowNet,input:{enabled:true,releaseAll:()=>released++},toast:()=>{},save:()=>savedPending++,cb:{onOnlineExit:()=>exits++}});
 const waiting=slow.leaveOnline();assert(slow.onlineExitPending);assert.equal(slow.input.enabled,false);slow.update(.05);await slow.leaveOnline();assert.equal(savedPending,1,'повтор выхода не создаёт вторую очередь');
 slowNet.accountSaved=true;await waiting;assert.equal(exits,3);assert.equal(slow.onlineExitPending,false);assert(released>=2);
 const disconnected=Object.create(Game.prototype) as any;Object.assign(disconnected,{onlineRequired:true,online:true,net:{sessionReady:false},toast:()=>{},save:()=>{throw Error('save should not start')},cb:{onOnlineExit:()=>exits++}});await disconnected.leaveOnline();assert.equal(exits,3,'без соединения не покидаем аккаунт');
 const timeout=Object.create(Game.prototype) as any;let error='';Object.assign(timeout,{onlineRequired:true,online:true,net:{sessionReady:true,accountSaved:false},input:{enabled:true,releaseAll:()=>{}},toast:(s:string)=>error=s,save:()=>{},cb:{onOnlineExit:()=>exits++}});
 const oldNow=Date.now;let clock=0;Date.now=()=>{clock+=6000;return clock;};try{await timeout.leaveOnline();}finally{Date.now=oldNow;}
 assert.equal(exits,3);assert(!timeout.onlineExitPending);assert(timeout.input.enabled);assert.match(error,/Нет подтверждения/,'при ошибке возобновляем управление, не выходя');
 console.log('✓ онлайн-only: пауза до входа и при потере связи, одиночное сохранение не записывается, выход ведёт в меню');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
