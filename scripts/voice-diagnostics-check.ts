import {strict as assert} from 'node:assert';
import {NearbyVoice} from '../src/game/voice';
let stopped=0,closed=0,disconnected=0;
const track={stop(){stopped++;},onended:null};const stream:any={getTracks:()=>[track],getAudioTracks:()=>[track]};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>stream}},configurable:true});
class Context {state='running';createMediaStreamSource(){return {connect(){},disconnect(){disconnected++;}};}createAnalyser(){return {fftSize:0,getByteTimeDomainData(a:Uint8Array){a.fill(150);}};}async resume(){}async close(){closed++;}}
(globalThis as any).window={AudioContext:Context,addEventListener(){},removeEventListener(){}};
class PC {connectionState='new';onicecandidate:any;ontrack:any;onconnectionstatechange:any;localDescription:any;remoteDescription:any;packets=0;
 addTrack(){} addTransceiver(){} async createOffer(){return {type:'offer'};} async setLocalDescription(d:any){this.localDescription={toJSON:()=>d};}
 async getStats(){return new Map([['out',{type:'outbound-rtp',kind:'audio',packetsSent:this.packets}]]);}close(){this.connectionState='closed';}}
(globalThis as any).RTCPeerConnection=PC;
(globalThis as any).document={body:{appendChild(){}},createElement(){return {setAttribute(){},play:async()=>{},pause(){},remove(){}};}};
(async()=>{
 const voice=new NearbyVoice(()=>{},()=>{});await voice.start();voice.tick(0,1,[{id:2,near:true}]);assert(voice.micLevel!==null && voice.micLevel>0);assert.match(voice.connectionStatus,/Подключение/);
 await voice.receive(1,2,{kind:'hello',data:{speaking:false}});const peer=[...(voice as any).peers.values()][0] as any;peer.pc.connectionState='connected';
 await (voice as any).sampleStats(peer);assert.match(voice.connectionStatus,/нет новых/);
 peer.pc.packets=5;await (voice as any).sampleStats(peer);assert.match(voice.connectionStatus,/передача/);
 peer.lastOut=Date.now()-6000;await (voice as any).sampleStats(peer);assert.match(voice.connectionStatus,/нет новых/);
 peer.pc.connectionState='failed';peer.pc.onconnectionstatechange();assert.match(voice.connectionStatus,/прервана/);
 voice.stop();assert.equal(voice.micLevel,null);assert.equal(stopped,1);assert.equal(closed,1);assert.equal(disconnected,1);assert.match(voice.connectionStatus,/выключен/);
 console.log('✓ индикатор микрофона, передача и отсутствие пакетов, разрыв связи, очистка');
})().catch(e=>{console.error(e);process.exitCode=1;});
