// Слой деталей интерьеров: то, что делает помещение похожим на настоящее место, а не на
// коробку со стенами. Здесь живут карнизы и потолочные балки, служебные и туалетные двери,
// пожарные щиты, доски объявлений, плакаты, корзины и очередь у кассы, коробки на складе.
//
// Правила, которых держится весь файл:
//  • настенное и потолочное — без коллайдеров, его нельзя «поймать» плечом;
//  • всё, что стоит на полу, ставится у стены или в проверенно свободном месте и не
//    перекрывает проход от входа (тамбур у z = D/2, |x| < 2.2) — это проверяет check:interiors;
//  • ничего не висит в воздухе: у каждой вещи есть опора или кронштейн.
import type { IB } from './interiors';

export interface DressInfo { W: number; D: number; H: number; venue: string; seed: number }

/** сетка «видимых» светильников: зал кажется освещённым, а реальных ламп остаётся мало */
function lampGrid(ib: IB, W: number, D: number, H: number, step: number, panel: boolean) {
  const nx = Math.max(1, Math.round((W - 3) / step)), nz = Math.max(1, Math.round((D - 3) / step));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -W / 2 + 1.5 + ((W - 3) * (i + 0.5)) / nx;
    const z = -D / 2 + 1.5 + ((D - 3) * (j + 0.5)) / nz;
    ib.lamp(x, H - (panel ? 0.2 : 0.34), z, panel);
  }
}

/* ─────────────── архитектура: карнизы, балки, решётки, бордюр пола ─────────────── */

/** карниз по периметру: тонкая планка под потолком, даёт «тень» и объём */
function cornice(ib: IB, W: number, D: number, H: number, c = '#e7e5e4') {
  const y = H - 0.26, t = 0.16;
  ib.f('c:' + c, 0, y, -D / 2 + t / 2, W, 0.1, t, false);
  ib.f('c:' + c, 0, y, D / 2 - t / 2, W, 0.1, t, false);
  ib.f('c:' + c, -W / 2 + t / 2, y, 0, t, 0.1, D, false);
  ib.f('c:' + c, W / 2 - t / 2, y, 0, t, 0.1, D, false);
}

/** тёмная вставка в пол по периметру: визуально «держит» комнату */
function floorBorder(ib: IB, W: number, D: number, c = '#94a3b8') {
  const in0 = 0.62, w = 0.16, y = 0.003;
  const hw = W / 2 - in0 / 2;
  if (W > 6) {
    ib.f('c:' + c, 0, y, -D / 2 + in0, W - 2 * in0, 0.008, w, false);
    ib.f('c:' + c, 0, y, D / 2 - in0, W - 2 * in0, 0.008, w, false);
  }
  if (D > 6) {
    ib.f('c:' + c, -hw, y, 0, w, 0.008, D - 2 * in0, false);
    ib.f('c:' + c, hw, y, 0, w, 0.008, D - 2 * in0, false);
  }
}

/** деревянные балки под потолком — деревня, бар, рыбалка, шахта */
function beams(ib: IB, W: number, D: number, H: number, step = 2.8, c = '#57534e') {
  for (let x = -W / 2 + step / 2; x < W / 2 - 0.4; x += step) ib.f('c:' + c, x, H - 0.42, 0, 0.22, 0.3, D - 0.3, false);
  ib.f('c:' + c, 0, H - 0.3, -D / 2 + 0.4, W - 0.4, 0.18, 0.24, false);
}

/** решётка подвесного потолка — магазины, офисы, больница */
function ceilingGrid(ib: IB, W: number, D: number, H: number, step = 2.4, c = '#d4d4d8') {
  for (let x = -W / 2 + step; x < W / 2 - 0.5; x += step) ib.f('c:' + c, x, H - 0.06, 0, 0.05, 0.05, D - 0.4, false);
  for (let z = -D / 2 + step; z < D / 2 - 0.5; z += step) ib.f('c:' + c, 0, H - 0.06, z, W - 0.4, 0.05, 0.05, false);
}

/** короб вентиляции вдоль потолка — кафе, офисы, склады */
function duct(ib: IB, W: number, D: number, H: number, z = 0, c = '#a1a1aa') {
  ib.f('c:' + c, 0, H - 0.55, z, W - 0.6, 0.34, 0.42, false);
  for (let x = -W / 2 + 1.4; x < W / 2 - 1; x += 3.1) ib.f('c:#71717a', x, H - 0.73, z, 0.5, 0.03, 0.3, false);
}

/* ─────────────── настенное: таблички, плакаты, щиты, зеркала ─────────────── */

/** дверь в служебное помещение: полотно, наличник, ручка, табличка */
function serviceDoor(ib: IB, x: number, z: number, ry: number, label: string, c = '#5b3a1e') {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const w = 1.0;
  ib.f('c:' + c, x, 0, z, along ? 0.08 : w, 2.1, along ? w : 0.08, false, ry);
  for (const s2 of [-1, 1]) ib.f('c:#e7e5e4', x + (along ? 0 : s2 * (w / 2 + 0.05)), 1.1, z + (along ? s2 * (w / 2 + 0.05) : 0), along ? 0.12 : 0.1, 2.2, along ? 0.1 : 0.12, false, ry);
  ib.f('c:#e7e5e4', x, 2.16, z, along ? 0.12 : w + 0.2, 0.1, along ? w + 0.2 : 0.12, false, ry);
  ib.f('chrome', x + (along ? -0.07 : w / 2 - 0.14), 1.02, z + (along ? w / 2 - 0.14 : -0.07), 0.1, 0.05, 0.1, false);
  ib.f('c:#18181b', x + (along ? -0.05 : 0), 1.62, z + (along ? 0 : -0.05), 0.09, 0.12, 0.04, false);
  ib.plane(`sign:${label}|#334155`, x + (along ? (Math.sin(ry) > 0 ? 0.06 : -0.06) : 0), 2.36, z + (along ? 0 : 0.07), 0.94, 0.26, ry);
  ib.doors++;
}

/** пожарный щит: красный шкаф, огнетушитель, багор, табличка */
function fireHose(ib: IB, x: number, z: number, ry: number) {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const out = Math.sin(ry) > 0 ? 0.03 : -0.03;
  ib.f('c:#b91c1c', x + (along ? out : 0), 0.35, z + (along ? 0 : out), along ? 0.16 : 1.3, 0.95, along ? 1.3 : 0.16, false, ry);
  ib.f('c:#f8fafc', x + (along ? out * 3 : 0), 0.66, z + (along ? 0 : out * 3), along ? 0.02 : 1.1, 0.28, along ? 1.1 : 0.02, false, ry);
  ib.f('c:#f8fafc', x + (along ? out * 3 : 0), 1.02, z + (along ? 0 : out * 3), along ? 0.02 : 1.1, 0.1, along ? 1.1 : 0.02, false, ry);
  ib.plane('sign:ПОЖАРНЫЙ ЩИТ · 01|#b91c1c', x + (along ? out * 2 : 0), 1.5, z + (along ? 0 : out * 2), 1.2, 0.24, ry);
}

/** доска объявлений: рамка, пробка, бумажки */
function noticeBoard(ib: IB, x: number, z: number, ry: number, w = 1.5) {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const out = Math.sin(ry) > 0 ? 0.04 : -0.04;
  ib.f('c:#78350f', x, 1.25, z, along ? 0.06 : w, 0.95, along ? w : 0.06, false, ry);
  ib.f('c:#c8a97a', x + (along ? out : 0), 1.25, z + (along ? 0 : out), along ? 0.02 : w - 0.12, 0.82, along ? w - 0.12 : 0.02, false, ry);
  for (let i = 0; i < 5; i++) {
    const t = -w / 2 + 0.24 + (i * (w - 0.5)) / 4;
    ib.f('c:' + ['#f8fafc', '#fef3c7', '#fde68a', '#e0f2fe', '#fecaca'][i], x + (along ? out * 2 : t), 1.28 + (i % 2) * 0.09, z + (along ? t : out * 2), along ? 0.01 : 0.28, 0.32, along ? 0.28 : 0.01, false, ry);
  }
  ib.plane('sign:ОБЪЯВЛЕНИЯ|#334155', x, 1.8, z, Math.min(w, 1.2), 0.2, ry);
}

/** ряд плакатов в рамах вдоль стены */
function posterRow(ib: IB, x: number, z: number, ry: number, n = 3, y = 1.9) {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const out = Math.sin(ry) > 0 ? 0.035 : -0.035;
  const cols = ['#b45309', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8'];
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 0.86;
    const px = along ? x : x + t, pz = along ? z + t : z;
    ib.f('c:#1c1917', px, y, pz, along ? 0.05 : 0.56, 0.72, along ? 0.56 : 0.05, false, ry);
    ib.f('c:' + cols[(i + 2) % cols.length], px + (along ? out : 0), y + 0.04, pz + (along ? 0 : out), along ? 0.02 : 0.46, 0.6, along ? 0.46 : 0.02, false, ry);
  }
}

/** зеркало в раме с подсветкой (парикмахерская, примерочная, аптека) */
function mirrorPanel(ib: IB, x: number, z: number, ry: number, w = 1.1, h = 1.6, y = 1.0) {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const out = Math.sin(ry) > 0 ? 0.035 : -0.035;
  ib.f('chrome', x, y, z, along ? 0.05 : w + 0.08, h + 0.08, along ? w + 0.08 : 0.05, false, ry);
  ib.plane('glass:0.55', x + (along ? out : 0), y + h / 2, z + (along ? 0 : out), w, h, ry);
  ib.f('glow:#fef9c3', x, y + h + 0.14, z, along ? 0.08 : w, 0.06, along ? w : 0.08, false, ry);
}

/** настенные крючки с куртками у входа */
function coatHooks(ib: IB, x: number, z: number, ry: number, n = 4) {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const out = Math.sin(ry) > 0 ? 0.05 : -0.05;
  ib.f('c:#78350f', x, 1.6, z, along ? 0.06 : 0.9, 0.1, along ? 0.9 : 0.06, false, ry);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 0.26;
    const px = along ? x + out : x + t, pz = along ? z + t : z + out;
    ib.f('chrome', px, 1.54, pz, 0.04, 0.08, 0.06, false, ry);
    if (i % 2 === 0) ib.f('c:' + ['#334155', '#7c2d12'][i % 2], px + (along ? out * 2 : 0), 1.19, pz + (along ? 0 : out * 2), along ? 0.12 : 0.34, 0.6, along ? 0.34 : 0.12, false, ry);
  }
}

/* ─────────────── напольное: мелочи, которые видно сразу ─────────────── */

/** урна: корпус, крышка, пакет */
function bin(ib: IB, x: number, z: number, c = '#334155') {
  ib.cyl('c:' + c, x, 0, z, 0.21, 0.62, true);
  ib.cyl('c:#111827', x, 0.62, z, 0.23, 0.05);
  ib.cyl('c:#e5e7eb', x, 0.66, z, 0.16, 0.03);
}

/** вешалка-стойка */
function coatRack(ib: IB, x: number, z: number) {
  ib.cyl('chrome', x, 0, z, 0.2, 0.04, true);
  ib.cyl('chrome', x, 0.04, z, 0.035, 1.72);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ib.f('chrome', x + Math.cos(a) * 0.16, 1.56, z + Math.sin(a) * 0.16, 0.05, 0.05, 0.3, false, a);
  }
  ib.f('c:#1e3a8a', x + 0.16, 1.0, z, 0.3, 0.56, 0.22, false);
}

/** стойка с зонтами */
function umbrella(ib: IB, x: number, z: number) {
  ib.cyl('c:#0f172a', x, 0, z, 0.19, 0.5, true);
  for (let i = 0; i < 3; i++) ib.cyl('c:' + ['#1d4ed8', '#b91c1c', '#111827'][i], x - 0.08 + i * 0.08, 0.2, z + 0.03, 0.045, 0.72);
}

/** стопка коробок в подсобке */
function boxes(ib: IB, x: number, z: number, n = 3) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.62 - i * 0.06;
    ib.f('c:#c8a97a', x + (i % 2 ? 0.05 : -0.04), y, z, w, 0.4, 0.52, false);
    ib.f('c:#a16207', x, y + 0.38, z, w * 0.95, 0.02, 0.5, false);
    y += 0.42;
  }
  ib.col(x - 0.35, z - 0.3, x + 0.35, z + 0.3, 0, y);
}

/** поддон с товаром на складе */
function pallet(ib: IB, x: number, z: number) {
  ib.f('c:#a16207', x, 0, z, 1.2, 0.14, 0.9, true);
  for (let i = 0; i < 3; i++) ib.f('c:#78350f', x - 0.4 + i * 0.4, 0.14, z, 0.12, 0.62, 0.82, false);
  ib.f('c:#d6d3d1', x, 0.14, z, 1.1, 0.6, 0.7, false);
}

/** табличка «мокрый пол» */
function wetFloor(ib: IB, x: number, z: number) {
  ib.f('c:#facc15', x, 0.05, z, 0.34, 0.7, 0.06, false, 0.25);
  ib.f('c:#111827', x, 0.4, z - 0.02, 0.24, 0.16, 0.03, false, 0.25);
  ib.f('c:#facc15', x + 0.1, 0.05, z - 0.16, 0.3, 0.62, 0.05, false, -0.3);
}

/** коврик у входа: яркая полоса с каймой */
function doorMat(ib: IB, D: number, c = '#166534') {
  ib.f('c:' + c, 0, 0.004, D / 2 - 1.15, 2.6, 0.012, 1.1, false);
  ib.f('c:#e7e5e4', 0, 0.008, D / 2 - 1.15, 2.4, 0.006, 0.94, false);
}

/** барные табуреты вдоль стойки */
function stools(ib: IB, x: number, z: number, n: number, dx = 0.85) {
  for (let i = 0; i < n; i++) {
    const px = x + i * dx;
    ib.cyl('chrome', px, 0, z, 0.2, 0.04, true);
    ib.cyl('chrome', px, 0.04, z, 0.05, 0.6);
    ib.cyl('c:' + ['#7c2d12', '#1f2937', '#78350f'][i % 3], px, 0.64, z, 0.24, 0.1);
  }
}

/** ограждение очереди: стойки с лентами */
function queue(ib: IB, x0: number, z0: number, x1: number, z1: number, n = 3) {
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    ib.cyl('chrome', x, 0, z, 0.16, 0.02);
    ib.cyl('chrome', x, 0.02, z, 0.04, 0.92);
    ib.cyl('c:#111827', x, 0.94, z, 0.07, 0.09);
  }
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = z0 + (z1 - z0) * (t0 + t1) / 2;
    const len = Math.hypot((x1 - x0) / n, (z1 - z0) / n);
    ib.f('c:#b91c1c', cx, 0.86, cz, 0.04, 0.06, len, false, Math.atan2(x1 - x0, z1 - z0));
  }
}

/** меню на грифельной доске */
function chalkboard(ib: IB, x: number, z: number, ry: number, text: string, color = '#0f766e') {
  const along = Math.abs(Math.sin(ry)) > 0.5;
  const out = Math.sin(ry) > 0 ? 0.05 : -0.05;
  ib.f('c:#78350f', x, 1.5, z, along ? 0.06 : 1.15, 0.95, along ? 1.15 : 0.06, false, ry);
  ib.f('c:#1c1917', x + (along ? out : 0), 1.5, z + (along ? 0 : out), along ? 0.02 : 1.02, 0.82, along ? 1.02 : 0.02, false, ry);
  ib.plane(`sign:${text}|${color}`, x + (along ? out * 2 : 0), 1.5, z + (along ? 0 : out * 2), 0.98, 0.76, ry);
  ib.f('c:#92400e', x, 1.06, z, along ? 0.11 : 1.2, 0.05, along ? 1.2 : 0.11, false, ry);
}

/** подвесная табличка-указатель под потолком */
function hangSign(ib: IB, x: number, y: number, z: number, text: string, ry = 0, w = 1.8) {
  ib.plane(`sign:${text}|#0f172a`, x, y, z, w, 0.34, ry);
  ib.f('c:#0f172a', x, y + 0.19, z, w + 0.06, 0.05, 0.06, false, ry);
  for (const s of [-1, 1]) ib.f('c:#52525b', x + (Math.abs(Math.sin(ry)) > 0.5 ? 0 : s * w * 0.4), y + 0.42, z + (Math.abs(Math.sin(ry)) > 0.5 ? s * w * 0.4 : 0), 0.02, 0.42, 0.02, false);
}

/** огнетушитель на полу */
function extinguisher(ib: IB, x: number, z: number) {
  ib.cyl('c:#dc2626', x, 0, z, 0.11, 0.58, true);
  ib.f('c:#111827', x, 0.58, z, 0.09, 0.08, 0.09, false);
  ib.f('c:#111827', x + 0.1, 0.4, z, 0.14, 0.03, 0.04, false);
}

/** стойка с корзинами у входа в магазин */
function baskets(ib: IB, x: number, z: number) {
  ib.f('c:#334155', x, 0, z, 0.86, 0.9, 0.66, true);
  for (let i = 0; i < 3; i++) ib.f('c:' + ['#dc2626', '#f59e0b', '#1d4ed8'][i], x - 0.26 + i * 0.26, 0.9, z, 0.24, 0.34, 0.5, false);
}

/** скамья у стены */
function bench(ib: IB, x: number, z: number, w: number, ry = 0) {
  ib.f('c:#78350f', x, 0, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.5 : w, 0.44, Math.abs(Math.sin(ry)) > 0.5 ? w : 0.5, true, ry);
  ib.f('c:#92400e', x, 0.44, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.12 : w, 0.42, Math.abs(Math.sin(ry)) > 0.5 ? w : 0.12, false, ry);
}

export function dressInterior(ib: IB, kind: string, o: DressInfo): void {
  const { W, D, H } = o;
  const wood = new Set(['house_village', 'house_city', 'vshop', 'vpharmacy', 'fishshop', 'bar', 'barber', 'vadmin', 'mine', 'greenhouse', 'truckoffice', 'vguntruck', 'basement', 'ozgim']);
  const industrial = new Set(['service', 'fire', 'checkpoint', 'truckoffice', 'mine', 'basement', 'vguntruck']);

  // Палитра и отделка соответствуют назначению места, а не одной схеме для всех.
  const accents: Record<string, string> = {
    shop24: '#b45309', vshop: '#92400e', supermarket: '#15803d', gas: '#475569',
    cafe: '#a16207', mallfood: '#b45309', pharmacy: '#0f766e', vpharmacy: '#0f766e',
    gunshop: '#475569', vguntruck: '#57534e', clothes: '#be185d', barber: '#be123c',
    police: '#1e3a8a', hospital: '#0e7490', cityhall: '#a16207', bank: '#0f766e',
    fishshop: '#0e7490', dealer: '#334155', service: '#b91c1c', mall: '#7c3aed',
    hall: '#64748b', vadmin: '#1e3a8a', checkpoint: '#57534e', fire: '#b91c1c',
    basement: '#78350f', truckoffice: '#57534e', office: '#38a4ce', scootershop: '#0ea5e9',
    greenhouse: '#4d7c0f', bar: '#7c3aed', ozgim: '#0ea5e9', mine: '#57534e', casino: '#b45309',
  };
  const accent = accents[kind];
  if (accent && !ib.residential) {
    // Неброский цветной цоколь снаружи центрального прохода, не мешает действиям.
    for (const side of [-1, 1]) ib.f('c:' + accent, side * (W / 2 - 0.18), 0.14, 0, 0.06, 0.12, D - 0.7, false);
  }

  /* ─── общая архитектура: потолок, пол, вход ─── */
  cornice(ib, W, D, H, wood.has(kind) ? '#c8a97a' : '#e7e5e4');
  if (W > 8 && D > 8) floorBorder(ib, W, D, wood.has(kind) ? '#78350f' : '#94a3b8');
  if (wood.has(kind)) beams(ib, W, D, H, kind === 'mine' ? 3.4 : 2.8);
  else if (W > 12) ceilingGrid(ib, W, D, H, W > 20 ? 3.2 : 2.6);
  if (['cafe', 'mallfood', 'mall', 'office', 'supermarket'].includes(kind)) duct(ib, W, D, H, -D / 2 + 1.8);
  if (industrial.has(kind)) for (let x = -W / 2 + 1.6; x < W / 2 - 1; x += 4.2) ib.f('c:#57534e', x, H - 0.5, 0, 0.3, 0.4, D - 1.2, false);
  doorMat(ib, D, wood.has(kind) ? '#7c2d12' : '#166534');
  // в узких фургонах и будках стены заняты оборудованием — общие мелочи не лепим
  if (!ib.residential && W > 5.5) {
    coatHooks(ib, -W / 2 + 0.12, D / 2 - 2.4, Math.PI / 2, 4);
    noticeBoard(ib, W / 2 - 0.12, D / 2 - 2.6, -Math.PI / 2, 1.4);
  }
  if (!ib.residential && W > 6.5) fireHose(ib, -W / 2 + 0.14, -D / 2 + 2.2, Math.PI / 2);
  // видимые светильники по сетке: в маленьких комнатах — 1–2, в залах — ряды
  const area = W * D;
  if (!ib.residential && area > 70) lampGrid(ib, W, D, H, area > 500 ? 6.2 : 4.6, !wood.has(kind));

  /* ─── по типу помещения ─── */
  switch (kind) {
    case 'shop24': case 'vshop': case 'gas': {
      baskets(ib, -W / 2 + 1.2, D / 2 - 2.0);
      queue(ib, 1.4, 3.5, 3.4, 3.5, 2);
      chalkboard(ib, -W / 2 + 0.14, 2.6, Math.PI / 2, 'АКЦИИ ДНЯ · МОЛОКО · ХЛЕБ', '#b45309');
      posterRow(ib, W / 2 - 0.14, -1.4, -Math.PI / 2, 3, 1.8);
      wetFloor(ib, -1.6, 2.0);
      bin(ib, W / 2 - 0.7, D / 2 - 3.2);
      ib.npc(-2.0, 3.0, 2.2, 'shopper');
      if (kind === 'shop24') {
        // за прилавком — служебная дверь и коробки на складе
        serviceDoor(ib, -W / 2 + 0.14, 0.4, Math.PI / 2, 'СКЛАД · ТОЛЬКО ПЕРСОНАЛ', '#3f3f46');
        boxes(ib, -W / 2 + 0.9, -0.5, 3);
      }
      break;
    }
    case 'supermarket': {
      baskets(ib, W / 2 - 1.5, D / 2 - 1.9);
      queue(ib, -7.4, 4.9, -5.2, 4.9, 3);
      hangSign(ib, 0, H - 1.15, 0.6, 'ПРОДУКТЫ · МЯСО · РЫБА · ХЛЕБ', 0, 4.4);
      chalkboard(ib, -W / 2 + 0.14, 1.0, Math.PI / 2, 'СВЕЖИЕ ОВОЩИ КАЖДЫЙ ДЕНЬ', '#166534');
      wetFloor(ib, -0.8, 3.4);
      bin(ib, 1.0, D / 2 - 1.6);
      serviceDoor(ib, W / 2 - 0.14, -5.0, -Math.PI / 2, 'СКЛАД · ТОЛЬКО ПЕРСОНАЛ', '#3f3f46');
      boxes(ib, W / 2 - 1.0, -4.0, 3);
      ib.npc(0, 5.0, 1.4, 'shopper'); ib.npc(-9.6, 4.4, 3.4, 'shopper');
      ib.plant(1.4, -1.2); ib.plant(-1.2, -1.2);
      break;
    }
    case 'cafe': case 'mallfood': {
      stools(ib, -5.6, -2.1, 4, 0.85);
      chalkboard(ib, -W / 2 + 0.14, 2.6, Math.PI / 2, 'КОФЕ · ЧАЙ · ВЫПЕЧКА', '#b45309');
      mirrorPanel(ib, 1.6, -D / 2 + 0.14, 0, 1.2, 1.0, 1.6);
      bin(ib, 5.2, D / 2 - 1.9);
      ib.npc(6.2, -0.6, Math.PI, 'guest');
      posterRow(ib, W / 2 - 0.14, 0.4, -Math.PI / 2, 2, 1.9);
      break;
    }
    case 'pharmacy': case 'vpharmacy': {
      queue(ib, 0.8, 2.6, 0.8, 4.0, 2);
      ib.npc(-3.4, 2.6, 0.4, 'guest');
      mirrorPanel(ib, W / 2 - 0.14, -3.4, -Math.PI / 2, 0.8, 1.2, 1.5);
      chalkboard(ib, -W / 2 + 0.14, 3.6, Math.PI / 2, 'ВИТАМИНЫ · УХОД', '#0f766e');
      extinguisher(ib, -W / 2 + 0.5, 4.4);
      break;
    }
    case 'clothes': {
      mirrorPanel(ib, -2.0, -D / 2 + 0.14, 0, 1.2, 1.9, 1.4);
      hangSign(ib, 0, H - 0.9, 3.4, 'ПРИМЕРОЧНЫЕ · КАССА', Math.PI, 3.2);
      bench(ib, 1.4, D / 2 - 1.7, 1.6);
      ib.npc(6.6, 2.6, 3.6, 'shopper');
      ib.plant(-1.6, D / 2 - 1.9);
      break;
    }
    case 'barber': {
      posterRow(ib, W / 2 - 0.14, 3.0, -Math.PI / 2, 2, 2.0);
      chalkboard(ib, -W / 2 + 0.14, 0.8, Math.PI / 2, 'СТРИЖКА · БОРОДА · ОКРАСКА', '#be123c');
      coatRack(ib, -W / 2 + 1.2, D / 2 - 1.9);
      ib.npc(-1.6, 2.4, 1.2, 'guest');
      break;
    }
    case 'bar': {
      hangSign(ib, 0, H - 1.2, 1.6, 'ТАНЦПОЛ · БАР · DJ', Math.PI, 4.2);
      chalkboard(ib, W / 2 - 0.14, 1.4, -Math.PI / 2, 'КОКТЕЙЛИ · ПИВО · ШОТЫ', '#a855f7');
      bin(ib, -W / 2 + 1.4, D / 2 - 2.0);
      break;
    }
    case 'casino': {
      hangSign(ib, 0, H - 1.7, 4.0, 'СТОЛ «БОМБА» →', Math.PI, 3.2);
      hangSign(ib, 0, H - 1.7, -3.4, 'КАССА · ОБМЕН ФИШЕК', 0, 3.6);
      bin(ib, 9.0, 8.6);
      break;
    }
    case 'police': {
      hangSign(ib, 0, H - 1.0, 2.2, 'ДЕЖУРНАЯ ЧАСТЬ · КАМЕРЫ · РОЗЫСК', 0, 4.6);
      queue(ib, -2.0, -0.6, 2.0, -0.6, 3);
      posterRow(ib, W / 2 - 0.14, 3.0, -Math.PI / 2, 2, 2.0);
      serviceDoor(ib, -W / 2 + 0.14, 0.4, Math.PI / 2, 'ОРУЖЕЙКА', '#334155');
      break;
    }
    case 'hospital': {
      hangSign(ib, 0, H - 0.95, 0.6, 'РЕГИСТРАТУРА ← · КАБИНЕТ ВРАЧА ↑', 0, 4.4);
      queue(ib, -1.6, 3.2, -1.6, 4.6, 2);
      chalkboard(ib, 8.4, -D / 2 + 0.14, 0, 'ПРИЁМ ПО ЗАПИСИ · БАХИЛЫ', '#0e7490');
      serviceDoor(ib, W / 2 - 0.14, 1.2, -Math.PI / 2, 'СКЛАД · ЛЕКАРСТВА', '#e2e8f0');
      break;
    }
    case 'office': {
      hangSign(ib, 0, H - 0.95, 0.6, 'ОТДЕЛЫ · ПЕРЕГОВОРНАЯ · КУХНЯ', 0, 4.2);
      chalkboard(ib, -W / 2 + 0.14, 1.2, Math.PI / 2, 'ПЛАН НЕДЕЛИ · ПЛАНЁРКА 10:00', '#1d4ed8');
      coatRack(ib, W / 2 - 1.2, D / 2 - 1.8);
      break;
    }
    case 'mall': {
      hangSign(ib, 0, H - 1.5, 4.0, 'ЭСКАЛАТОР · 1 ЭТАЖ', Math.PI, 3.4);
      hangSign(ib, 0, H - 1.5, -4.0, 'ФУД-КОРТ · КИНО', 0, 3.4);
      posterRow(ib, -W / 2 + 0.14, 0.6, Math.PI / 2, 3, 2.4);
      break;
    }
    case 'hall': {
      hangSign(ib, 0, 3.45, 1.2, 'КВАРТИРЫ 1–2 · ЛИФТ', Math.PI, 2.6);
      extinguisher(ib, -W / 2 + 0.5, 1.0);
      break;
    }
    case 'cityhall': {
      hangSign(ib, 0, H - 1.3, 2.2, 'ПРИЁМНАЯ · АРХИВ · КАБИНЕТ МЭРА', Math.PI, 5.2);
      posterRow(ib, W / 2 - 0.14, -2.6, -Math.PI / 2, 3, 2.2);
      break;
    }
    case 'bank': {
      hangSign(ib, 0, H - 1.0, 1.6, 'КАССА · СЕЙФ · БАНКОМАТ', Math.PI, 4.2);
      queue(ib, -2.4, 0.6, 0.6, 0.6, 3);
      serviceDoor(ib, W / 2 - 0.14, -4.0, -Math.PI / 2, 'СЕЙФОВАЯ КОМНАТА', '#6b7280');
      break;
    }
    case 'vadmin': {
      hangSign(ib, 0, H - 0.9, 2.0, 'ПРИЁМНАЯ · АРХИВ', Math.PI, 3.4);
      bench(ib, 2.6, D / 2 - 1.9, 1.6);
      break;
    }
    case 'service': {
      hangSign(ib, 0, H - 1.1, 3.0, 'ПОДЪЁМНИК · ШИНЫ · КАССА', Math.PI, 4.4);
      wetFloor(ib, -1.0, 2.4);
      extinguisher(ib, W / 2 - 0.9, -3.0);
      posterRow(ib, W / 2 - 0.14, 0.4, -Math.PI / 2, 2, 2.2);
      break;
    }
    case 'fire': {
      hangSign(ib, 0, H - 1.1, 3.0, 'ВЫЕЗД · СКЛАД РУКАВОВ', Math.PI, 4.0);
      wetFloor(ib, 1.0, 2.0);
      break;
    }
    case 'checkpoint': {
      hangSign(ib, 0, H - 0.9, 1.2, 'ТУРНИКЕТ · ПРОПУСКА', Math.PI, 2.8);
      break;
    }
    case 'dealer': {
      hangSign(ib, 0, H - 1.4, 4.0, 'ТЕСТ-ДРАЙВ · КРЕДИТ · ТРЕЙД-ИН', Math.PI, 5.0);
      break;
    }
    case 'scootershop': {
      posterRow(ib, W / 2 - 0.14, 0.4, -Math.PI / 2, 2, 1.9);
      extinguisher(ib, -W / 2 + 0.5, 2.4);
      break;
    }
    case 'gunshop': {
      queue(ib, -2.2, 1.6, 0.4, 1.6, 3);
      serviceDoor(ib, -W / 2 + 0.14, 1.6, Math.PI / 2, 'СКЛАД ОРУЖИЯ', '#1f2937');
      posterRow(ib, W / 2 - 0.14, 1.4, -Math.PI / 2, 2, 2.0);
      break;
    }
    case 'fishshop': {
      chalkboard(ib, -W / 2 + 0.14, 1.4, Math.PI / 2, 'СВЕЖИЙ УЛОВ КАЖДОЕ УТРО', '#0e7490');
      wetFloor(ib, 1.6, 2.2);
      bin(ib, W / 2 - 0.8, 3.6);
      break;
    }
    case 'mine': {
      for (const [x, z] of [[-6, -12], [6, -6], [-5, 4], [7, 8]] as const) {
        ib.cyl('glow:#fbbf24', x, 1.9, z, 0.16, 0.3);
        ib.f('c:#44403c', x, 2.2, z, 0.05, 0.4, 0.05, false);
      }
      break;
    }
    default: break;
  }
}
