// Интерьеры: отдельные помещения с полом, стенами, потолком, светом, мебелью и коллизиями.
// Все сцены переделаны: у каждой свой план, материалы, мебель и подсветка.
import * as THREE from 'three';
import { Batcher, T, M } from './geom';
import type { Box } from './worldgen';
import { INTERIOR_ORIGIN } from './config';
import { dressInterior } from './interiorDetail';

export interface Interact { x: number; z: number; r: number; label: string; action: string; y?: number }
export interface Interior {
  group: THREE.Group; colliders: Box[]; acts: Interact[]; spawn: { x: number; z: number; a: number; y?: number };
  npcs: { x: number; z: number; a: number; role: string }[]; bounds: { x0: number; x1: number; z0: number; z1: number; h: number };
  /** лампы интерьера: бар меняет их цвет на диско-свет */
  lights: THREE.Light[];
  bed?: { x: number; z: number; y: number; a: number }; doorSpots: Record<string, { x: number; z: number; a: number; y: number }>;
  pots?: { x: number; z: number }[];
  /** динамические объекты интерьера (анимируются игрой): вагонетки шахты */
  carts?: THREE.Object3D[];
  /** что получилось при сборке: пригодится проверкам и отладке */
  stats: { meshes: number; signs: number; fixtures: number; doors: number; windows: number };
  dispose: () => void;
}
export type EntrStyle = 'glass' | 'wood' | 'metal';
export type InteriorKind = 'shop24' | 'supermarket' | 'cafe' | 'pharmacy' | 'gunshop' | 'clothes' | 'barber' | 'police' | 'hospital' | 'cityhall' | 'bank' | 'fishshop' |
  'dealer' | 'service' | 'mall' | 'hall' | 'apt_eco' | 'apt_mid' | 'apt_lux' | 'house_city' | 'house_village' | 'vshop' | 'vpharmacy' | 'vguntruck' | 'vadmin' | 'checkpoint' | 'fire' | 'gas' | 'mallfood' | 'basement' | 'banya' | 'truckoffice' | 'office' | 'scootershop' | 'greenhouse' | 'bar' | 'ozgim' | 'mine' | 'casino';

export const WALLS = {
  white: 'c:#f1efe9', beige: 'c:#e8dcc4', mint: 'c:#d1e7dd', grey: 'c:#d4d4d8', blue: 'c:#c7d2fe', wood: 'c:#b08060', dark: 'c:#3f3f46',
  pink: 'c:#fbcfe8', brick: 'tex:brickwall', paper: 'tex:wallpaper', paperPink: 'c:#f3d7e3', tile: 'tex:walltile', panel: 'tex:woodpanel',
  clinic: 'c:#e6f0f4', olive: 'tex:woodpanel', sand: 'c:#e7dcc7', night: 'c:#1e1b2e',
};
export const GOODS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#eab308', '#ec4899', '#0ea5e9'];

export class IB {
  b = new Batcher(); cols: Box[] = []; acts: Interact[] = []; npcs: Interior['npcs'] = []; lights: THREE.Light[] = []; group = new THREE.Group();
  ox = INTERIOR_ORIGIN.x; oz = INTERIOR_ORIGIN.z; doorSpots: Interior['doorSpots'] = {};
  bed?: Interior['bed']; pots: { x: number; z: number }[] = []; carts: THREE.Object3D[] = [];
  /** сколько вывесок, светильников и дверей нарисовали — для проверок */
  signs = 0; fixtures = 0; doors = 0; windows = 0;
  residential = false; retail = false;

  floor(x0: number, z0: number, x1: number, z1: number, mk: string, s = 2, y = 0) { this.b.add(mk, T.box, M(this.ox + (x0 + x1) / 2, y - 0.05, this.oz + (z0 + z1) / 2, 0, x1 - x0, 0.1, z1 - z0), s); }
  ceil(x0: number, z0: number, x1: number, z1: number, h: number, c = '#f4f4f0') { this.b.add('c:' + c, T.box, M(this.ox + (x0 + x1) / 2, h + 0.05, this.oz + (z0 + z1) / 2, 0, x1 - x0, 0.1, z1 - z0)); }
  col(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) { this.cols.push({ x0: this.ox + Math.min(x0, x1), x1: this.ox + Math.max(x0, x1), z0: this.oz + Math.min(z0, z1), z1: this.oz + Math.max(z0, z1), y0, y1 }); }
  /** осевая стена с дверными проёмами [центр, ширина] */
  wall(x0: number, z0: number, x1: number, z1: number, h: number, mk: string, doors: [number, number][] = [], y0 = 0) {
    const horiz = Math.abs(z1 - z0) < 0.01;
    const a = horiz ? Math.min(x0, x1) : Math.min(z0, z1), bb = horiz ? Math.max(x0, x1) : Math.max(z0, z1);
    const segs: [number, number][] = []; let cur = a;
    const ds = [...doors].sort((p, q) => p[0] - q[0]);
    for (const [c, w] of ds) { segs.push([cur, c - w / 2]); cur = c + w / 2; }
    segs.push([cur, bb]);
    const t = 0.2;
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.02) continue;
      const m = (s0 + s1) / 2, L = s1 - s0;
      if (horiz) { this.b.add(mk, T.box, M(this.ox + m, y0 + h / 2, this.oz + z0, 0, L, h, t), 2.5); this.col(s0, z0 - t / 2, s1, z0 + t / 2, y0, y0 + h); }
      else { this.b.add(mk, T.box, M(this.ox + x0, y0 + h / 2, this.oz + m, 0, t, h, L), 2.5); this.col(x0 - t / 2, s0, x0 + t / 2, s1, y0, y0 + h); }
    }
    for (const [c, w] of ds) { // перемычка + наличник
      const lh = h - 2.3;
      if (horiz) { this.b.add(mk, T.box, M(this.ox + c, y0 + 2.3 + lh / 2, this.oz + z0, 0, w, lh, t), 2.5); this.b.add('c:#e7e5e4', T.box, M(this.ox + c, y0 + 2.32, this.oz + z0, 0, w + 0.2, 0.08, t + 0.04)); }
      else { this.b.add(mk, T.box, M(this.ox + x0, y0 + 2.3 + lh / 2, this.oz + c, 0, t, lh, w), 2.5); this.b.add('c:#e7e5e4', T.box, M(this.ox + x0, y0 + 2.32, this.oz + c, 0, t + 0.04, 0.08, w + 0.2)); }
    }
  }
  /** Общие детали помещений: в жилье — только бытовые вещи, в общественных местах — навигация. */
  common(W: number, D: number, H: number, kind: string) {
    this.f('c:#3f3f46', 0, 0.004, D / 2 - 1.15, 1.9, 0.012, 1.0, false);
    if (this.residential) return;
    this.plane('sign:ВЫХОД|#166534', 0, 2.55, D / 2 - 0.16, 0.92, 0.26, Math.PI);
    this.b.add('glow:#22c55e', T.box, M(this.ox, 2.66, this.oz + D / 2 - 0.18, 0, 0.98, 0.05, 0.05));
    this.cyl('c:#b91c1c', W / 2 - 0.42, 0.32, D / 2 - 1.5, 0.11, 0.62);
    if (W > 7) {
      this.f('c:#f8fafc', W / 2 - 0.12, H * 0.6, -0.4, 0.04, 0.38, 0.38, false);
      this.f('c:#111827', W / 2 - 0.15, H * 0.6 + 0.18, -0.4, 0.02, 0.02, 0.13, false);
    }
    for (const [vx, vz] of [[-W * 0.28, -D * 0.28], [W * 0.28, D * 0.24]] as const)
      this.f('c:#9ca3af', vx, H - 0.05, vz, 0.7, 0.04, 0.45, false);
    this.plane('sign:ПЛАН ЭВАКУАЦИИ|#0e7490', -W / 2 + 0.5, 1.7, D / 2 - 1.9, 0.7, 0.5, Math.PI);
    void kind;
  }
  /** мебель: y — низ */
  f(mk: string, x: number, y: number, z: number, w: number, h: number, d: number, collide = true, ry = 0) {
    this.b.add(mk, T.box, M(this.ox + x, y + h / 2, this.oz + z, ry, w, h, d));
    if (collide) { const rw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d, rd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d; this.col(x - rw / 2, z - rd / 2, x + rw / 2, z + rd / 2, y, y + h); }
  }
  cyl(mk: string, x: number, y: number, z: number, r: number, h: number, collide = false) { this.b.add(mk, T.cylB, M(this.ox + x, y, this.oz + z, 0, r, h, r)); if (collide) this.col(x - r, z - r, x + r, z + r, y, y + h); }
  plane(mk: string, x: number, y: number, z: number, w: number, h: number, ry: number) {
    if (mk.startsWith('sign:')) this.signs++;
    this.b.add(mk, T.plane, M(this.ox + x, y, this.oz + z, ry, w, h, 1));
  }
  act(x: number, z: number, r: number, label: string, action: string, y = 0) { this.acts.push({ x: this.ox + x, z: this.oz + z, r, label, action, y }); }
  /** геометрия светильника без источника света: большие залы освещаем мало
   *  реальными лампами, а «видимых» светильников ставим по сетке — так кадры целы */
  lamp(x: number, y: number, z: number, panel = true) { this.fixtureGeom(x, y, z, panel); this.fixtures++; }
  private fixtureGeom(x: number, y: number, z: number, panel: boolean) {
    if (panel) {
      // офисная панель: широкий короб под потолком, светящаяся плёнка снизу
      this.b.add('c:#e5e7eb', T.box, M(this.ox + x, y + 0.16, this.oz + z, 0, 1.35, 0.1, 1.35));
      this.b.add('glow:#fffaf0', T.box, M(this.ox + x, y + 0.1, this.oz + z, 0, 1.24, 0.03, 1.24));
      this.b.add('c:#cbd5e1', T.box, M(this.ox + x, y + 0.22, this.oz + z, 0, 1.4, 0.04, 1.4));
    } else {
      // подвес: трос, чашка, плафон, лампочка
      this.b.add('c:#57534e', T.box, M(this.ox + x, y + 0.42, this.oz + z, 0, 0.04, 0.5, 0.04));
      this.b.add('c:#334155', T.cylB, M(this.ox + x, y + 0.2, this.oz + z, 0, 0.3, 0.12, 0.3));
      this.b.add('glow:#fff8e7', T.cylB, M(this.ox + x, y + 0.06, this.oz + z, 0, 0.26, 0.22, 0.26));
      this.b.add('c:#1f2937', T.cylB, M(this.ox + x, y + 0.2, this.oz + z, 0, 0.06, 0.06, 0.06));
    }
  }
  /** светильник: геометрия + сам источник света */
  light(x: number, y: number, z: number, i = 1.4, c = 0xfff1d6, dist = 18, panel = false) {
    const l = new THREE.PointLight(c, i, dist, 1.3); l.position.set(this.ox + x, y, this.oz + z); this.group.add(l); this.lights.push(l);
    this.fixtures++;
    this.fixtureGeom(x, y, z, panel);
  }
  npc(x: number, z: number, a: number, role: string) { this.npcs.push({ x: this.ox + x, z: this.oz + z, a, role }); }
  /** входная группа: тамбур, стеклянные створки в раме, фрамуга, боковые стёкла,
   *  порог, доводчик, таблички «ОТКРЫТО» и часы работы. Стиль зависит от здания. */
  entrance(w: number, d: number, h: number, style: EntrStyle = 'glass') {
    const z = d / 2 - 0.13, OW = style === 'glass' ? 3.6 : 2.2;
    this.doors++;
    // порог, наличники и перекладина проёма
    this.f('c:#a8a29e', 0, 0.001, d / 2 - 0.02, OW + 0.34, 0.02, 0.4, false);
    for (const sx of [-1, 1]) this.f('c:#d6d3d1', sx * (OW / 2 + 0.07), 0, d / 2 - 0.11, 0.14, 2.6, 0.26, false);
    this.f('c:#d6d3d1', 0, 2.46, d / 2 - 0.11, OW + 0.28, 0.16, 0.26, false);
    // козырёк над входом изнутри: узкая светящаяся полоса
    this.f('glow:#fef3c7', 0, 2.62, d / 2 - 0.42, OW - 0.2, 0.05, 0.16, false);
    this.b.add('c:#78716c', T.box, M(this.ox, 2.7, this.oz + d / 2 - 0.5, 0, OW - 0.1, 0.08, 0.3));
    if (style === 'glass') {
      // глухие боковые стёкла (витринные) по краям проёма
      for (const sx of [-1, 1]) {
        this.f('glass:0.3', sx * 1.5, 0.05, z, 0.55, 2.3, 0.05, false);
        this.f('c:#9ca3af', sx * 1.5, 0.02, z, 0.62, 0.07, 0.08, false);
        this.f('c:#9ca3af', sx * 1.5, 2.34, z, 0.62, 0.07, 0.08, false);
        this.f('c:#9ca3af', sx * 1.78, 0.05, z, 0.07, 2.3, 0.08, false);
      }
      // две створки: стекло в раме, толкатель, замок, нижняя планка
      for (const sx of [-1, 1]) {
        const x = sx * 0.56;
        this.f('glass:0.24', x, 0.14, z, 0.86, 2.02, 0.05, false);
        this.f('c:#9ca3af', x, 0.05, z, 0.96, 0.09, 0.09, false);
        this.f('c:#9ca3af', x, 2.2, z, 0.96, 0.09, 0.09, false);
        this.f('c:#9ca3af', x, 1.28, z, 0.96, 0.05, 0.07, false);
        this.f('c:#9ca3af', x - sx * 0.45, 0.1, z, 0.08, 2.14, 0.09, false);
        this.f('chrome', x + sx * 0.34, 0.95, z - 0.08, 0.04, 0.85, 0.05, false);
        this.f('c:#111827', x - sx * 0.33, 1.52, z - 0.07, 0.09, 0.1, 0.05, false);
        this.f('c:#e7e5e4', x, 0.16, z - 0.05, 0.9, 0.14, 0.02, false); // наклейка «тяните»
      }
      // фрамуга над створками и доводчик
      this.f('glass:0.3', 0, 2.36, z, 2.1, 0.12, 0.05, false);
      this.f('c:#3f3f46', 0.72, 2.26, z - 0.1, 0.46, 0.07, 0.1, false);
      this.f('c:#d6d3d1', 0, 2.44, z, 2.16, 0.06, 0.08, false);
    } else {
      // деревянная или металлическая дверь с филёнками и глазком
      const leaf = style === 'wood' ? 'c:#5b3a1e' : 'c:#3f3f46';
      const trim = style === 'wood' ? 'c:#78350f' : 'c:#71717a';
      this.f(leaf, 0, 0, z, 1.98, 2.32, 0.08, false);
      for (const [py, ph] of [[0.25, 0.7], [1.1, 0.55], [1.78, 0.42]] as const) {
        if (style === 'wood') this.f(trim, 0, py, z - 0.05, 1.6, ph, 0.03, false);
        else this.f('c:#52525b', 0, py, z - 0.05, 1.5, ph, 0.03, false);
      }
      this.f('chrome', 0.78, 1.0, z - 0.11, 0.1, 0.05, 0.12, false);
      this.f('c:#a1a1aa', -0.78, 1.05, z - 0.09, 0.06, 0.22, 0.05, false);
      this.f('c:#111827', 0, 1.72, z - 0.1, 0.07, 0.07, 0.05, false);      // глазок
      this.f('c:#18181b', 0, 0.02, z - 0.06, 1.9, 0.16, 0.03, false);      // подножка
      this.f(trim, 0, 2.32, z, 2.1, 0.08, 0.12, false);
    }
    // Часы работы и касса уместны только в магазинах, не в домах и учреждениях.
    if (this.retail) {
      const side = Math.min(2.55, w / 2 - 0.85);
      this.plane('sign:ОТКРЫТО|#166534', 0, 2.92, d / 2 - 0.16, Math.min(1.5, w - 1.2), 0.32, Math.PI);
      if (w > 7) {
        this.plane('sign:ПН–ВС · 08:00–22:00|#0f172a', -side, 2.05, d / 2 - 0.15, 1.4, 0.3, Math.PI);
        this.plane('sign:ОПЛАЧИВАЙТЕ НА КАССЕ|#334155', side, 1.9, d / 2 - 0.15, 1.4, 0.28, Math.PI);
      }
    }

  }
  /** базовая комната с входной группой на юге (z = d/2) */
  room(w: number, d: number, h: number, floorMk: string, wallMk: string, exitLabel = 'Выйти на улицу', style: EntrStyle = 'glass') {
    // Не рисуем стеклянные боковые окна у входа; публичные двери остаются глухими.
    if (style === 'glass') style = 'metal';
    this.floor(-w / 2, -d / 2, w / 2, d / 2, floorMk);
    this.ceil(-w / 2, -d / 2, w / 2, d / 2, h);
    this.wall(-w / 2, -d / 2, w / 2, -d / 2, h, wallMk);
    this.wall(-w / 2, -d / 2, -w / 2, d / 2, h, wallMk);
    this.wall(w / 2, -d / 2, w / 2, d / 2, h, wallMk);
    this.wall(-w / 2, d / 2, w / 2, d / 2, h, wallMk, [[0, 2.3]]);
    this.entrance(w, d, h, style);
    this.act(0, d / 2 - 0.9, 1.5, exitLabel, 'exit');
    // плинтус по периметру + потолочный карниз
    const bb = (x: number, z: number, w2: number, d2: number) => this.f('c:#d6d3d1', x, 0, z, w2, 0.11, d2, false);
    bb(0, -d / 2 + 0.06, w, 0.06); bb(0, d / 2 - 0.06, w, 0.06); bb(-w / 2 + 0.06, 0, 0.06, d); bb(w / 2 - 0.06, 0, 0.06, d);
    bb(0, -d / 2 + 0.08, w, 0.05); bb(0, d / 2 - 0.08, w, 0.05);
  }
  /** витрина-стеллаж: металлический каркас, 4 полки, товары и ценники */
  shelf(x: number, z: number, len: number, ry: number, seed: number) {
    const along = Math.abs(ry) < 0.5;
    const w = along ? len : 0.62, d = along ? 0.62 : len;
    this.f('c:#cbd5e1', x, 0, z, w, 0.12, d, true);
    for (const sx of [-1, 1]) for (const sz of [0]) {
      const px = x + (along ? sx * (len / 2 - 0.04) : 0), pz = z + (along ? 0 : sx * (len / 2 - 0.04));
      this.f('c:#94a3b8', px, 0, pz, along ? 0.07 : 0.58, 1.85, along ? 0.58 : 0.07, false);
    }
    for (let lv = 0; lv < 4; lv++) {
      const y = 0.16 + lv * 0.44;
      this.f('c:#e2e8f0', x, y, z, along ? len : 0.56, 0.05, along ? 0.56 : len, false);
      for (let i = 0; i < Math.floor(len / 0.42); i++) {
        const t = -len / 2 + 0.22 + i * 0.42;
        const c = GOODS[(i * 3 + lv * 5 + seed) % GOODS.length];
        const px = x + (along ? t : 0), pz = z + (along ? 0 : t);
        this.f('c:' + c, px, y + 0.05, pz + (along ? 0.12 : 0), along ? 0.26 : 0.3, 0.26, along ? 0.3 : 0.26, false);
        this.f('c:' + GOODS[(i + lv + 2) % GOODS.length], px + (along ? 0 : -0.13), y + 0.05, pz + (along ? -0.13 : 0), along ? 0.2 : 0.14, 0.2, along ? 0.14 : 0.2, false);
      }
      // ценник на полке
      this.f('c:#fde68a', x, y + 0.05, z + (along ? 0.3 : 0), along ? len - 0.1 : 0.02, 0.04, along ? 0.02 : len - 0.1, false);
    }
    this.plane(`sign:СКИДКИ|#dc2626`, x, 2.05, z, Math.min(len * 0.7, 2.4), 0.3, ry);
  }
  fridgeCase(x: number, z: number, len: number) {
    this.f('c:#334155', x, 0, z, len, 2.15, 0.85, true);
    for (let i = 0; i < len / 0.42; i++) for (let lv = 0; lv < 4; lv++)
      this.f('c:' + ['#2563eb', '#dc2626', '#16a34a', '#f8fafc', '#f59e0b'][(i + lv) % 5], x - len / 2 + 0.21 + i * 0.42, 0.28 + lv * 0.44, z + 0.44, 0.22, 0.3, 0.06, false);
    this.f('glass:0.22', x, 0.1, z + 0.47, len, 1.95, 0.03, false);
    for (const sx of [-1, 1]) this.f('c:#475569', x + sx * (len / 2 - 0.02), 0, z + 0.47, 0.05, 1.95, 0.06, false);
    this.f('glow:#60a5fa', x, 2.02, z + 0.42, len - 0.1, 0.05, 0.05, false);
    this.plane(`sign:ХОЛОД|#0ea5e9`, x, 2.25, z, Math.min(len * 0.6, 2), 0.26, 0);
  }
  counter(x: number, z: number, w: number, label: string, action: string, cashier = true, ry = 0) {
    const along = Math.abs(ry) < 0.5;
    this.f('c:#78350f', x, 0, z, w, 0.95, 0.75, true, ry);
    this.f('c:#e7e5e4', x, 0.95, z, w + 0.14, 0.07, 0.86, false, ry);
    this.f('c:#111827', x + (along ? w / 2 - 0.35 : 0), 1.02, z + (along ? 0 : w / 2 - 0.35), 0.4, 0.32, 0.3, false, ry);
    this.f('glow:#22c55e', x + (along ? w / 2 - 0.35 : 0), 1.34, z + (along ? 0 : w / 2 - 0.35), 0.3, 0.02, 0.22, false, ry); // терминал оплаты
    this.f('c:#a8a29e', x - (along ? w / 2 - 0.5 : 0), 1.02, z - (along ? 0 : w / 2 - 0.5), 0.26, 0.18, 0.2, false, ry); // сканер
    this.f('c:#1f2937', x, 1.55, z - (along ? 0 : 0.3), w * 0.8, 0.06, 0.12, false, ry); // монитор на кронштейне
    this.act(x, z + (along ? 1.1 : 0), 1.5, label, action);
    if (cashier) this.npc(x, z - 0.9, 0, 'cashier');
  }
  table(x: number, z: number, chairs = 4, c = '#92400e') {
    this.f('c:' + c, x, 0.72, z, 1.1, 0.05, 1.1, false); this.f('c:#333', x, 0, z, 0.1, 0.72, 0.1); this.col(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0, 0.77);
    const ps = [[0, 0.85], [0, -0.85], [0.85, 0], [-0.85, 0]].slice(0, chairs);
    for (const [dx, dz] of ps) { this.f('c:#57534e', x + dx, 0.45, z + dz, 0.45, 0.05, 0.45, false); this.f('c:#57534e', x + dx * 1.25, 0.45, z + dz * 1.25, Math.abs(dx) > 0 ? 0.05 : 0.45, 0.5, Math.abs(dz) > 0 ? 0.05 : 0.45, false); this.col(x + dx - 0.22, z + dz - 0.22, x + dx + 0.22, z + dz + 0.22, 0, 0.5); }
    if (this.residential) {
      for (const dx of [-0.42, 0.42]) for (const dz of [-0.42, 0.42]) this.f('c:#5b3a29', x + dx, 0, z + dz, 0.09, 0.72, 0.09, false);
      this.f('c:#e7d5bd', x, 0.77, z, 0.65, 0.012, 0.38, false);
    }
    // салфетки и вазочка
    this.cyl('c:#f1f5f9', x, 0.77, z, 0.07, 0.12); this.cyl('c:#0f766e', x + 0.3, 0.77, z - 0.25, 0.05, 0.18);
  }
  sofa(x: number, z: number, w: number, ry: number, c = '#475569') {
    const along = Math.abs(Math.sin(ry)) < 0.5;
    // сиденье: габарит по факту (w вдоль оси, 0.9 глубина) — коллайдер считаем сами,
    // иначе повёрнутый диван получал коллайдер с двойным поворотом
    this.f('c:' + c, x, 0, z, along ? w : 0.9, 0.45, along ? 0.9 : w, false, ry);
    this.col(x - (along ? w / 2 : 0.45), z - (along ? 0.45 : w / 2), x + (along ? w / 2 : 0.45), z + (along ? 0.45 : w / 2), 0, 0.45);
    this.f('c:' + c, x - Math.sin(ry) * 0.38, 0.45, z - Math.cos(ry) * 0.38, along ? w : 0.2, 0.45, along ? 0.2 : w, false, ry);
    for (const s of [-1, 1]) this.f('c:' + c, x + (along ? s * (w / 2 - 0.1) : 0), 0.3, z + (along ? 0 : s * (w / 2 - 0.1)), 0.16, 0.35, 0.86, false, ry);
    for (let i = 0; i < Math.max(1, Math.floor(w / 0.9)); i++) this.f('c:#e2e8f0', x + (along ? -w / 2 + 0.5 + i * 0.9 : 0), 0.46, z + (along ? 0 : -w / 2 + 0.5 + i * 0.9), along ? 0.4 : 0.55, 0.12, along ? 0.55 : 0.4, false, ry);
  }
  tv(x: number, z: number, w: number, ry: number) {
    this.f('c:#0a0a0a', x, 1.0, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.06 : w, w * 0.56, Math.abs(Math.sin(ry)) > 0.5 ? w : 0.06, false);
    this.f('glow:#1e3a8a', x + Math.sin(ry) * 0.04, 1.03, z + Math.cos(ry) * 0.04, Math.abs(Math.sin(ry)) > 0.5 ? 0.01 : w - 0.1, w * 0.5, Math.abs(Math.sin(ry)) > 0.5 ? w - 0.1 : 0.01, false);
    this.f('c:#292524', x, 0, z, 0.5, 0.6, 0.35, true);
  }
  /** рабочее место с ПК: ry=0 — пользователь сидит со стороны +z */
  pc(x: number, z: number, ry: number, action: string, label: string, person = false) {
    const s = Math.sin(ry), c = Math.cos(ry);
    this.f('c:#57534e', x, 0, z, 1.3, 0.75, 0.65, true, ry);
    this.f('c:#0a0a0a', x - s * 0.15, 0.78, z - c * 0.15, 0.62, 0.4, 0.04, false, ry);
    this.f('glow:#60a5fa', x - s * 0.125, 0.8, z - c * 0.125, 0.56, 0.34, 0.01, false, ry);
    this.f('c:#111827', x - s * 0.15, 0.75, z - c * 0.15, 0.08, 0.06, 0.08, false, ry);
    this.f('c:#1f2937', x + s * 0.12, 0.76, z + c * 0.12, 0.45, 0.02, 0.15, false, ry);
    this.f('c:#e5e7eb', x + s * 0.12 + c * 0.32, 0.76, z + c * 0.12 - s * 0.32, 0.07, 0.03, 0.1, false, ry);
    this.cyl('c:#111827', x + s * 0.72, 0, z + c * 0.72, 0.24, 0.48); this.f('c:#111827', x + s * 0.95, 0.48, z + c * 0.95, 0.42, 0.5, 0.06, false, ry);
    this.act(x + s * 1.1, z + c * 1.1, 1.0, label, action);
    if (person) this.npc(x + s * 0.72, z + c * 0.72, ry + Math.PI, 'worker');
  }
  plant(x: number, z: number) { this.cyl('c:#a16207', x, 0, z, 0.22, 0.45); this.b.add('c:#16a34a', T.ico, M(this.ox + x, 0.95, this.oz + z, 0, 0.45, 0.6, 0.45)); this.b.add('c:#15803d', T.ico, M(this.ox + x + 0.18, 1.2, this.oz + z - 0.12, 0.7, 0.3, 0.4, 0.3)); this.col(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, 1); }
  rug(x: number, z: number, w: number, d: number, c: string) { this.f('c:' + c, x, 0.004, z, w, 0.012, d, false); }
  painting(x: number, y: number, z: number, ry: number, c: string) {
    this.plane('c:' + c, x, y, z, 1.0, 0.7, ry);
    this.plane('c:#1c1917', x, y, z - Math.cos(ry) * 0.01, 1.12, 0.82, ry);
    this.plane('c:' + c, x, y, z - Math.cos(ry) * 0.015, 1.0, 0.7, ry);
  }
  /** Единственное окно — в офисе: непрозрачный спокойный небесно-голубой цвет. */
  officeWindow(x: number, y: number, z: number, w: number, h: number) {
    this.windows++;
    this.f('c:#bce5f7', x, y, z, w, h, 0.06, false);
    this.f('c:#e8eff1', x, y - 0.07, z + 0.04, w + 0.16, 0.07, 0.12, false);
    this.f('c:#e8eff1', x, y + h, z + 0.04, w + 0.16, 0.07, 0.12, false);
    for (let i = 0; i <= 4; i++) this.f('c:#e8eff1', x - w / 2 + i * w / 4, y, z + 0.04, 0.07, h, 0.12, false);
  }
  /** медицинская кушетка: лежанка, подушка, каркас, стойка и место пациента */
  examBed(x: number, z: number, ry = 0) {
    this.f('c:#cbd5e1', x, 0, z, 1.15, 0.5, 2.1, true, ry);
    this.f('c:#bfdbfe', x, 0.5, z, 1.05, 0.14, 1.95, false, ry);
    this.f('c:#f8fafc', x, 0.64, z - 0.7, 0.85, 0.12, 0.5, false, ry);
    this.f('chrome', x + 0.62, 0, z, 0.06, 1.0, 0.06, false);
    this.f('c:#e2e8f0', x + 0.62, 1.0, z, 0.3, 0.06, 0.5, false, ry);
    this.act(x, z, 1.9, 'Кушетка пациента', 'patient');
  }
  /** медицинский шкаф с препаратами (кликабельный) */
  medCabinet(x: number, z: number, idx: number, name: string, ry = 0) {
    const along = Math.abs(ry) < 0.5;
    this.f('c:#e2e8f0', x, 0, z, along ? 1.4 : 0.5, 2.0, along ? 0.5 : 1.4, true, ry);
    for (let lv = 0; lv < 4; lv++) for (let i = 0; i < 4; i++) {
      const t = -0.5 + i * 0.34;
      this.f('c:' + ['#f8fafc', '#bbf7d0', '#bfdbfe', '#fecaca'][(i + lv) % 4], x + (along ? t : 0), 0.3 + lv * 0.42, z + (along ? 0 : t), along ? 0.26 : 0.24, 0.22, along ? 0.24 : 0.26, false, ry);
    }
    this.f('glass:0.25', x, 0.1, z + (along ? 0.28 : 0), along ? 1.36 : 0.04, 1.85, along ? 0.04 : 1.36, false, ry);
    this.plane(`sign:${name}|#0f766e`, x, 2.1, z, along ? 1.3 : 1.3, 0.26, ry);
    // стойка перед шкафом: со стороны комнаты, а не за стеной
    this.act(x + (along ? 0 : 0.9), z + (along ? 0.9 : 0), 1.3, `Шкаф: ${name}`, `med:${idx}`);
  }
  /** монитор диагностики */
  monitor(x: number, z: number, ry: number, action: string, label: string) {
    this.f('c:#1f2937', x, 0.75, z, 0.7, 0.5, 0.12, false, ry);
    this.f('glow:#22d3ee', x, 0.78, z + Math.cos(ry) * 0.07, 0.6, 0.4, 0.01, false, ry);
    this.f('c:#374151', x, 0.35, z, 0.12, 0.4, 0.12, false);
    this.f('c:#374151', x, 0, z, 0.5, 0.06, 0.5, true);
    this.act(x, z + 0.9, 1.3, label, action);
  }
  /** ширма-занавес */
  curtain(x0: number, z0: number, x1: number, z1: number, h: number) {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    this.f('c:#dbeafe', (x0 + x1) / 2, 0.05, (z0 + z1) / 2, 0.08, h, len, false, a);
    this.f('chrome', x0, 0, z0, 0.06, h + 0.2, 0.06, false);
    this.f('chrome', x1, 0, z1, 0.06, h + 0.2, 0.06, false);
  }
  /** прилавок-витрина с подсветкой (аптека, пекарня, ювелирка) */
  display(x: number, z: number, w: number, ry: number) {
    const along = Math.abs(ry) < 0.5;
    this.f('c:#f8fafc', x, 0, z, along ? w : 0.7, 0.95, along ? 0.7 : w, true, ry);
    this.f('glass:0.25', x, 0.95, z, along ? w : 0.72, 0.5, along ? 0.72 : w, false, ry);
    for (let i = 0; i < Math.floor(w / 0.4); i++) {
      const t = -w / 2 + 0.25 + i * 0.4;
      this.f('c:' + GOODS[(i + 3) % GOODS.length], x + (along ? t : 0), 1.0, z + (along ? 0 : t), along ? 0.22 : 0.3, 0.18, along ? 0.3 : 0.22, false, ry);
    }
    this.f('glow:#fef9c3', x, 1.45, z, along ? w - 0.1 : 0.06, 0.04, along ? 0.06 : w - 0.1, false, ry);
  }
  bedAt(x: number, z: number, w: number, a: number, linen = '#e0e7ff') {
    const d = 2.1; const rot = a;
    this.f('c:#6b4f3a', x, 0, z, w, 0.45, d, true, rot);
    this.f('c:' + linen, x, 0.45, z, w - 0.1, 0.12, d - 0.1, false, rot);
    const hx = x + Math.sin(rot) * -(d / 2 - 0.25), hz = z + Math.cos(rot) * -(d / 2 - 0.25);
    this.f('c:#ffffff', hx, 0.57, hz, w * 0.7, 0.12, 0.4, false, rot);
    this.f('c:#4b3621', x + Math.sin(rot) * -(d / 2), 0, z + Math.cos(rot) * -(d / 2), rot ? 0.1 : w, 1.1, rot ? w : 0.1, true);
    if (this.residential) {
      this.f('c:#e8d6bb', x, 0.58, z + 0.3, w - 0.14, 0.06, 0.85, false, rot);
      this.f('c:#8b6b55', hx, 0.55, hz, w - 0.12, 0.4, 0.08, false, rot);
    }
    this.bed = { x: this.ox + x, z: this.oz + z, y: 0.6, a: rot + Math.PI };
    this.act(x + Math.cos(rot) * (w / 2 + 0.5), z - Math.sin(rot) * (w / 2 + 0.5), 1.4, 'Лечь на кровать', 'bed');
  }
  fridgeAt(x: number, z: number, ry: number) {
    this.f('c:#e5e7eb', x, 0, z, 0.7, 1.9, 0.7, true, ry);
    this.f('c:#9ca3af', x + Math.sin(ry) * 0.36 + Math.cos(ry) * 0.25, 0.9, z + Math.cos(ry) * 0.36, ry ? 0.03 : 0.04, 0.5, ry ? 0.04 : 0.03, false);
    if (this.residential) this.f('c:#94a3b8', x, 1.22, z + 0.36, 0.6, 0.025, 0.025, false);
    this.act(x + Math.sin(ry) * 1.0, z + Math.cos(ry) * 1.0, 1.3, 'Холодильник', 'fridge');
  }
  kitchen(x: number, z: number, len: number, ry: number) {
    const alongX = Math.abs(Math.sin(ry)) < 0.5;
    this.f('c:#f5f5f4', x, 0, z, alongX ? len : 0.65, 0.9, alongX ? 0.65 : len);
    this.f('c:#44403c', x, 0.9, z, alongX ? len + 0.02 : 0.67, 0.04, alongX ? 0.67 : len + 0.02, false);
    this.f('c:#111', x + (alongX ? len / 4 : 0), 0.94, z + (alongX ? 0 : len / 4), 0.55, 0.02, 0.5, false);
    this.f('chrome', x - (alongX ? len / 4 : 0), 0.93, z - (alongX ? 0 : len / 4), 0.5, 0.03, 0.4, false);
    // верхние шкафы и вытяжка
    this.f('c:#e7e5e4', x + (alongX ? len / 3 : 0), 1.6, z + (alongX ? 0 : len / 3), alongX ? len * 0.4 : 0.34, 0.6, alongX ? 0.34 : len * 0.4, false, ry);
    this.f('c:#78716c', x - (alongX ? len / 3 : 0), 1.55, z - (alongX ? 0 : len / 3), alongX ? 0.6 : 0.34, 0.25, alongX ? 0.34 : 0.6, false, ry);
    this.f('c:#f59e0b', x, 1.1, z - (alongX ? 0 : 0.3), alongX ? 0.5 : 0.04, 0.3, alongX ? 0.04 : 0.5, false);
  }
  finish(spawn: Interior['spawn'], bounds: Interior['bounds']): Interior {
    for (const m of this.b.build({ receive: true })) this.group.add(m);
    const g = this.group;
    return {
      group: g, colliders: this.cols, acts: this.acts, npcs: this.npcs, spawn: { ...spawn, x: this.ox + spawn.x, z: this.oz + spawn.z },
      bounds: { x0: this.ox + bounds.x0, x1: this.ox + bounds.x1, z0: this.oz + bounds.z0, z1: this.oz + bounds.z1, h: bounds.h },
      bed: this.bed, doorSpots: this.doorSpots, pots: this.pots.map((p) => ({ x: this.ox + p.x, z: this.oz + p.z })), lights: this.lights, carts: this.carts,
      stats: { meshes: g.children.length, signs: this.signs, fixtures: this.fixtures, doors: this.doors, windows: this.windows },
      dispose: () => { g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); g.parent?.remove(g); },
    };
  }
}

export function buildInterior(kind: InteriorKind, opts: { seed?: number; owned?: boolean[]; units?: number; name?: string } = {}): Interior {
  const ib = new IB();
  ib.residential = ['apt_eco', 'apt_mid', 'apt_lux', 'house_city', 'house_village'].includes(kind);
  ib.retail = ['shop24', 'vshop', 'supermarket', 'pharmacy', 'vpharmacy', 'gunshop', 'vguntruck', 'clothes', 'gas', 'fishshop', 'scootershop'].includes(kind);
  const seed = opts.seed ?? 1;
  /** имя заведения с вывески: у баров и казино оно своё у каждого здания */
  const venue = (opts.name ?? '').replace(/\s+/g, ' ').trim();
  let W = 12, D = 10, H = 3.4;
  const S = (w: number, d: number, h = 3.4) => { W = w; D = d; H = h; };
  switch (kind) {
    // ---------------- ПРОДУКТОВЫЙ МАГАЗИН ----------------
    case 'shop24': case 'vshop': case 'gas': {
      const village = kind === 'vshop';
      if (village && venue.includes('Ольховка')) S(20, 15, 3.6); else S(14, 11, 3.6);
      ib.room(W, D, H, 'tex:floortile', village ? WALLS.wood : WALLS.white, 'Выйти на улицу', village ? 'wood' : 'glass');
      // вход: корзины, коврик, объявление
      ib.f('c:#334155', -5.6, 0, D / 2 - 1.6, 0.9, 0.5, 0.7);
      ib.f('c:#dc2626', -5.6, 0.5, D / 2 - 1.6, 0.7, 0.1, 0.5, false);
      ib.f('c:#1f2937', 5.9, 0, D / 2 - 1.5, 0.7, 0.5, 0.7);
      ib.rug(0, D / 2 - 1.0, 3, 1.6, '#94a3b8');
      // три ряда стеллажей в центре и пристенные полки
      for (let i = 0; i < 3; i++) ib.shelf(-4 + i * 3.7, -1.6, 4.6, 1, i + seed);
      ib.f('c:#e2e8f0', 0, 0, -D / 2 + 0.35, W - 1.2, 2.2, 0.55);
      for (let i = 0; i < 26; i++) for (let lv = 0; lv < 4; lv++)
        ib.f('c:' + GOODS[(i + lv * 3) % GOODS.length], -6 + i * 0.46, 0.25 + lv * 0.46, -D / 2 + 0.66, 0.28, 0.26, 0.1, false);
      ib.fridgeCase(-4.4, -D / 2 + 1.0, 3.2);
      ib.fridgeCase(-0.6, -D / 2 + 1.0, 3.2);
      // касса с лентой и корзиной для мелочи
      ib.counter(5.2, 2.2, 3.0, village ? 'Сельмаг: E — купить · R — смена · ствол на кассира — ограбление' : 'Касса: E — купить · R — смена · ствол на кассира — ограбление', 'counter');
      ib.f('c:#111827', 2.7, 0, 2.2, 2.6, 0.9, 0.72, true);
      ib.f('c:#374151', 2.7, 0.9, 2.2, 2.4, 0.05, 0.55, false);
      ib.act(5.2, 4.4, 1.6, 'Смена продавца · R', 'counter');
      if (kind === 'gas') {
        // АЗС: кофемашина и полка автотоваров
        ib.f('c:#1f2937', -6.1, 0, 3.4, 0.9, 1.6, 0.7, true);
        ib.f('glow:#fde68a', -6.05, 1.1, 3.4, 0.7, 0.35, 0.02, false);
        ib.act(-5.0, 3.4, 1.2, 'Кофе на АЗС', 'coffee');
        ib.shelf(5.6, -1.0, 3.4, Math.PI / 2, 9);
      } else {
        ib.plant(-6.2, 4.4); ib.plant(6.2, -4.2);
      }
      ib.plane(`sign:${village ? 'СЕЛЬМАГ' : kind === 'gas' ? 'АЗС · МАГАЗИН' : '24 / 7'}|#dc2626`, 0, 2.85, -D / 2 + 0.16, 4.4, 0.6, 0);
      ib.light(-3, H - 0.25, -1, 1.2, 0xffffff, 16); ib.light(3, H - 0.25, 1.5, 1.2, 0xffffff, 16); ib.light(0, H - 0.25, 4, 0.9, 0xfff3d6, 12);
      break;
    }
    // ---------------- СУПЕРМАРКЕТ ----------------
    case 'supermarket': {
      S(26, 19, 4.2); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      // центральный проход, 6 стеллажей, витрины у стен
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) ib.shelf(-9 + i * 4.4, -4.5 + r * 5.5, 5.2, 1, i + r * 2 + seed);
      ib.fridgeCase(-7.5, -D / 2 + 1.0, 6.5);
      ib.fridgeCase(0.5, -D / 2 + 1.0, 6.5);
      ib.fridgeCase(8.5, -D / 2 + 1.0, 5.5);
      // овощной отдел: ящики с зеленью
      for (let i = 0; i < 4; i++) {
        const x = -10.5 + i * 1.5;
        ib.f('c:#a16207', x, 0, 1.2, 1.3, 0.55, 1.1, true);
        ib.f('c:' + ['#22c55e', '#f59e0b', '#ef4444', '#84cc16'][i], x, 0.4, 1.2, 1.2, 0.3, 1.0, false);
        ib.act(x, 2.2, 1.1, 'Овощи: взвесить и купить', 'counter');
      }
      // пекарня: витрина с подсветкой
      ib.display(9.4, 2.6, 4.4, 0);
      ib.f('c:#78350f', 9.4, 0, 4.4, 4.6, 1.0, 0.7, true);
      ib.plane('sign:ПЕКАРНЯ|#b45309', 9.4, 2.6, -D / 2 + 0.16, 3, 0.5, 0);
      // две кассы
      ib.counter(-6.5, 6.6, 3.0, 'Касса №1: E — купить · R — смена · ствол на кассира — ограбление', 'counter');
      ib.counter(1.5, 6.6, 3.0, 'Касса №2: E — купить · R — смена · ствол на кассира — ограбление', 'counter');
      ib.f('c:#111827', -6.5, 0, 5.0, 2.2, 0.9, 0.7, true);
      ib.f('c:#111827', 1.5, 0, 5.0, 2.2, 0.9, 0.7, true);
      // тележки и корзины у входа
      for (let i = 0; i < 5; i++) { ib.f('chrome', 8 + i * 0.5, 0, D / 2 - 1.4, 0.45, 0.9, 0.6, false); ib.f('c:#dc2626', 8 + i * 0.5, 0.9, D / 2 - 1.4, 0.4, 0.3, 0.55, false); }
      ib.f('c:#1d4ed8', -11.4, 0, D / 2 - 1.4, 1.2, 0.7, 0.9, true);
      ib.plane('sign:СУПЕРМАРКЕТ «ЛУКОШКО»|#f59e0b', 0, 3.7, -D / 2 + 0.18, 8, 0.9, 0);
      ib.plane('sign:АКЦИЯ · −30%|#dc2626', 0, 3.0, D / 2 - 0.16, 4, 0.6, Math.PI);
      ib.rug(-2.5, 6.6, 5, 2, '#cbd5e1');
      ib.light(-8, H - 0.3, -3, 1.4, 0xffffff, 22); ib.light(2, H - 0.3, -3, 1.4, 0xffffff, 22);
      ib.light(-4, H - 0.3, 5, 1.2, 0xffffff, 18); ib.light(8, H - 0.3, 4, 1.2, 0xfff3d6, 18);
      break;
    }
    // ---------------- КАФЕ ----------------
    case 'cafe': case 'mallfood': {
      S(15, 12, 3.4); ib.room(W, D, H, 'tex:parquet', WALLS.paper, kind === 'mallfood' ? 'Выйти в торговый центр' : 'Выйти на улицу');
      // барная стойка с кофемашиной, витриной десертов и бутылками
      ib.counter(-3.6, -3.6, 5.2, 'Заказ: E — купить · R — смена · ствол на кассира — ограбление', 'counter');
      ib.f('c:#1f2937', -5.6, 1.05, -3.6, 0.6, 0.5, 0.4, false);
      ib.f('glow:#fbbf24', -5.6, 1.35, -3.75, 0.4, 0.2, 0.02, false);
      ib.display(-0.9, -3.6, 2.2, 0);
      ib.f('c:#78350f', -3.6, 1.3, -D / 2 + 0.45, 4.6, 0.08, 0.35, false); // полка бутылок
      for (let i = 0; i < 10; i++) ib.cyl('c:' + ['#166534', '#7c2d12', '#f59e0b'][i % 3], -5.6 + i * 0.44, 1.38, -D / 2 + 0.45, 0.07, 0.28);
      // столики у окон
      for (const [x, z] of [[3.4, -2.6], [6.2, -2.6], [3.4, 0.8], [6.2, 0.8], [0.6, 2.6]]) ib.table(x, z, 4);
      for (let i = 0; i < 3; i++)
      ib.sofa(-5.6, 1.8, 2.4, Math.PI / 2, '#7c2d12');
      ib.plant(-6.3, 4.4); ib.plant(6.6, 4.4); ib.plant(0.0, -1.2);
      ib.plane('sign:МЕНЮ · КОФЕ · ВЫПЕЧКА|#b45309', 0, 2.75, -D / 2 + 0.17, 4.6, 0.55, 0);
      ib.painting(6.9, 2.0, -D / 2 + 0.14, 0, '#b45309');
      ib.rug(-3.6, 0.4, 4, 2.6, '#7c2d12');
      ib.light(-3.6, H - 0.3, -2.6, 1.2, 0xffd7a0, 14); ib.light(4.8, H - 0.3, 0.6, 1.1, 0xffd7a0, 14); ib.light(-5.4, H - 0.3, 3, 0.8, 0xffd7a0, 10);
      break;
    }
    // ---------------- АПТЕКА (город) ----------------
    case 'pharmacy': {
      S(12, 10, 3.2); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      // шкафы с лекарствами по задней стене
      for (let c = 0; c < 3; c++) {
        const x = -3.4 + c * 3.4;
        ib.f('c:#f8fafc', x, 0, -D / 2 + 0.4, 3.1, 2.2, 0.6, true);
        for (let i = 0; i < 7; i++) for (let lv = 0; lv < 5; lv++)
          ib.f('c:' + ['#ffffff', '#10b981', '#60a5fa', '#fca5a5', '#fde68a'][(i + lv) % 5], x - 1.4 + i * 0.42, 0.22 + lv * 0.4, -D / 2 + 0.7, 0.28, 0.24, 0.1, false);
      }
      ib.f('glass:0.2', 0, 0.1, -D / 2 + 0.75, W - 1.2, 2.0, 0.03, false);
      // витрина и касса
      ib.display(-2.6, 1.0, 3.6, 0);
      ib.counter(3.4, 1.0, 3.0, 'Аптека: E — купить · R — смена · ствол на кассира — ограбление', 'counter');
      ib.f('c:#ffffff', 3.4, 0, -1.6, 2.4, 1.9, 0.6, true); ib.f('glass:0.2', 3.4, 1.0, -1.25, 2.3, 0.8, 0.03, false);
      ib.act(-2.6, 2.0, 1.2, 'Витрина: витамины и уход', 'counter');
      // аптечные весы, касса-аппарат, стул фармацевта
      ib.cyl('c:#e2e8f0', 1.6, 0.95, 1.0, 0.22, 0.12); ib.cyl('c:#0f766e', 1.6, 1.07, 1.0, 0.16, 0.05);
      ib.f('c:#0f766e', 3.4, 0, 2.2, 0.5, 0.45, 0.5, false);
      // лавка ожидания, кулер, растения
      ib.sofa(-4.4, 3.4, 2.6, Math.PI, '#0f766e'); ib.f('c:#e2e8f0', 3.2, 0, 3.6, 0.5, 1.1, 0.5, true);
      ib.f('c:#38bdf8', 3.2, 1.1, 3.6, 0.4, 0.5, 0.4, false);
      ib.plant(-5.3, -3.6); ib.plant(5.3, 3.6);
      ib.plane('sign:✚ АПТЕКА · 24 ЧАСА|#10b981', 0, 2.7, -D / 2 + 0.18, 4.2, 0.6, 0);
      ib.light(-2, H - 0.3, 0, 1.3, 0xffffff, 16); ib.light(3, H - 0.3, 2, 1.1, 0xffffff, 14);
      break;
    }
    // ---------------- АПТЕКА В ДЕРЕВНЕ ----------------
    case 'vpharmacy': {
      S(11, 9, 3.4); ib.room(W, D, H, 'tex:wood', WALLS.panel, 'Выйти на улицу', 'wood');
      ib.rug(0, 1.0, 4, 2.4, '#a16207');
      // деревянные полки с банками и травами
      for (let c = 0; c < 3; c++) {
        const x = -3.2 + c * 3.2;
        ib.f('c:#78350f', x, 0, -D / 2 + 0.45, 2.9, 2.1, 0.55, true);
        for (let lv = 0; lv < 4; lv++) {
          ib.f('c:#92400e', x, 0.5 + lv * 0.42, -D / 2 + 0.45, 2.8, 0.05, 0.55, false);
          for (let i = 0; i < 6; i++) ib.cyl('c:' + ['#65a30d', '#0d9488', '#e2e8f0', '#f59e0b'][(i + lv) % 4], x - 1.2 + i * 0.48, 0.55 + lv * 0.42, -D / 2 + 0.45, 0.1, 0.24);
        }
      }
      // прилавок с весами и ящиками
      ib.counter(2.4, 0.4, 3.4, 'Сельская аптека: E — купить · R — смена · ствол на кассира — ограбление', 'counter');
      ib.f('c:#78350f', 2.4, 0, -1.6, 3.2, 0.8, 0.8, true);
      ib.cyl('c:#e7e5e4', 1.4, 0.82, -1.6, 0.2, 0.16);
      for (let i = 0; i < 4; i++) ib.f('c:#a16207', 4.6 + (i % 2) * 0.5, 0, -2.4 + Math.floor(i / 2) * 0.6, 0.45, 0.45, 0.45, true);
      // скамья и печка
      ib.f('c:#78350f', -3.6, 0, 3.2, 2.6, 0.45, 0.6, true); ib.f('c:#57534e', -4.8, 0, 3.2, 0.1, 0.5, 0.6, false);
      ib.f('c:#e7e5e4', 4.4, 0, 2.8, 1.3, 1.7, 1.3, true); ib.cyl('c:#44403c', 4.4, 1.7, 2.8, 0.14, 1.0);
      ib.act(2.4, 1.5, 1.6, 'Смена фармацевта · R', 'counter');
      ib.plane('sign:✚ СЕЛЬСКАЯ АПТЕКА|#0f766e', 0, 2.55, -D / 2 + 0.18, 3.8, 0.5, 0);
      ib.painting(-4.2, 2.0, -D / 2 + 0.16, 0, '#166534');
      ib.light(-2, H - 0.3, 0, 1.0, 0xffe0b0, 12); ib.light(3, H - 0.3, 2, 0.9, 0xffe0b0, 12);
      break;
    }
    // ---------------- РЫБОЛОВНЫЙ МАГАЗИН ----------------
    case 'fishshop': {
      S(13, 10, 3.5); ib.room(W, D, H, 'tex:wood', WALLS.panel, 'Выйти на улицу', 'wood');
      // стена удочек и снастей
      for (let i = 0; i < 11; i++) {
        ib.f('c:#78350f', -5 + i, 2.2, -D / 2 + 0.2, 0.06, 1.6, 0.06, false);
        ib.cyl('c:#1f2937', -5 + i, 1.3 + (i % 3) * 0.35, -D / 2 + 0.24, 0.022, 1.0);
      }
      // аквариумы с рыбой
      for (let i = 0; i < 3; i++) {
        ib.f('c:#0e7490', 2.0 + i * 1.6, 0, -D / 2 + 0.8, 1.4, 0.9, 0.7, true);
        ib.f('c:#38bdf8', 2.0 + i * 1.6, 0.9, -D / 2 + 0.8, 1.3, 0.5, 0.6, false);
        ib.f('glow:#7dd3fc', 2.0 + i * 1.6, 1.45, -D / 2 + 0.8, 1.2, 0.06, 0.5, false);
      }
      // прилавок со льдом и весами
      ib.f('c:#0e7490', -1.4, 0, 0.4, 5.0, 0.95, 0.9, true);
      ib.f('c:#e0f2fe', -1.4, 0.95, 0.4, 4.8, 0.12, 0.8, false);
      ib.act(-1.4, 1.6, 1.7, 'Прилавок: E — купить снасти · R — смена', 'counter'); ib.npc(-1.4, -0.6, 0, 'cashier');
      ib.cyl('c:#e2e8f0', 1.0, 1.07, 0.4, 0.18, 0.16);
      // сети, ящики, лодка-декор
      ib.f('c:#78716c', 5.2, 0, 1.2, 0.9, 0.6, 0.9, true); ib.f('c:#57534e', 5.2, 0.6, 1.2, 0.94, 0.08, 0.94, false);
      ib.f('c:#166534', -5.6, 0, 2.0, 2.8, 0.9, 1.4, true);
      ib.plane('sign:РЫБАЛКА «ПОПЛАВОК»|#0e7490', 0, 2.75, -D / 2 + 0.18, 4.2, 0.55, 0);
      ib.plant(-5.8, 4.2);
      ib.light(0, H - 0.3, 0, 1.1, 0xd8f3ff, 16); ib.light(4, H - 0.3, -2, 0.9, 0xd8f3ff, 12);
      break;
    }
    // ---------------- ОРУЖЕЙНЫЙ МАГАЗИН ----------------
    case 'gunshop': {
      S(11, 9, 3.2); ib.room(W, D, H, 'tex:parquet', WALLS.dark);
      // стена оружия: подсвеченные витрины
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
        const x = -3.8 + i * 1.7, y = 1.3 + r * 0.7;
        ib.f('c:#111111', x, y, -D / 2 + 0.14, 1.1, 0.12, 0.1, false);
        ib.f('c:#78350f', x - 0.3, y - 0.02, -D / 2 + 0.15, 0.34, 0.1, 0.11, false);
        ib.f('glow:#fef3c7', x, y + 0.16, -D / 2 + 0.16, 1.0, 0.03, 0.03, false);
      }
      // патронные ящики и сейф
      for (let i = 0; i < 5; i++) ib.f('c:#365314', -4.2 + i * 0.9, 0, -2.2, 0.8, 0.55, 0.6, true);
      ib.f('c:#1c1917', 4.2, 0, -2.2, 1.2, 1.6, 0.8, true); ib.cyl('c:#a8a29e', 4.2, 0.9, -1.75, 0.16, 0.06);
      // прилавок с витриной и мишень
      ib.f('c:#1f2937', 0, 0, 0.4, 5.4, 1.0, 0.8, true);
      ib.f('glass:0.28', 0, 1.0, 0.4, 5.4, 0.4, 0.8, false);
      ib.f('c:#f8fafc', 4.85, 1.2, 2.4, 0.05, 1.2, 0.9, false); ib.cyl('c:#dc2626', 4.8, 1.75, 2.4, 0.25, 0.02);
      ib.act(0, 1.5, 1.7, 'Оружейная: E — купить · R — смена · ствол на кассира — ограбление', 'counter'); ib.npc(0, -0.7, 0, 'cashier');
      ib.plane('sign:ОРУЖЕЙНЫЙ «АРСЕНАЛ»|#b91c1c', 0, 2.7, -D / 2 + 0.18, 4.6, 0.55, 0);
      ib.light(0, H - 0.3, 0, 1.1, 0xffe4c4, 14); ib.light(4, H - 0.3, 2, 0.8, 0xffe4c4, 10);
      break;
    }
    // ---------------- ОРУЖЕЙНЫЙ ГРУЗОВИК (деревня) ----------------
    case 'vguntruck': {
      S(3.6, 9.6, 2.6); ib.room(W, D, H, 'tex:wood', WALLS.olive, 'Выйти из грузовика', 'metal');
      // узкий фургон: ружейные стойки по стенам, патронные ящики, откидной прилавок
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const z = -3.4 + i * 1.5;
        ib.f('c:#111111', side * (W / 2 - 0.16), 1.15, z, 0.1, 0.12, 1.1, false);
        ib.f('c:#78350f', side * (W / 2 - 0.17), 1.13, z - 0.3, 0.11, 0.1, 0.34, false);
        ib.f('glow:#fef3c7', side * (W / 2 - 0.14), 1.5, z, 0.02, 0.03, 1.0, false);
      }
      for (let i = 0; i < 4; i++) ib.f('c:#365314', -1.0 + (i % 2) * 1.5, 0, -2.8 + Math.floor(i / 2) * 0.8, 0.6, 0.5, 0.5, true);
      ib.f('c:#1f2937', 0, 0, 0.6, 2.2, 0.95, 0.7, true);
      ib.f('c:#e7e5e4', 0, 0.95, 0.6, 2.3, 0.06, 0.8, false);
      ib.f('c:#111827', -0.9, 1.01, 0.6, 0.3, 0.26, 0.24, false);
      ib.act(0, 1.7, 1.5, 'Оружейный грузовик: E — купить · R — смена', 'counter'); ib.npc(0.7, -0.4, Math.PI, 'cashier');
      ib.f('c:#4b5320', 0, 0, D / 2 - 0.5, 1.4, 2.0, 0.12, false);
      ib.f('chrome', 0.45, 1.0, D / 2 - 0.44, 0.12, 0.04, 0.06, false);
      ib.f('c:#1c1917', 0, 0, -D / 2 + 0.3, W - 0.4, 1.2, 0.5, true); // ящик у кабины
      ib.plane('sign:ОРУЖИЕ · ПАТРОНЫ|#3f6212', 0, 2.15, -D / 2 + 0.18, 2.8, 0.4, 0);
      ib.f('glow:#fef9c3', 0, H - 0.12, 0, W - 0.5, 0.03, D - 1.4, false);
      ib.light(0, H - 0.2, 1.5, 0.8, 0xfff1d6, 7); ib.light(0, H - 0.2, -2.5, 0.7, 0xfff1d6, 7);
      break;
    }
    // ---------------- МАГАЗИН ОДЕЖДЫ ----------------
    case 'clothes': {
      S(15, 11, 3.5); ib.room(W, D, H, 'tex:parquet', WALLS.paper);
      // три рейла с одеждой
      for (let r = 0; r < 3; r++) {
        const x = -4.8 + r * 3.6;
        ib.f('chrome', x, 1.55, -2.0, 3.0, 0.05, 0.05, false);
        ib.f('chrome', x - 1.45, 0, -2.0, 0.06, 1.55, 0.06); ib.f('chrome', x + 1.45, 0, -2.0, 0.06, 1.55, 0.06);
        for (let i = 0; i < 10; i++) ib.f('c:' + GOODS[(i + r) % GOODS.length], x - 1.25 + i * 0.28, 0.72, -2.0, 0.06, 0.82, 0.5, false);
        ib.col(x - 1.5, -2.3, x + 1.5, -1.7, 0, 1.6);
      }
      // примерочные с шторами
      for (let i = 0; i < 2; i++) {
        const x = 4.4 + i * 1.6;
        ib.f('c:#7c3aed', x, 0, -2.4, 0.08, 2.3, 1.6, false);
        ib.f('c:#7c3aed', x, 0, -1.55, 1.6, 2.3, 0.08, false);
        ib.curtain(x - 0.7, -1.5, x - 0.7, -3.2, 2.1);
        ib.f('c:#e2e8f0', x, 0, -1.2, 0.8, 0.02, 0.8, false);
      }
      ib.act(4.4, -0.9, 1.4, 'Примерочная: выбрать одежду', 'clothes');
      ib.act(6.0, -0.9, 1.4, 'Примерочная №2', 'clothes');
      // зеркала, манекены, касса
      ib.plane('glass:0.4', W / 2 - 0.14, 1.5, 2.4, 2.0, 2.0, -Math.PI / 2);
      ib.f('chrome', W / 2 - 0.16, 0.5, 2.4, 0.04, 2.0, 2.0, false);
      for (const [x, z] of [[-6.0, 3.2], [-4.4, 3.2]]) { ib.cyl('c:#a8a29e', x, 0, z, 0.25, 0.6); ib.f('c:#1d4ed8', x, 0.6, z, 0.5, 0.6, 0.35, false); ib.cyl('c:#d6d3d1', x, 0.4, z, 0.22, 1.2); }
      ib.f('c:#78350f', -4.2, 0, 4.0, 2.8, 0.95, 0.7, true);
      ib.act(-4.2, 5.1, 1.5, 'Касса — примерка и покупка одежды', 'clothes');
      ib.npc(-4.2, 3.2, 0, 'clerk');
      ib.shelf(-W / 2 + 0.75, 1.2, 3.0, Math.PI / 2, 4); // полка обуви
      ib.plane('sign:МОДА · СКИДКИ|#8b5cf6', 0, 2.9, -D / 2 + 0.18, 4, 0.55, 0);
      ib.plant(-6.5, -4.2); ib.plant(6.5, 4.4);
      ib.light(-3, H - 0.3, -1, 1.2, 0xffffff, 16); ib.light(3, H - 0.3, 2, 1.2, 0xffffff, 16);
      break;
    }
    // ---------------- ПАРИКМАХЕРСКАЯ ----------------
    case 'barber': {
      S(11, 9, 3.3); ib.room(W, D, H, 'tex:floortile', WALLS.paperPink);
      // три рабочих места: кресло, зеркало, столик с инструментами
      for (let i = 0; i < 3; i++) {
        const x = -3.4 + i * 3.4;
        ib.f('c:#111827', x, 0, -2.4, 0.72, 0.55, 0.72);
        ib.f('c:#111827', x, 0.55, -2.8, 0.72, 0.7, 0.12, false);
        ib.f('c:#374151', x, 0.05, -1.9, 0.5, 0.12, 0.5, false);
        ib.plane('glass:0.3', x, 1.35, -D / 2 + 0.14, 1.1, 1.5, 0);
        ib.f('chrome', x, 0.55, -D / 2 + 0.16, 1.24, 1.5, 0.05, false);
        ib.f('glow:#fef3c7', x, 1.95, -D / 2 + 0.2, 1.3, 0.06, 0.18, false);
        ib.f('c:#ffffff', x + 0.75, 0.8, -2.7, 0.5, 0.12, 0.4, false); // столик
        ib.cyl('c:#a8a29e', x + 0.75, 0, -2.7, 0.05, 0.8);
      }
      ib.act(0, -1.0, 1.8, 'Сесть в кресло: стрижка и окраска', 'barber');
      ib.npc(1.6, -1.6, Math.PI, 'barber');
      // зона ожидания: диван, журнальный столик, полка средств
      ib.sofa(-3.9, 2.6, 2.6, Math.PI, '#be185d');
      ib.f('c:#78350f', -1.2, 0, 3.2, 1.4, 0.45, 0.7, true);
      ib.f('c:#f8fafc', -1.2, 0.45, 3.2, 1.0, 0.06, 0.5, false);
      ib.shelf(4.6, 1.6, 2.6, Math.PI / 2, 6);
      ib.cyl('c:#f8fafc', 4.2, 0, -0.6, 0.22, 0.5); // мойка
      ib.plant(-4.9, 4.2); ib.plant(4.9, 4.2);
      ib.plane('sign:БАРБЕРШОП · СТРИЖКИ|#ec4899', 0, 2.75, -D / 2 + 0.18, 4.2, 0.55, 0);
      ib.rug(0, 0.4, 4.4, 3, '#831843');
      ib.light(0, H - 0.3, 0, 1.2, 0xffffff, 16); ib.light(-4, H - 0.3, 2.6, 0.8, 0xfff0d0, 10);
      break;
    }
    // ---------------- ПОЛИЦИЯ ----------------
    case 'police': {
      S(18, 13, 3.6); ib.room(W, D, H, 'tex:floortile', WALLS.grey);
      // дежурная часть с бронестеклом
      ib.f('c:#1e40af', 0, 0, -2.6, 6.0, 1.1, 0.9, true);
      ib.f('c:#e2e8f0', 0, 1.1, -2.6, 6.1, 0.08, 1.0, false);
      ib.f('glass:0.3', 0, 1.18, -3.05, 6.0, 0.9, 0.05, false);
      ib.act(0, -1.3, 1.7, 'Дежурная часть: розыск и страховка', 'police'); ib.npc(0, -3.4, 0, 'police');
      ib.f('c:#111827', -2.2, 1.18, -2.6, 0.4, 0.3, 0.3, false);
      // камеры за решёткой
      for (let i = 0; i < 2; i++) {
        const x = -6.4 + i * 3.1;
        ib.wall(x - 1.4, -D / 2, x - 1.4, -D / 2 + 3.0, H, WALLS.grey);
        for (let k = 0; k < 9; k++) ib.f('c:#52525b', x - 1.2 + k * 0.3, 0, -D / 2 + 3.0, 0.05, 2.5, 0.05);
        ib.f('c:#71717a', x - 1.2, 0, -D / 2 + 3.0, 2.6, 0.08, 0.08, false);
        ib.col(x - 1.3, -D / 2 + 2.9, x + 1.2, -D / 2 + 3.1, 0, 2.5);
        ib.f('c:#a1a1aa', x - 0.3, 0, -D / 2 + 1.3, 0.9, 0.45, 1.9, true); // шконка
      }
      // пост, доска розыска, шкафчики, скамьи
      ib.f('c:#1e293b', W / 2 - 0.4, 0, -5.4, 0.5, 1.5, 3.0, true); ib.npc(W / 2 - 1.4, -5.4, -Math.PI / 2, 'police');
      for (let i = 0; i < 4; i++) ib.f('c:#334155', 6.6, 0, -1.4 + i * 0.7, 1.4, 2.1, 0.6, true);
      ib.plane('sign:РОЗЫСК|#b91c1c', 3.0, 2.2, -D / 2 + 0.16, 3.4, 1.2, 0);
      ib.f('c:#78350f', 2.4, 0, 2.4, 3.2, 0.45, 0.7, true); ib.f('c:#78350f', 2.4, 0.45, 2.4, 3.2, 0.5, 0.1, true); // лавка
      ib.sofa(-4.6, 3.6, 3, Math.PI, '#1e3a8a');
      ib.f('c:#e2e8f0', 5.6, 0, 3.6, 0.6, 1.0, 0.6, true); ib.f('c:#38bdf8', 5.6, 1.0, 3.6, 0.45, 0.5, 0.45, false); // кулер
      ib.plane('sign:ПОЛИЦИЯ|#1e40af', 0, 3.0, -D / 2 + 0.18, 4.4, 0.7, 0);
      // пульт дежурного: карта патрулей, рации, стол разбора и шкаф с ключами
      ib.plane('sign:ПАТРУЛИ · ЛОС-ГОРОД|#0ea5e9', W / 2 - 0.15, 2.25, 1.4, 3.0, 1.35, -Math.PI / 2);
      ib.f('glow:#38bdf8', W / 2 - 0.18, 1.52, 1.4, 0.04, 0.06, 3.0, false);
      ib.f('c:#334155', 5.0, 0, -2.0, 2.0, 0.92, 1.0, true);
      ib.f('c:#1e293b', 5.0, 0.92, -2.0, 2.1, 0.05, 1.1, false);
      ib.f('c:#0f172a', 4.6, 0.97, -2.0, 0.5, 0.28, 0.3, false);       // рация
      ib.cyl('chrome', 5.5, 0.97, -1.9, 0.03, 0.36);                    // антенна
      ib.f('c:#52525b', -W / 2 + 0.3, 0, 2.2, 0.35, 1.5, 1.0, true);    // шкаф с ключами
      for (let i = 0; i < 6; i++) ib.f('c:#fbbf24', -W / 2 + 0.46, 0.5 + (i % 3) * 0.42, 1.85 + Math.floor(i / 3) * 0.42, 0.04, 0.08, 0.12, false);
      ib.light(-4, H - 0.3, -1, 1.2, 0xffffff, 18); ib.light(4, H - 0.3, 1, 1.2, 0xffffff, 18);
      ib.light(5.0, H - 0.3, -2.0, 0.8, 0xbfdbfe, 10);
      break;
    }
    // ---------------- БОЛЬНИЦА С КАБИНЕТОМ ВРАЧА ----------------
    case 'hospital': {
      S(21, 15, 3.6); ib.room(W, D, H, 'tex:floortile', WALLS.clinic);
      // перегородка: кабинет врача на севере, приёмное отделение на юге
      ib.wall(-W / 2, -1.2, W / 2, -1.2, H, WALLS.clinic, [[-3.0, 1.8]]);
      // ---- приёмное отделение ----
      ib.f('c:#0e7490', -6.2, 0, 2.0, 4.6, 1.05, 0.9, true);
      ib.f('c:#e2e8f0', -6.2, 1.05, 2.0, 4.7, 0.08, 1.0, false);
      ib.f('glass:0.25', -6.2, 1.13, 1.55, 4.4, 0.8, 0.05, false);
      ib.act(-6.2, 3.2, 1.8, 'Регистратура: лечение · смена пола', 'hospital'); ib.npc(-6.2, 0.8, 0, 'doctor');
      // стойка записи на смену врача
      ib.f('c:#0f766e', 0.6, 0, 1.6, 3.2, 1.05, 0.8, true);
      ib.f('c:#111827', 0.6, 1.05, 1.6, 0.4, 0.28, 0.26, false);
      ib.act(0.6, 2.6, 1.7, 'Смена врача: приём пациентов', 'doctorhire');
      // зона ожидания: два ряда кресел, столик, кулер, информационный стенд
      for (let i = 0; i < 4; i++) for (const z of [4.6, 6.0]) {
        ib.f('c:#1d4ed8', -6.4 + i * 1.15, 0, z, 0.95, 0.48, 0.9, true);
        ib.f('c:#1d4ed8', -6.4 + i * 1.15, 0.48, z + 0.36, 0.95, 0.55, 0.12, false);
      }
      ib.f('c:#78350f', -2.6, 0, 5.3, 1.6, 0.45, 0.7, true);
      for (let i = 0; i < 4; i++) ib.f('c:' + GOODS[i], -3.2 + i * 0.4, 0.47, 5.3, 0.3, 0.06, 0.4, false);
      ib.f('c:#e2e8f0', 1.8, 0, 5.4, 0.6, 1.05, 0.6, true); ib.f('c:#38bdf8', 1.8, 1.05, 5.4, 0.45, 0.5, 0.45, false);
      ib.plane('sign:РЕЖИМ РАБОТЫ · ПРИЁМ ВРАЧА|#0e7490', 4.4, 2.3, 6.2, 5.4, 1.4, Math.PI);
      ib.f('c:#0e7490', 4.4, 0, 6.2, 5.6, 1.6, 0.1, false);
      ib.plane('sign:✚ БОЛЬНИЦА|#dc2626', 0, 3.0, -D / 2 + 0.18, 4.4, 0.7, 0);
      ib.plane('sign:ХИРУРГИЯ · ТЕРАПИЯ|#0e7490', -3.0, 2.3, -1.05, 3.6, 0.5, 0);
      ib.plant(-9.2, 5.8); ib.plant(8.6, 1.8); ib.rug(-4.4, 5.3, 5, 2, '#bae6fd');
      // ---- кабинет врача (северная половина) ----
      // кушетка у левой стены
      ib.examBed(-6.8, -5.4, 0);
      ib.curtain(-4.6, -6.9, -4.6, -3.6, 2.5);
      // монитор диагностики
      ib.monitor(-3.9, -6.6, 0, 'diagnose', 'Монитор: осмотр пациента');
      // шкафы с препаратами у правой/задней стены
      ib.medCabinet(1.0, -D / 2 + 0.4, 0, 'Антигриппин', 0);
      ib.medCabinet(3.4, -D / 2 + 0.4, 1, 'Обезболивающее', 0);
      ib.medCabinet(5.8, -D / 2 + 0.4, 2, 'Антисептик', 0);
      // рабочий стол врача, карта пациента, весы, ростомер, раковина
      ib.f('c:#78350f', 3.2, 0, -4.0, 3.2, 0.95, 1.0, true);
      ib.f('c:#f8fafc', 3.2, 0.95, -4.0, 3.0, 0.06, 0.8, false);
      ib.f('c:#0a0a0a', 3.8, 1.01, -4.0, 0.7, 0.42, 0.06, false); ib.f('glow:#60a5fa', 3.8, 1.04, -4.05, 0.62, 0.34, 0.01, false);
      ib.cyl('c:#111827', 2.4, 0, -3.0, 0.24, 0.48);
      ib.f('c:#e2e8f0', 6.2, 0, -2.4, 0.8, 1.6, 0.8, true); // весы
      ib.f('c:#a8a29e', 7.6, 0, -D / 2 + 0.4, 0.2, 2.2, 0.2, false); // ростомер
      ib.f('c:#f8fafc', 8.6, 0, -2.0, 0.6, 0.8, 1.2, true); ib.cyl('chrome', 8.6, 0.8, -2.0, 0.06, 0.3);
      ib.f('c:#dc2626', 8.75, 1.1, -2.7, 0.3, 0.5, 0.3, false); // огнетушитель/аптечка
      // стулья для посетителей кабинета
      ib.f('c:#334155', 1.0, 0, -3.2, 0.5, 0.5, 0.5, true); ib.f('c:#334155', 1.0, 0.5, -3.5, 0.5, 0.5, 0.1, false);
      ib.rug(2.4, -5.6, 3.2, 2.4, '#e0f2fe');
      ib.light(0, H - 0.3, 2.6, 1.3, 0xffffff, 20); ib.light(-6.4, H - 0.3, 4.4, 1.0, 0xffffff, 14);
      ib.light(-5.6, H - 0.3, -4.6, 1.2, 0xf0f9ff, 16); ib.light(3.4, H - 0.3, -4.6, 1.2, 0xf0f9ff, 16);
      break;
    }
    // ---------------- МЭРИЯ ----------------
    case 'cityhall': {
      S(34, 24, 5.4);
      ib.room(W, D, H, 'tex:parquet', WALLS.beige);
      // парадная лестница и балкон
      for (let k = 0; k < 8; k++) ib.f('c:#d6d3d1', 0, 0, -D / 2 + 1.2 + k * 0.55, 9 - k * 0.4, 0.34 * (k + 1), 0.6);
      ib.f('c:#d6d3d1', 0, 2.7, -D / 2 + 6.6, 9, 0.3, 2.4);
      ib.col(-4.5, -D / 2 + 1, 4.5, -D / 2 + 7.6, 0, 3.0);
      for (const x of [-4.6, 4.6]) ib.f('c:#a8a29e', x, 0, -D / 2 + 4.2, 0.25, 3.0, 6.4, false);
      ib.f('c:#e7e5e4', 0, 3.9, -D / 2 + 3.4, W - 2, 0.3, 6.2, false);
      ib.f('c:#a8a29e', 0, 4.2, -D / 2 + 6.4, W - 2, 1.0, 0.12);
      // колонны
      for (const x of [-7, 7]) for (const z of [-7, 0, 7]) ib.cyl('c:#f5f5f4', x, 0, z, 0.45, H, true);
      for (const x of [-7, 7]) for (const z of [-7, 0, 7]) { ib.cyl('c:#e7e5e4', x, H - 0.5, z, 0.62, 0.3); ib.cyl('c:#e7e5e4', x, 0, z, 0.62, 0.35); }
      // левое крыло: кабинеты
      ib.wall(-9, -D / 2, -9, D / 2, H, WALLS.beige, [[-7.5, 1.4], [1.5, 1.4], [8.5, 1.4]]);
      ib.wall(-W / 2, -3.0, -9, -3.0, H, WALLS.beige);
      ib.wall(-W / 2, 4.6, -9, 4.6, H, WALLS.beige);
      ib.f('c:#78350f', -13, 0, -8.4, 5.4, 0.95, 2.2);
      ib.f('c:#1c1917', -13, 0.95, -8.4, 1.2, 0.05, 0.6, false);
      ib.cyl('c:#1f2937', -15.6, 0, -9.4, 0.35, 1.1);
      for (const x of [-16.5, -14.5, -12.5, -10.5]) ib.f('c:#57534e', x, 0, -4.2, 0.6, 0.9, 0.6, true);
      ib.f('c:#0f172a', -13, 1.9, -D / 2 + 0.14, 4.2, 1.5, 0.06, false);
      ib.f('glow:#fde68a', -13, 2.2, -D / 2 + 0.2, 3.9, 0.9, 0.02, false);
      ib.rug(-13, -6.2, 5, 3.4, '#7f1d1d');
      ib.act(-13, -5.2, 2.0, 'Кабинет мэра', 'cityhall'); ib.npc(-13, -9.6, Math.PI, 'clerk');
      ib.counter(-13, -0.4, 5.2, 'Отдел недвижимости', 'cityhall', false);
      ib.npc(-15.4, -1.2, 0, 'clerk'); ib.npc(-11.2, -1.2, 0, 'clerk');
      for (const z of [-2.2, 1.0, 2.6]) ib.f('c:#2563eb', -W / 2 + 0.16, 1.4, z, 0.04, 0.9, 1.2, false);
      ib.table(-12.6, 2.4, 4);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) ib.f('c:#57534e', -16.4 + k * 2.4, 0, 6.4 + r * 1.6, 2.2, 2.3, 0.55, true);
      ib.f('c:#111827', -13, 0, 11.2, 1.6, 0.75, 0.9);
      ib.act(-16.4, 9.6, 1.8, 'Архив: справки и выписки', 'cityhall');
      // правое крыло
      ib.counter(11.5, -6.5, 6, 'Приёмная: недвижимость и справки', 'cityhall', false);
      ib.npc(9.4, -7.4, 0, 'clerk'); ib.npc(13.6, -7.4, 0, 'clerk');
      ib.wall(9, 6.2, W / 2, 6.2, H, 'c:#c9c2b4', [[12, 1.2]]);
      for (const x of [10.4, 12.4, 14.4]) { ib.f('c:#78350f', x, 0, 8.4, 1.4, 0.75, 0.8); ib.cyl('c:#1f2937', x, 0, 9.6, 0.22, 0.45); }
      ib.f('c:#e5e7eb', W / 2 - 0.4, 0, 8.4, 0.7, 1.9, 3.2, true);
      ib.act(W / 2 - 1.3, 8.4, 1.3, 'Буфет: кофе', 'coffee');
      ib.f('c:#1e293b', W / 2 - 0.3, 0, -9, 0.5, 1.4, 3, true); ib.npc(W / 2 - 1.2, -9, -Math.PI / 2, 'guard');
      // декор зала
      ib.rug(0, 0, 4.2, 17, '#7f1d1d');
      for (const z of [-3, 3, 9]) for (const x of [-6, 6]) ib.sofa(x, z, 2.6, x > 0 ? Math.PI / 2 : -Math.PI / 2, '#1e3a8a');
      ib.f('c:#e7e5e4', 0, 1.2, D / 2 - 0.2, 5.4, 2.6, 0.1, false);
      ib.plane('sign:МЭРИЯ ЛОС-ГОРОДА|#1e3a8a', 0, 4.2, D / 2 - 0.16, 7.5, 1.0, Math.PI);
      ib.f('c:#64748b', -W / 2 + 0.5, 0, -11.4, 0.06, 3.4, 0.06, false);
      ib.f('c:#64748b', -W / 2 + 0.5, 0, -10.9, 0.06, 3.4, 0.06, false);
      ib.f('glow:#e5e7eb', -W / 2 + 1.3, 2.8, -11.4, 1.6, 0.9, 0.04, false);
      ib.f('glow:#dc2626', -W / 2 + 1.3, 2.8, -10.9, 1.6, 0.9, 0.04, false);
      ib.plane('sign:КАРТА ГОРОДА|#0f766e', 12, 2.4, -D / 2 + 0.14, 6, 2.6, 0);
      ib.plant(-7.6, 11); ib.plant(7.6, 11); ib.plant(-7.6, -11); ib.plant(7.6, -11); ib.plant(-9.8, -2.2); ib.plant(9.6, 5.4);
      ib.light(-11, H - 0.6, 6, 1.2, 0xfff0d0, 16); ib.light(-11, H - 0.6, -6, 1.2, 0xfff0d0, 16);
      ib.light(0, H - 0.4, -2, 1.6, 0xfff3d6, 24); ib.light(0, H - 0.4, 7, 1.4, 0xfff3d6, 22); ib.light(12, H - 0.5, -4, 1.2, 0xffffff, 16);
      break;
    }
    // ---------------- БАНК ----------------
    case 'bank': {
      S(16, 11, 4.2); ib.room(W, D, H, 'tex:floortile', WALLS.beige);
      // три окошка кассиров с латунными рамами
      for (let i = 0; i < 3; i++) {
        const x = -4.6 + i * 4.4;
        ib.f('c:#78350f', x, 0, -2.4, 3.6, 1.1, 0.9, true);
        ib.f('c:#d6d3d1', x, 1.1, -2.4, 3.7, 0.08, 1.0, false);
        ib.f('glass:0.28', x, 1.18, -2.85, 3.5, 1.0, 0.05, false);
        ib.f('c:#b45309', x, 2.25, -2.86, 3.6, 0.12, 0.1, false);
        ib.f('c:#111827', x + 1.2, 1.18, -2.4, 0.35, 0.28, 0.28, false);
      }
      ib.act(0, -1.0, 2.0, 'Банк: доход бизнесов', 'bank'); ib.npc(-2, -3.4, 0, 'clerk'); ib.npc(2.6, -3.4, 0, 'clerk');
      // сейфовая дверь, банкомат, очередь
      ib.cyl('c:#9ca3af', 6.6, 0.2, -D / 2 + 0.35, 1.4, 0.3);
      ib.f('c:#6b7280', 6.6, 0, -D / 2 + 0.2, 3.0, 2.9, 0.12, false);
      ib.f('c:#4b5563', 6.6, 1.4, -D / 2 + 0.28, 0.25, 0.25, 0.1, false);
      ib.f('c:#1f2937', W / 2 - 0.5, 0, 1.6, 0.6, 1.9, 1.0, true);
      ib.f('glow:#38bdf8', W / 2 - 0.82, 1.25, 1.6, 0.03, 0.5, 0.7, false);
      ib.act(W / 2 - 1.0, 2.6, 1.2, 'Банкомат: снять доход', 'bank');
      for (let i = 0; i < 3; i++) ib.f('chrome', -3.6 + i * 2.2, 0, 1.0, 0.12, 1.0, 0.12, false);
      ib.f('c:#dc2626', -3.6, 1.0, 1.0, 0.5, 0.14, 0.04, false);
      ib.sofa(-6.0, 3.4, 3.0, Math.PI, '#78350f'); ib.sofa(6.0, 3.4, 3.0, Math.PI, '#78350f');
      ib.plant(-7.2, 4.4); ib.plant(7.2, 4.4); ib.rug(0, 0.6, 6, 3, '#78350f');
      ib.f('c:#e5e7eb', -W / 2 + 0.4, 0, 3.2, 0.7, 1.2, 2.0, true); ib.f('c:#38bdf8', -W / 2 + 0.75, 1.0, 3.2, 0.3, 0.4, 0.4, false);
      ib.plane('sign:БАНК · КАССА|#0f766e', 0, 3.2, -D / 2 + 0.18, 4.4, 0.7, 0);
      ib.light(0, H - 0.3, 0, 1.5, 0xfff3d6, 22); ib.light(0, H - 0.3, 3, 1.0, 0xfff3d6, 14);
      break;
    }
    // ---------------- АВТОСАЛОН ----------------
    case 'dealer': {
      S(26, 16, 6.2); ib.room(W, D, H, 'tex:floortile', WALLS.white);
      // подиумы с машинами (упрощённые силуэты)
      for (const [x, col] of [[-8, '#d50000'], [0, '#ffffff'], [8, '#1d4ed8']] as const) {
        ib.f('c:#e2e8f0', x, 0, -1.0, 5.2, 0.18, 8.0, true);
        ib.f('c:' + col, x, 0.18, -1.0, 1.9, 0.7, 4.4, false);
        ib.f('c:' + col, x, 0.88, -1.2, 1.7, 0.55, 2.4, false);
        ib.f('glass:0.5', x, 1.05, -1.2, 1.55, 0.4, 2.0, false);
        for (const dz of [-1.5, 1.5]) for (const sx of [-0.95, 0.95]) ib.f('c:#111827', x + sx, 0.18, -1.0 + dz, 0.22, 0.4, 0.9, false);
        ib.cyl('c:#9ca3af', x, 0.9, 3.6, 0.35, 1.2); // стойка с инфо
      }
      // стойка менеджера и зона ожидания
      ib.f('c:#111827', 10.6, 0, -4.4, 3.0, 0.85, 1.2, true); ib.npc(10.6, -5.3, 0, 'clerk');
      ib.act(10.6, -2.9, 2.0, 'Автосалон: купить новую машину', 'dealer');
      ib.sofa(-10.6, 4.6, 3.0, Math.PI, '#0f172a'); ib.f('c:#78350f', -7.4, 0, 4.6, 1.6, 0.45, 0.8, true);
      ib.f('c:#0ea5e9', -W / 2 + 0.2, 1.6, 0, 0.06, 1.2, 5.0, false);
      ib.plane('sign:АВТОСАЛОН · ТЕСТ-ДРАЙВ|#0ea5e9', 0, 4.4, D / 2 - 0.18, 6.4, 1.0, Math.PI);
      ib.plane('sign:НОВИНКИ 2026|#0ea5e9', 0, 3.4, -D / 2 + 0.18, 5.2, 0.8, 0);
      ib.plant(-12.2, 6.6); ib.plant(12.2, 6.6);
      ib.light(-8, H - 0.5, -1, 1.8, 0xffffff, 24); ib.light(0, H - 0.5, -1, 1.8, 0xffffff, 24); ib.light(8, H - 0.5, -1, 1.8, 0xffffff, 24);
      ib.light(0, H - 0.5, 5, 1.2, 0xffffff, 18);
      break;
    }
    // ---------------- АВТОСЕРВИС ----------------
    case 'service': {
      S(18, 14, 5.4); ib.room(W, D, H, 'tex:concrete', WALLS.grey, 'Выйти на улицу', 'metal');
      // подъёмник с машиной, инструментальная стена, шины, бочки
      ib.f('c:#334155', -3.0, 0, -1.0, 3.4, 0.3, 6.4, true);
      ib.f('c:#64748b', -3.0, 0.3, -1.0, 2.6, 0.14, 5.4, false);
      ib.f('c:#b91c1c', -3.0, 0.44, -1.0, 1.9, 0.7, 4.4, false);
      ib.f('c:#b91c1c', -3.0, 1.14, -1.2, 1.7, 0.5, 2.3, false);
      ib.f('glass:0.4', -3.0, 1.3, -1.2, 1.55, 0.35, 1.9, false);
      for (const dz of [-1.5, 1.5]) for (const sx of [-0.95, 0.95]) ib.f('c:#111827', -3.0 + sx, 0.2, -1.0 + dz, 0.22, 0.38, 0.9, false);
      ib.f('c:#facc15', -4.8, 0, -3.4, 0.2, 2.6, 0.2, true); ib.f('c:#facc15', -4.8, 0, 1.4, 0.2, 2.6, 0.2, true);
      ib.f('c:#facc15', -1.2, 0, -3.4, 0.2, 2.6, 0.2, true); ib.f('c:#facc15', -1.2, 0, 1.4, 0.2, 2.6, 0.2, true);
      ib.f('c:#374151', -3.0, 2.6, -1.0, 3.6, 0.14, 6.6, false);
      // стена инструментов
      for (let i = 0; i < 14; i++) { ib.f('c:#9ca3af', 7.8, 1.2 + (i % 4) * 0.35, -5.2 + Math.floor(i / 4) * 1.2, 0.1, 0.1, 0.5, false); }
      ib.f('c:#1f2937', 8.2, 0, -1.0, 0.6, 2.2, 4.4, true);
      for (let i = 0; i < 8; i++) { ib.cyl('c:#111827', 6.0 + (i % 4) * 0.9, 0, 2.6 + Math.floor(i / 4) * 0.9, 0.38, 0.28, true); }
      for (let i = 0; i < 4; i++) ib.cyl('c:' + ['#b91c1c', '#1d4ed8', '#365314', '#a16207'][i], -7.6 + i * 0.8, 0, 2.4, 0.3, 0.9, true);
      ib.f('c:#78350f', -7.4, 0, -4.4, 2.6, 0.95, 1.0, true); ib.f('c:#111827', -7.4, 0.95, -4.4, 1.4, 0.1, 0.5, false);
      // мастер и менеджер
      ib.f('c:#b91c1c', 5.0, 0, -5.4, 3.0, 1.4, 0.8, true);
      ib.act(3.5, -3.8, 2.0, 'Мастер: ремонт и тюнинг (подъезжайте на машине к воротам)', 'service-info');
      ib.npc(5.2, -4.5, Math.PI, 'mechanic'); ib.npc(-6.2, -3.2, 0.5, 'mechanic');
      ib.f('c:#1e293b', 8.2, 0, 4.6, 2.4, 0.9, 1.0, true); ib.act(7.0, 5.9, 1.5, 'Касса автосервиса', 'service-info');
      ib.plane('sign:АВТОСЕРВИС · ТЮНИНГ|#2563eb', 0, 4.0, -D / 2 + 0.18, 6, 0.8, 0);
      ib.light(-4, H - 0.4, 0, 1.6, 0xffffff, 22); ib.light(5, H - 0.4, 1, 1.4, 0xffffff, 20);
      break;
    }
    // ---------------- ПОЖАРНАЯ ЧАСТЬ ----------------
    case 'fire': {
      S(16, 12, 5.4); ib.room(W, D, H, 'tex:concrete', WALLS.grey, 'Выйти на улицу', 'metal');
      // пожарная машина
      ib.f('c:#b91c1c', -3.4, 0.2, -1.0, 2.4, 2.0, 7.4, true);
      ib.f('c:#b91c1c', -3.4, 2.2, -1.0, 2.2, 0.5, 5.0, false);
      ib.f('glass:0.45', -3.4, 1.6, -4.5, 2.0, 0.9, 0.12, false);
      for (const dz of [-2.6, -0.4, 2.4]) for (const sx of [-1.2, 1.2]) ib.f('c:#111827', -3.4 + sx, 0.2, -1.0 + dz, 0.28, 0.8, 1.2, false);
      ib.f('c:#dc2626', -3.4, 2.8, -1.0, 0.5, 0.4, 6.0, false); // лестница на крыше
      // стойки с экипировкой
      for (let i = 0; i < 6; i++) { ib.f('c:#1f2937', 5.6 + (i % 3) * 0.7, 0, -4.4, 0.6, 1.9, 0.6, true); ib.cyl('c:#facc15', 5.6 + (i % 3) * 0.7, 1.9, -4.4, 0.22, 0.28); }
      for (let i = 0; i < 4; i++) ib.cyl('c:#dc2626', 5.4 + i * 0.7, 0, 1.0, 0.24, 0.3); // рукава
      ib.f('c:#1e293b', 4.8, 0, 3.8, 3.4, 1.0, 0.9, true); ib.npc(4.8, 2.9, 0, 'fireman');
      ib.act(3.2, 3.8, 1.6, 'Диспетчер: вызовы через телефон', 'fire-info');
      ib.plane('sign:ПОЖАРНАЯ ЧАСТЬ · 01|#b91c1c', 0, 4.2, -D / 2 + 0.18, 5.6, 0.8, 0);
      ib.plane('sign:ВЫЕЗД 24/7|#dc2626', 0, 3.4, D / 2 - 0.16, 4.0, 0.6, Math.PI);
      ib.light(-3, H - 0.4, 0, 1.5, 0xffffff, 24); ib.light(5, H - 0.4, 1, 1.2, 0xffffff, 18);
      break;
    }
    // ---------------- ДЕРЕВЕНСКАЯ АДМИНИСТРАЦИЯ ----------------
    case 'vadmin': {
      S(17, 13, 3.7); ib.room(W, D, H, 'tex:parquet', WALLS.beige);
      ib.wall(-2, -D / 2, -2, D / 2, H, WALLS.beige, [[-2.6, 1.4], [-0.4, 1.4]]);
      ib.wall(-2, 1.4, W / 2, 1.4, H, WALLS.beige, [[0.6, 1.5]]);
      // приёмная с окошком
      ib.f('c:#78350f', 0.6, 0, -2.2, 3.6, 0.9, 1.0);
      ib.f('glass:0.3', 0.6, 0.9, -2.6, 3.6, 0.9, 0.05, false);
      ib.f('c:#92400e', 0.6, 1.8, -2.6, 3.8, 0.12, 0.12, false);
      ib.npc(0.6, -3.2, 0, 'clerk');
      ib.act(0.6, -1.0, 1.6, 'Администрация: дома на продажу', 'vadmin');
      ib.f('c:#2563eb', -W / 2 + 0.16, 1.3, -3.2, 0.04, 0.9, 1.4, false);
      ib.plane('sign:ДОМА · ЗЕМЛЯ · СПРАВКИ|#1e3a8a', 3.0, 2.1, -D / 2 + 0.16, 4.2, 0.5, 0);
      for (const z of [2.6, 4.4]) ib.sofa(3.6, z, 2.0, Math.PI / 2, '#78350f');
      ib.f('c:#78350f', 6.4, 0, 1.9, 1.2, 0.45, 0.6, true); // стол ожидания
      // кабинет главы
      ib.f('c:#78350f', -6.4, 0, -3.4, 3.2, 0.95, 1.5);
      ib.cyl('c:#1f2937', -6.4, 0, -4.8, 0.3, 1.0);
      ib.f('c:#0f172a', -6.4, 1.7, -D / 2 + 0.12, 2.4, 1.0, 0.06, false);
      ib.rug(-6.4, -1.6, 3.6, 2.6, '#7f1d1d');
      ib.act(-6.4, -1.4, 1.6, 'Глава администрации', 'vadmin');
      ib.f('c:#166534', -W / 2 + 0.2, 1.4, 2.0, 0.05, 0.9, 3.0, false); // стенд с планом
      ib.plant(-7.4, 4.6);
      // архив
      for (let k = 0; k < 3; k++) ib.f('c:#57534e', 3.6 + k * 2.2, 0, 3.4, 2.0, 2.2, 0.5, true);
      for (let k = 0; k < 3; k++) for (let lv = 0; lv < 4; lv++) ib.f('c:#e7e5e4', 3.6 + k * 2.2, 0.4 + lv * 0.45, 3.7, 1.8, 0.3, 0.1, false);
      ib.f('c:#e5e7eb', 8.6, 0, 4.4, 1.4, 1.0, 0.8);
      ib.light(-6, H - 0.3, -1, 1.0, 0xfff0d0, 12); ib.light(2, H - 0.3, 3, 1.0, 0xfff0d0, 12);
      break;
    }
    // ---------------- ПРОХОДНАЯ ЗАВОДА ----------------
    case 'checkpoint': {
      S(11, 8, 3.4); ib.room(W, D, H, 'tex:concrete', WALLS.grey, 'Выйти на улицу', 'metal');
      // будка охраны с остеклением и турникет
      ib.f('glass:0.3', -2.4, 0, -1.4, 3.0, 2.4, 0.08);
      ib.f('c:#d1d5db', -2.4, 0, -2.4, 3.0, 0.95, 0.8, true);
      ib.f('c:#111827', -2.4, 0.95, -2.4, 0.4, 0.3, 0.3, false);
      ib.npc(-2.4, -2.9, 0, 'guard');
      ib.act(-2.4, 0, 1.7, 'Отдел кадров: работа на заводе', 'factory');
      ib.f('chrome', 2.2, 0, -1.2, 0.16, 1.5, 0.16, false);
      for (const a of [0, Math.PI / 2, Math.PI]) ib.f('c:#9ca3af', 2.2 + Math.sin(a) * 0.9, 0.9, -1.2 + Math.cos(a) * 0.9, 0.12, 0.08, 1.6, false, a);
      ib.f('c:#facc15', 0.4, 0, -1.2, 2.8, 0.06, 0.4, false); // разметка
      ib.plane('sign:ПРОХОДНАЯ · ПРОПУСКА|#334155', 0, 2.7, -D / 2 + 0.16, 4.0, 0.55, 0);
      for (let i = 0; i < 4; i++) ib.f('c:#334155', 4.4, 0, -2.6 + i * 0.7, 0.9, 2.0, 0.55, true);
      ib.light(0, H - 0.3, 0, 1.1, 0xffffff, 12);
      break;
    }
    // ---------------- ПОДВАЛ (гроурум) ----------------
    // ---------------- ОРАНЖЕРЕЯ (теплица во дворе усадьбы) ----------------
    // ---------------- БАР С ДИСКО-КЛУБОМ ----------------
    case 'bar': {
      S(24, 18, 5.2);
      ib.room(W, D, H, 'tex:floortile', WALLS.night, 'Выйти из бара');
      // танцпол с подсветкой по периметру
      ib.f('c:#111827', 0, 0.02, 2.6, 12, 0.04, 9, false);
      for (let i = 0; i < 6; i++) {
        ib.f('glow:' + ['#a855f7', '#22d3ee', '#f472b6', '#facc15'][i % 4], -5.2 + i * 2.08, 0.05, -1.7, 0.22, 0.03, 9, false);
        ib.f('glow:' + ['#22d3ee', '#f472b6', '#a855f7', '#facc15'][i % 4], -5.2 + i * 2.08, 0.05, 6.9, 0.22, 0.03, 9, false);
      }
      ib.rug(0, 2.6, 11.4, 8.4, '#1e1b4b');
      // барная стойка у северной стены: E — меню, R — смена бармена
      ib.counter(-2.4, -5.2, 8.4, 'Бармен: E — меню напитков · R — смена бармена', 'counter');
      ib.f('c:#78350f', -2.4, 1.35, -D / 2 + 0.4, 9.0, 0.08, 0.4, false);
      for (let i = 0; i < 14; i++) ib.cyl('c:' + ['#166534', '#7c2d12', '#f59e0b', '#0e7490'][i % 4], -7.6 + i * 0.62, 1.42, -D / 2 + 0.4, 0.07, 0.3);
      for (let i = 0; i < 5; i++) { ib.cyl('c:#111827', -5.6 + i * 2.0, 0, -2.6, 0.22, 0.95, true); ib.cyl('c:#334155', -5.6 + i * 2.0, 0.95, -2.6, 0.3, 0.06); }
      // диджейская стойка и вертушки
      ib.f('c:#0f172a', 8.4, 0, -2.2, 3.4, 1.0, 1.4, true);
      ib.f('c:#1e293b', 8.4, 1.0, -2.2, 3.6, 0.08, 1.6, false);
      for (const dx of [-0.7, 0.7]) { ib.cyl('c:#111', 8.4 + dx, 1.08, -2.2, 0.34, 0.05); ib.cyl('glow:#22d3ee', 8.4 + dx, 1.1, -2.2, 0.16, 0.02); }
      ib.f('glow:#a855f7', 8.4, 2.3, -D / 2 + 0.22, 3.0, 0.7, 0.06, false);
      ib.plane('sign:DJ · ЛОС-ГОРОД|#a855f7', 8.4, 3.3, -D / 2 + 0.2, 3.2, 0.6, 0);
      ib.act(8.4, -0.6, 2.0, 'Пульт диджея: музыка и свет', 'dj');
      // сцена у восточной стены: вход с юга остаётся свободным
      ib.f('c:#1f2937', 7.4, 0, 6.4, 7.4, 0.55, 3.0, true);
      ib.cyl('chrome', 7.4, 0.55, 6.4, 0.09, 3.1);
      for (const sx of [4.6, 10.2]) { ib.f('c:#111827', sx, 0, 6.9, 1.0, 2.4, 1.0, true); ib.cyl('c:#374151', sx, 1.1, 6.35, 0.22, 0.22); }
      ib.act(3.4, 5.0, 2.4, 'Танцпол: зажигать', 'dance');
      // столики у стен и диваны
      for (const [x, z] of [[-8.4, 1.4], [-8.4, 4.6], [8.4, 3.6], [8.4, 6.2]]) ib.table(x, z, 3);
      ib.sofa(-11.0, 3.0, 3.2, Math.PI / 2, '#7c2d12');
      ib.sofa(11.0, 4.8, 3.2, -Math.PI / 2, '#7c2d12');
      // неон, зеркальный шар, лампы
      ib.cyl('c:#9ca3af', 0, H - 0.4, 2.4, 0.04, 0.5);
      ib.cyl('chrome', 0, H - 0.9, 2.4, 0.62, 0.6);
      ib.plane(`sign:${(venue || 'КЛУБ-БАР «ОГОНЁК»').toUpperCase()} · ТАНЦЫ ДО УТРА|#f472b6`, 0, H - 1.6, -D / 2 + 0.2, 7.4, 0.7, 0);
      // световые столбы вдоль танцпола
      for (let i = 0; i < 6; i++) ib.f('glow:' + ['#a855f7', '#22d3ee', '#f472b6', '#facc15'][i % 4], -5.0 + i * 2.0, 0.06, 2.6, 0.1, H - 1.5, 0.1, false);
      // лазерные лучи из углов в центр пола
      for (const [lx, lz, col] of [[-10, -7, '#22d3ee'], [10, -7, '#f472b6'], [-10, 7.4, '#facc15'], [10, 7.4, '#a855f7']] as const)
        ib.f('glow:' + col, lx / 2, H - 1.9, lz / 2, Math.hypot(lx, lz), 0.05, 0.05, false, Math.atan2(-lz, -lx));
      // VIP: бархатные стойки с лентой у западных диванов
      for (const pz of [1.4, 4.6]) { ib.cyl('c:#b45309', -9.2, 0, pz, 0.06, 1.0); ib.cyl('c:#fbbf24', -9.2, 1.0, pz, 0.09, 0.06); }
      ib.f('glow:#f472b6', -9.2, 0.72, 3.0, 0.05, 0.05, 3.4, false);
      ib.light(-7.5, H - 0.6, 1.0, 1.6, 0xa855f7, 20); ib.light(7.5, H - 0.6, 1.0, 1.6, 0x22d3ee, 20);
      ib.light(0, H - 0.5, 3.0, 1.8, 0xf472b6, 24); ib.light(-2.4, 2.6, -5.4, 1.0, 0xffd7a0, 12);
      ib.plant(-11.4, -6.4); ib.plant(11.4, -6.4);
      // толпа на танцполе: 18 гостей, часть — хостес; с диско-светом все пускаются в пляс
      for (let i = 0; i < 18; i++) {
        const cx = ((i * 7) % 11) - 5.0 + ((i * 13) % 5) * 0.22;
        const cz = -0.6 + ((i * 11) % 7) * 0.95 + ((i * 3) % 4) * 0.14;
        ib.npc(cx, cz, ((i * 37) % 63) / 10, i % 4 === 0 ? 'hostess' : 'dancer');
      }
      // хостес у сцены и в VIP, бармен за стойкой, гости на диванах и у бара
      ib.npc(4.9, 6.2, -Math.PI / 2, 'hostess'); ib.npc(9.9, 6.2, -Math.PI / 2, 'hostess');
      ib.npc(-10.4, 3.0, Math.PI / 2, 'hostess');
      ib.npc(-2.4, -4.0, Math.PI, 'bartender');
      ib.npc(-10.8, 4.4, Math.PI / 2, 'guest'); ib.npc(10.8, 5.8, -Math.PI / 2, 'guest');
      ib.npc(-0.4, -4.2, Math.PI, 'guest'); ib.npc(3.6, -4.2, Math.PI, 'guest');
      break;
    }
    case 'ozgim': {
      // маркетплейс OZGIM: шоурум-склад, стойка выдачи заказов и примерочные
      S(17, 13, 4.0); ib.room(W, D, H, 'tex:floortile', WALLS.blue);
      // брендированная стена и вывеска
      ib.f('c:#0ea5e9', 0, 0, -D / 2 + 0.06, W - 0.4, 2.2, 0.08, false);
      ib.plane('sign:OZGIM · МАРКЕТПЛЕЙС|#ffffff', 0, 3.0, -D / 2 + 0.2, 5.4, 0.7, 0);
      // стеллажи с посылками-заказами по периметру
      for (const [sx, sz, r] of [[-6.6, -3.6, 0], [-3.2, -3.6, 0], [3.2, -3.6, 0], [6.6, -3.6, 0]] as const) {
        ib.shelf(sx, sz, 2.4, r, 4);
        ib.col(sx - 1.2, sz - 0.4, sx + 1.2, sz + 0.4, 0, 1.8);
      }
      // стойка выдачи и продажи
      ib.f('c:#0f172a', -4.6, 0, 3.4, 4.2, 1.0, 1.0, true);
      ib.f('c:#e2e8f0', -4.6, 1.0, 3.4, 4.4, 0.08, 1.15, false);
      ib.act(-4.6, 2.4, 2.0, 'OZGIM: приём и выдача заказов', 'ozgim');
      ib.npc(-4.6, 2.6, 0, 'clerk');
      // примерочные и зеркало
      for (let i = 0; i < 2; i++) {
        const x = 3.0 + i * 2.2;
        ib.f('c:#0ea5e9', x, 0, 2.6, 0.08, 2.3, 1.7, false);
        ib.f('c:#0ea5e9', x, 0, 3.4, 1.8, 2.3, 0.08, false);
        ib.curtain(x + 0.85, 2.7, x + 0.85, 4.6, 2.1);
        ib.plane('glass:0.4', x + 0.85, 1.5, 4.55, 1.4, 2.0, Math.PI);
      }
      ib.act(3.0, 4.9, 1.6, 'Примерочная OZGIM — примерить и надеть', 'ozgimwear');
      ib.act(5.2, 4.9, 1.6, 'Примерочная OZGIM №2', 'ozgimwear');
      // рейл с вешалками и манекены
      ib.f('chrome', -7.2, 1.5, 5.2, 0.06, 0.06, 3.0, false);
      for (let i = 0; i < 12; i++) ib.f('c:' + GOODS[i % GOODS.length], -7.2, 0.7, 3.9 + i * 0.24, 0.5, 0.8, 0.06, false);
      for (const [mx2, mz2] of [[7.0, -0.6], [7.0, 1.2]] as const) { ib.cyl('c:#a8a29e', mx2, 0, mz2, 0.24, 0.6); ib.f('c:#0ea5e9', mx2, 0.6, mz2, 0.5, 0.7, 0.36, false); }
      ib.col(-7.2, 3.6, -6.9, 6.8, 0, 1.8);
      ib.plant(-7.4, -5.4); ib.plant(7.4, 5.4);
      ib.light(-3, H - 0.3, 0, 1.3, 0xe0f2fe, 17); ib.light(3, H - 0.3, 1, 1.3, 0xe0f2fe, 17);
      break;
    }
    case 'greenhouse': {
      S(10, 8, 3.0);
      ib.room(W, D, H, 'tex:concrete', 'c:#dfe7e2', 'Выйти во двор');
      // стеклянные стены с лёгкой зеленью — чувствуется, что снаружи сад
      for (const sx of [-1, 1]) ib.f('glass:0.18', sx * (W / 2 - 0.14), 0.2, 0, 0.06, H - 0.3, D - 0.4, false);
      ib.f('glass:0.18', 0, 0.2, -D / 2 + 0.14, W - 0.4, H - 0.3, 0.06, false);
      // центральная дорожка и стеллажи с рассадой по бокам
      ib.f('c:#b8a99a', 0, 0.02, 0.4, 1.1, 0.04, D - 1.6, false);
      ib.f('c:#9a8f7f', 0, 0.005, 0.4, 1.25, 0.03, D - 1.4, false);
      const beds: [number, number][] = [];
      for (let k = 0; k < 3; k++) {
        const bz = -2.3 + k * 2.3;
        for (const sx of [-1, 1]) {
          const bx = sx * 2.5;
          // короб грядки с землёй и растениями
          ib.f('c:#8b6b4a', bx, 0, bz, 3.0, 0.55, 1.5, true);
          ib.f('c:#4b3621', bx, 0.55, bz, 2.8, 0.08, 1.3, false);
          for (let i = 0; i < 5; i++) {
            const lx = bx - 1.1 + i * 0.55;
            ib.f('c:' + ['#2f7d32', '#388e3c', '#43a047'][i % 3], lx, 0.63, bz + (i % 2 ? 0.25 : -0.2), 0.3, 0.34, 0.3, false);
            ib.f('c:' + ['#e53935', '#fbc02d', '#d81b60'][i % 3], lx, 0.95, bz + (i % 2 ? 0.25 : -0.2), 0.12, 0.12, 0.12, false);
          }
          beds.push([bx, bz]);
          ib.act(sx * 0.7, bz, 1.2, `Грядка ${beds.length}`, 'pot:' + (beds.length - 1));
          ib.pots.push({ x: bx, z: bz });
        }
      }
      // водопроводная колонка: полив и напиться
      ib.f('c:#64748b', -W / 2 + 0.7, 0, -D / 2 + 1.0, 0.3, 1.15, 0.3, true);
      ib.f('chrome', -W / 2 + 0.7, 1.15, -D / 2 + 1.15, 0.14, 0.1, 0.5, false);
      ib.f('c:#f8fafc', -W / 2 + 1.6, 0, -D / 2 + 1.4, 1.1, 0.55, 0.9, true);
      ib.f('water', -W / 2 + 1.6, 0.5, -D / 2 + 1.4, 0.95, 0.06, 0.75, false);
      ib.act(-W / 2 + 1.6, -D / 2 + 2.1, 1.3, 'Умыться и напиться', 'water');
      // стеллаж с инвентарём, лейки, мешки, горшки и лампа
      ib.f('c:#78716c', W / 2 - 0.5, 0, -1.0, 0.75, 2.0, 3.2, true);
      for (let k = 0; k < 5; k++) ib.f('c:' + ['#166534', '#a16207', '#7c2d12'][k % 3], W / 2 - 0.5, 0.4 + (k % 3) * 0.55, -2.2 + Math.floor(k / 3) * 2.0, 0.4, 0.3, 0.9, false);
      for (let k = 0; k < 4; k++) { ib.cyl('c:#9a3412', W / 2 - 0.5, 0, 1.9 + (k % 2) * 0.5 - 0.25, 0.18, 0.34); }
      ib.f('c:#334155', W / 2 - 0.5, 2.0, 1.4, 0.5, 0.3, 0.5, false);
      ib.f('glow:#a3e635', 0, H - 0.25, -1.6, 2.4, 0.06, 0.25, false);
      ib.f('glow:#a3e635', 0, H - 0.25, 1.6, 2.4, 0.06, 0.25, false);
      ib.f('c:#1f2937', 0, H - 0.2, -1.6, 2.6, 0.06, 0.32, false);
      ib.f('c:#1f2937', 0, H - 0.2, 1.6, 2.6, 0.06, 0.32, false);
      ib.plant(-W / 2 + 1.0, 2.4); ib.plant(W / 2 - 1.0, -2.8); ib.plant(W / 2 - 1.0, 3.0);
      ib.light(0, H - 0.4, -1.2, 0.9, 0xd9f99d, 9); ib.light(0, H - 0.4, 1.6, 0.7, 0xd9f99d, 8);
      break;
    }
    case 'basement': {
      S(9, 8, 2.6); ib.room(W, D, H, 'tex:concrete', 'tex:brickwall', 'Подняться в дом');
      ib.f('c:#78350f', 3.5, 0, -0.5, 0.6, 1.8, 2.8, true);
      for (let k = 0; k < 6; k++) {
        const z = -1.4 + (k % 3) * 0.9, y = 0.25 + Math.floor(k / 3) * 0.75;
        ib.f('c:#b08968', 3.45, y, z, 0.45, 0.45, 0.65, false);
      }
      ib.light(0, H - 0.3, 0, 0.8, 0xfff1d6, 9);
      break;
    }
    case 'banya': {
      S(10, 12, 3); ib.room(W, D, H, 'tex:woodfloor', WALLS.panel, 'Выйти из бани', 'wood');
      // Вход с юга: диван слева, проход в парную справа.
      ib.wall(-5, 1, 5, 1, H, WALLS.panel, [[-2.5, 1.7]]);
      ib.sofa(3, 3.8, 2.4, 0, '#735342');
      // Справа от входа в парную печь, слева два крана, дальше лавки.
      ib.f('c:#44403c', -4, 0, -0.3, 1.1, 1.1, 1.1);
      ib.f('c:#78716c', -4, 1.1, -0.3, 0.9, 0.25, 0.9, false);
      for (const x of [3.7, 2.8]) {
        ib.f('chrome', x, 1.1, 0.82, 0.18, 0.12, 0.35, false);
        ib.f('c:#94a3b8', x, 0.65, 0.55, 0.55, 0.18, 0.5, false);
      }
      for (const x of [-3.8, 3.8]) ib.f('c:#b88958', x, 0.45, -3.7, 1.1, 0.14, 3.0, true);
      ib.light(0, H - 0.3, 3, 0.8, 0xffdba8, 8);
      ib.light(0, H - 0.3, -3, 0.8, 0xffc88a, 8);
      ib.lamp(-3, H - 0.3, -3, false);
      break;
    }
    // ---------------- ОФИС «ЛОС-ТЕХ» ----------------
    case 'office': {
      S(24, 16, 3.6); ib.room(W, D, H, 'tex:floortile', WALLS.panel);
      ib.officeWindow(0, 0.6, -D / 2 + 0.16, W - 1, 2.6); // светло-голубое небо без вида на мир
      // опенспейс 8 мест
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const i = r * 4 + c; ib.pc(-8 + c * 4.8, -4.6 + r * 4.6, 0, 'pc:' + i, `Рабочий ПК №${i + 1}`, (i % 3) === 1); }
      ib.f('c:#94a3b8', -1.0, 0.75, -2.3, 12.0, 0.06, 0.4, false); // перегородка между рядами столов
      // переговорная, HR, кофе, диваны
      ib.f('glass:0.25', 6.4, 0.6, 3.4, 0.08, 2.4, 5.0, false);
      ib.f('c:#78350f', 8.6, 0, 5.6, 4.2, 0.75, 1.4, true);
      for (let i = 0; i < 6; i++) ib.f('c:#334155', 7.2 + (i % 3) * 1.4, 0, 4.4 + Math.floor(i / 3) * 2.4, 0.5, 0.5, 0.5, false);
      ib.act(8.6, 4.4, 1.2, 'Переговорная', 'info');
      ib.counter(7.5, -5.8, 3.4, 'Отдел кадров «ЛосТех»: устройство в офис', 'officehr', false); ib.npc(7.5, -6.6, 0, 'clerk');
      ib.f('c:#1f2937', -10.4, 0, 5.6, 1.2, 1.0, 0.7); ib.f('c:#7c2d12', -10.4, 1.0, 5.6, 0.4, 0.4, 0.4, false);
      ib.act(-10.4, 4.6, 1.2, 'Кофемашина', 'coffee');
      ib.sofa(-4.0, 6.2, 2.6, Math.PI, '#0ea5e9'); ib.f('c:#78350f', -1.4, 0, 6.2, 1.6, 0.45, 0.7, true);
      ib.plane('sign:«ЛосТех» · IT & ДАННЫЕ|#0ea5e9', 0, 2.9, D / 2 - 0.18, 5.4, 0.65, Math.PI);
      ib.plane('sign:ОПЕНСПЕЙС|#0ea5e9', -4.0, 2.9, -2.3, 4.0, 0.5, 0);
      ib.plant(-10.8, -6.8); ib.plant(10.8, -6.8); ib.plant(10.8, 6.8);
      ib.rug(-4.0, 5.4, 6, 2.4, '#0f172a');
      ib.light(-6, H - 0.3, -3, 1.3, 0xffffff, 18); ib.light(3, H - 0.3, -3, 1.3, 0xffffff, 18);
      ib.light(0, H - 0.3, 5, 1.0, 0xffffff, 14); ib.light(8, H - 0.3, 4, 1.0, 0xfff3d6, 12);
      break;
    }
    // ---------------- САМОКАТЫ ----------------
    case 'scootershop': {
      S(15, 11, 4.2); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      for (let i = 0; i < 8; i++) {
        const x = -5.6 + (i % 4) * 3.8, z = -3.6 + Math.floor(i / 4) * 3.6;
        ib.cyl('c:#e2e8f0', x, 0, z, 0.95, 0.12); ib.col(x - 0.95, z - 0.95, x + 0.95, z + 0.95, 0, 0.12);
        ib.f('c:' + ['#16a34a', '#0ea5e9', '#f59e0b', '#111827'][i % 4], x, 0.14, z, 0.16, 0.06, 1.0, false);
        ib.f('c:#111827', x, 0.2, z + 0.45, 0.05, 1.05, 0.05, false);
        ib.f('c:#111827', x, 1.25, z + 0.45, 0.52, 0.04, 0.04, false);
        ib.cyl('c:#111827', x, 0.14, z - 0.5, 0.14, 0.14);
      }
      ib.counter(5.4, 2.4, 3.2, 'Продавец: электросамокаты (20 моделей)', 'scooterdealer', false); ib.npc(5.4, 1.5, 0, 'clerk');
      ib.f('c:#16a34a', -W / 2 + 0.2, 0, 3.4, 0.08, 1.6, 3.0, false); // баннер с зарядками
      ib.plane('sign:🛴 ВЖУХ STORE · ТЕСТ-ДРАЙВ|#16a34a', 0, 3.2, -D / 2 + 0.18, 5.2, 0.7, 0);
      ib.plant(-6.4, 4.2); ib.plant(6.4, -4.2);
      ib.light(-3, H - 0.4, -1, 1.5, 0xffffff, 18); ib.light(4, H - 0.4, 1, 1.3, 0xffffff, 16);
      break;
    }
    // ---------------- ДИСПЕТЧЕРСКАЯ ----------------
    case 'truckoffice': {
      S(13, 10, 3.4); ib.room(W, D, H, 'tex:floortile', WALLS.grey);
      ib.counter(0, -3.0, 4.4, 'Диспетчер: устройство на работу и заказы', 'trucker', false); ib.npc(0, -3.9, 0, 'clerk');
      ib.plane('sign:«ВОСТОК-ТРАНС» · ГРУЗОПЕРЕВОЗКИ|#b45309', 0, 2.7, -D / 2 + 0.16, 5.4, 0.6, 0);
      ib.f('c:#1e293b', -4.9, 1.2, -D / 2 + 0.15, 2.6, 1.5, 0.05, false); ib.f('glow:#38bdf8', -4.9, 1.3, -D / 2 + 0.18, 2.4, 1.3, 0.01, false); // карта маршрутов
      for (const [x, z] of [[-3.6, 1.6], [3.6, 1.6]]) { ib.f('c:#78350f', x, 0, z, 1.7, 0.75, 0.85); ib.f('c:#111827', x, 0.75, z, 0.5, 0.35, 0.05, false); ib.cyl('c:#111', x, 0, z + 0.9, 0.22, 0.48); ib.f('glow:#38bdf8', x, 0.78, z - 0.2, 0.42, 0.3, 0.02, false); }
      ib.sofa(-2.6, 4.2, 2.4, Math.PI, '#b45309'); ib.f('c:#78350f', 3.0, 0, 4.3, 1.2, 0.45, 0.7, true); ib.rug(-0.6, 4.2, 2.4, 1.6, '#78350f');
      ib.f('c:#e2e8f0', -5.2, 0, 3.0, 0.6, 1.1, 0.6, true); ib.f('c:#38bdf8', -5.2, 1.1, 3.0, 0.45, 0.5, 0.45, false);
      ib.plant(5.4, 3.6); ib.plane('sign:ЗАКАЗЫ · РЕЙСЫ · ПУТЕВЫЕ ЛИСТЫ|#b45309', 0, 2.4, -D / 2 + 0.2, 4.6, 0.4, 0);
      ib.light(-2, H - 0.3, 0, 1.2, 0xffffff, 14); ib.light(3, H - 0.3, 2, 1.0, 0xffffff, 12);
      break;
    }
    // ---------------- ТОРГОВЫЙ ЦЕНТР ----------------
    case 'mall': {
      S(44, 32, 9); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      ib.ceil(-W / 2, -D / 2, W / 2, D / 2, H, '#e2e8f0');
      // второй этаж-галерея и световые люки
      ib.f('c:#cbd5e1', 0, 4.2, -D / 2 + 1.5, W, 0.25, 3, false);
      ib.f('glass:0.3', 0, 4.45, -D / 2 + 3, W, 1.0, 0.05, false);
      for (const x of [-12, 0, 12]) { ib.f('glow:#e0f2fe', x, H - 0.09, 0, 6, 0.02, 6, false); ib.f('c:#94a3b8', x, H - 0.12, 0, 6.4, 0.04, 6.4, false); }
      const shops: [string, string, string][] = [['clothes', 'Одежда «Стиль»', '#8b5cf6'], ['mallfood', 'Фуд-корт «Вкусно»', '#f97316'], ['pharmacy', 'Аптека «Здоровье»', '#10b981'], ['barber', 'Барбершоп', '#ec4899'], ['shop24', 'Продукты 24/7', '#e11d48'], ['gunshop', 'Охота и рыбалка', '#374151']];
      shops.forEach(([k, name, color], i) => {
        const left = i < 3; const z = -10 + (i % 3) * 8;
        const x = left ? -W / 2 + 0.25 : W / 2 - 0.25;
        const ry = left ? Math.PI / 2 : -Math.PI / 2;
        ib.f('glass:0.35', x + (left ? 0.1 : -0.1), 0.3, z - 2.2, 0.08, 2.6, 3, false);
        ib.f('c:' + color, x + (left ? 0.05 : -0.05), 0, z + 1.4, 0.12, 2.4, 1.6, false);
        ib.plane(`sign:${name}|${color}`, x + (left ? 0.2 : -0.2), 3.2, z - 0.5, 5, 0.9, ry);
        for (let n = 0; n < 5; n++) ib.f('c:' + GOODS[(n + i) % GOODS.length], x + (left ? 0.6 : -0.6), 0.3, z - 3.2 + n * 0.55, 0.3, 1.3 + (n % 2) * 0.5, 0.4, false);
        ib.f('c:#f1f5f9', x + (left ? 0.3 : -0.3), 3.7, z - 0.5, 0.6, 0.12, 5.2, false); // козырёк
        ib.act(x + (left ? 1.0 : -1.0), z + 1.4, 1.4, `Войти: ${name}`, `mallshop:${k}:${i}`);
        ib.doorSpots['shop' + i] = { x: ib.ox + x + (left ? 1.4 : -1.4), z: ib.oz + z + 1.4, a: left ? Math.PI / 2 : -Math.PI / 2, y: 0 };
      });
      // фонтан, эскалатор-декор, зоны отдыха
      ib.cyl('c:#9ca3af', 0, 0, 0, 3, 0.7, true); ib.cyl('water', 0, 0.5, 0, 2.7, 0.25); ib.cyl('c:#e5e7eb', 0, 0.7, 0, 0.4, 2.5);
      ib.f('glass:0.25', 4.6, 0.6, -D / 2 + 6.0, 3.2, 3.4, 0.06, false);
      for (let i = 0; i < 8; i++) ib.f('c:#94a3b8', 4.6, 0.1 + i * 0.42, -D / 2 + 6.0 - i * 0.6, 3.0, 0.1, 0.6, false);
      for (const [x, z] of [[-6, 6], [6, 6], [-6, -6], [6, -6]]) { ib.sofa(x, z, 2.4, x > 0 ? -Math.PI / 2 : Math.PI / 2, '#334155'); ib.plant(x, z + (z > 0 ? 2 : -2)); ib.cyl('c:#78350f', x + 2, 0, z, 0.4, 0.7); }
      ib.npc(-8, 3, 1, 'shopper'); ib.npc(9, -3, -2, 'shopper'); ib.npc(3, 9, 3, 'shopper'); ib.npc(-3, -9, 0.4, 'shopper');
      ib.plane('sign:ТЦ «ОРБИТА» · 2 ЭТАЖА|#0ea5e9', 0, 6.0, D / 2 - 0.2, 8, 1.1, Math.PI);
      ib.rug(0, 3.4, 8, 3, '#0f172a');
      ib.light(-12, H - 0.5, 0, 1.6, 0xffffff, 26); ib.light(12, H - 0.5, 0, 1.6, 0xffffff, 26); ib.light(0, H - 0.5, 8, 1.4, 0xffffff, 22); ib.light(0, H - 0.5, -8, 1.4, 0xffffff, 22);
      break;
    }
    // ---------------- ПОДЪЕЗД (2 этажа, 4 квартиры) ----------------
    case 'hall': {
      S(10, 14, 6.6); ib.room(W, D, H, 'tex:floortile', WALLS.mint, 'Выйти из подъезда');
      // ---- тамбур у входа: коврик, табличка дома, домофон ----
      ib.f('c:#3f3f46', 0, 0, D / 2 - 1.1, 2.6, 0.03, 1.2, false);
      ib.plane('sign:ПОДЪЕЗД 1 · ЛОС-ГОРОД|#166534', 0, 2.35, D / 2 - 0.14, 2.2, 0.42, Math.PI);
      ib.f('c:#1f2937', -W / 2 + 0.16, 1.35, D / 2 - 0.9, 0.12, 0.34, 0.22, false);
      // ---- почтовые ящики у входа ----
      for (let i = 0; i < 8; i++) for (let r = 0; r < 2; r++) {
        ib.f('c:#1e3a8a', -W / 2 + 0.2, 1.05 + r * 0.32, 3.6 + i * 0.3, 0.14, 0.28, 0.26, false);
        ib.f('chrome', -W / 2 + 0.28, 1.11 + r * 0.32, 3.6 + i * 0.3, 0.02, 0.04, 0.14, false);
      }
      // ---- 1 этаж: две квартиры на западной стене ----
      const door1 = [[-W / 2 + 0.12, -0.5, Math.PI / 2, 0], [-W / 2 + 0.12, -3.0, Math.PI / 2, 0],
      // ---- 2 этаж: две квартиры на северной стене (площадка y = 3.0) ----
        [-2.2, -D / 2 + 0.12, 0, 3.0], [1.4, -D / 2 + 0.12, 0, 3.0]] as const;
      door1.forEach(([x, z, ry, y], u) => {
        const owned = opts.owned?.[u];
        ib.f(owned ? 'c:#166534' : 'c:#7c2d12', x, y, z, ry ? 0.08 : 1.05, 2.1, ry ? 1.05 : 0.08, false);
        ib.f('chrome', x + (ry ? 0.06 : 0.38), y + 1.0, z + (ry ? 0.38 : 0.06), 0.05, 0.05, 0.05, false);
        ib.plane(`sign:${u + 1}|#334155`, x + (ry ? 0.05 : 0), y + 2.24, z + (ry ? 0 : 0.05), 0.34, 0.24, ry ? Math.PI / 2 : 0);
        // коврик и наличник
        ib.f('c:#57534e', x + (ry ? 0.6 : 0), y, z + (ry ? 0 : 0.6), ry ? 1.0 : 1.25, 0.03, ry ? 1.25 : 1.0, false);
        ib.f('c:#e7e5e4', x + (ry ? 0.03 : 0), y + 2.15, z + (ry ? 0 : 0.03), ry ? 0.12 : 1.3, 0.1, ry ? 1.3 : 0.12, false);
        const ax = x + (ry ? 0.95 : 0), az = z + (ry ? 0 : 0.95);
        ib.act(ax, az, 1.25, `Квартира ${u + 1}`, 'apt:' + u, y);
        ib.doorSpots['apt' + u] = { x: ib.ox + ax, z: ib.oz + az, a: ry ? Math.PI / 2 : 0, y };
      });
      // ---- лестница: 12 ступеней от входа к площадке второго этажа ----
      const steps = 12, rise = 3.0 / steps, depth = 0.36, x0st = 2.9;
      for (let st = 0; st < steps; st++) {
        const z = 3.0 - st * depth;
        ib.f('c:#a8a29e', x0st, 0, z, 2.6, rise * (st + 1), depth, st > 0);
        ib.f('c:#78716c', x0st, rise * (st + 1) - 0.02, z + depth / 2 - 0.03, 2.6, 0.04, 0.06, false);
      }
      // перила вдоль марша
      ib.f('c:#78350f', 4.15, 0.9, 1.4, 0.07, 0.07, 4.0, false, 0.09);
      for (let st = 0; st < steps; st += 2) ib.f('c:#44403c', 4.15, rise * (st + 1), 3.0 - st * depth, 0.05, 0.95, 0.05, false);
      // ---- площадка второго этажа ----
      ib.f('c:#a8a29e', 0, 2.85, -4.1, 9.6, 0.15, 5.8, false);
      ib.col(-4.8, -7.0, 4.8, -1.2, 2.85, 3.0);
      // ограждение площадки со стороны лестницы
      ib.f('c:#78350f', -1.6, 3.85, -2.55, 6.2, 0.08, 0.08, false);
      ib.col(-4.7, -2.62, 1.5, -2.48, 3.0, 4.0);
      for (let x = -4.6; x <= 1.4; x += 1.2) ib.f('c:#44403c', x, 3.0, -2.55, 0.05, 0.9, 0.05, false);
      // ---- лифт: шахта с дверями на каждом этаже ----
      for (const y of [0, 3.0]) {
        ib.f('c:#94a3b8', W / 2 - 0.16, y, -4.6, 0.12, 2.2, 2.2, false);
        ib.f('c:#334155', W / 2 - 0.2, y, -4.6, 0.06, 2.0, 1.0, false);
        ib.f('chrome', W / 2 - 0.1, y + 1.0, -4.0, 0.1, 0.12, 0.06, false);
        ib.plane('sign:ЛИФТ|#0f172a', W / 2 - 0.22, y + 2.35, -4.6, 0.9, 0.22, -Math.PI / 2);
        ib.act(W / 2 - 1.2, -4.6, 1.2, 'Лифт не работает — только лестница', 'lift', y);
      }
      // ---- указатели этажей и свет ----
      ib.plane('sign:1 ЭТАЖ|#334155', -3.9, 2.55, D / 2 - 0.15, 1.5, 0.34, Math.PI);
      ib.plane('sign:2 ЭТАЖ|#334155', -3.9, 5.7, D / 2 - 0.15, 1.5, 0.34, Math.PI);
      ib.light(0, 2.75, 3.4, 1.1, 0xfff3d6, 11);
      ib.light(-2.0, 2.75, -3.4, 1.0, 0xfff3d6, 10);
      ib.light(-1.4, 6.1, -4.4, 1.2, 0xfff3d6, 12);
      ib.light(2.6, 6.1, 0.6, 1.0, 0xfff3d6, 11);
      // ---- бытовые мелочи подъезда: велосипед, коляска, скамейка, доска объявлений ----
      ib.f('chrome', 3.7, 0, 5.4, 0.1, 1.0, 1.5, true); ib.cyl('c:#111827', 3.1, 0, 5.4, 0.32, 0.08);
      ib.f('c:#f8fafc', -3.7, 0, 5.2, 1.4, 0.9, 0.55, false); ib.f('c:#94a3b8', -3.7, 0.9, 5.2, 1.4, 0.3, 0.55, false);
      ib.f('c:#78350f', -1.2, 0, 4.6, 1.6, 0.45, 0.5); ib.f('c:#78350f', -1.2, 0.45, 4.85, 1.6, 0.5, 0.1, false);
      ib.f('c:#166534', W / 2 - 0.22, 1.35, 2.6, 0.06, 1.0, 1.8, false);
      ib.plant(-4.4, -5.9); ib.plant(3.4, -6.2);
      break;
    }
    // ---------------- ЖИЛЬЁ: прихожая, спальня, кухня-гостиная и санузел ----------------
    case 'apt_eco': case 'apt_mid': case 'apt_lux': case 'house_city': case 'house_village': {
      const house = kind === 'house_city' || kind === 'house_village';
      const village = kind === 'house_village';
      const lux = kind === 'apt_lux';
      if (lux) S(18, 14, 3.2);
      else if (kind === 'apt_eco') S(12, 10, 2.9);
      else if (house) S(village ? 13 : 14, 12, 3.0);
      else S(14, 11, 3.0);
      const left = -W / 2, right = W / 2, back = -D / 2, front = D / 2;
      const divider = -1.8, bathX = right - 3.3, bathZ = back + 3.5;
      const wall = village ? WALLS.wood : WALLS.beige;
      ib.room(W, D, H, 'tex:parquet', village ? WALLS.panel : WALLS.paper,
        house ? 'Выйти на крыльцо' : 'Выйти в подъезд', 'wood');

      // Слева отдельная спальня; широкий дверной проём ведёт из прихожей.
      ib.wall(divider, back, divider, 1.8, H, wall, [[0.45, 1.5]]);
      ib.bedAt(left + 1.65, back + 1.65, lux ? 2.0 : 1.6, 0, village ? '#ead3a7' : '#cbd5e1');
      ib.f('c:#9a785c', left + 3.2, 0, back + 0.5, 0.55, 0.55, 0.55);
      ib.f('glow:#fff2cc', left + 3.2, 0.55, back + 0.5, 0.18, 0.28, 0.18, false);
      ib.f('c:#8b6b55', left + 0.4, 0, 1.15, 0.65, 1.9, 2.0);
      ib.rug(left + 1.8, back + 3.45, 2.6, 1.5, village ? '#a16207' : '#a8a29e');
      ib.painting(left + 1.65, 2.05, back + 0.13, 0, '#72999a');
      ib.pc(left + 1.8, front - 0.7, Math.PI, 'homepc', 'Домашний компьютер');

      // Санузел отделён стенами и проёмом; всё оборудование у стен.
      ib.floor(bathX + 0.1, back + 0.1, right - 0.1, bathZ - 0.1, 'tex:floortile', 1.5, 0.012);
      ib.wall(bathX, back, bathX, bathZ, H, WALLS.white);
      ib.wall(bathX, bathZ, right, bathZ, H, WALLS.white, [[right - 1.5, 1.35]]);
      ib.f('c:#f8fafc', right - 0.6, 0, back + 0.9, 0.65, 0.43, 0.9);
      ib.f('c:#f8fafc', bathX + 0.55, 0, back + 0.65, 0.75, 0.82, 0.6);
      ib.f('c:#dbeafe', bathX + 0.55, 1.0, back + 0.12, 0.7, 0.65, 0.04, false); // зеркало
      ib.f('c:#e2e8f0', right - 0.55, 0, bathZ - 0.55, 0.75, 0.82, 0.65); // стиральная машина
      ib.cyl('c:#475569', right - 0.55, 0.43, bathZ - 0.2, 0.18, 0.05);
      ib.rug(right - 1.65, bathZ - 1.2, 1.0, 0.6, '#94a3b8');

      // Кухня вдоль задней стены, обеденный стол не загораживает проход.
      const kitchenX = (divider + bathX) / 2;
      const kitchenW = Math.min(3.1, bathX - divider - 0.6);
      ib.kitchen(kitchenX, back + 0.38, kitchenW, 0);
      ib.fridgeAt(bathX - 0.5, back + 1.3, 0);
      ib.table(0.0, -1.5, 2, village ? '#92400e' : '#a8a29e');
      ib.rug(0, -1.5, 2.4, 2.3, village ? '#b98c6b' : '#d6d3d1');
      // Гостиная справа: диван смотрит к телевизору, центральный путь свободен.
      ib.sofa(right - 1.25, 1.35, 2.2, -Math.PI / 2, village ? '#8b5e4a' : '#64748b');
      ib.tv(right - 3.25, 1.35, 1.35, Math.PI / 2);
      ib.rug(right - 2.25, 1.35, 2.5, 2.7, village ? '#a16207' : '#94a3b8');
      ib.plant(right - 0.55, front - 0.7);
      // Обновлённая домашняя мебель: фасады, ручки, детали и мягкий текстиль.
      for (let i = 0; i < 3; i++) {
        const x = kitchenX - kitchenW / 2 + (i + 0.5) * kitchenW / 3;
        ib.f('c:#c6a987', x, 0.08, back + 0.72, kitchenW / 3 - 0.04, 0.68, 0.025, false);
        ib.f('c:#57534e', x, 0.65, back + 0.74, 0.18, 0.035, 0.025, false);
      }
      ib.f('c:#f5efe5', left + 1.65, 0.59, back + 2.1, 1.35, 0.06, 0.6, false);
      ib.f('c:#d6b99a', right - 1.22, 0.48, 1.35, 0.65, 0.08, 1.4, false);
      ib.f('c:#e7e5e4', bathX - 0.5, 1.22, back + 1.66, 0.6, 0.025, 0.025, false);
      ib.f('c:#a8a29e', -1.9, 0, front - 0.65, 0.65, 0.5, 0.45); // обувница
      ib.f('c:#78350f', -1.4, 1.3, front - 0.16, 0.8, 0.08, 0.07, false); // крючки
      for (const dx of [-0.25, 0, 0.25]) ib.f('chrome', -1.4 + dx, 1.18, front - 0.12, 0.05, 0.12, 0.05, false);
      if (house) {
        // Люк не создаёт коллайдера: через него можно спуститься и вернуться.
        ib.f('c:#5b3a1e', 0.1, 0.005, 2.0, 1.0, 0.02, 1.0, false);
        ib.f('chrome', 0.45, 0.03, 2.0, 0.12, 0.03, 0.04, false);
        ib.act(0.1, 2.0, 1.1, 'Спуститься в подвал', 'basement');
        ib.doorSpots.hatch = { x: ib.ox + 0.1, z: ib.oz + 0.9, a: Math.PI, y: 0 };
      }
      if (village) {
        // Тёплая печь и посуда у кухни — без дополнительных коллайдеров на проходе.
        ib.f('c:#d6c7ac', right - 0.4, 1.0, -0.6, 0.18, 0.75, 1.0, false);
        ib.f('c:#854d0e', right - 0.28, 1.25, -0.6, 0.04, 0.35, 0.45, false);
        ib.painting(left + 0.14, 2.0, -0.9, Math.PI / 2, '#8f6b48');
      } else if (kind === 'house_city') {
        ib.painting(right - 0.14, 2.0, front - 2.1, -Math.PI / 2, '#72999a');
      } else if (kind === 'apt_eco') {
        ib.f('c:#a8a29e', left + 0.15, 1.5, front - 1.4, 0.12, 0.12, 1.3, false);
      }
      if (lux) {
        ib.f('c:#a8a29e', left + 0.4, 0, -0.5, 0.65, 2.2, 2.1); // большой шкаф
        ib.plant(right - 0.6, -1.4);
        ib.painting(0.3, 2.1, front - 0.13, Math.PI, '#b98b69');
      }
      if (lux) { ib.lamp(left + 1.5, H - 0.3, 2.0, false); ib.lamp(2.5, H - 0.3, 3.0, false); }
      ib.light(left + 2.4, H - 0.3, -1.0, 0.9, 0xffefd7, 9);
      ib.light(0.2, H - 0.3, -2.0, 1.0, 0xffefd7, 10);
      ib.light(right - 2.0, H - 0.3, 1.2, 1.0, 0xffefd7, 10);
      ib.light(right - 1.7, H - 0.3, back + 1.6, 0.65, 0xfff7e6, 6);
      break;
    }
    // ---------------- ШАХТА «ЧЁРНАЯ ЖИЛА»: штрек, крепи, жилы, рельсы и вагонетки ----------------
    case 'mine': {
      S(24, 40, 4.4); ib.room(W, D, H, 'tex:gravel', 'tex:rockwall', 'Выйти из шахты', 'metal');
      for (let z = -D / 2 + 4; z < D / 2 - 2; z += 5) { // крепи: стойки + верхняк
        ib.f('c:#5b3a1e', -W / 2 + 0.9, 0, z, 0.42, H - 0.4, 0.42);
        ib.f('c:#5b3a1e', W / 2 - 0.9, 0, z, 0.42, H - 0.4, 0.42);
        ib.f('c:#4a2f18', 0, H - 0.6, z, W - 1.4, 0.34, 0.46, false);
      }
      for (const rx of [-0.5, 0.5]) ib.f('chrome', rx, 0.02, -D / 2 + 8, 0.12, 0.07, 16, false);      // рельсы к тёмному стволу
      for (let z = -D / 2 + 1; z < 1; z += 1.2) ib.f('c:#3f2d1c', 0, 0.012, z, 1.9, 0.06, 0.24, false); // шпалы
      ib.plane('c:#040507', 0, 1.55, -D / 2 + 0.18, 3.6, 3.0, 0);                                     // зев тоннеля
      const veins: [number, number][] = [[-W / 2 + 1.5, -6], [-W / 2 + 1.5, 2], [-W / 2 + 1.5, 10], [W / 2 - 1.5, -2]];
      for (const [vx, vz] of veins) {                                                                  // угольные жилы с подсветкой
        const west = vx < 0;
        ib.f('tex:coalseam', vx, 0, vz, 2.4, 2.3, 3.0);
        for (let k = 0; k < 6; k++) ib.f('glow:#7dd3fc', vx + (west ? -0.9 : 0.9), 0.5 + (k % 3) * 0.5, vz - 1 + Math.floor(k / 2) * 0.9, 0.18, 0.18, 0.12, false);
        ib.act(vx + (west ? 2.6 : -2.6), vz, 1.7, '⛏️ Рубить уголь', 'mine');
      }
      ib.f('c:#57534e', 0, 0.03, 3.4, 2.6, 0.06, 2.6, false);                                          // площадка клети
      ib.f('c:#3f3f46', -1.3, 0, 3.4, 0.1, 2.6, 0.1, false); ib.f('c:#3f3f46', 1.3, 0, 3.4, 0.1, 2.6, 0.1, false);
      ib.act(0, 3.4, 2.0, '⬇️ Спуститься в забой', 'mine_down');
      ib.f('c:#f59e0b', -W / 2 + 1.3, 0, D / 2 - 3.2, 1.6, 1.9, 0.5);                                   // стойка формы
      ib.f('c:#fde68a', -W / 2 + 1.3, 1.95, D / 2 - 3.2, 1.7, 0.12, 0.6, false);
      ib.plane('sign:ФОРМА · КАСКИ · КИРКИ|#b45309', -W / 2 + 1.3, 2.6, D / 2 - 3.2, 2.1, 0.42, Math.PI);
      ib.act(-W / 2 + 2.7, D / 2 - 3.2, 1.6, '🦺 Устроиться: форма и кирка', 'mine_uniform');
      ib.f('c:#14532d', W / 2 - 1.0, 0, D / 2 - 3.2, 1.5, 2.1, 0.14, false);                            // доска объявлений
      ib.plane('sign:ШАХТА «ЧЁРНАЯ ЖИЛА» · $540 ЗА ВАГОНЕТКУ|#14532d', W / 2 - 1.0, 2.5, D / 2 - 3.1, 2.7, 0.5, Math.PI);
      ib.act(0, -D / 2 + 8.4, 2.1, '🚃 Отгрузить уголь в вагонетку', 'mine_cart');                     // отгрузка
      const mkCart = (z: number) => {                                                                   // динамические вагонетки
        const gr = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 2.2), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }));
        body.position.y = 0.75; gr.add(body);
        const coal = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 2.0), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6, metalness: 0.15 }));
        coal.position.y = 1.28; coal.visible = false; coal.name = 'coal'; gr.add(coal);
        for (const wx of [-0.68, 0.68]) for (const wz of [-0.72, 0.72]) {
          const whl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x2b2f36 }));
          whl.rotation.z = Math.PI / 2; whl.position.set(wx, 0.28, wz); gr.add(whl);
        }
        gr.position.set(ib.ox, 0, ib.oz + z);
        ib.group.add(gr);
        return gr;
      };
      ib.carts.push(mkCart(-D / 2 + 6), mkCart(-D / 2 + 1.5));
      for (let z = -D / 2 + 6; z < D / 2 - 4; z += 8) ib.light(0, H - 0.7, z, 0.95, 0xffd9a0, 15);
      ib.light(-W / 2 + 2.4, 2.4, -6, 0.5, 0x9fd8ff, 8); ib.light(-W / 2 + 2.4, 2.4, 10, 0.5, 0x9fd8ff, 8);
      break;
    }
    // ---------------- КАЗИНО «ЖАР-ПТИЦА»: золото, бархат, стол «Бомба» и фейсконтроль ----------------
    case 'casino': {
      S(26, 22, 4.8); ib.room(W, D, H, 'tex:carpet_red', WALLS.night, 'Выйти из казино');
      // золотые колонны и карниз по периметру зала
      for (const [px, pz] of [[-W / 2 + 2, -D / 2 + 2], [W / 2 - 2, -D / 2 + 2], [-W / 2 + 2, D / 2 - 2], [W / 2 - 2, D / 2 - 2]] as const) {
        ib.cyl('c:#b45309', px, 0, pz, 0.5, H - 0.5, true); ib.cyl('c:#fbbf24', px, H - 0.6, pz, 0.62, 0.2);
      }
      ib.f('c:#fbbf24', 0, H - 0.35, 0, W - 0.6, 0.12, D - 0.6, false);
      // главный стол «Бомба»: зелёное сукно, фишки, дилер напротив
      ib.cyl('tex:felt', 0, 0, -1.6, 2.5, 0.95, true);
      ib.cyl('c:#3b2412', 0, 0, -1.6, 2.7, 0.12, false);
      ib.cyl('c:#fbbf24', 0, 0.95, -1.6, 2.6, 0.04, false);
      for (let i = 0; i < 6; i++) ib.cyl('c:' + ['#dc2626', '#1d4ed8', '#111827'][i % 3], -0.9 + (i % 3) * 0.9, 0.95, -1.6 + (i < 3 ? -0.5 : 0.5), 0.16, 0.1 + (i % 3) * 0.05);
      ib.act(0, 1.2, 2.4, '💣 Игра «Бомба» — ставки от $30 000 до $1 000 000', 'gamble');
      // стойки игровых автоматов вдоль стен
      for (const sx of [-W / 2 + 1.6, W / 2 - 1.6]) for (let z = -D / 2 + 3; z <= D / 2 - 5; z += 3.2) {
        const west = sx < 0;
        ib.f('c:#1f2937', sx, 0, z, 1.1, 2.0, 0.8, true);
        ib.f('glow:' + ['#facc15', '#f472b6', '#22d3ee', '#a855f7'][Math.abs(Math.round(z)) % 4], sx + (west ? -0.3 : 0.3), 1.3, z, 0.1, 0.9, 0.6, false);
      }
      // касса обмена фишек и барная стойка у юго-западного угла
      ib.counter(-7.4, D / 2 - 2.6, 4.6, 'Касса: обменяйте выигрыш на наличные', 'counter');
      // вывеска и неон над входом
      ib.plane(`sign:${(venue || 'КАЗИНО «ЖАР-ПТИЦА»').toUpperCase()} · ×5 ДЖЕКПОТ|#f59e0b`, 0, H - 1.2, -D / 2 + 0.2, 8.4, 0.9, 0);
      ib.f('glow:#f59e0b', 0, H - 0.7, -D / 2 + 0.16, 9.0, 0.16, 0.06, false);
      // охрана у входа и дилер за столом
      ib.npc(-3.2, D / 2 - 1.6, Math.PI, 'security'); ib.npc(3.2, D / 2 - 1.6, Math.PI, 'security');
      ib.npc(0, -3.6, 0, 'dealer');
      ib.light(0, H - 0.6, -1.6, 1.8, 0xffe3a8, 16); ib.light(-W / 2 + 4, H - 0.6, 4, 1.0, 0xf59e0b, 12); ib.light(W / 2 - 4, H - 0.6, 4, 1.0, 0xa855f7, 12);
      break;
    }
  }
  if (kind !== 'basement' && kind !== 'banya') dressInterior(ib, kind, { W, D, H, venue, seed });
  if (kind !== 'basement' && kind !== 'banya') ib.common(W, D, H, kind);
  const spawnZ = D / 2 - 1.6;
  return ib.finish({ x: 0, z: spawnZ, a: Math.PI }, { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, h: H });
}

export function interiorForBuilding(kind: string, cls?: string): InteriorKind | null {
  const m: Record<string, InteriorKind> = {
    shop24: 'shop24', supermarket: 'supermarket', cafe: 'cafe', pharmacy: 'pharmacy', gunshop: 'gunshop', clothes: 'clothes', barber: 'barber',
    police: 'police', hospital: 'hospital', cityhall: 'cityhall', bank: 'bank', dealer: 'dealer', service: 'service', mall: 'mall', apartment: 'hall',
    house: 'house_city', vhouse: 'house_village', vshop: 'vshop', vpharmacy: 'vpharmacy', vguntruck: 'vguntruck', vadmin: 'vadmin',
    checkpoint: 'checkpoint', fire: 'fire', gas: 'gas', depot: 'truckoffice', office: 'office', scootershop: 'scootershop', fishshop: 'fishshop',
    banya: 'banya', greenhouse: 'greenhouse', bar: 'bar', ozgim: 'ozgim', mine: 'mine', casino: 'casino',
  };
  void cls;
  return m[kind] ?? null;
}
