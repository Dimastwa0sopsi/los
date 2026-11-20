// Реклама на щитах Лос-Города.
//
// Щит — обычный игровой объект: место (координаты, размер, цена часа) живёт в
// worldgen, каркас — в worldMesh, а здесь хранится сам текст объявления, его
// срок и картинка на панели. Аренда — 1 час игрового времени СМИ (реальный час
// на сервере/Live): игрок платит в СМИ, пишет текст (с модерацией) и щит
// начинает показывать его рекламу. Через час место снова свободно.
import * as THREE from 'three';
import type { WorldLayout } from './worldgen';

export type BillboardDef = WorldLayout['billboards'][number];

export const AD_HOUR = 60 * 60 * 1000;              // час аренды
export const AD_STORE_KEY = 'losgorod_ads';

/** оформление объявления: цвет и подпись */
export const AD_TAGS = [
  { id: 'biz', name: 'Бизнес', color: '#0ea5e9' },
  { id: 'sale', name: 'Распродажа', color: '#f97316' },
  { id: 'job', name: 'Работа', color: '#22c55e' },
  { id: 'fun', name: 'Отдых', color: '#a855f7' },
  { id: 'auto', name: 'Авто', color: '#ef4444' },
] as const;
export type AdTag = typeof AD_TAGS[number]['id'];

export interface Ad {
  text: string;
  tag: AdTag;
  who: string;
  /** до какого времени (ms) щит занят */
  until: number;
}

const tagColor = (t: string) => AD_TAGS.find((x) => x.id === t)?.color ?? '#0ea5e9';
const tagName = (t: string) => AD_TAGS.find((x) => x.id === t)?.name ?? 'Реклама';

/** перенос длинного текста по словам под ширину полотна */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (g.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; if (lines.length === maxLines - 1) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

export class AdsSystem {
  defs: BillboardDef[];
  private faces = new Map<string, THREE.Mesh>();
  private ads = new Map<string, Ad>();
  private textures = new Map<string, THREE.CanvasTexture>();
  private placeholder: THREE.CanvasTexture | null = null;
  onExpire: ((id: string) => void) | null = null;

  constructor(defs: BillboardDef[], faces: { id: string; mesh: THREE.Mesh }[]) {
    this.defs = defs;
    for (const f of faces) {
      this.faces.set(f.id, f.mesh);
      const m = f.mesh.material as THREE.MeshStandardMaterial;
      m.side = THREE.FrontSide;
      f.mesh.userData.billboard = f.id;
    }
    this.load();
    for (const d of defs) this.paint(d.id);
  }

  def(id: string) { return this.defs.find((d) => d.id === id) ?? null; }
  ad(id: string): Ad | null {
    const a = this.ads.get(id);
    if (!a) return null;
    if (a.until <= Date.now()) { this.ads.delete(id); this.save(); return null; }
    return a;
  }
  /** сколько минут осталось */
  leftMin(id: string): number {
    const a = this.ad(id);
    return a ? Math.max(0, Math.ceil((a.until - Date.now()) / 60000)) : 0;
  }
  isBusy(id: string) { return !!this.ad(id); }
  /** все занятые щиты — для списка в СМИ */
  busy(): { def: BillboardDef; ad: Ad }[] {
    const out: { def: BillboardDef; ad: Ad }[] = [];
    for (const d of this.defs) { const a = this.ad(d.id); if (a) out.push({ def: d, ad: a }); }
    return out;
  }
  /** поставить объявление: до конца часа, текст уже проверен модерацией */
  place(id: string, text: string, tag: AdTag, who: string): boolean {
    if (!this.def(id)) return false;
    this.ads.set(id, { text, tag, who, until: Date.now() + AD_HOUR });
    this.paint(id); this.save();
    return true;
  }
  clear(id: string) { if (this.ads.delete(id)) { this.paint(id); this.save(); } }
  /**
   * Сервер прислал общий список объявлений — он главный: щиты видят все игроки.
   * Локальные записи заменяются, чтобы не висели «свои» объявления после
   * окончания аренды или снятия с другого устройства.
   */
  applyRemote(remote: Record<string, { text: string; tag: string; who: string; until: number }>) {
    const now = Date.now();
    this.ads.clear();
    for (const [id, a] of Object.entries(remote ?? {})) {
      if (!a || typeof a.text !== 'string' || !(a.until > now)) continue;
      this.ads.set(id, { text: a.text, tag: (AD_TAGS.some((t) => t.id === a.tag) ? a.tag : 'biz') as AdTag, who: a.who, until: a.until });
    }
    for (const d of this.defs) this.paint(d.id);
    this.save();
  }

  update() {
    const now = Date.now();
    for (const [id, a] of [...this.ads]) {
      if (a.until <= now) { this.ads.delete(id); this.paint(id); this.save(); this.onExpire?.(id); }
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(AD_STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, Ad>;
      for (const [id, a] of Object.entries(data)) {
        if (!a || typeof a.text !== 'string' || !Number.isFinite(a.until)) continue;
        if (a.until > Date.now()) this.ads.set(id, a);
      }
    } catch { /* приватный режим — просто без рекламы */ }
  }
  private save() {
    try {
      const obj: Record<string, Ad> = {};
      for (const [id, a] of this.ads) obj[id] = a;
      localStorage.setItem(AD_STORE_KEY, JSON.stringify(obj));
    } catch { /* нечего сохранять */ }
  }

  /** пустое место: «здесь может быть ваша реклама» */
  private emptyTex(): THREE.CanvasTexture {
    if (this.placeholder) return this.placeholder;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 1024, 512);
    grad.addColorStop(0, '#132033'); grad.addColorStop(1, '#0b1220');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = 'rgba(148,163,184,.35)'; g.lineWidth = 10; g.setLineDash([26, 18]);
    g.strokeRect(22, 22, 980, 468); g.setLineDash([]);
    g.textAlign = 'center';
    g.fillStyle = '#93a3bb'; g.font = 'bold 62px system-ui, sans-serif';
    g.fillText('МЕСТО ДЛЯ РЕКЛАМЫ', 512, 236);
    g.fillStyle = '#5b6b84'; g.font = '36px system-ui, sans-serif';
    g.fillText('СМИ Лос-Города · аренда на 1 час', 512, 306);
    g.fillStyle = '#7c3aed'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillText('телефон → сервисы → 📰 СМИ', 512, 380);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    this.placeholder = t;
    return t;
  }

  /** нарисовать панель: объявление или заглушка */
  private paint(id: string) {
    const mesh = this.faces.get(id);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const ad = this.ad(id);
    if (!ad) { mat.map = this.emptyTex(); mat.needsUpdate = true; return; }
    let tex = this.textures.get(id);
    if (!tex) {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
      tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      this.textures.set(id, tex);
    }
    const g = tex.image.getContext('2d') as CanvasRenderingContext2D;
    const color = tagColor(ad.tag);
    const grad = g.createLinearGradient(0, 0, 1024, 512);
    grad.addColorStop(0, color); grad.addColorStop(1, '#0b1220');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0, 0, 1024, 512);
    // цветная плашка-тег
    g.fillStyle = color; g.fillRect(0, 0, 1024, 84);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.font = 'bold 44px system-ui, sans-serif';
    g.fillText(tagName(ad.tag).toUpperCase(), 40, 58);
    g.textAlign = 'right'; g.font = 'bold 34px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillText('РЕКЛАМА', 986, 58);
    // основной текст
    g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = 'bold 92px system-ui, sans-serif';
    let lines = wrap(g, ad.text, 900, 3);
    if (lines.length > 2) g.font = 'bold 76px system-ui, sans-serif';
    lines = wrap(g, ad.text, 900, 3);
    const lh = 104, startY = 250 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => g.fillText(ln, 512, startY + i * lh));
    // подпись
    g.fillStyle = 'rgba(255,255,255,.72)'; g.font = '34px system-ui, sans-serif';
    g.fillText(ad.who ? `заказчик: ${ad.who}` : 'частное объявление', 512, 462);
    tex.needsUpdate = true;
    mat.map = tex; mat.needsUpdate = true;
  }
}
