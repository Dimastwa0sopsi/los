import { NearbyVoice } from '../src/game/voice';
import { strict as assert } from 'node:assert';
async function main() {
  let resolve!: (s: MediaStream)=>void;
  let stopped=0;
  const track={stop(){stopped++;},onended:null};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]} as unknown as MediaStream;
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r;})}},configurable:true});
  (globalThis as any).RTCPeerConnection=class {};
  const messages:string[]=[];
  const voice=new NearbyVoice(()=>{},m=>messages.push(m));
  const start=voice.start(); assert.equal(voice.starting,true); voice.stop(); resolve(stream); await start;
  assert.equal(stopped,1); assert.equal(voice.active,false); assert.equal(voice.starting,false);
  const next=voice.start(); resolve(stream); await next; assert.equal(voice.active,true);
  voice.stopMicrophone(); assert.equal(stopped,2); assert.equal(voice.active,true); assert.equal(voice.micOn,false);
  voice.stop(); assert.equal(voice.active,false);
  let calls=0;
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{calls++;if(calls===1)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return stream;}}},configurable:true});
  await voice.start();assert.equal(voice.starting,false);assert.equal(voice.micOn,false);assert(messages.some(m=>m.includes('настройках сайта')));
  await voice.start();assert.equal(calls,2);assert.equal(voice.micOn,true);voice.stop();
  console.log('✓ voice permission cancellation, retry after denial and track cleanup');
}
void main();
