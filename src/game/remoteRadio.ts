import {SoundCloudWidget} from './soundCloudWidget';
import {radioGain, soundCloudUrl, type RadioListener, type RadioPlace} from './radioSpatial';
import type {NetworkRadio} from './net';

type Player = {widget:SoundCloudWidget; state:NetworkRadio; received:number; lastCorrection:number; playing:boolean; slot:number};
/** A separate official player per nearby source; no audio is relayed by the game server. */
export class RemoteRadios {
  private sources:NetworkRadio[]=[];
  private players=new Map<number,Player>();
  private received=0;
  private lastHint=0;
  constructor(private onIncoming:()=>void=()=>{}) {}
  apply(sources:NetworkRadio[], self:number|null) {
    this.received=Date.now();
    this.sources=sources.filter(s=>s && Number.isSafeInteger(s.owner) && s.owner>0 && s.owner!==self && (s.kind==='vehicle'||s.kind==='computer') && typeof s.url==='string' && !!soundCloudUrl(s.url) && [s.x,s.z,s.exteriorX,s.exteriorZ,s.position,s.outside,s.inside].every(Number.isFinite) && s.position>=0 && s.position<=86400000 && s.outside>=0 && s.outside<=1 && s.inside>=0 && s.inside<=1 && typeof s.playing==='boolean' && (s.kind!=='computer'||Number.isSafeInteger(s.buildingId)));
  }
  update(listener:RadioListener, passengerOwner:number|null) {
    if(Date.now()-this.received>8000)this.sources=[];
    const candidates=this.sources.map(s=>{
      const place:RadioPlace=s.kind==='vehicle'?{kind:'vehicle',x:s.x,z:s.z,vehicleId:String(s.owner)}:{kind:'computer',x:s.x,z:s.z,exteriorX:s.exteriorX,exteriorZ:s.exteriorZ,buildingId:s.buildingId!};
      const l={...listener,vehicleId:passengerOwner===s.owner?String(s.owner):null};
      return {s,gain:radioGain(place,l,s.outside,s.inside)};
    }).filter(x=>x.gain>0.001 && x.s.playing).sort((a,b)=>b.gain-a.gain).slice(0,3);
    const selected=new Set(candidates.map(c=>c.s.owner));
    for(const [id,p] of this.players)if(!selected.has(id)){p.widget.destroy();this.players.delete(id);}
    for(const {s,gain} of candidates){
      let p=this.players.get(s.owner);
      if(p && p.state.url!==s.url){p.widget.destroy();this.players.delete(s.owner);p=undefined;}
      if(!p){
        const occupied=new Set([...this.players.values()].map(p=>p.slot));
        const slot=[0,1,2].find(n=>!occupied.has(n)) ?? 0;
        const player:Player={widget:null!,state:s,received:this.received,lastCorrection:0,playing:false,slot};
        player.widget=new SoundCloudWidget(playing=>{player.playing=playing;},()=>{},()=>{
          const pos=player.state.position+Math.max(0,Date.now()-player.received);
          player.widget.seekTo(pos);player.widget.play();
        },false,slot);
        this.players.set(s.owner,player); void player.widget.open(s.url,gain); p=player;
        if(Date.now()-this.lastHint>30000){this.lastHint=Date.now();this.onIncoming();}
      }
      p.state=s;p.received=this.received;p.widget.setVolume(gain);
      if(p.playing && Date.now()-p.lastCorrection>10000){
        p.lastCorrection=Date.now();const current=p;
        p.widget.getPosition(pos=>{if(this.players.get(s.owner)!==current)return;const target=current.state.position+Math.max(0,Date.now()-current.received);if(Math.abs(pos-target)>2500)current.widget.seekTo(target);});
      }
    }
  }
  clear(){for(const p of this.players.values())p.widget.destroy();this.players.clear();this.sources=[];}
}
