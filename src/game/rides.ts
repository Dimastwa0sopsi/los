// Аттракционы парка «Ракета»: динамические модели + места для пассажира.
//
// Каждый аттракцион — самостоятельная группа, которую игровой цикл двигает сам.
// Главное правило: место пассажира считается из ТОЙ ЖЕ математики, что и
// геометрия. Раньше колесо обозрения «сажало» игрока в воздух (кабинка стартовала
// в верхней точке), карусель не повторяла покачивание лошадки, а вагонетка горок
// не наклонялась на спуске — теперь всё это сходится: сиденье всегда внутри
// кабины/вагона, а посадка начинается у платформы.
import * as THREE from 'three';
import type { WorldLayout } from './worldgen';

type RideDef = WorldLayout['parkRides'][number];
export type RideKind = RideDef['kind'];

export interface SeatPose { x: number; y: number; z: number; yaw: number; pitch: number }

interface Ride {
  def: RideDef;
  kind: RideKind;
  root: THREE.Group;
  /** фаза анимации в радианах (колесо/карусель) или 0..1 (башня/горки) */
  phase: number;
  running: boolean;
  tick(dt: number): void;
  seat(phase: number): SeatPose;
  /** сколько секунд длится поездка */
  dur: number;
  /** с какой фазы начинается посадка (чтобы кабина стояла у платформы) */
  phase0: number;
  yaw: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.62, metal = 0.12) {
  const key = color + '|' + rough + '|' + metal;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); matCache.set(key, m); }
  return m;
}
function box(g: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m); return m;
}
function cyl(g: THREE.Object3D, color: string, x: number, y: number, z: number, r: number, h: number, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat(color));
  m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
  g.add(m); return m;
}
/** «стекло» кабины: полупрозрачная панель */
function glass(g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
    color: 0x9fd8ff, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.05,
  }));
  m.position.set(x, y, z); m.rotation.y = ry;
  g.add(m); return m;
}

/* ───────────────────────────── колесо обозрения ───────────────────────────── */
/** Колесо в вертикальной плоскости YZ. Кабинка №0 висит внизу — у платформы. */
function makeFerris(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const R = Math.max(8, d.h);
  const HANG = 0.6;                     // подвес от обода до крыши кабины
  const CAB_H = 1.6, CAB_W = 1.9, CAB_D = 1.5;
  const cy = R + HANG + CAB_H + 0.3;    // ось колеса: низ кабинки на 0.3 м над землёй
  const hubZ = 2.2;                     // ширина ступицы (две плоскости обода)

  // ---- опоры: две А-образные рамы, сходящиеся к ступице ----
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const foot = sx * R * 0.44;
      const len = Math.hypot(foot, cy) + 0.4;
      const ang = Math.atan2(foot, cy);
      box(root, '#9aa4b2', foot / 2, cy / 2, sz * hubZ, 0.34, len, 0.34, 0, 0, ang);
      box(root, '#6b7280', foot, 0.22, sz * hubZ, 1.4, 0.44, 1.4);            // пятка
    }
    // поперечные связи между ногами
    for (let k = 1; k <= 3; k++) {
      const y = (cy / 4) * k;
      const half = (R * 0.44) * (1 - y / cy);
      box(root, '#7f8a99', 0, y, sz * hubZ, half * 2, 0.12, 0.12);
    }
  }
  // ---- ступица ----
  cyl(root, '#4b5563', 0, cy, 0, 0.55, hubZ * 2 + 0.6, Math.PI / 2, 0);
  cyl(root, '#374151', 0, cy, 0, 0.85, 0.34, Math.PI / 2, 0);

  // ---- вращающееся колесо ----
  const wheel = new THREE.Group(); wheel.position.set(0, cy, 0); root.add(wheel);
  const SEG = 28;
  for (const sz of [-1, 1]) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2;
      // сегмент обода по хорде: длина, угол поворота вокруг X
      const y0 = Math.sin(a0) * R, z0 = Math.cos(a0) * R;
      const y1 = Math.sin(a1) * R, z1 = Math.cos(a1) * R;
      const my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
      const len = Math.hypot(y1 - y0, z1 - z0) + 0.12;
      // поворот вокруг X: локальная ось Z должна смотреть вдоль хорды
      const rotX = Math.atan2(-(y1 - y0), z1 - z0);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, len), mat('#e5e9f0'));
      seg.position.set(sz * hubZ, my, mz); seg.rotation.x = rotX;
      wheel.add(seg);
      if (k % 7 === 0) box(wheel, '#c7cdd8', 0, y0, z0, hubZ * 2 + 0.1, 0.26, 0.26);   // поперечины
    }
  }
  const gondolas: THREE.Group[] = [];
  const NG = 8;
  for (let k = 0; k < NG; k++) {
    const a = (k / NG) * Math.PI * 2;                // кабинка 0 внизу при phase0 = π/2
    const gd = new THREE.Group();
    gd.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
    wheel.add(gd);
    const body = new THREE.Group(); body.position.y = -HANG - CAB_H / 2; gd.add(body);
    box(gd, '#6b7280', 0, -HANG / 2, 0, 0.16, HANG, 0.16);                     // подвес
    box(body, k % 2 ? '#f97316' : '#22c55e', 0, 0, 0, CAB_W, CAB_H, CAB_D);    // корпус
    box(body, '#0f172a', 0, -0.15, 0, CAB_W - 0.24, 0.5, CAB_D - 0.24);        // пол/сиденье
    glass(body, 0, 0.22, CAB_D / 2 + 0.01, CAB_W - 0.3, CAB_H - 0.7, 0.05);    // окна
    glass(body, 0, 0.22, -CAB_D / 2 - 0.01, CAB_W - 0.3, CAB_H - 0.7, 0.05);
    glass(body, CAB_W / 2 + 0.01, 0.22, 0, 0.05, CAB_H - 0.7, CAB_D - 0.3);
    glass(body, -CAB_W / 2 - 0.01, 0.22, 0, 0.05, CAB_H - 0.7, CAB_D - 0.3);
    box(body, '#e2e8f0', 0, CAB_H / 2 + 0.06, 0, CAB_W + 0.12, 0.12, CAB_D + 0.12); // крыша
    box(body, '#111827', 0, -CAB_H / 2 - 0.05, 0, CAB_W + 0.06, 0.1, CAB_D + 0.06); // днище
    gondolas.push(gd);
  }

  // ---- платформа посадки и дорожка к точке сбора (board.bz сзади) ----
  const rampZ = Math.max(4, Math.hypot(d.board.x - d.x, d.board.z - d.z));
  box(root, '#8b93a1', 0, 0.14, rampZ / 2, 5.2, 0.28, rampZ);                  // подиум
  box(root, '#b9c0cb', 0, 0.3, 0, 3.6, 0.34, 3.6);                             // площадка у колеса
  for (const sx of [-1, 1]) box(root, '#94a3b8', sx * 2.5, 0.62, rampZ / 2, 0.12, 0.9, rampZ); // перила
  box(root, '#f59e0b', 0, 0.9, rampZ - 0.3, 4.6, 0.12, 0.5);                   // жёлтая полоса

  const ride: Ride = {
    def: d, kind: 'ferris', root, phase: Math.PI / 2, running: false, dur: 20, phase0: Math.PI / 2, yaw: 0,
    tick(dt) {
      const speed = this.running ? 0.3 : 0.1;
      this.phase += dt * speed;
      wheel.rotation.x = this.phase;
      for (const gd of gondolas) gd.rotation.x = -this.phase;     // кабинки всегда ровно
    },
    seat(p) {
      // кабинка 0 после поворота колеса на p: локальное (0,0,R) → (0, -R sin p, R cos p)
      const y = cy - R * Math.sin(p) - HANG - CAB_H + 0.08;
      const z = d.z + R * Math.cos(p);
      return { x: d.x, y: Math.max(0.1, y), z, yaw: 0, pitch: 0 };
    },
  };
  return ride;
}

/* ───────────────────────────────── карусель ───────────────────────────────── */
/** Платформа, шатёр с фестонами и 12 лошадок на латунных штангах. */
function makeCarousel(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const R = Math.max(4.5, d.w / 2);
  const spin = new THREE.Group(); root.add(spin);

  cyl(root, '#7f1d1d', 0, 0.12, 0, R + 0.7, 0.24);                     // фундамент
  cyl(spin, '#fdf2f8', 0, 0.34, 0, R + 0.2, 0.2);                      // настил
  cyl(spin, '#f8fafc', 0, 0.46, 0, R, 0.1);
  // юбка с лампочками
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const x = Math.cos(a) * (R + 0.12), z = Math.sin(a) * (R + 0.12);
    box(spin, k % 2 ? '#f8fafc' : '#e11d48', x, 0.62, z, 0.5, 0.42, 0.12, 0, -a + Math.PI / 2, 0);
    box(spin, '#fde68a', x * 1.02, 0.62, z * 1.02, 0.16, 0.16, 0.16);
  }
  cyl(root, '#eab308', 0, 2.6, 0, 0.3, 5.2);                           // колонна
  cyl(root, '#b45309', 0, 0.6, 0, 0.45, 1.0);

  // шатёр: конус + фестоны по краю
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(R * 1.06, 2.2, 20), mat('#dc2626'));
  canopy.position.y = 5.6; root.add(canopy);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.16, 8, 28), mat('#f8fafc'));
  trim.rotation.x = Math.PI / 2; trim.position.y = 4.55; root.add(trim);
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    box(root, k % 2 ? '#f8fafc' : '#dc2626', Math.cos(a) * R * 1.0, 4.3, Math.sin(a) * R * 1.0, 0.7, 0.5, 0.08, 0, -a, 0.35);
  }
  box(root, '#fbbf24', 0, 6.85, 0, 0.26, 0.7, 0.26);                   // шпиль

  // лошадки: 6 «внутренних» и 6 «внешних», у каждой своя фаза покачивания
  const horses: { g: THREE.Group; phase: number; r: number }[] = [];
  const N = 12;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const rr = R * (k % 2 ? 0.56 : 0.78);
    const h = new THREE.Group();
    h.position.set(Math.cos(a) * rr, 0.95, Math.sin(a) * rr);
    h.rotation.y = -a;
    const col = k % 3 === 0 ? '#7c3aed' : k % 3 === 1 ? '#f8fafc' : '#0ea5e9';
    box(h, col, 0, 0.55, 0, 1.45, 0.62, 0.5);                          // корпус
    box(h, col, 0.72, 0.95, 0, 0.5, 0.5, 0.36);                        // голова
    box(h, '#111827', 0.95, 1.02, 0, 0.18, 0.14, 0.3);                 // морда
    box(h, '#f472b6', -0.7, 0.5, 0, 0.14, 0.9, 0.14, 0, 0, 0.5);       // хвост
    for (const [ox, oz] of [[-0.45, -0.18], [-0.45, 0.18], [0.45, -0.18], [0.45, 0.18]] as const)
      box(h, '#78350f', ox, 0.12, oz, 0.12, 0.6, 0.12);
    box(h, '#fde68a', 0, 0.92, 0, 0.9, 0.1, 0.24);                     // седло
    spin.add(h);
    // латунная штанга от настила к шатру
    cyl(spin, '#eab308', h.position.x, 2.7, h.position.z, 0.055, 4.3);
    horses.push({ g: h, phase: k * 0.7, r: rr });
  }

  const ride: Ride = {
    def: d, kind: 'carousel', root, phase: 0, running: false, dur: 14, phase0: 0, yaw: 0,
    tick(dt) {
      const speed = this.running ? 0.8 : 0.16;
      this.phase += dt * speed;
      spin.rotation.y = this.phase;
      for (const hb of horses) hb.g.position.y = 0.95 + Math.sin(this.phase * 2.6 + hb.phase) * 0.24;
    },
    seat(p) {
      const a = p;                                   // лошадка №0 (внешний круг)
      const rr = horses[0].r;
      const bob = Math.sin(p * 2.6 + horses[0].phase) * 0.24;
      return { x: d.x + Math.cos(a) * rr, y: 1.5 + bob, z: d.z + Math.sin(a) * rr, yaw: -a + Math.PI / 2, pitch: 0 };
    },
  };
  return ride;
}

/* ─────────────────────────── башня свободного падения ─────────────────────── */
/** Ферменная башня с кабиной-кольцом на 8 мест: подъём, замирание, срыв, торможение. */
function makeTower(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const H = Math.max(14, d.h);
  const legR = 1.05;

  cyl(root, '#334155', 0, 0.2, 0, 2.2, 0.4);                              // фундамент
  // четыре ноги + раскосы
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(root, '#64748b', sx * legR, H / 2, sz * legR, 0.22, H, 0.22);
  }
  for (let y = 1.5; y < H; y += 2) {
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      box(root, '#94a3b8', ((ax + bx) / 2) * legR, y, ((az + bz) / 2) * legR, 0.1, 0.1, legR * 2 + 0.1, 0, 0, 0);
    }
    box(root, '#475569', 0, y, 0, legR * 2, 0.09, 0.09);
  }
  // направляющие для кабины
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(root, '#cbd5e1', sx * (legR + 0.16), H / 2, sz * (legR + 0.16), 0.09, H, 0.09);
  }
  // верх: площадка, шкив и тормоз
  box(root, '#1e293b', 0, H + 0.25, 0, 3.6, 0.3, 3.6);
  cyl(root, '#0f172a', 0, H + 0.7, 0, 0.75, 0.5);
  cyl(root, '#eab308', 0, H + 1.15, 0, 0.3, 1.2);
  box(root, '#dc2626', 0, H + 1.85, 0, 0.14, 0.7, 0.14);

  // кабина-кольцо с 8 местами
  const car = new THREE.Group(); root.add(car);
  cyl(car, '#b91c1c', 0, 0.2, 0, 1.65, 0.4);                              // пол
  cyl(car, '#f8fafc', 0, 0.03, 0, 1.7, 0.12);
  cyl(car, '#b91c1c', 0, 1.5, 0, 1.55, 0.16);                             // крыша
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.cos(a) * 1.45, z = Math.sin(a) * 1.45;
    box(car, '#7f1d1d', x, 0.9, z, 0.12, 1.1, 0.12, 0, -a, 0);           // стойки
    box(car, '#e11d48', Math.cos(a + 0.39) * 1.45, 0.62, Math.sin(a + 0.39) * 1.45, 0.42, 0.1, 0.42); // сиденья
    glass(car, Math.cos(a + 0.39) * 1.5, 0.95, Math.sin(a + 0.39) * 1.5, 0.05, 0.8, 0.5, -a + 0.39);
  }
  cyl(car, '#334155', 0, 1.75, 0, 0.28, 0.5);
  box(car, '#fbbf24', 0, 1.95, 0, 0.5, 0.1, 0.5);

  const ride: Ride = {
    def: d, kind: 'tower', root, phase: 0, running: false, dur: 16, phase0: 0, yaw: 0,
    tick(dt) {
      if (this.running) this.phase = Math.min(1, this.phase + dt / this.dur);
      else this.phase = 0;                        // не запущено — кабина ждёт у платформы
      const p = this.phase;
      const top = H - 3.2;
      let y = 0.05;
      if (p < 0.42) y = 0.05 + top * (0.5 - 0.5 * Math.cos(Math.PI * (p / 0.42)));   // разгон-торможение
      else if (p < 0.52) y = top;                                                    // замирание наверху
      else if (p < 0.66) { const k = (p - 0.52) / 0.14; y = top * (1 - k * k); }      // срыв
      else if (p < 0.74) { const k = (p - 0.66) / 0.08; y = 0.05 + Math.abs(Math.sin(k * Math.PI * 2)) * 1.0; } // отскок (без ухода под пол)
      car.position.y = Math.max(0.05, y);
    },
    seat() {
      const a = 0;
      return { x: d.x + Math.cos(a) * 1.1, y: car.position.y + 0.45, z: d.z + Math.sin(a) * 1.1, yaw: -a, pitch: 0 };
    },
  };
  return ride;
}

/* ─────────────────────────── американские горки ───────────────────────────── */
/** Рельсы по профилю, шпалы, опоры до земли, станция с навесом и вагонетка. */
function makeCoaster(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const len = d.w, H = Math.max(6, d.h);
  // профиль: станция → подъём → спуск → «верблюд» → торможение (t: 0..1)
  // простые отрезки с плавными краями: станция → подъём → сброс → «верблюд» → станция
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k);
  const prof = (t: number) => {
    const c = clamp01(t);
    const seg = (a: number, b: number) => clamp01((c - a) / (b - a));
    const ST = 1.2;                                  // высота станции
    if (c < 0.12) return ST;
    if (c < 0.36) return ST + (H - ST) * ease(seg(0.12, 0.36));       // подъём
    if (c < 0.56) return H - (H - 2.2) * ease(seg(0.36, 0.56));       // первый сброс
    if (c < 0.74) return 2.2 + (H * 0.45 - 2.2) * Math.sin(Math.PI * seg(0.56, 0.74)); // «верблюд»
    if (c < 0.86) return 2.2 + (ST - 2.2) * ease(seg(0.74, 0.86));    // торможение
    return ST;
  };
  const px = (t: number) => -len / 2 + len * t;

  // ---- рельсы: две нитки, шпалы и опоры ----
  const N = Math.max(40, Math.round(len));
  for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N;
    const x0 = px(t0), x1 = px(t1), y0 = prof(t0), y1 = prof(t1);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const seg = Math.hypot(x1 - x0, y1 - y0) + 0.08;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (const sz of [-0.62, 0.62]) {
      box(root, '#e5e7eb', mx, my, sz, seg, 0.1, 0.12, 0, 0, ang);            // рельс
      box(root, '#9ca3af', mx, my - 0.14, sz, seg, 0.08, 0.2, 0, 0, ang);     // ложемент
    }
    if (k % 2 === 0) box(root, '#7f1d1d', mx, my - 0.17, 0, 0.3, 0.1, 1.5);   // шпала
    if (k % 3 === 0 && my > 1.6) {
      box(root, '#94a3b8', mx, my / 2, 0.62, 0.16, my, 0.16);                 // опоры
      box(root, '#94a3b8', mx, my / 2, -0.62, 0.16, my, 0.16);
      box(root, '#cbd5e1', mx, my * 0.5, 0, 0.1, 0.1, 1.4, 0, 0, 0);
    }
  }
  // ---- станция в начале: платформа, навес, турникет ----
  const stX = px(0.06);
  box(root, '#57534e', stX, 0.45, 0, 7, 0.9, 4.2);
  box(root, '#a8a29e', stX, 0.94, 2.3, 7, 0.1, 1.6);
  for (const sx of [-1, 1]) {
    box(root, '#78716c', stX + sx * 3.2, 1.9, -1.9, 0.18, 3.4, 0.18);
    box(root, '#78716c', stX + sx * 3.2, 1.9, 1.9, 0.18, 3.4, 0.18);
  }
  box(root, '#dc2626', stX, 3.7, 0, 7.2, 0.22, 4.2);
  box(root, '#fbbf24', stX, 3.55, 2.1, 6.8, 0.12, 0.2);

  // ---- вагонетка на рельсах ----
  const cart = new THREE.Group(); root.add(cart);
  box(cart, '#b91c1c', 0, 0.22, 0, 2.4, 0.62, 1.5);
  box(cart, '#f8fafc', 0, 0.56, 0, 2.3, 0.14, 1.4);
  box(cart, '#111827', 0, 0.05, 0, 2.2, 0.2, 1.2);
  for (const [sx, sz] of [[-0.9, -0.62], [0.9, -0.62], [-0.9, 0.62], [0.9, 0.62]] as const)
    cyl(cart, '#1e293b', sx, -0.02, sz, 0.13, 0.2, Math.PI / 2, 0);
  for (const sx of [-1, 1]) box(cart, '#111827', sx * 1.1, 0.5, 1.35, 0.1, 0.9, 0.1);  // дуга безопасности

  const runDur = 16;
  const ride: Ride = {
    def: d, kind: 'coaster', root, phase: 0, running: false, dur: runDur, phase0: 0, yaw: 0,
    tick(dt) {
      // на стоянке вагонетка ждёт у станции, во время поездки едет по профилю
      if (this.running) this.phase = Math.min(1, this.phase + dt / runDur);
      else this.phase = 0;
      const t = this.phase;
      const x = px(t), y = prof(t);
      const slope = Math.atan2(prof(Math.min(1, t + 0.004)) - prof(t), len * 0.004);
      cart.position.set(x, y + 0.06, 0);
      cart.rotation.z = slope;
    },
    seat() {
      const t = this.phase;
      const x = px(t), y = prof(t);
      const slope = Math.atan2(prof(Math.min(1, t + 0.004)) - prof(t), len * 0.004);
      return { x: d.x + x, y: y + 0.5, z: d.z, yaw: Math.PI / 2, pitch: -slope };
    },
  };
  return ride;
}

export class ParkRides {
  group = new THREE.Group();
  private items = new Map<string, Ride>();
  constructor(defs: RideDef[]) {
    for (const d of defs) {
      const r = d.kind === 'ferris' ? makeFerris(d)
        : d.kind === 'carousel' ? makeCarousel(d)
          : d.kind === 'tower' ? makeTower(d)
            : makeCoaster(d);
      this.items.set(d.id, r);
      this.group.add(r.root);
    }
  }
  update(dt: number) { for (const r of this.items.values()) r.tick(dt); }
  start(id: string) { const r = this.items.get(id); if (!r) return 0; r.running = true; r.phase = r.phase0; return r.dur; }
  stop(id: string) { const r = this.items.get(id); if (r) { r.running = false; } }
  seat(id: string): SeatPose | null { const r = this.items.get(id); return r ? r.seat(r.phase) : null; }
  duration(id: string) { return this.items.get(id)?.dur ?? 12; }
  /** для проверок: сколько секунд идёт поездка и с какой фазы стартует */
  info(id: string) { const r = this.items.get(id); return r ? { dur: r.dur, phase0: r.phase0, kind: r.kind } : null; }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
}
