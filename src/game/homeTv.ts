import * as THREE from 'three';

// Same-origin media in public/: relative to the deployed game page, including
// GitHub Pages project subpaths. No third-party host or CORS required.
export const HOME_TV_VIDEO = './media/home-tv.mp4';

export class HomeTv {
  private video: HTMLVideoElement | null = null;
  private texture: THREE.VideoTexture | null = null;
  private generation = 0;
  get isOn() { return this.video !== null; }
  constructor(private screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>) {}
  start(notice: (text:string)=>void) {
    this.stop();
    const generation=++this.generation;
    const video=document.createElement('video');this.video=video;
    video.crossOrigin='anonymous';video.playsInline=true;video.loop=true;video.preload='auto';video.src=HOME_TV_VIDEO;
    video.onerror=()=>{if(this.video!==video || this.generation!==generation)return;this.stop();notice('Телевизор: видео недоступно или хостинг не разрешает его загрузку.');};
    const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.SRGBColorSpace;this.texture=texture;
    this.screen.material.map=texture;this.screen.material.color.set('#ffffff');this.screen.material.needsUpdate=true;
    // Attempt sound after the interaction. Browsers can block audible autoplay;
    // in that case show the video muted instead of leaving the screen blank.
    void video.play().catch(async()=>{
      if(this.video!==video || this.generation!==generation)return;
      video.muted=true;
      try {await video.play();if(this.video===video && this.generation===generation)notice('Телевизор включён без звука: браузер заблокировал автозапуск звука.');}
      catch {if(this.video===video && this.generation===generation){this.stop();notice('Телевизор: не удалось воспроизвести видео.');}}
    });
  }
  stop() {
    this.generation++;
    if(this.video){this.video.onerror=null;this.video.pause();this.video.removeAttribute('src');this.video.load();this.video=null;}
    this.screen.material.map=null;this.screen.material.color.set('#111827');this.screen.material.needsUpdate=true;
    this.texture?.dispose();this.texture=null;
  }
  dispose(){this.stop();this.screen.material.dispose();}
}
