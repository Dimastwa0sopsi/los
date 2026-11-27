// Радио в машине (T). Поиск станций идёт по открытому каталогу radio-browser.info:
// он отдаёт JSON с CORS, поэтому браузер может искать сам, без игрового сервера.
// Играем только https-потоки: на https-странице браузер блокирует http-звук.
// Если каталог недоступен (нет сети, закрыт), остаётся встроенный список и ручная
// вставка ссылки на поток — радио работает всегда, «любым способом».

import { soundCloudUrl } from './radioSpatial';
import { SoundCloudWidget } from './soundCloudWidget';

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  country?: string;
  genre?: string;
}

/** запасной список: короткие https-потоки, которые не требуют ключей */
const SEED: RadioStation[] = [
  { id: 'seed-1', name: 'SomaFM · Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', country: 'US', genre: 'chill' },
  { id: 'seed-2', name: 'SomaFM · Beat Blender', url: 'https://ice1.somafm.com/beatblender-128-mp3', country: 'US', genre: 'house' },
  { id: 'seed-3', name: 'SomaFM · Deep Space One', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', country: 'US', genre: 'ambient' },
  { id: 'seed-4', name: 'SomaFM · Indie Pop Rocks', url: 'https://ice1.somafm.com/indiepop-128-mp3', country: 'US', genre: 'indie' },
  { id: 'seed-5', name: 'Radio Paradise · Main Mix', url: 'https://stream.radioparadise.com/mp3-128', country: 'US', genre: 'rock' },
  { id: 'seed-6', name: 'Radio Paradise · Mellow', url: 'https://stream.radioparadise.com/mellow-128', country: 'US', genre: 'chill' },
  { id: 'seed-7', name: 'Radio Record · Trance', url: 'https://radiorecord.hostingradio.ru/trance96.aacp', country: 'RU', genre: 'trance' },
  { id: 'seed-8', name: 'Radio Record · Русское', url: 'https://radiorecord.hostingradio.ru/rr96.aacp', country: 'RU', genre: 'pop' },
];

const API = [
  'https://de1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];

export type RadioState = { station: RadioStation | null; playing: boolean; loading: boolean; error: string };

export class Radio {
  private audio: HTMLAudioElement | null = null;
  private cloud: SoundCloudWidget | null = null;
  private outputVolume: number | null = null;
  list: RadioStation[] = [...SEED];
  station: RadioStation | null = null;
  playing = false;
  loading = false;
  error = '';
  volume = 0.7;
  insideVolume = 0.7;
  onChange: (() => void) | null = null;

  private emit() { this.onChange?.(); }

  /** ленивое создание <audio>: браузер разрешает звук только после касания/нажатия */
  private el(): HTMLAudioElement {
    if (!this.audio) {
      const a = new Audio();
      a.preload = 'none';
      a.volume = this.volume;
      a.addEventListener('playing', () => { this.playing = true; this.loading = false; this.error = ''; this.emit(); });
      a.addEventListener('pause', () => { this.playing = false; this.emit(); });
      a.addEventListener('waiting', () => { this.loading = true; this.emit(); });
      a.addEventListener('error', () => {
        this.playing = false; this.loading = false;
        this.error = 'Поток не отвечает — выберите другую станцию';
        this.emit();
      });
      this.audio = a;
    }
    return this.audio;
  }

  state(): RadioState { return { station: this.station, playing: this.playing, loading: this.loading, error: this.error }; }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    this.emit();
  }
  setInsideVolume(v:number) { this.insideVolume=Math.max(0,Math.min(1,v)); this.emit(); }
  /** Effective local loudness is recomputed from source position each frame. */
  setOutputVolume(v: number) { const next=Number.isFinite(v)?Math.max(0,Math.min(1,v)):0; if (this.outputVolume!==null && Math.abs(next-this.outputVolume)<0.002) return; this.outputVolume=next; this.applyVolume(); }
  private applyVolume() { const v=this.outputVolume ?? this.volume; if (this.audio) this.audio.volume=v; this.cloud?.setVolume(v); }

  play(st: RadioStation) {
    this.station = st;
    this.error = '';
    this.loading = true;
    const sc = soundCloudUrl(st.url);
    if (sc) {
      this.audio?.pause(); this.cloud?.destroy();
      this.cloud = new SoundCloudWidget(playing => { this.playing=playing; this.loading=false; if (playing) this.error=''; this.emit(); }, message => { this.playing=false; this.loading=false; this.error=message; this.emit(); }, () => { this.loading=false; this.emit(); });
      void this.cloud.open(sc,this.outputVolume ?? this.volume);
      this.error = 'Если музыка не запустилась, нажмите ▶ в плеере SoundCloud';
      this.emit(); return;
    }
    this.cloud?.destroy(); this.cloud=null;
    const a = this.el();
    a.src = st.url;
    a.volume = this.outputVolume ?? this.volume;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => { this.loading = false; this.error = 'Не удалось включить — нажмите ещё раз'; this.emit(); });
    this.emit();
  }

  resume() { if (this.cloud) this.cloud.play(); else if (this.station) this.play(this.station); }
  pause() { this.audio?.pause(); this.cloud?.pause(); this.playing = false; this.emit(); }
  stop() { this.cloud?.destroy(); this.cloud=null; if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.playing = false; this.loading = false; this.emit(); }
  toggle() {
    if (this.playing) this.pause();
    else if (this.station) this.resume();
    else if (this.list[0]) this.play(this.list[0]);
  }

  next(step = 1) {
    if (!this.list.length) return;
    const i = this.station ? this.list.findIndex((s) => s.id === this.station!.id) : -1;
    const n = ((i + step) % this.list.length + this.list.length) % this.list.length;
    this.play(this.list[n]);
  }

  /** ссылка на поток вручную: «любым способом» */
  playUrl(url: string, name = 'Своя волна') {
    const clean = url.trim();
    let parsed: URL;
    try { parsed = new URL(clean); } catch { this.error = 'Нужна ссылка на поток или публичный трек SoundCloud'; this.emit(); return; }
    if (clean.length > 2048 || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) { this.error = 'Нужна ссылка на поток или публичный трек SoundCloud'; this.emit(); return; }
    const hostname = parsed.hostname.toLowerCase(), sc = soundCloudUrl(clean);
    if ((hostname === 'soundcloud.com' || hostname.endsWith('.soundcloud.com')) && !sc) { this.error = 'Нужна публичная ссылка на трек или плейлист SoundCloud'; this.emit(); return; }
    if (parsed.protocol === 'http:' && typeof location !== 'undefined' && location.protocol === 'https:') {
      this.error = 'На https-странице http-поток браузер блокирует — ищите https-ссылку';
      this.emit();
      return;
    }
    const canonical = sc ?? clean;
    const st: RadioStation = { id: 'custom-' + canonical, name: sc && name === 'Своя волна' ? 'SoundCloud' : name, url: canonical };
    this.list = [st, ...this.list.filter((s) => s.url !== canonical)];
    this.play(st);
  }

  /**
   * Поиск станций по названию, жанру или городу.
   * Каталог отдаёт до 40 станций; берём только https, иначе браузер молчит.
   */
  async search(q: string): Promise<RadioStation[]> {
    const query = q.trim();
    this.loading = true; this.error = ''; this.emit();
    const local = SEED.filter((s) => !query || (s.name + ' ' + (s.genre ?? '')).toLowerCase().includes(query.toLowerCase()));
    if (query.length < 2) { this.list = [...SEED]; this.loading = false; this.emit(); return this.list; }
    for (const host of API) {
      try {
        const u = `${host}/json/stations/search?limit=60&hidebroken=true&order=clickcount&reverse=true&name=${encodeURIComponent(query)}`;
        const r = await fetch(u, { headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const rows = (await r.json()) as { stationuuid: string; name: string; url_resolved: string; country?: string; tags?: string }[];
        const found = rows
          .filter((x) => /^https:\/\//i.test(String(x.url_resolved || '')))
          .map((x) => ({
            id: x.stationuuid,
            name: String(x.name || 'Без названия').trim().slice(0, 48),
            url: String(x.url_resolved),
            country: x.country,
            genre: (x.tags || '').split(',')[0]?.trim().slice(0, 18),
          }));
        this.list = [...local, ...found].slice(0, 50);
        if (!found.length) this.error = 'В каталоге нет https-потоков по этому запросу — попробуйте другое слово';
        this.loading = false; this.emit();
        return this.list;
      } catch { /* следующее зеркало */ }
    }
    // каталог недоступен: играем то, что есть, и говорим об этом честно
    this.list = [...local];
    this.error = local.length ? 'Каталог не отвечает — показаны встроенные станции' : 'Каталог не отвечает, вставьте ссылку на поток';
    this.loading = false; this.emit();
    return this.list;
  }

  dispose() { try { this.stop(); } catch { /* */ } this.onChange = null; this.audio = null; }
}
