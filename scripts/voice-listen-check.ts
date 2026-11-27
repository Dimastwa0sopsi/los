import { strict as assert } from 'node:assert';
import { NearbyVoice, type VoiceSignal } from '../src/game/voice';
let requests=0; let stopped=0;
const track:any={stop(){stopped++;},onended:null};
const stream:any={getTracks:()=>[track],getAudioTracks:()=>[track]};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{requests++;return stream;}}},configurable:true});
const pcs:MockPC[]=[]; const audios:any[]=[];
class MockPC {
  connectionState='new'; remoteDescription:any=null; localDescription:any=null; onicecandidate:any; ontrack:any; onconnectionstatechange:any;
  tracks=0; receiving=false; closed=false;
  constructor(){pcs.push(this);}
  addTrack(){this.tracks++;} addTransceiver(kind:string, options:any){assert.equal(kind,'audio');assert.equal(options.direction,'recvonly');this.receiving=true;}
  async createOffer(){return {type:'offer',sdp:'offer'};} async createAnswer(){return {type:'answer',sdp:'answer'};}
  async setLocalDescription(d:any){this.localDescription={...d,toJSON(){return d;}};} async setRemoteDescription(d:any){this.remoteDescription=d;}
  async addIceCandidate(){} close(){this.closed=true;}
}
(globalThis as any).RTCPeerConnection=MockPC;
(globalThis as any).document={body:{appendChild(){}},createElement:()=>{const audio={volume:1,autoplay:false,srcObject:null,setAttribute(){},play:async()=>{},pause(){},remove(){}};audios.push(audio);return audio;}};
async function run(listenerId:number){
 const q:{from:number,to:number,signal:VoiceSignal}[]=[];
 const voices:Record<number,NearbyVoice>={};
 for(const id of [1,2])voices[id]=new NearbyVoice((to,signal)=>q.push({from:id,to,signal}),()=>{});
 const senderId=listenerId===1?2:1;
 voices[listenerId].startListening(); assert(voices[listenerId].active && !voices[listenerId].micOn);const before=requests;
 await voices[senderId].start();assert.equal(requests,before+1);
 for(const id of [1,2])voices[id].tick(0,id,[{id:3-id,near:true}]);
 while(q.length){const m=q.shift()!;await voices[m.to].receive(m.to,m.from,m.signal);}
 voices[listenerId].setVolume(0.3); assert(audios.some(a=>a.volume===0.3));
 voices[listenerId].tick(0,listenerId,[{id:senderId,near:true,distance:20}]);assert(audios.some(a=>Math.abs(a.volume-0.15)<1e-9));
 assert(pcs.some(p=>p.receiving)); assert(pcs.some(p=>p.tracks===1)); assert(pcs.filter(p=>p.remoteDescription).length>=2);
 voices[listenerId].tick(0,listenerId,[{id:senderId,near:false}]);assert(pcs.some(p=>p.closed));
 voices[senderId].stopMicrophone(); assert(voices[senderId].active && !voices[senderId].micOn);
 voices[1].stop();voices[2].stop();
}
(async()=>{await run(1);pcs.length=0;audios.length=0;await run(2);assert.equal(stopped,2);console.log('✓ прослушивание без микрофона, переговоры при обоих порядках ID и выход из радиуса');})().catch(e=>{console.error(e);process.exitCode=1});
