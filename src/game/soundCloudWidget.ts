import { soundCloudEmbed } from './radioSpatial';

type Widget = { bind(event:string, cb:()=>void):void; play():void; pause():void; setVolume(value:number):void; seekTo(milliseconds:number):void; getPosition(callback:(milliseconds:number)=>void):void };
type SoundCloudApi = { Widget: ((iframe:HTMLIFrameElement)=>Widget) & {Events:{READY:string;PLAY:string;PAUSE:string;FINISH:string;ERROR:string}} };
declare global { interface Window { SC?: SoundCloudApi } }
let loading: Promise<SoundCloudApi> | null = null;
function loadApi(): Promise<SoundCloudApi> {
  if (window.SC?.Widget) return Promise.resolve(window.SC);
  if (loading) return loading;
  loading = new Promise<SoundCloudApi>((resolve,reject) => {
    const s=document.createElement('script'); s.src='https://w.soundcloud.com/player/api.js'; s.async=true;
    const timer=window.setTimeout(()=>{s.remove();reject(Error('SoundCloud API timeout'));},12000);
    s.onload=()=>{window.clearTimeout(timer); window.SC?.Widget ? resolve(window.SC) : reject(Error('SoundCloud API unavailable'));};
    s.onerror=()=>{window.clearTimeout(timer);s.remove();reject(Error('SoundCloud API unavailable'));};
    document.head.appendChild(s);
  }).catch(error=>{loading=null;throw error;});
  return loading;
}
/** Visible official player: SoundCloud may require the user to press its play button. */
export class SoundCloudWidget {
  private frame: HTMLIFrameElement | null = null;
  private widget: Widget | null = null;
  private generation = 0;
  private volume = 0.7;
  private ready = false;
  private pendingSeek: number | null = null;
  constructor(private onPlaying:(playing:boolean)=>void,private onError:(message:string)=>void,private onReady:()=>void=()=>{}) {}
  async open(url:string,volume:number) {
    const embed=soundCloudEmbed(url); if (!embed) { this.onError('Нужна публичная ссылка SoundCloud на трек или плейлист'); return; }
    this.destroy(); const generation=++this.generation;
    this.volume=Math.max(0,Math.min(1,volume));
    const frame=document.createElement('iframe'); frame.src=embed; frame.title='SoundCloud';
    frame.allow='autoplay'; frame.className='soundcloud-widget'; document.body.appendChild(frame); this.frame=frame;
    try {
      const api=await loadApi(); if (generation!==this.generation) return;
      const widget=api.Widget(frame); this.widget=widget;
      widget.bind(api.Widget.Events.READY,()=>{if(generation!==this.generation)return;this.ready=true;widget.setVolume(Math.round(this.volume*100));if(this.pendingSeek!==null){widget.seekTo(this.pendingSeek);this.pendingSeek=null;}this.onReady();widget.play();});
      widget.bind(api.Widget.Events.PLAY,()=>{if(generation===this.generation)this.onPlaying(true);});
      widget.bind(api.Widget.Events.PAUSE,()=>{if(generation===this.generation)this.onPlaying(false);});
      widget.bind(api.Widget.Events.FINISH,()=>{if(generation===this.generation)this.onPlaying(false);});
      widget.bind(api.Widget.Events.ERROR,()=>{if(generation===this.generation)this.onError('SoundCloud не смог открыть трек: проверьте ссылку и доступность в вашем регионе');});
    } catch { if(generation===this.generation)this.onError('Не удалось подключить управление SoundCloud. Проверьте интернет и нажмите ▶ в плеере'); }
  }
  play(){this.widget?.play();}
  pause(){this.widget?.pause();}
  setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));if(this.ready)this.widget?.setVolume(Math.round(this.volume*100));}
  seekTo(milliseconds:number){
    if(!Number.isFinite(milliseconds)) return;
    const position=Math.max(0,Math.min(86400000,Math.round(milliseconds)));
    if(this.ready && this.widget)this.widget.seekTo(position);else if(this.frame)this.pendingSeek=position;
  }
  getPosition(callback:(milliseconds:number)=>void){
    const widget=this.widget, generation=this.generation;
    if(!widget || !this.ready)return;
    widget.getPosition(value=>{if(generation===this.generation && Number.isFinite(value) && value>=0)callback(value);});
  }
  destroy(){this.generation++;this.ready=false;this.pendingSeek=null;this.widget?.pause();this.widget=null;this.frame?.remove();this.frame=null;}
}
