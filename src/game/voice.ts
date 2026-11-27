// Receiving is automatic online; microphone capture always requires permission.
export type VoiceSignal = { kind: 'hello' | 'offer' | 'answer' | 'ice' | 'bye'; data?: unknown };
export interface VoicePeer { id: number; near: boolean; distance?: number }
export function microphoneError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as {name:unknown}).name) : '';
  if(name==='NotAllowedError' || name==='PermissionDeniedError' || name==='SecurityError') return 'Доступ к микрофону запрещён. Разрешите его в настройках сайта и устройства, затем нажмите ещё раз.';
  if(name==='NotFoundError' || name==='DevicesNotFoundError') return 'Микрофон не найден. Проверьте подключение и настройки устройства.';
  if(name==='NotReadableError' || name==='TrackStartError') return 'Микрофон занят или недоступен. Закройте другие приложения и попробуйте снова.';
  return 'Не удалось включить микрофон. Проверьте разрешения сайта и попробуйте снова.';
}
export function voiceDistanceGain(distance: number): number {
  return Number.isFinite(distance) ? Math.max(0,Math.min(1,1-Math.max(0,distance)/40)) : 0;
}
export class NearbyVoice {
  active = false;
  starting = false;
  get micOn() { return !!this.stream; }
  private generation = 0;
  private stream: MediaStream | null = null;
  private peers = new Map<number,{pc:RTCPeerConnection;audio:HTMLAudioElement;pending:RTCIceCandidateInit[];created:number}>();
  private nearby = new Set<number>();
  private gains = new Map<number,number>();
  private earlyIce = new Map<number, RTCIceCandidateInit[]>();
  private pulse = 0;
  private volume = 1;
  constructor(private send:(id:number,s:VoiceSignal)=>void, private notice:(s:string)=>void) {}
  async start() {
    if (this.starting || this.stream) return;
    if (!this.active) this.startListening();
    if (!this.active) return;
    this.starting=true;
    const generation=++this.generation;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') { this.notice('Голос недоступен в этом браузере или без HTTPS'); this.starting=false; return; }
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if (generation!==this.generation) { stream.getTracks().forEach(t=>t.stop()); return; }
      this.stream=stream;this.resetPeers();
      stream.getAudioTracks().forEach(t=>{t.onended=()=>this.stopMicrophone();});
      this.notice('🎙 Микрофон включён: вас слышат игроки рядом');
    } catch (error) { if(generation===this.generation)this.notice(microphoneError(error)); }
    finally { if(generation===this.generation)this.starting=false; }
  }
  startListening() {
    if (this.active) return;
    if (typeof RTCPeerConnection === 'undefined') { this.notice('Голос недоступен в этом браузере'); return; }
    this.active=true; this.pulse=0;
    if (typeof window !== 'undefined') { window.addEventListener('pointerdown', this.resumeOnGesture, true); window.addEventListener('keydown', this.resumeOnGesture, true); }
  }
  private resumeOnGesture = () => this.resumeAudio();
  private resetPeers(){
    for(const id of this.peers.keys()) this.send(id,{kind:'bye'});
    for(const id of [...this.peers.keys()]) this.closePeer(id);
    this.earlyIce.clear(); this.pulse=0;
  }
  stopMicrophone(){
    ++this.generation; const was=!!this.stream || this.starting; this.starting=false;
    this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();}); this.stream=null;
    if (was) { this.resetPeers(); this.notice('🎙 Микрофон выключен'); }
  }
  stop(){
    this.stopMicrophone(); this.active=false; this.resetPeers(); this.nearby.clear(); this.gains.clear();
    if (typeof window !== 'undefined') { window.removeEventListener('pointerdown', this.resumeOnGesture, true); window.removeEventListener('keydown', this.resumeOnGesture, true); }
  }
  tick(dt:number,me:number|null,players:VoicePeer[]){
    if(!this.active || me===null)return;
    const nearPlayers=players.filter(p=>p.near&&p.id!==me);
    this.nearby=new Set(nearPlayers.map(p=>p.id));
    this.gains=new Map(nearPlayers.map(p=>[p.id,p.distance===undefined?1:voiceDistanceGain(p.distance)]));
    for(const [id,p] of this.peers) p.audio.volume=this.volume*(this.gains.get(id)??0);
    for(const [id,p] of this.peers) if(!this.nearby.has(id) || (p.pc.connectionState !== 'connected' && Date.now()-p.created > 15000)){this.send(id,{kind:'bye'});this.closePeer(id);}
    for(const id of this.earlyIce.keys())if(!this.nearby.has(id))this.earlyIce.delete(id);
    this.pulse-=dt;if(this.pulse<=0){this.pulse=3;for(const id of this.nearby)if(!this.peers.has(id))this.send(id,{kind:'hello',data:{speaking:this.micOn}});}
  }
  setVolume(value:number) { this.volume = Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : 1; for (const [id,p] of this.peers) p.audio.volume=this.volume*(this.gains.get(id)??0); }
  resumeAudio() { for (const p of this.peers.values()) if (p.audio.srcObject) void p.audio.play().catch(()=>{}); }
  private closePeer(id:number){const p=this.peers.get(id);if(!p)return;this.peers.delete(id);p.pc.onicecandidate=null;p.pc.ontrack=null;p.pc.onconnectionstatechange=null;p.pc.close();p.audio.pause();p.audio.srcObject=null;p.audio.remove();}
  private create(id:number){
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const audio=document.createElement('audio');audio.volume=this.volume*(this.gains.get(id)??0);audio.autoplay=true;audio.setAttribute('playsinline','');
    // Some mobile browsers require the audio element to be attached to the page.
    audio.hidden=true; document.body.appendChild(audio);
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
        if(me>=from || p || (!this.micOn && (s.data as {speaking?:boolean} | undefined)?.speaking === false))return;
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
