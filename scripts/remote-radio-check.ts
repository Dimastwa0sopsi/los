import {strict as assert} from 'node:assert';
import {RemoteRadios} from '../src/game/remoteRadio';
import type {NetworkRadio} from '../src/game/net';
const instances:{callbacks:Record<string,()=>void>;volume:number;seek:number;played:number;removed:boolean}[]=[];
const factory=Object.assign((_frame:unknown)=>{
  const p=instances[instances.length-1];
  return {bind:(event:string,cb:()=>void)=>{p.callbacks[event]=cb;},play:()=>{p.played++;},pause:()=>{},setVolume:(v:number)=>{p.volume=v;},seekTo:(v:number)=>{p.seek=v;},getPosition:(cb:(v:number)=>void)=>cb(p.seek)};
},{Events:{READY:'ready',PLAY:'play',PAUSE:'pause',FINISH:'finish',ERROR:'error'}});
(globalThis as any).window={SC:{Widget:factory}};
(globalThis as any).document={getElementById:()=>({appendChild:()=>{}}),createElement:()=>{const p={callbacks:{},volume:-1,seek:-1,played:0,removed:false};instances.push(p);return {remove:()=>{p.removed=true;}};},body:{appendChild:()=>{}}};
(async()=>{
 const remote=new RemoteRadios();
 const s:NetworkRadio={owner:2,kind:'vehicle',url:'https://soundcloud.com/artist/song',x:10,z:10,buildingId:null,exteriorX:10,exteriorZ:10,position:5000,outside:.8,inside:.4,playing:true,updatedAt:Date.now()};
 const listener={x:10,z:10,buildingId:null,vehicleId:null};
 remote.apply([s],1);remote.update(listener,null);await Promise.resolve();await Promise.resolve();
 assert.equal(instances.length,1);instances[0].callbacks.ready();assert.equal(instances[0].volume,80);assert(instances[0].seek>=5000);assert.equal(instances[0].played,1);
 remote.update(listener,2);assert.equal(instances[0].volume,40);
 remote.update({...listener,x:100},null);assert(instances[0].removed);
 remote.apply([{...s,url:'https://example.com/evil'}],1);remote.update(listener,null);assert.equal(instances.length,1);
 remote.apply([s],1);remote.update(listener,null);await Promise.resolve();await Promise.resolve();assert.equal(instances.length,2);
 remote.apply([],1);remote.update(listener,null);assert(instances[1].removed);remote.clear();
 console.log('✓ удалённое радио: выбор источника, громкость в салоне и снаружи, позиция, дистанция и очистка (мок API)');
})().catch(e=>{console.error(e);process.exitCode=1;});
