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
 const pending=Object.create(Game.prototype) as any;Object.assign(pending,{onlineRequired:true,online:true,economyLabPaused:false,net:{ready:true,accountSaved:true},save:()=>{},cb:{onOnlineExit:()=>exits++}});await pending.leaveOnline();assert.equal(exits,2);
 console.log('✓ онлайн-only: пауза до входа и при потере связи, одиночное сохранение не записывается, выход ведёт в меню');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
