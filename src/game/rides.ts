// Аттракционы парка «Ракета»: динамические модели + места для пассажира.
// Статика парка (газон, дорожки, ограды) живёт в worldMesh, а всё, что должно
// крутиться и везти игрока, собирается здесь отдельными группами и анимируется
// в игровом цикле. Каждый аттракцион сам сообщает, где сейчас его «сиденье».
import * as THREE from 'three';
import type { WorldLayout } from './worldgen';

type RideDef = WorldLayout['parkRides'][number];
export type RideKind = RideDef['kind'];

export interface SeatPose { x: number; y: number; z: number; yaw: number; pitch: number }

interface Ride {
  def: RideDef;
  kind: RideKind;
  root: THREE.Group;
  /** 0..1 — прогресс поездки, у каждого аттракциона свой смысл */
  phase: number;
  running: boolean;
  tick(dt: number): void;
  seat(phase: number): SeatPose;
  /** сколько секунд длится поездка */
  dur: number;
  yaw: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.12 }); matCache.set(color, m); }
  return m;
}
function box(g: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = false; m.receiveShadow = false;
  g.add(m); return m;
}
function cyl(g: THREE.Object3D, color: string, x: number, y: number, z: number, r: number, h: number, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat(color));
  m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
  g.add(m); return m;
}

/** колесо обозрения: станина, вращающийся обод со спицами и кабинками */
function makeFerris(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const R = d.h, cy = R + 2.4;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) box(root, '#94a3b8', sx * 1.9, cy / 2, sz * 0.5, 0.24, cy * 1.02, 0.24, 0, 0, sx * 0.06);
    box(root, '#64748b', 0, 0.5, sz * 1.6, 5.2, 0.5, 0.9);
  }
  cyl(root, '#475569', 0, cy, 0, 0.42, 3.0, 0, Math.PI / 2);
  const wheel = new THREE.Group(); wheel.position.set(0, cy, 0); root.add(wheel);
  const SEG = 24;
  for (let k = 0; k < SEG; k++) {
    const a = (k / SEG) * Math.PI * 2;
    box(wheel, '#e2e8f0', 0, Math.sin(a) * R, Math.cos(a) * R, 0.26, 0.32, (2 * Math.PI * R) / SEG + 0.16, a, 0, 0);
  }
  const gondolas: THREE.Group[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    box(wheel, '#94a3b8', 0, Math.sin(a) * R / 2, Math.cos(a) * R / 2, 0.16, R, 0.16, a, 0, 0);
    const gd = new THREE.Group();
    gd.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
    const body = new THREE.Group(); body.position.y = -0.9;
    box(body, k % 2 ? '#f97316' : '#22c55e', 0, 0, 0, 1.7, 1.4, 1.3);
    box(body, '#0f172a', 0, 0.5, 0.66, 1.5, 0.6, 0.08);
    box(body, '#0f172a', 0, 0.5, -0.66, 1.5, 0.6, 0.08);
    box(body, '#e2e8f0', 0, 0.78, 0, 1.75, 0.12, 1.35);
    gd.add(body);
    wheel.add(gd); gondolas.push(gd);
  }
  box(root, '#e2e8f0', 0, 0.25, 0, 4.2, 0.5, 4.2);   // площадка посадки
  const ride: Ride = {
    def: d, kind: 'ferris', root, phase: 0, running: false, dur: 20, yaw: 0,
    tick(dt) {
      const speed = this.running ? 0.34 : 0.12;
      this.phase += dt * speed;
      wheel.rotation.x = this.phase;
      for (const gd of gondolas) gd.rotation.x = -this.phase;
    },
    seat() {
      const a = this.phase + 0;               // кабинка №0
      const y = cy + Math.sin(a) * R - 0.9;
      const z = d.z + Math.cos(a) * R;
      const x = d.x;
      return { x, y: y - 0.55, z, yaw: Math.atan2(Math.cos(a), Math.sin(a)), pitch: -0.05 };
    },
  };
  return ride;
}

/** карусель: вращающаяся платформа с лошадками и шатром */
function makeCarousel(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const R = d.w / 2;
  const spin = new THREE.Group(); root.add(spin);
  cyl(root, '#b91c1c', 0, 0.15, 0, R + 0.4, 0.3, 0, 0);
  cyl(spin, '#f8fafc', 0, 0.42, 0, R, 0.14);
  cyl(root, '#eab308', 0, 2.2, 0, 0.32, 4.4);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(R * 1.02, 2.6, 16), mat('#dc2626'));
  canopy.position.y = 6.4; root.add(canopy);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    box(canopy, '#f8fafc', Math.cos(a) * R * 0.55, -0.6, Math.sin(a) * R * 0.55, 0.5, 2.0, 0.12, 0, -a, 0.3);
  }
  const horses: THREE.Group[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const h = new THREE.Group();
    h.position.set(Math.cos(a) * R * 0.66, 0.9, Math.sin(a) * R * 0.66);
    h.rotation.y = -a;
    box(h, k % 2 ? '#f8fafc' : '#7c3aed', 0, 0.55, 0, 1.5, 0.9, 0.55);
    box(h, '#f1f5f9', 0.85, 1.0, 0, 0.55, 0.55, 0.4);
    for (const [ox, oz] of [[-0.5, -0.2], [-0.5, 0.2], [0.5, -0.2], [0.5, 0.2]] as const) box(h, '#eab308', ox, 0.05, oz, 0.13, 0.85, 0.13);
    cyl(spin, '#fbbf24', h.position.x, 3.4, h.position.z, 0.05, 2.6);
    spin.add(h); horses.push(h);
  }
  cyl(root, '#94a3b8', 0, 0.55, 0, R + 0.5, 0.12);  // бортик по кругу (не мешает посадке)
  const ride: Ride = {
    def: d, kind: 'carousel', root, phase: 0, running: false, dur: 14, yaw: 0,
    tick(dt) {
      const speed = this.running ? 0.85 : 0.18;
      this.phase += dt * speed;
      spin.rotation.y = this.phase;
      horses.forEach((h, i) => { h.position.y = 0.9 + Math.sin(this.phase * 3 + i) * 0.22; });
    },
    seat() {
      const a = this.phase;
      const rr = R * 0.66;
      return { x: d.x + Math.cos(a) * rr, y: 2.0, z: d.z + Math.sin(a) * rr, yaw: -a + Math.PI / 2, pitch: 0 };
    },
  };
  return ride;
}

/** башня свободного падения: кабина едет вверх и срывается вниз */
function makeTower(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const H = d.h;
  cyl(root, '#334155', 0, 0.25, 0, 1.5, 0.5);
  box(root, '#64748b', 0, H / 2, 0, 1.0, H, 1.0);
  box(root, '#1e293b', 0, H, 0, 2.6, 0.7, 2.6);
  const car = new THREE.Group(); root.add(car);
  box(car, '#dc2626', 0, 0, 0, 2.6, 1.2, 2.6);
  box(car, '#f8fafc', 0, 0.72, 0, 2.7, 0.14, 2.7);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) cyl(car, '#f8fafc', sx * 1.2, 0.9, sz * 1.2, 0.09, 0.8);
  const ride: Ride = {
    def: d, kind: 'tower', root, phase: 0, running: false, dur: 16, yaw: 0,
    tick(dt) {
      if (this.running) this.phase = Math.min(1, this.phase + dt / this.dur);
      const p = this.phase;
      // 0–0.35 подъём, 0.35–0.5 стоим, 0.5–0.62 падение, дальше отдых
      let y = 1.2;
      if (p < 0.35) y = 1.2 + (H - 4) * (p / 0.35);
      else if (p < 0.5) y = H - 2.8;
      else if (p < 0.62) { const k = (p - 0.5) / 0.12; y = (H - 2.8) * (1 - k * k) + 1.2 * k * k; }
      car.position.y = y;
      // при простое кабина медленно катается вверх-вниз «для красоты»
      if (!this.running) car.position.y = 1.2 + Math.sin(performance.now() / 2600) * 0.8;
      void dt;
    },
    seat() {
      return { x: d.x, y: car.position.y + 0.75, z: d.z, yaw: 0, pitch: 0 };
    },
  };
  return ride;
}

/** американские горки: рельсы по профилю и вагонетка, которая по ним едет */
function makeCoaster(d: RideDef): Ride {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z);
  const len = d.w, H = d.h;
  const prof = (t: number) => 1.2 + Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * H;
  const N = 30;
  for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N;
    const x0 = -len / 2 + len * t0, x1 = -len / 2 + len * t1;
    const y0 = prof(t0), y1 = prof(t1);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const seg = Math.hypot(x1 - x0, y1 - y0) + 0.1;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (const sz of [-0.65, 0.65]) {
      box(root, '#f59e0b', mx, my, sz, seg, 0.16, 0.16, 0, 0, ang);
      box(root, '#fbbf24', mx, my - 0.3, sz, seg, 0.1, 0.1, 0, 0, ang);
    }
    if (k % 2 === 0) box(root, '#94a3b8', mx, my / 2, 0, 0.22, my, 1.5);
  }
  box(root, '#7f1d1d', -len / 2 + 3, 0.55, 0, 7, 0.3, 3.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(root, '#7f1d1d', -len / 2 + 3 + sx * 3, 1.1, sz * 1.4, 0.2, 2.2, 0.2);
  const cart = new THREE.Group(); root.add(cart);
  box(cart, '#dc2626', 0, 0.25, 0, 2.2, 0.7, 1.4);
  for (const [sx, sz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]] as const) cyl(cart, '#1e293b', sx, -0.05, sz, 0.12, 0.24, Math.PI / 2, 0);
  const ride: Ride = {
    def: d, kind: 'coaster', root, phase: 0, running: false, dur: 16, yaw: 0,
    tick(dt) {
      if (this.running) this.phase = Math.min(1, this.phase + dt / 16);
      else this.phase = Math.min(0.999, this.phase + dt * 0.02);
      const t = this.phase;
      const x = -len / 2 + len * t, y = prof(t);
      const slope = Math.atan2(prof(Math.min(1, t + 0.01)) - prof(t), len * 0.01);
      cart.position.set(x * 0.92, y + 0.1, 0);
      cart.rotation.z = slope;
    },
    seat() {
      const t = this.phase;
      const x = (-len / 2 + len * t) * 0.92;
      return { x: d.x + x, y: prof(t) + 0.55, z: d.z, yaw: Math.PI / 2, pitch: 0 };
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
  start(id: string) { const r = this.items.get(id); if (!r) return 0; r.running = true; r.phase = 0; return r.dur; }
  stop(id: string) { const r = this.items.get(id); if (r) r.running = false; }
  seat(id: string): SeatPose | null { return this.items.get(id)?.seat(this.items.get(id)!.phase) ?? null; }
  duration(id: string) { return this.items.get(id)?.dur ?? 12; }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
}
