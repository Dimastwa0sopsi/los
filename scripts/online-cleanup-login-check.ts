import './domstub';
import {strict as assert} from 'node:assert';
import {Game} from '../src/game/game';
import {NetClient} from '../src/game/net';
import {newState} from '../src/game/state';
class Store {data=new Map<string,string>();get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
const s=new Store();(globalThis as any).localStorage=s;(globalThis as any).window.clearTimeout=clearTimeout;
const oldConnect=NetClient.prototype.connect;NetClient.prototype.connect=function(){};
const initial=()=>{s.data.clear();s.setItem('losgorod_save','solo');s.setItem('losgorod_save_acc_a','solo account');s.setItem('losgorod_save_online_a','online copy');};
function game(){const g=Object.create(Game.prototype) as any;Object.assign(g,{online:false,onlineRequired:true,intro:null,net:null,peds:{onlineMode:false},L:{playerSpawn:{x:0,z:0,a:0}},cb:{onNetError:()=>{}},sound:{coin:()=>{}},toast:()=>{},reportInventory:()=>{},removeQuestPeds:()=>{},swapState(st:any){assert(s.getItem('losgorod_save'),'удаление должно следовать после загрузки');this.state=st;this.online=true;},save:()=>{}});return g;}
try {
 initial();const a=game();a.enterOnline('Tester','m',false,false,{mode:'login',password:'password-123'});assert(s.getItem('losgorod_save'));const state=newState('m',{x:0,z:0,a:0});state.customized=true;a.net.onLogin({id:1,name:'Tester',gender:'m',money:20000},true,state);assert.equal(s.getItem('losgorod_save'),null);assert.equal(s.getItem('losgorod_save_acc_a'),null);assert.equal(s.getItem('losgorod_save_online_a'),'online copy');
 for (const malformed of ['bad state',{}, {...state,vehicles:{}}, {...state,pos:{x:0,z:0}}, {...state,money:NaN}, {...state,version:state.version+1}, {...state,version:'4'}, {...state,vehicles:[null]}, {...state,vehicles:[{type:'unrecognized_future_car'}]}, {...state,vehicles:[{type:'constructor'}]}]) {
  initial();const b=game();b.enterOnline('Tester','m',false,false,{mode:'login',password:'password-123'});b.net.onLogin({id:1,name:'Tester'},true,malformed);assert.equal(s.getItem('losgorod_save'),'solo','повреждённый серверный снимок не должен удалять локальные данные');assert.equal(b.online,false);
 }
 console.log('✓ очистка одиночных слотов только после установки серверного сохранения; онлайн-слоты сохранены');
}finally{NetClient.prototype.connect=oldConnect;}
