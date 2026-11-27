import { soundCloudUrl } from './radioSpatial';
import { SoundCloudWidget } from './soundCloudWidget';

export interface RadioStation { id:string; name:string; url:string; country?:string; genre?:string }
export type RadioState = { station:RadioStation|null; playing:boolean; loading:boolean; error:string };

/** SoundCloud is played only through its official embedded player. */
export class Radio {
  private cloud:SoundCloudWidget|null=null;
  private outputVolume:number|null=null;
  list:RadioStation[]=[];
  station:RadioStation|null=null;
  playing=false; loading=false; error=''; volume=0.7; insideVolume=0.7;
  onChange:(()=>void)|null=null;
  private emit(){this.onChange?.();}
  state():RadioState{return {station:this.station,playing:this.playing,loading:this.loading,error:this.error};}
  getPosition(callback:(milliseconds:number)=>void){this.cloud?.getPosition(callback);}
  setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));this.applyVolume();this.emit();}
  setInsideVolume(v:number){this.insideVolume=Math.max(0,Math.min(1,v));this.emit();}
  setOutputVolume(v:number){const next=Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;if(this.outputVolume!==null&&Math.abs(next-this.outputVolume)<0.002)return;this.outputVolume=next;this.applyVolume();}
  private applyVolume(){this.cloud?.setVolume(this.outputVolume??this.volume);}
  play(st:RadioStation){
    const sc=soundCloudUrl(st.url);
    if(!sc){this.error='Нужна публичная ссылка SoundCloud на трек или плейлист';this.emit();return;}
    this.cloud?.destroy();this.station={...st,url:sc};this.error='';this.loading=true;this.playing=false;
    this.cloud=new SoundCloudWidget(playing=>{this.playing=playing;this.loading=false;if(playing)this.error='';this.emit();},message=>{this.playing=false;this.loading=false;this.error=message;this.emit();},()=>{this.loading=false;this.emit();});
    void this.cloud.open(sc,this.outputVolume??this.volume);
    this.error='Если музыка не запустилась, нажмите ▶ в плеере SoundCloud';this.emit();
  }
  playUrl(url:string,name='SoundCloud'){
    const sc=soundCloudUrl(url);
    if(!sc){this.error='Нужна публичная ссылка SoundCloud на трек или плейлист';this.emit();return;}
    const st:RadioStation={id:'custom-'+sc,name,url:sc};
    this.list=[st,...this.list.filter(s=>s.url!==sc)];this.play(st);
  }
  resume(){if(this.cloud)this.cloud.play();else if(this.station)this.play(this.station);}
  pause(){this.cloud?.pause();this.playing=false;this.emit();}
  stop(){this.cloud?.destroy();this.cloud=null;this.playing=false;this.loading=false;this.emit();}
  toggle(){if(this.playing)this.pause();else if(this.station)this.resume();else if(this.list[0])this.play(this.list[0]);}
  next(step=1){if(!this.list.length)return;const i=this.station?this.list.findIndex(s=>s.url===this.station!.url):-1;const n=((i+step)%this.list.length+this.list.length)%this.list.length;this.play(this.list[n]);}
  dispose(){try{this.stop();}catch{/* */}this.onChange=null;}
}
