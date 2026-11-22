// Nearby voice is opt-in on both clients. No media is sent until the browser
// grants microphone access; closing voice stops the microphone immediately.
export type VoiceSignal = { kind: 'hello' | 'offer' | 'answer' | 'ice' | 'bye'; data?: unknown };
export interface VoicePeer { id: number; near: boolean }
export class NearbyVoice {
  active = false;
  starting = false;
  get listeningOnly() { return this.active && !this.stream; }
  private generation = 0;
  private stream: MediaStream | null = null;
  private peers = new Map<number,{pc:RTCPeerConnection;audio:HTMLAudioElement;pending:RTCIceCandidateInit[];created:number}>();
  private nearby = new Set<number>();
  private earlyIce = new Map<number, RTCIceCandidateInit[]>();
  private pulse = 0;
  constructor(private send:(id:number,s:VoiceSignal)=>void, private notice:(s:string)=>void) {}
  async start() {
    if (this.active || this.starting || this.stream) return;
    this.starting=true;
    const generation=++this.generation;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') { this.notice('Голос недоступен в этом браузере или без HTTPS'); this.starting=false; return; }
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if (generation!==this.generation) { stream.getTracks().forEach(t=>t.stop()); return; }
      this.stream=stream;this.active=true;this.pulse=0;
      stream.getAudioTracks().forEach(t=>{t.onended=()=>this.stop();});
      this.notice('🎙 Микрофон включён: вас слышат игроки рядом с включённым голосом');
    } catch { if(generation===this.generation)this.notice('Нет доступа к микрофону'); }
    finally { if(generation===this.generation)this.starting=false; }
  }
  startListening() {
    if (this.active || this.starting) return;
    if (typeof RTCPeerConnection === 'undefined') { this.notice('Голос недоступен в этом браузере'); return; }
    this.active=true; this.pulse=0;
    this.notice('🎧 Прослушивание включено — микрофон выключен');
  }
  stop(){
    ++this.generation; const was=this.active;this.active=false;this.starting=false;
    for(const id of this.peers.keys())this.send(id,{kind:'bye'});
    for(const id of [...this.peers.keys()])this.closePeer(id);
    this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.nearby.clear();this.earlyIce.clear();
    if(was)this.notice('Голос выключен');
  }
  tick(dt:number,me:number|null,players:VoicePeer[]){
    if(!this.active || me===null)return;
    this.nearby=new Set(players.filter(p=>p.near&&p.id!==me).slice(0,8).map(p=>p.id));
    for(const [id,p] of this.peers) if(!this.nearby.has(id) || (p.pc.connectionState !== 'connected' && Date.now()-p.created > 15000)){this.send(id,{kind:'bye'});this.closePeer(id);}
    for(const id of this.earlyIce.keys())if(!this.nearby.has(id))this.earlyIce.delete(id);
    this.pulse-=dt;if(this.pulse<=0){this.pulse=3;for(const id of this.nearby)if(!this.peers.has(id))this.send(id,{kind:'hello'});}
  }
  resumeAudio() { for (const p of this.peers.values()) if (p.audio.srcObject) void p.audio.play().catch(()=>{}); }
  private closePeer(id:number){const p=this.peers.get(id);if(!p)return;this.peers.delete(id);p.pc.onicecandidate=null;p.pc.ontrack=null;p.pc.onconnectionstatechange=null;p.pc.close();p.audio.pause();p.audio.srcObject=null;p.audio.remove();}
  private create(id:number){
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const audio=document.createElement('audio');audio.autoplay=true;audio.setAttribute('playsinline','');
    const peer={pc,audio,pending:[] as RTCIceCandidateInit[],created:Date.now()};this.peers.set(id,peer);
    if (this.stream) for(const track of this.stream.getAudioTracks())pc.addTrack(track,this.stream);
    else pc.addTransceiver('audio',{direction:'recvonly'});
    pc.onicecandidate=e=>{if(e.candidate)this.send(id,{kind:'ice',data:e.candidate.toJSON()});};
    pc.ontrack=e=>{if(!this.active||!this.nearby.has(id))return;audio.srcObject=e.streams[0]??new MediaStream([e.track]);void audio.play().catch(()=>this.notice('Нажмите на экран, чтобы разрешить звук'));};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))this.closePeer(id);};
    return peer;
  }
  async receive(me:number,from:number,s:VoiceSignal){
    if(!this.active || !this.nearby.has(from) || !Number.isSafeInteger(from))return;
    try {
      let p=this.peers.get(from);
      if(s.kind==='bye'){this.closePeer(from);this.earlyIce.delete(from);return;}
      if(s.kind==='ice' && !p && s.data && typeof s.data==='object') { const q=this.earlyIce.get(from)??[]; if(q.length<32)q.push(s.data as RTCIceCandidateInit); this.earlyIce.set(from,q); return; }
      if(s.kind==='hello'){
        if(me>=from || p)return;
        p=this.create(from);const offer=await p.pc.createOffer();await p.pc.setLocalDescription(offer);this.send(from,{kind:'offer',data:p.pc.localDescription?.toJSON()});return;
      }
      if(s.kind==='offer'){
        if(me<from || p || !s.data || typeof s.data!=='object')return;
        p=this.create(from);p.pending.push(...(this.earlyIce.get(from)??[]));this.earlyIce.delete(from);await p.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        const answer=await p.pc.createAnswer();await p.pc.setLocalDescription(answer);this.send(from,{kind:'answer',data:p.pc.localDescription?.toJSON()});
      }else if(s.kind==='answer'){
        if(!p || !s.data || typeof s.data!=='object')return;await p.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
      }else if(s.kind==='ice'){
        if(!p || !s.data || typeof s.data!=='object')return;
        if(p.pc.remoteDescription)await p.pc.addIceCandidate(s.data as RTCIceCandidateInit);else if(p.pending.length<32)p.pending.push(s.data as RTCIceCandidateInit);
      }
      if(p?.pc.remoteDescription){for(const candidate of p.pending.splice(0))await p.pc.addIceCandidate(candidate);}
    }catch{this.closePeer(from);}
  }
}
