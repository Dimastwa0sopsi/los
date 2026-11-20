// Построение 3D-мира из раскладки: чанки, объединённая геометрия, инстансы
import * as THREE from 'three';
import { CHUNK, CELL, ROAD_W, N, SIDEWALK } from './config';
import type { WorldLayout, Building, Prop } from './worldgen';
import { Batcher, T, M, stripQuad } from './geom';
import { FACADE_TILE, mat, getTex, GFX } from './textures';
import { KIOSK_TYPES } from './data';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export interface LightIntersection { node: number; x: number; z: number; gi: number; gj: number; state: number }
export interface WorldMeshes {
  root: THREE.Group;
  chunks: { group: THREE.Group; cx: number; cz: number }[];
  lights: LightIntersection[];
  bulbs: THREE.InstancedMesh;
  wheat: THREE.InstancedMesh;
  wheatCells: { x: number; z: number; done: boolean }[];
  garageGates: THREE.Mesh[];
  /** поверхности воды: отмель, средняя глубина, фарватер */
  waters: THREE.Mesh[];
  /** прибой: пенная полоса у кромки воды, анимируется в game.ts */
  shore: THREE.Mesh | null;
  /** створки ворот на петлях: один инстанс-меш, матрицы обновляет game.ts */
  gates: THREE.InstancedMesh | null;
  gateLeaves: GateLeaf[];
  /** лицевые плоскости рекламных щитов: текстуру ставит game/ads.ts */
  billboards: { id: string; mesh: THREE.Mesh }[];
}
/** створка ворот: петля (x,z), закрытый угол a, длина w, сторона открытия swing */
export interface GateLeaf { x: number; z: number; a: number; w: number; swing: number; color: string; open: number }

/** геометрия створки в локальных координатах: петля в нуле, полотно вдоль +X 0..1 */
function gateLeafGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g);
  };
  for (let i = 0; i < 4; i++) add(0.22, 1.05, 0.06, 0.14 + i * 0.24, 0.86, 0);   // доски
  add(1.0, 0.1, 0.05, 0.5, 0.45, 0.05); add(1.0, 0.1, 0.05, 0.5, 1.16, 0.05);     // прожилины
  add(1.02, 0.08, 0.09, 0.5, 1.36, 0);                                            // верхняя планка
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

export async function buildWorldMeshes(L: WorldLayout, progress: (p: number, label: string) => void): Promise<WorldMeshes> {
  const root = new THREE.Group();
  root.name = 'world';
  const batchers = new Map<string, Batcher>();
  const B = (x: number, z: number) => {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let b = batchers.get(k); if (!b) { b = new Batcher(); batchers.set(k, b); }
    return b;
  };
  // ---------- земля ----------
  progress(0.12, 'Земля и вода');
  const bnd = L.bounds;
  // плоскость травы больше не одна: суша строится берегами вдоль русла (ниже)
  // ---------- РЕКА: вырезанное ложе, настоящее дно и вода слоями ----------
  // Раньше вода была одной плоской полосой поверх травы: под ней ничего не было,
  // а «мокрый песок» заходил на воду на 5 метров — из-за этого игрок «купался в песке».
  // Теперь земля строится берегами вдоль русла (с вырезом), между берегами лежит дно
  // с реальной глубиной (L.river.depth), а поверх — вода тремя полосами прозрачности:
  // отмель → средняя глубина → фарватер.
  const WATER_Y = L.waterY;
  const RZ = 12;                                       // шаг полос вдоль русла
  const GX0 = bnd.x0 - 400, GX1 = bnd.x1 + 400, GZ0 = bnd.z0 - 400, GZ1 = bnd.z1 + 400;
  const bankHalf = L.river.half;
  const bankX = (z: number) => L.river.center(z);
  // плоский четырёхугольник на земле: точки по кругу, UV в метрах (трава/дно не «мылятся»)
  const flat4 = (b: Batcher, key: string, pts: [number, number][], y: number, s = 12.5) => {
    // Самопроверка обхода: считаем нормаль первого треугольника и при необходимости
    // разворачиваем — иначе земля/вода оказываются вывернутыми и «исчезают» сверху.
    const ny = (p: [number, number][], o: number[]) =>
      (p[o[2]][1] - p[o[0]][1]) * (p[o[1]][0] - p[o[0]][0]) - (p[o[2]][0] - p[o[0]][0]) * (p[o[1]][1] - p[o[0]][1]);
    let order = [0, 1, 2, 0, 2, 3];
    if (ny(pts, order) > 0) order = [0, 3, 2, 0, 2, 1];
    const pos: number[] = [], uv2: number[] = [];
    for (const i of order) { pos.push(pts[i][0], y, pts[i][1]); uv2.push(pts[i][0] / s, pts[i][1] / s); }
    b.raw(key, pos, uv2);
  };
  // Вырезаем прямоугольные чаши из земли, чтобы плитка и дно не скрывались травой.
  type P2 = [number, number];
  const cutPools = (polygon: P2[]): P2[][] => {
    let pieces = [polygon];
    const clip = (poly: P2[], axis: 0 | 1, bound: number, less: boolean): P2[] => {
      const out: P2[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ia = less ? a[axis] <= bound : a[axis] >= bound;
        const ib = less ? b[axis] <= bound : b[axis] >= bound;
        if (ia) out.push(a);
        if (ia !== ib) { const t = (bound - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    for (const p of L.pools) {
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
      const next: P2[][] = [];
      for (const poly of pieces) {
        if (Math.max(...poly.map(v => v[0])) <= x0 || Math.min(...poly.map(v => v[0])) >= x1 || Math.max(...poly.map(v => v[1])) <= z0 || Math.min(...poly.map(v => v[1])) >= z1) { next.push(poly); continue; }
        let inside = poly;
        for (const [axis, bound, less] of [[0, x0, false], [0, x1, true], [1, z0, false], [1, z1, true]] as const) {
          const outside = clip(inside, axis, bound, !less); if (outside.length >= 3) next.push(outside);
          inside = clip(inside, axis, bound, less); if (inside.length < 3) break;
        }
      }
      pieces = next;
    }
    return pieces;
  };
  const groundPoly = (b: Batcher, key: string, pts: P2[], y: number, scale = 12.5) => {
    for (const poly of cutPools(pts)) for (let i = 1; i + 1 < poly.length; i++) {
      const tri = [poly[0], poly[i], poly[i + 1]];
      const ny = (tri[2][1] - tri[0][1]) * (tri[1][0] - tri[0][0]) - (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1]);
      if (ny > 0) [tri[1], tri[2]] = [tri[2], tri[1]];
      b.raw(key, tri.flatMap(v => [v[0], y, v[1]]), tri.flatMap(v => [v[0] / scale, v[1] / scale]));
    }
  };
  const gb = new Batcher();                            // суша двумя берегами (без воды посередине)
  const wShallow = new Batcher(), wMid = new Batcher(), wDeep = new Batcher();
  const bedPos: number[] = [], bedUv: number[] = [], bedCol: number[] = [];
  const cShore = new THREE.Color('#c8b184'), cShelf = new THREE.Color('#6f8a6b'), cDeep = new THREE.Color('#143038');
  const ACROSS = 14;
  const bedColor = (depth: number, out: THREE.Color) => {
    const k = Math.min(1, depth / 3.6);
    if (k < 0.45) out.copy(cShore).lerp(cShelf, k / 0.45);
    else out.copy(cShelf).lerp(cDeep, Math.min(1, (k - 0.45) / 0.55));
    return out;
  };
  const tmpC = new THREE.Color();
  const bedTri = (a: [number, number, number], b2: [number, number, number], c: [number, number, number]) => {
    // нормаль по (b-a)×(c-a): если смотрит вниз — меняем обход, чтобы дно было видно сверху
    const ny = (b2[2] - a[2]) * (c[0] - a[0]) - (b2[0] - a[0]) * (c[2] - a[2]);
    const t3 = ny >= 0 ? [a, b2, c] : [a, c, b2];
    for (const v of t3) {
      bedPos.push(v[0], v[1], v[2]);
      bedUv.push(v[0] / 4.5, v[2] / 4.5);
      const col = bedColor(Math.max(0, -v[1]), tmpC);
      bedCol.push(col.r, col.g, col.b);
    }
  };
  for (let z = GZ0; z < GZ1; z += RZ) {
    const z1 = Math.min(GZ1, z + RZ);
    const c0 = bankX(z), c1 = bankX(z1);
    const l0 = c0 - bankHalf, l1 = c1 - bankHalf;
    const r0 = c0 + bankHalf, r1 = c1 + bankHalf;
    // суша: левый и правый берег, кромка точно по линии воды
    groundPoly(gb, 'tex:grass', [[GX0, z], [GX0, z1], [l1, z1], [l0, z]], 0);
    groundPoly(gb, 'tex:grass', [[r0, z], [r1, z1], [GX1, z1], [GX1, z]], 0);
    // дно: поперёк русла 14 сегментов, глубина по профилю
    const px: number[][] = [], py: number[][] = [];
    for (const zz of [z, z1]) {
      const lx = zz === z ? l0 : l1, rx = zz === z ? r0 : r1;
      const rowX: number[] = [], rowY: number[] = [];
      for (let j = 0; j <= ACROSS; j++) {
        const x = lx + (rx - lx) * (j / ACROSS);
        rowX.push(x); rowY.push(-L.river.depth(x, zz));
      }
      px.push(rowX); py.push(rowY);
    }
    for (let j = 0; j < ACROSS; j++) {
      const a: [number, number, number] = [px[0][j], py[0][j], z];
      const b2: [number, number, number] = [px[0][j + 1], py[0][j + 1], z];
      const c: [number, number, number] = [px[1][j + 1], py[1][j + 1], z1];
      const d: [number, number, number] = [px[1][j], py[1][j], z1];
      bedTri(a, b2, c); bedTri(a, c, d);
      // поверхность воды: полоса тем прозрачнее, чем глубже
      const depth = (-(py[0][j] + py[0][j + 1] + py[1][j] + py[1][j + 1]) / 4);
      const band = depth < 0.55 ? wShallow : depth < 2.1 ? wMid : wDeep;
      flat4(band, depth < 0.55 ? 'waterShallow' : depth < 2.1 ? 'waterMid' : 'waterDeep',
        [[px[0][j], z], [px[0][j + 1], z], [px[1][j + 1], z1], [px[1][j], z1]], WATER_Y, 26);
    }
  }
  gb.build().forEach((m) => { m.receiveShadow = true; root.add(m); });
  {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bedPos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(bedUv, 2));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(bedCol, 3));
    bg.computeVertexNormals(); bg.computeBoundingSphere();
    const bmat = GFX.pbr
      ? new THREE.MeshStandardMaterial({ map: getTex('riverbed'), vertexColors: true, roughness: 0.95, metalness: 0.02 })
      : new THREE.MeshLambertMaterial({ map: getTex('riverbed'), vertexColors: true });
    const bedMesh = new THREE.Mesh(bg, bmat);
    bedMesh.receiveShadow = true; bedMesh.matrixAutoUpdate = false; bedMesh.updateMatrix();
    root.add(bedMesh);
  }
  // ---------- дно не пустое: валуны, галька и водоросли под водой ----------
  {
    const db = new Batcher();
    const rnd = (i: number) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
    let i = 0;
    for (let z = GZ0; z < GZ1; z += 22) {
      const c = bankX(z);
      const spots = 1 + ((z / 22) % 2 === 0 ? 1 : 0);
      for (let k = 0; k < spots; k++, i++) {
        const x = c + (rnd(i * 3.1) - 0.5) * 2 * (bankHalf - 4);
        const d = L.river.depth(x, z);
        if (d < 0.3) continue;
        const y = -d;
        const s = 0.3 + rnd(i * 7.7) * 0.75;
        db.add('c:#8a8371', T.ico, M(x, y + s * 0.3, z + rnd(i * 5.3) * 5, rnd(i) * 6, s, s * 0.62, s * 0.9));
        if (rnd(i * 2.2) > 0.45) {
          const wh = 0.7 + rnd(i * 9.1) * 1.3;
          db.add('c:#3f6b45', T.cylB, M(x + 0.8, y, z - 0.6, 0, 0.06, wh, 0.06));
          db.add('c:#4d7a50', T.cylB, M(x + 0.62, y, z - 0.4, 0, 0.05, wh * 0.75, 0.05));
          db.add('c:#356040', T.cylB, M(x + 0.95, y, z - 0.85, 0, 0.05, wh * 0.6, 0.05));
        }
      }
    }
    db.build().forEach((m) => { m.receiveShadow = true; root.add(m); });
  }
  // вода: три слоя прозрачности, чтобы отмель просвечивала, а фарватер был тёмным
  const waters: THREE.Mesh[] = [];
  for (const [batcher, key] of [[wShallow, 'waterShallow'], [wMid, 'waterMid'], [wDeep, 'waterDeep']] as const) {
    batcher.build().forEach((m) => { m.renderOrder = 3; m.userData.water = true; waters.push(m); root.add(m); });
  }
  // ---------- прибой: пена ровно по кромке воды (полоса следует за руслом) ----------
  let shore: THREE.Mesh | null = null;
  {
    const fb = new Batcher();
    const be0 = L.beach;
    for (let z = be0.z0 - 10; z < be0.z1 + 10; z += 4) {
      const a = L.river.center(z) + L.river.half, c = L.river.center(z + 4) + L.river.half;
      stripQuad(fb, 'foam', a - 0.9, z, c - 0.9, z + 4, 3.6, WATER_Y + 0.012, 2.4);  // вал прибоя на самой воде
      stripQuad(fb, 'foam', a + 2.6, z, c + 2.6, z + 4, 3.4, 0.112, 1.8);           // язык пены на песке
    }
    const built = fb.build();
    if (built.length) { shore = built[0]; shore.renderOrder = 4; root.add(shore); }
  }
  await tick();
  // ---------- дороги ----------
  progress(0.18, 'Дороги и разметка');
  const isCity = (id: number) => L.nodes[id].gi !== undefined;
  // у каждого узла — направления и полуширины асфальтовых дорог: по ним подрезаем просёлки,
  // чтобы земля не залезала на асфальт (в Сосновке был «пятак» грунта посреди улицы)
  const pavedAt = new Map<number, { dx: number; dz: number; half: number }[]>();
  for (const e of L.edges) {
    if (e.kind === 'dirt') continue;
    const A = L.nodes[e.a], Bn = L.nodes[e.b];
    const dl = Math.hypot(Bn.x - A.x, Bn.z - A.z) || 1;
    const dx = (Bn.x - A.x) / dl, dz = (Bn.z - A.z) / dl;
    const p1 = pavedAt.get(e.a); if (p1) p1.push({ dx, dz, half: e.w / 2 }); else pavedAt.set(e.a, [{ dx, dz, half: e.w / 2 }]);
    const p2 = pavedAt.get(e.b); if (p2) p2.push({ dx: -dx, dz: -dz, half: e.w / 2 }); else pavedAt.set(e.b, [{ dx: -dx, dz: -dz, half: e.w / 2 }]);
  }
  /** на сколько отступить просёлку от узла, чтобы не лезть на поперечный асфальт */
  const dirtTrim = (node: number, dx: number, dz: number) => {
    let t = 0;
    for (const p of pavedAt.get(node) ?? []) {
      if (Math.abs(p.dx * dx + p.dz * dz) > 0.55) continue;     // почти вдоль асфальта — не подрезаем
      t = Math.max(t, p.half + 0.15);
    }
    return t;
  };
  for (const e of L.edges) {
    const a = L.nodes[e.a], b = L.nodes[e.b];
    let ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const len = Math.hypot(bx - ax, bz - az); const ux = (bx - ax) / len, uz = (bz - az) / len;
    if (e.kind === 'dirt') {
      const ta = dirtTrim(e.a, ux, uz);
      const tb = dirtTrim(e.b, -ux, -uz);
      if (ta + tb < len - 2) { ax += ux * ta; az += uz * ta; bx -= ux * tb; bz -= uz * tb; }
    }
    if (isCity(e.a)) { ax += ux * ROAD_W / 2; az += uz * ROAD_W / 2; }
    if (isCity(e.b)) { bx -= ux * ROAD_W / 2; bz -= uz * ROAD_W / 2; }
    // три дизайна городского полотна: чередуются по кварталам, чтобы асфальт не был одинаковым
    const baseKey = e.kind === 'dirt' ? 'road:road_dirt'
      : e.kind === 'highway' ? 'road:road_highway6'
      : e.kind === 'avenue' ? 'road:road_highway'
      : e.kind === 'city' ? 'city' : 'road:road_' + e.kind;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const segs = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 60));
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const sx = ax + (bx - ax) * t0, sz = az + (bz - az) * t0, ex = ax + (bx - ax) * t1, ez = az + (bz - az) * t1;
      const v = Math.abs(Math.round((sx + sz) / 47)) % 3;
      const key = baseKey === 'city' ? (v === 1 ? 'road:road_city2' : v === 2 ? 'road:road_city3' : 'road:road_city') : baseKey;
      stripQuad(B((sx + ex) / 2, (sz + ez) / 2), key, sx, sz, ex, ez, e.w, 0.03, e.w * 2, (Math.hypot(sx - ax, sz - az) / (e.w * 2)));
    }
    void mx; void mz;
    // зебры у городских перекрёстков
    if (e.kind === 'city' || e.kind === 'avenue') {
      if (a.light || (a.gi! > 0 && a.gi! < N) || true) {
        stripQuad(B(ax, az), 'zebra', ax + ux * 3.2, az + uz * 3.2, ax + ux * 0.2, az + uz * 0.2, ROAD_W - 0.6, 0.05, 3);
        stripQuad(B(bx, bz), 'zebra', bx - ux * 3.2, bz - uz * 3.2, bx - ux * 0.2, bz - uz * 0.2, ROAD_W - 0.6, 0.05, 3);
      }
    }
  }
  for (const n of L.nodes) {
    if (n.dead || !L.adj[n.id]?.length) continue;      // узлы-сироты после чистки дублей: дорог нет
    const deg = L.adj[n.id].length;
    if (n.gi !== undefined) B(n.x, n.z).add('road:patch', T.plane, M(n.x, 0.035, n.z, 0, ROAD_W, ROAD_W, 1, -Math.PI / 2), 12);
    else if (deg !== 2 || true) {
      const e = L.edges[L.adj[n.id][0].e];
      const key = e.kind === 'dirt' ? 'road:road_dirt' : 'road:patch';
      B(n.x, n.z).add(key, T.circle, M(n.x, 0.032, n.z, 0, e.w / 2, e.w / 2, 1, -Math.PI / 2), 12);
    }
  }
  await tick();
  // ---------- поверхности кварталов ----------
  progress(0.24, 'Кварталы и тротуары');
  // Квартал: в городе — асфальт (как в жизни: проезды, площадки, парковки), но не «плита»:
  // по краю газонная полоса, внутри — пятна газона и земли, лунки под деревья. Парки,
  // частный сектор и деревня остаются зелёными.
  const GREEN_BLOCKS = ['park', 'private', 'farm', 'barn', 'coop', 'livestock', 'village', 'dacha', 'orchard'];
  // детерминированный «шум» без RNG: одинаковый мир при каждой сборке
  const hsh = (a: number, b: number, k: number) => {
    const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (const bl of L.blocks) {
    const x0 = bl.ox ?? bl.i * CELL + ROAD_W / 2, z0 = bl.oz ?? bl.j * CELL + ROAD_W / 2, s = CELL - ROAD_W;
    const cx = x0 + s / 2, cz = z0 + s / 2;
    // кварталы большого парка рисуются одним куском ниже: иначе внутри парка
    // остаются бордюры и тротуары от бывших четырёх кварталов
    if (L.bigParks.some((q) => cx > q.x0 && cx < q.x1 && cz > q.z0 && cz < q.z1)) continue;
    const b = B(cx, cz);
    const green = GREEN_BLOCKS.includes(bl.type);
    // основание квартала: асфальт в городе, газон в парках и частном секторе
    groundPoly(b, green ? 'tex:grass' : 'tex:asphalt', [[x0, z0], [x0, z0 + s], [x0 + s, z0 + s], [x0 + s, z0]], 0.075, green ? 4 : 6);
    const cc = 'c:#c9c6bf';
    b.box(cc, cx, 0, z0 + 0.12, s, 0.18, 0.24); b.box(cc, cx, 0, z0 + s - 0.12, s, 0.18, 0.24);
    b.box(cc, x0 + 0.12, 0, cz, 0.24, 0.18, s); b.box(cc, x0 + s - 0.12, 0, cz, 0.24, 0.18, s);
    // тротуар по периметру квартала: четыре полосы шириной SIDEWALK
    const sw = SIDEWALK;
    b.add('tex:sidewalk', T.plane, M(cx, 0.158, z0 + sw / 2, 0, s, sw, 1, -Math.PI / 2), 2.5);
    b.add('tex:sidewalk', T.plane, M(cx, 0.158, z0 + s - sw / 2, 0, s, sw, 1, -Math.PI / 2), 2.5);
    b.add('tex:sidewalk', T.plane, M(x0 + sw / 2, 0.158, cz, 0, sw, s - 2 * sw, 1, -Math.PI / 2), 2.5);
    b.add('tex:sidewalk', T.plane, M(x0 + s - sw / 2, 0.158, cz, 0, sw, s - 2 * sw, 1, -Math.PI / 2), 2.5);
    if (!green) {
      // Город — асфальт: газонов нет. Остаются только пятна земли (ремонт, клумбы
      // без травы) и лунки под уличные деревья, чтобы не было «газонного ковра».
      const ix0 = x0 + sw + 2, iz0 = z0 + sw + 2;
      const iw = s - 2 * (sw + 2);
      const n = 3 + Math.floor(hsh(bl.i, bl.j, 1) * 3);
      for (let k = 0; k < n; k++) {
        const px = ix0 + hsh(bl.i, bl.j, 10 + k) * iw, pz = iz0 + hsh(bl.i, bl.j, 40 + k) * iw;
        const pw = 3.5 + hsh(bl.i, bl.j, 70 + k) * 6, pd = 3.5 + hsh(bl.i, bl.j, 90 + k) * 6;
        if (Math.hypot(px - cx, pz - cz) < 8) continue;
        b.add('tex:soil', T.plane, M(px, 0.154 + k * 0.0004, pz, hsh(bl.i, bl.j, 160 + k) * 3.14, pw, pd, 1, -Math.PI / 2), 4);
      }
      // лунки под уличные деревья
      for (const tt of [-16, -3, 4.5, 16]) {
        b.add('tex:soil', T.plane, M(cx + tt, 0.159, z0 + 0.75, 0, 1.1, 1.1, 1, -Math.PI / 2), 2);
        b.add('tex:soil', T.plane, M(cx + tt, 0.159, z0 + s - 0.75, 0, 1.1, 1.1, 1, -Math.PI / 2), 2);
      }
    }
    const ix = x0 + SIDEWALK, iz = z0 + SIDEWALK, is = s - SIDEWALK * 2;
    if (bl.type === 'park') {
      // дорожки парка поверх газона: две аллеи и кольцо
      b.add('tex:sidewalk', T.plane, M(ix + is / 2, 0.165, iz + is / 2, 0, 4, is, 1, -Math.PI / 2), 2.5);
      b.add('tex:sidewalk', T.plane, M(ix + is / 2, 0.166, iz + is / 2, 0, is, 4, 1, -Math.PI / 2), 2.5);
      for (let k = 0; k < 16; k++) { const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2; stripQuad(b, 'tex:sidewalk', ix + is / 2 + Math.cos(a0) * 13, iz + is / 2 + Math.sin(a0) * 13, ix + is / 2 + Math.cos(a1) * 13, iz + is / 2 + Math.sin(a1) * 13, 3, 0.167, 3); }
    }
  }
  // ---------- Парк «Ракета» (2×2 квартала) ----------
  // Газон + сеть пешеходных дорожек: площадь у ракеты, аллеи по четырём сторонам,
  // кольцо вокруг площади и лучи к каждому аттракциону. Машинных проездов нет.
  for (const bp of L.bigParks) {
    const w = bp.x1 - bp.x0, d = bp.z1 - bp.z0;
    const cx = (bp.x0 + bp.x1) / 2, cz = (bp.z0 + bp.z1) / 2;
    const b = B(cx, cz);
    b.box('tex:grass', cx, 0, cz, w, 0.15, d, 0, 4);
    const cc = 'c:#c9c6bf';
    b.box(cc, cx, 0, bp.z0 + 0.12, w, 0.18, 0.24); b.box(cc, cx, 0, bp.z1 - 0.12, w, 0.18, 0.24);
    b.box(cc, bp.x0 + 0.12, 0, cz, 0.24, 0.18, d); b.box(cc, bp.x1 - 0.12, 0, cz, 0.24, 0.18, d);
    const sw = SIDEWALK;
    b.add('tex:sidewalk', T.plane, M(cx, 0.158, bp.z0 + sw / 2, 0, w, sw, 1, -Math.PI / 2), 2.5);
    b.add('tex:sidewalk', T.plane, M(cx, 0.158, bp.z1 - sw / 2, 0, w, sw, 1, -Math.PI / 2), 2.5);
    b.add('tex:sidewalk', T.plane, M(bp.x0 + sw / 2, 0.158, cz, 0, sw, d - 2 * sw, 1, -Math.PI / 2), 2.5);
    b.add('tex:sidewalk', T.plane, M(bp.x1 - sw / 2, 0.158, cz, 0, sw, d - 2 * sw, 1, -Math.PI / 2), 2.5);
    // плиточные дорожки: чуть светлее газона и с бордюром из мелкого камня
    const pathY = 0.166;
    const path = (ax: number, az: number, bx: number, bz: number, width = 5) => {
      stripQuad(b, 'tex:sidewalk', ax, az, bx, bz, width, pathY, 3);
      stripQuad(b, 'tex:sidewalk', ax, az, bx, bz, width * 0.82, pathY + 0.004, 3); // внутренняя «плитка» чуть выше
    };
    // площадь: круг радиусом 16 м вокруг ракеты
    b.add('tex:sidewalk', T.circle, M(cx, pathY, cz, 0, 17, 17, 1, -Math.PI / 2), 12);
    b.add('tex:sidewalk', T.circle, M(cx, pathY + 0.002, cz, 0, 15.6, 15.6, 1, -Math.PI / 2), 12);
    // четыре аллеи от края парка к площади
    path(cx, bp.z0 + sw, cx, cz - 15, 7);
    path(cx, cz + 15, cx, bp.z1 - sw, 7);
    path(bp.x0 + sw, cz, cx - 15, cz, 7);
    path(cx + 15, cz, bp.x1 - sw, cz, 7);
    // кольцо вокруг площади — прогулочная дорожка
    const ringR = 30, RN = 40;
    for (let k = 0; k < RN; k++) {
      const a0 = (k / RN) * Math.PI * 2, a1 = ((k + 1) / RN) * Math.PI * 2;
      stripQuad(b, 'tex:sidewalk', cx + Math.cos(a0) * ringR, cz + Math.sin(a0) * ringR, cx + Math.cos(a1) * ringR, cz + Math.sin(a1) * ringR, 4.5, pathY - 0.002, 3);
    }
    // лучи от кольца к аттракционам и к пруду
    const rides = L.parkRides ?? [];
    for (const rd of rides) {
      const dx = rd.board.x - cx, dz = rd.board.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const sx = cx + (dx / len) * ringR, sz = cz + (dz / len) * ringR;
      path(sx, sz, rd.board.x, rd.board.z, 4.5);
      // площадка сбора у аттракциона
      b.add('tex:sidewalk', T.plane, M(rd.board.x, pathY + 0.002, rd.board.z, 0, 9, 9, 1, -Math.PI / 2), 3);
    }
    // дорожка к детской площадке и к пруду
    path(bp.x1 - 26, bp.z0 + sw, bp.x1 - 26, bp.z0 + 22, 3.6);
    path(cx + ringR, cz, bp.x1 - 20 - 10, bp.z1 - 32, 4.5);
    path(bp.x1 - 20, bp.z0 + 24, bp.x1 - 20, bp.z1 - 32 - 10, 3.6);
  }

  // промзона, пляж, парковка, поля
  const ind = L.industrial;
  for (let x = ind.x0; x < ind.x1; x += CHUNK / 2) for (let z = ind.z0; z < ind.z1; z += CHUNK / 2) {
    const w = Math.min(CHUNK / 2, ind.x1 - x), d = Math.min(CHUNK / 2, ind.z1 - z);
    B(x + w / 2, z + d / 2).add('tex:asphalt', T.plane, M(x + w / 2, 0.02, z + d / 2, 0, w, d, 1, -Math.PI / 2), 8);
  }
  // ---------- Пляж: живая береговая линия по полосам ----------
  // Мокрый песок следует за руслом (bankE(z) меняется по Z), дальше сухой песок
  // с дюнами, у променада — галечная полоса. Раньше был один прямоугольник песка,
  // из-за чего берег выглядел линейкой, а плитка променада уходила под песок.
  const be = L.beach;
  const bankAt = (z: number) => L.river.center(z) + L.river.half;
  {
    const STEP = 8;
    const zs: number[] = [];
    for (let z = be.z0 - 20; z < be.z1 + 20; z += STEP) zs.push(z);
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const b0 = bankAt(z0), b1 = bankAt(z1), bm = bankAt((z0 + z1) / 2);
      const bb = B(bm, (z0 + z1) / 2);
      // вода → мокрый песок: полоса 14 м вдоль кромки
      stripQuad(bb, 'tex:sandwet', b0 + 6.6, z0, b1 + 6.6, z1, 13.4, 0.104, 9);   // от кромки воды вглубь
      // сухой песок до галечной полосы
      const dryFrom = bm + 12, dryTo = be.x1 - 12;
      if (dryTo > dryFrom + 2) stripQuad(bb, 'tex:sand', (b0 + 12 + dryTo) / 2, z0, (b1 + 12 + dryTo) / 2, z1, dryTo - dryFrom, 0.1, 7);
      // галька перед променадом
      stripQuad(bb, 'tex:pebble', be.x1 - 7, z0, be.x1 - 7, z1, 10, 0.108, 6);
    }
  }
  // прогулочные тропы: набережная вдоль моря + поперечные дорожки к воде
  {
    const midX = (be.x0 + be.x1) / 2, len = be.x1 - be.x0;
    for (const pz of [be.z0 + 14, be.z1 - 14]) B(midX, pz).add('tex:boardwalk', T.plane, M(midX, 0.118, pz, 0, len, 3.2, 1, -Math.PI / 2), 2);
    for (let z = be.z0 + 34; z < be.z1 - 20; z += 42) B(be.x1 - 16, z).add('tex:boardwalk', T.plane, M(be.x1 - 16, 0.118, z, 0, 26, 2.4, 1, -Math.PI / 2), 2);
  }
  B(-160, 480).add('tex:asphalt', T.plane, M(-158, 0.025, 480, 0, 22, 40, 1, -Math.PI / 2), 6);
  const F = L.farm;
  for (const f of [F, ...F.aiFields]) {
    for (let x = f.x0; x < f.x1; x += 60) for (let z = f.z0; z < f.z1; z += 60) {
      const w = Math.min(60, f.x1 - x), d = Math.min(60, f.z1 - z);
      B(x + w / 2, z + d / 2).add('tex:soil', T.plane, M(x + w / 2, 0.02, z + d / 2, 0, w, d, 1, -Math.PI / 2), 6);
      // Ряды вместо сплошных высоких прямоугольных блоков.
      if (f !== F) for (let rx = x + 1; rx < x + w - 0.5; rx += 2.6)
        B(rx, z + d / 2).add('tex:wheat', T.box, M(rx, 0.52, z + d / 2, 0, 1.4, 1.04, d - 0.8), 3);
    }
  }
  await tick();
  // ---------- здания ----------
  progress(0.3, 'Здания');
  const BUILD_STEP = 120;
  for (let i = 0; i < L.buildings.length; i++) {
    if (L.buildings[i].removed) continue;
    if (L.buildings[i].kind === 'parkade') buildParkade(B(L.buildings[i].x, L.buildings[i].z), L.buildings[i]); else buildBuilding(B(L.buildings[i].x, L.buildings[i].z), L.buildings[i]);
    if (i % BUILD_STEP === 0) { progress(0.3 + (i / L.buildings.length) * 0.22, `Здания ${i}/${L.buildings.length}`); await tick(); }
  }
  // ---------- гаражи ----------
  const garageGates: THREE.Mesh[] = [];
  for (const g of L.garages) {
    const b = B(g.x, g.z);
    b.box('tex:concrete', g.x, 0, g.z - 1, g.w + 2, 0.08, g.d + 4, 0, 4);
    b.box('tex:brickwall', g.x - g.w / 2 + 0.15, 0, g.z, 0.3, 3.2, g.d, 0, 2);
    b.box('tex:brickwall', g.x + g.w / 2 - 0.15, 0, g.z, 0.3, 3.2, g.d, 0, 2);
    b.box('tex:brickwall', g.x, 0, g.z + g.d / 2 - 0.15, g.w, 3.2, 0.3, 0, 2);
    b.box('tex:brickwall', g.x, 2.6, g.gateZ + 0.15, g.w, 0.6, 0.3, 0, 2);
    b.box('c:#4b5563', g.x, 3.2, g.z, g.w + 0.4, 0.2, g.d + 0.4);
    b.box('c:#6b7280', g.x + g.w / 2 + 0.01, 0, g.z + 2, 0.06, 2.1, 0.9); // боковая дверь
    const gate = new THREE.Mesh(T.box, mat('c:#9ca3af'));
    gate.scale.set(g.w - 0.6, 2.6, 0.1); gate.position.set(g.x, 1.3, g.gateZ + 0.1); gate.castShadow = true;
    for (let k = 0; k < 6; k++) { const rib = new THREE.Mesh(T.box, mat('c:#6b7280')); rib.scale.set(1.02, 0.02, 1.4); rib.position.y = -0.4 + k * 0.17; gate.add(rib); }
    root.add(gate); garageGates.push(gate);
  }
  // ---------- реквизит ----------
  progress(0.55, 'Деревья и объекты');
  // кварталы приподняты на 0.15 (бордюр): плоскостные объекты во дворах (дорожки, въезды,
  // площадки) нужно поднять на эту же высоту, иначе они тонут внутри газона и их не видно
  const blockRects = L.blocks.map((bl) => {
    const bx0 = bl.ox ?? bl.i * CELL + ROAD_W / 2, bz0 = bl.oz ?? bl.j * CELL + ROAD_W / 2, bs = CELL - ROAD_W;
    return { x0: bx0, z0: bz0, x1: bx0 + bs, z1: bz0 + bs };
  });
  for (const q of L.bigParks) blockRects.push(q);
  const liftAt = (x: number, z: number) =>
    blockRects.some((q) => x > q.x0 + 0.3 && x < q.x1 - 0.3 && z > q.z0 + 0.3 && z < q.z1 - 0.3) ? 0.15 : 0;
  for (let i = 0; i < L.props.length; i++) {
    buildProp(B(L.props[i].x, L.props[i].z), L.props[i], liftAt(L.props[i].x, L.props[i].z));
    if (i % 800 === 0) { progress(0.55 + (i / L.props.length) * 0.15, `Объекты ${i}/${L.props.length}`); await tick(); }
  }
  // ларьки — вывески
  for (const k of L.kiosks) {
    const kt = KIOSK_TYPES[k.type];
    B(k.x, k.z).add(`sign:${kt.name}|${kt.color}`, T.plane, M(k.x + Math.sin(k.a) * 1.02, 2.35, k.z + Math.cos(k.a) * 1.02, k.a, 2.4, 0.42, 1));
  }
  // разметка парковок
  for (const lot of L.lots) for (const sp of lot.spaces) {
    const b = B(sp.x, sp.z); const y = lot.name === 'Парковка' ? 0.165 : 0.03;
    for (const sx of [-1.45, 1.45]) b.add('c:#f1f1ec', T.box, M(sp.x + sx, y, sp.z, 0, 0.1, 0.02, 5));
  }
  // логистический терминал: асфальт
  { const D = L.depot; for (let x = D.x0; x < D.x1; x += 50) for (let z = D.z0; z < D.z1; z += 50) { const w = Math.min(50, D.x1 - x), d = Math.min(50, D.z1 - z); B(x + w / 2, z + d / 2).add('tex:asphalt', T.plane, M(x + w / 2, 0.02, z + d / 2, 0, w, d, 1, -Math.PI / 2), 8); }
    for (const bay of D.bays) { const b = B(bay.x, bay.z); for (const sx of [-2, 2]) b.add('c:#facc15', T.box, M(bay.x + sx, 0.04, bay.z, 0, 0.15, 0.02, 14)); }
    B(1220, 512).add('sign:ЛОГИСТИКА «ВОСТОК»|#0f766e', T.box, M(1220, 4.5, 516, 0, 9, 1.2, 0.1)); for (const sx of [-4.6, 4.6]) B(1220, 512).add('c:#475569', T.box, M(1220 + sx, 2.4, 516, 0, 0.25, 4.8, 0.25)); }
  // места автобазара
  for (const sl of L.bazaarSlots) {
    const b = B(sl.x, sl.z);
    for (const sx of [-1.9, 1.9]) b.add('c:#f8fafc', T.box, M(sl.x + sx, 0.17, sl.z, 0, 0.12, 0.02, 5.6));
    b.add('c:#f8fafc', T.box, M(sl.x, 0.17, sl.z - 2.8, 0, 3.9, 0.02, 0.12));
    b.add(`sign:Место ${sl.id + 1} · продажа|#0f766e`, T.plane, M(sl.x, 1.6, sl.z + 3.1, Math.PI, 2.4, 0.45, 1));
    b.add('c:#334155', T.box, M(sl.x - 1.0, 0.7, sl.z + 3.12, 0, 0.06, 1.4, 0.06)); b.add('c:#334155', T.box, M(sl.x + 1.0, 0.7, sl.z + 3.12, 0, 0.06, 1.4, 0.06));
  }
  // указатели главного шоссе
  for (const ax of [3, 9, 15]) { const x = ax * 60 + 30, z = 540 - 6.6; B(x, z).add('c:#475569', T.cylB, M(x, 0, z, 0, 0.08, 5.2, 0.08)); B(x, z).add('sign:ГЛАВНОЕ ШОССЕ|#15803d', T.box, M(x, 4.6, z, 0, 3.6, 0.7, 0.06)); }
  // вертолётная площадка
  B(L.helipad.x, L.helipad.z).add('sign:H|#334155', T.plane, M(L.helipad.x, 0.17, L.helipad.z, 0, 7, 7, 1, -Math.PI / 2));
  await tick();
  // ---------- рекламные щиты: каркас в чанки, лицевая панель — отдельным мешем ----------
  const billboardFaces: WorldMeshes['billboards'] = [];
  {
    const faces = billboardFaces;
    for (const bb of L.billboards ?? []) {
      const b = B(bb.x, bb.z);
      const ca = Math.cos(bb.rot), sa = Math.sin(bb.rot);
      const nx = Math.sin(bb.rot), nz = Math.cos(bb.rot);   // нормаль панели
      const panelY = 3.2;                              // низ панели на 3.2 м над землёй
      const postH = panelY + bb.h + 0.6;
      for (const sx of [-1, 1]) {
        const px = bb.x + ca * sx * (bb.w / 2 - 0.7), pz = bb.z - sa * sx * (bb.w / 2 - 0.7);
        b.add('c:#6b7280', T.cylB, M(px, 0, pz, 0, 0.26, postH, 0.26));
        b.box('c:#4b5563', px, 0.18, pz, 0.9, 0.36, 0.9);   // бетонная пятка
      }
      // рама: верх, низ и боковины вокруг панели
      const fy = panelY + bb.h / 2;
      b.add('c:#374151', T.box, M(bb.x, fy + bb.h / 2 + 0.12, bb.z, bb.rot, bb.w + 0.4, 0.24, 0.34));
      b.box('c:#374151', bb.x, panelY - 0.0, bb.z, bb.w + 0.4, 0.24, 0.34);
      for (const sx of [-1, 1]) {
        const ex = bb.x + ca * sx * (bb.w / 2 + 0.1), ez = bb.z - sa * sx * (bb.w / 2 + 0.1);
        b.box('c:#374151', ex, panelY + bb.h / 2, ez, 0.24, bb.h, 0.34);
      }
      // задняя стенка (чтобы с изнанки щит не был «бумажным») и подсветка сверху
      b.add('c:#4b5563', T.box, M(bb.x - nx * 0.18, panelY + bb.h / 2, bb.z - nz * 0.18, bb.rot, bb.w, bb.h, 0.14));
      b.add('glow:#dbeafe', T.box, M(bb.x, panelY + bb.h + 0.2, bb.z, bb.rot, bb.w * 0.96, 0.1, 0.16));
      // лицевая панель с рекламой
      const geom = new THREE.PlaneGeometry(bb.w, bb.h);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 });
      const face = new THREE.Mesh(geom, mat);
      face.position.set(bb.x + nx * 0.1, panelY + bb.h / 2, bb.z + nz * 0.1);
      face.rotation.y = bb.rot;
      face.name = 'billboard ' + bb.id;
      root.add(face);
      faces.push({ id: bb.id, mesh: face });
    }
  }
  await tick();
  // ---------- объединение чанков ----------
  progress(0.72, 'Объединение геометрии');
  const chunks: WorldMeshes['chunks'] = [];
  let ci = 0;
  for (const [k, b] of batchers) {
    const [cx, cz] = k.split(',').map(Number);
    const g = new THREE.Group(); g.name = 'chunk ' + k;
    for (const m of b.build({ cast: true, receive: true })) g.add(m);
    root.add(g);
    chunks.push({ group: g, cx: (cx + 0.5) * CHUNK, cz: (cz + 0.5) * CHUNK });
    if (++ci % 10 === 0) { progress(0.72 + (ci / batchers.size) * 0.14, 'Объединение геометрии'); await tick(); }
  }
  // ---------- светофоры (инстансы) ----------
  progress(0.88, 'Светофоры');
  const lights: LightIntersection[] = L.nodes.filter((n) => n.light).map((n) => ({ node: n.id, x: n.x, z: n.z, gi: n.gi!, gj: n.gj!, state: -1 }));
  const nL = lights.length * 4;
  const poleM = new THREE.InstancedMesh(T.cylB, mat('c:#2f3337'), nL);
  const armM = new THREE.InstancedMesh(T.box, mat('c:#2f3337'), nL);
  const housM = new THREE.InstancedMesh(T.box, mat('c:#151515'), nL * 2);
  const bulbs = new THREE.InstancedMesh(T.circle, new THREE.MeshBasicMaterial({ color: 0xffffff }), nL * 3);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let li = 0;
  for (const lt of lights) {
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = dirs[d]; // направление движения к перекрёстку
      const rx = -dz, rz = dx; // правая сторона
      const px = lt.x - dx * 7.4 + rx * 7.0, pz = lt.z - dz * 7.4 + rz * 7.0;
      const face = Math.atan2(-dx, -dz);
      poleM.setMatrixAt(li, M(px, 0, pz, 0, 0.12, 5.6, 0.12));
      armM.setMatrixAt(li, M(px - rx * 2.6, 5.5, pz - rz * 2.6, face, 5.2, 0.12, 0.12).clone().multiply(new THREE.Matrix4()) );
      // корпус на консоли и на стойке
      const hx = px - rx * 3.4, hz = pz - rz * 3.4;
      housM.setMatrixAt(li * 2, M(hx, 4.75, hz, face, 0.42, 1.25, 0.32));
      housM.setMatrixAt(li * 2 + 1, M(px + dx * 0.1, 2.6, pz + dz * 0.1, face, 0.34, 1.0, 0.26));
      for (let c = 0; c < 3; c++) {
        bulbs.setMatrixAt(li * 3 + c, M(hx - dx * 0.17, 5.15 - c * 0.38, hz - dz * 0.17, face, 0.13, 0.13, 1));
        bulbs.setColorAt(li * 3 + c, new THREE.Color(0x222222));
      }
      li++;
    }
  }
  // консоль поперёк: исправить ориентацию (по направлению правого вектора)
  li = 0;
  for (const lt of lights) for (let d = 0; d < 4; d++) {
    const [dx, dz] = dirs[d]; const rx = -dz, rz = dx;
    const px = lt.x - dx * 7.4 + rx * 7.0, pz = lt.z - dz * 7.4 + rz * 7.0;
    armM.setMatrixAt(li, M(px - rx * 1.8, 5.55, pz - rz * 1.8, Math.atan2(rx, rz), 0.12, 0.12, 3.8));
    li++;
  }
  for (const im of [poleM, armM, housM, bulbs]) { im.instanceMatrix.needsUpdate = true; im.castShadow = im !== bulbs; im.frustumCulled = false; root.add(im); }
  if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  // ---------- поле пшеницы (работа) ----------
  progress(0.93, 'Поля');
  const cw = (F.x1 - F.x0) / F.cols, chh = (F.z1 - F.z0) / F.rows;
  // Четыре узкие полосы в каждой убираемой ячейке, с видимой землёй между ними.
  const rowParts = [-0.36, -0.12, 0.12, 0.36].map(x => new THREE.BoxGeometry(0.13, 1, 1).translate(x, 0.5, 0));
  const wheatGeometry = mergeGeometries(rowParts)!; rowParts.forEach(part => part.dispose());
  const wheat = new THREE.InstancedMesh(wheatGeometry, mat('tex:wheat'), F.cols * F.rows);
  const wheatCells: WorldMeshes['wheatCells'] = [];
  for (let r = 0; r < F.rows; r++) for (let c = 0; c < F.cols; c++) {
    const x = F.x0 + (c + 0.5) * cw, z = F.z0 + (r + 0.5) * chh;
    wheat.setMatrixAt(wheatCells.length, M(x, 0, z, 0, cw - 0.2, 1.1, chh - 0.2));
    wheatCells.push({ x, z, done: false });
  }
  wheat.instanceMatrix.needsUpdate = true; wheat.receiveShadow = true;
  root.add(wheat);
  // ---------- ворота: створки на петлях, анимируются в game.ts ----------
  const gateLeaves: GateLeaf[] = L.props.filter((p) => p.t === 'gate').map((p) => ({
    x: p.x, z: p.z, a: p.r ?? 0, w: p.w ?? 1.6, swing: p.swing ?? 1, color: p.c ?? '#7c5a3a', open: 0,
  }));
  let gates: THREE.InstancedMesh | null = null;
  if (gateLeaves.length) {
    gates = new THREE.InstancedMesh(gateLeafGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.04 }), gateLeaves.length);
    gates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    gateLeaves.forEach((g, i) => { gates!.setMatrixAt(i, M(g.x, 0, g.z, g.a, g.w, 1, 1)); gates!.setColorAt(i, col.set(g.color)); });
    gates.instanceMatrix.needsUpdate = true; if (gates.instanceColor) gates.instanceColor.needsUpdate = true;
    gates.castShadow = true; gates.receiveShadow = true; gates.frustumCulled = false;
    gates.name = 'gates';
    root.add(gates);
  }
  await tick();
  return { root, chunks, lights, bulbs, wheat, wheatCells, garageGates, waters, gates, gateLeaves, shore, billboards: billboardFaces };
}

// ---------- многоуровневый паркинг ----------
function buildParkade(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd; const levels = Math.round(h / 3.2);
  const C = 'tex:concrete';
  for (let lv = 1; lv <= levels; lv++) {
    const y = lv * 3.2;
    b.box(C, x, y - 0.25, z, w, 0.3, d, 0, 4); // перекрытие
    if (lv < levels || true) { b.box('c:#c9c6bf', x, y - 0.25 + 0.3, z - d / 2 + 0.1, w, 0.9, 0.2); b.box('c:#c9c6bf', x - w / 2 + 0.1, y + 0.05, z, 0.2, 0.9, d); b.box('c:#c9c6bf', x + w / 2 - 0.1, y + 0.05, z, 0.2, 0.9, d); } // парапеты
    b.box('c:#1d4ed8', x, y + 0.6, z - d / 2 + 0.02, w, 0.18, 0.04); // синяя полоса
  }
  b.box(C, x, 0, z + d / 2 - 0.15, w, h, 0.3, 0, 4); // задняя стена
  for (let px = -1; px <= 1; px++) for (const pz of [-1, 1]) b.box('c:#b8b5ae', x + px * (w / 2 - 0.5), 0, z + pz * (d / 2 - 0.5), 1, h, 1);
  for (const px of [-10, 10]) b.box('c:#b8b5ae', x + px, 0, z, 0.8, h, 0.8);
  // пандус (декоративный) и машины на ярусах
  b.add(C, T.box, M(x + w / 2 - 4, 1.6, z + 2, 0, 6, 0.3, 14, 0.23));
  const cols = ['#d50000', '#ffffff', '#212121', '#2962ff', '#9e9e9e', '#00c853', '#ffd600'];
  for (let lv = 1; lv < levels; lv++) for (let k = 0; k < 10; k++) {
    if ((k * 7 + lv * 3 + bd.id) % 3 === 0) continue;
    const cx = x - w / 2 + 4 + k * 3.4, cz = z + (k % 2 ? d / 2 - 4 : -d / 2 + 4), y = lv * 3.2 + 0.05;
    const col = 'paint:' + cols[(k + lv) % cols.length];
    b.box(col, cx, y + 0.3, cz, 1.8, 0.65, 4.3); b.box(col, cx, y + 0.95, cz - 0.2, 1.6, 0.5, 2.3); b.box('c:#1c2a38', cx, y + 1.0, cz - 0.2, 1.62, 0.36, 2.0);
  }
  b.add('sign:P · ПАРКИНГ «ЯРУС»|#1d4ed8', T.plane, M(x, h - 1.2, z - d / 2 - 0.05, Math.PI, 12, 1.6, 1));
  b.add('sign:P|#1d4ed8', T.box, M(x - w / 2 - 1.5, 4, z - d / 2 - 1.5, 0, 1.6, 1.6, 0.1)); b.box('c:#475569', x - w / 2 - 1.5, 0, z - d / 2 - 1.5, 0.15, 3.2, 0.15);
}
// ---------- детали фасада: цоколь, карниз, балконы, витрины ----------
const SHOPS = new Set(['shop24', 'supermarket', 'cafe', 'pharmacy', 'gunshop', 'clothes', 'barber', 'service', 'dealer', 'gas', 'vshop', 'vpharmacy', 'fishshop']);
function buildingDetails(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd;
  const a = bd.door.a, ox = Math.sin(a), oz = Math.cos(a);
  const alongX = Math.abs(oz) > 0.5; // фасад вдоль оси X
  const faceW = alongX ? w : d;
  const fx = x + ox * (alongX ? 0 : w / 2), fz = z + oz * (alongX ? d / 2 : 0); // центр фасада
  const at = (u: number, out: number) => ({ x: fx + (alongX ? u : 0) + ox * out, z: fz + (alongX ? 0 : u) + oz * out });
  const light = bd.facade === 'glass' ? 'c:#9aa4b0' : 'c:#dcd8cf';
  if (bd.kind === 'tower') {
    b.box('c:#1d2733', x, 0, z, w + 0.3, 4.6, d + 0.3); // остеклённый лобби-этаж
    b.box('c:#bfc5cc', x, 4.6, z, w + 0.5, 0.35, d + 0.5);
    b.box('c:#c9ced4', x, h - 0.2, z, w + 0.4, 0.5, d + 0.4); // венчающий пояс
    if (GFX.pbr) for (const sx of [-1, 1]) { b.box('c:#aab2bc', x + sx * (w / 2 + 0.12), 4.9, z, 0.18, h - 5.1, 0.6); b.box('c:#aab2bc', x, 4.9, z + sx * (d / 2 + 0.12), 0.6, h - 5.1, 0.18); }
    return;
  }
  if (bd.kind === 'factory' || bd.kind === 'warehouse' || bd.facade === 'kiosk') return;
  b.box('c:#4b4744', x, 0, z, w + 0.24, 0.9, d + 0.24); // цоколь
  b.box(light, x, h - 0.45, z, w + 0.45, 0.45, d + 0.45); // карниз
  // витрина с маркизой у магазинов
  if (SHOPS.has(bd.kind)) {
    const dw = 1.9, half = (faceW - dw) / 2 - 0.6;
    for (const sgn of [-1, 1]) {
      const c = at(sgn * (dw / 2 + half / 2 + 0.3), 0.05);
      b.add('glass:0.55', T.box, M(c.x, 1.55, c.z, a, half, 2.2, 0.06));
      b.add('c:#2b2f36', T.box, M(c.x, 0.42, c.z, a, half + 0.1, 0.12, 0.12));
      b.add('c:#2b2f36', T.box, M(c.x, 2.68, c.z, a, half + 0.1, 0.1, 0.12));
    }
    const aw = at(0, 0.75);
    b.add('c:' + (bd.color ?? '#7f1d1d'), T.box, M(aw.x, 2.95, aw.z, a, faceW - 0.6, 0.08, 1.5, 0.28));
    b.add('c:#f8fafc', T.box, M(aw.x + ox * 0.72, 2.75, aw.z + oz * 0.72, a, faceW - 0.6, 0.22, 0.04));
  }
  // балконы жилых домов (на среднем и высоком качестве)
  if (bd.kind === 'apartment' && GFX.pbr) {
    const floors = Math.round(h / 3.2);
    const lux = bd.cls === 'lux';
    const base = alongX ? x : z;
    for (let f = 1; f < floors; f++) {
      for (let k = Math.ceil((base - faceW / 2 + 1.6 - 2) / 4); 4 * k + 2 <= base + faceW / 2 - 1.6; k++) {
        if ((k + f + bd.id) % 2) continue;
        const u = 4 * k + 2 - base; const c = at(u, 0.6);
        b.add('c:#d4d0c8', T.box, M(c.x, f * 3.2 + 0.05, c.z, a, 2.8, 0.14, 1.2));
        const rl = at(u, 1.17);
        b.add(lux ? 'glass:0.4' : 'c:#3b3f46', T.box, M(rl.x, f * 3.2 + 0.62, rl.z, a, 2.8, 0.95, 0.05));
        if (!lux) b.add('c:#2a2d33', T.box, M(rl.x, f * 3.2 + 1.1, rl.z, a, 2.85, 0.05, 0.08));
      }
    }
  }
}
// ---------- оранжерея: каркас, стеклянные стены, стеклянная крыша ----------
function buildGreenhouse(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd;
  const frame = 'c:#e7e5e4';
  b.box('c:#9ca3af', x, 0, z, w + 0.3, 0.25, d + 0.3);           // бетонный фундамент
  b.box('c:#6b7280', x, 0.25, z, w - 0.4, 0.06, d - 0.4);        // пол из плитки
  // стеклянные стены (по низу — кирпичный цоколь)
  for (const s of [-1, 1]) {
    b.box('c:#a8a29e', x, 0.25, z + s * d / 2, w, 0.6, 0.2);
    b.box('glass:0.28', x, 0.85, z + s * d / 2, w - 0.2, h - 0.85, 0.06);
    b.box('c:#a8a29e', x + s * w / 2, 0.25, z, 0.2, 0.6, d);
    b.box('glass:0.28', x + s * w / 2, 0.85, z, 0.06, h - 0.85, d - 0.2);
  }
  // рёбра каркаса
  for (const s of [-1, 1]) for (let i = 0; i <= 4; i++) {
    const t = i / 4 - 0.5;
    b.box(frame, x + t * w, 0.85, z + s * d / 2, 0.1, h - 0.85, 0.12);
  }
  for (const k of [0.85, h * 0.55, h - 0.15]) {
    b.box(frame, x, k, z - d / 2, w + 0.06, 0.08, 0.1);
    b.box(frame, x, k, z + d / 2, w + 0.06, 0.08, 0.1);
    b.box(frame, x - w / 2, k, z, 0.1, 0.08, d + 0.06);
    b.box(frame, x + w / 2, k, z, 0.1, 0.08, d + 0.06);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(frame, x + sx * w / 2, 0, z + sz * d / 2, 0.16, h, 0.16);
  // двускатная стеклянная крыша + конёк + форточки
  const along = w >= d;
  b.add('glass:0.32', T.prism, M(x, h, z, along ? 0 : Math.PI / 2, (along ? w : d) + 0.4, 1.5, (along ? d : w) + 0.4));
  b.box(frame, x, h + 1.5, z, along ? w + 0.5 : 0.14, 0.12, along ? 0.14 : d + 0.5);
  for (const s of [-1, 1]) {
    b.box(frame, x + (along ? 0 : s * w / 2), h + 0.75, z + (along ? s * d / 2 : 0), along ? w + 0.4 : 0.08, 0.08, along ? 0.08 : d + 0.4);
    b.box('glass:0.5', x + (along ? s * w * 0.28 : 0), h + 0.55, z + (along ? 0 : s * d * 0.28), along ? w * 0.3 : 0.05, 0.5, along ? 0.05 : d * 0.3);
  }
  // вход: рама, дверь и козырёк
  b.box('c:#57534e', x, 0, z + d / 2 + 0.5, 1.3, 0.1, 1.0);
  b.box(frame, x, 0, z + d / 2 + 0.03, 1.2, 2.1, 0.1);
  b.box('glass:0.4', x, 0.05, z + d / 2 + 0.02, 1.0, 1.9, 0.05);
  b.box('chrome', x + 0.42, 1.0, z + d / 2 - 0.03, 0.05, 0.18, 0.05);
  b.box('c:#475569', x, 2.15, z + d / 2 + 0.35, 1.6, 0.1, 0.8);
  // грядки внутри (видны сквозь стекло)
  for (let i = 0; i < 3; i++) {
    const gz = z - d / 2 + 1.1 + i * (d - 2.2) / 2;
    b.box('c:#5b3a1e', x - w * 0.18, 0.31, gz, w * 0.34, 0.28, 0.8);
    b.box('c:#4ade80', x - w * 0.18, 0.47, gz, w * 0.3, 0.12, 0.66);
    b.box('c:#5b3a1e', x + w * 0.18, 0.31, gz, w * 0.3, 0.28, 0.8);
    b.box('c:#22c55e', x + w * 0.18, 0.47, gz, w * 0.26, 0.12, 0.66);
  }
  b.box('c:#0ea5e9', x + w * 0.36, 0.4, z + d * 0.32, 0.5, 0.5, 0.5); // бак с водой
}

// ---------- здание ----------
const FACADE_TINTS: Record<string, string[]> = {
  plaster: ['#ffffff', '#f6e3c4', '#e9d6ec', '#d6ecd9', '#f7cfb3', '#dfe7f5'], panel: ['#ffffff', '#e5e7eb', '#dbeafe', '#fdf0c4', '#f3dede'],
  brick: ['#ffffff', '#d9c4b6', '#c8a08c', '#e8d8cf'], office: ['#ffffff', '#e2e8f0', '#d6d3d1', '#f5ecd9'], glass: ['#ffffff', '#c7ddff', '#b6f0d8', '#e9d5ff', '#ffe2c2'],
  luxres: ['#ffffff', '#ece7e2', '#e2ece9'], wood: ['#ffffff', '#d9b38c', '#b48a6a'],
};
function buildBuilding(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd;
  if (bd.kind === 'vguntruck') return;   // оружейный грузовик рисуется как реквизит (prop guntruck)
  if (bd.kind === 'greenhouse') { buildGreenhouse(b, bd); return; }
  const tints = FACADE_TINTS[bd.facade];
  const facadeKey = 'facade:' + bd.facade + (tints ? ':' + tints[bd.id % tints.length] : '');
  if (bd.roof === 'gable') {
    b.box(bd.kind === 'banya' ? 'tex:woodpanel' : facadeKey, x, 0, z, w, h * 0.62, d, 0, [10, 12]);
    b.box('c:#5a554f', x, 0, z, w + 0.2, 0.5, d + 0.2); // фундамент
    const alongX = w >= d;
    b.add('c:' + (bd.color ?? '#7f1d1d'), T.prism, M(x, h * 0.62, z, alongX ? 0 : Math.PI / 2, (alongX ? w : d) + 0.6, h * 0.38, (alongX ? d : w) + 0.8));
    if (bd.kind === 'banya') b.box('c:#44403c', x + w * 0.25, h * 0.65, z, 0.25, 0.9, 0.25);
    if (bd.kind === 'vhouse' || bd.kind === 'house') b.box('c:#57534e', x + (alongX ? w * 0.25 : 0), h * 0.7, z + (alongX ? 0 : d * 0.25), 0.6, h * 0.45, 0.6);
  } else {
    b.box(facadeKey, x, 0, z, w, h, d, 0, [FACADE_TILE.w, FACADE_TILE.h]);
    buildingDetails(b, bd);
    b.box('tex:roof', x, h, z, w + 0.3, 0.35, d + 0.3, 0, 6);
    if (GFX.pbr && bd.kind !== 'factory' && bd.kind !== 'warehouse') {
      const pc = 'c:#8f9196';
      b.box(pc, x, h + 0.35, z - d / 2, w + 0.3, 0.55, 0.3); b.box(pc, x, h + 0.35, z + d / 2, w + 0.3, 0.55, 0.3);
      b.box(pc, x - w / 2, h + 0.35, z, 0.3, 0.55, d + 0.3); b.box(pc, x + w / 2, h + 0.35, z, 0.3, 0.55, d + 0.3);
      if (bd.kind === 'apartment') { b.box('c:#b0b4ba', x - w * 0.25, h + 0.35, z, 1.4, 0.9, 1.0); b.add('c:#9ca3af', T.cylB, M(x + w * 0.28, h + 0.35, z + d * 0.1, 0, 0.9, 1.8, 0.9)); b.box('c:#57534e', x + w * 0.05, h + 0.35, z - d * 0.2, 1.6, 2.2, 1.6); }
    }
    if (h > 25) { b.box('c:#9ca3af', x + w * 0.2, h + 0.35, z - d * 0.15, 3, 2.2, 3); b.box('c:#6b7280', x - w * 0.25, h + 0.35, z + d * 0.2, 2, 3, 2); }
  }
  // дверь и козырёк
  const a = bd.door.a, ox = Math.sin(a), oz = Math.cos(a);
  const fx = bd.door.x - ox * 1.25, fz = bd.door.z - oz * 1.25; // на фасаде
  const shop = bd.facade === 'shop' || bd.facade === 'mall' || bd.facade === 'glass';
  const dw = bd.kind === 'mall' ? 6 : bd.kind === 'vhouse' ? 1.1 : 1.6;
  if (bd.kind !== 'tower' && bd.kind !== 'factory' && bd.kind !== 'warehouse') {
    b.add(shop ? 'c:#1e3a5f' : 'c:#4a2c17', T.box, M(fx + ox * 0.03, 1.2, fz + oz * 0.03, a, dw, 2.4, 0.12));
    b.add('c:#d1d5db', T.box, M(fx + ox * 0.05, 2.45, fz + oz * 0.05, a, dw + 0.3, 0.15, 0.14));
    if (bd.kind === 'apartment' || bd.kind === 'house') b.add('c:#475569', T.box, M(fx + ox * 0.8, 2.8, fz + oz * 0.8, a, 2.6, 0.12, 1.6));
  } else if (bd.kind === 'tower') {
    b.add('c:#1e293b', T.box, M(fx + ox * 0.05, 1.6, fz + oz * 0.05, a, 4, 3.2, 0.12));
  } else {
    b.add('c:#6b7280', T.box, M(fx + ox * 0.05, 2.5, fz + oz * 0.05, a, 6, 5, 0.12)); // ворота цеха
  }
  // вывеска
  const signed = ['shop24', 'supermarket', 'cafe', 'pharmacy', 'gunshop', 'clothes', 'barber', 'mall', 'dealer', 'service', 'gas', 'police', 'hospital', 'fire', 'cityhall', 'bank', 'vshop', 'vadmin', 'checkpoint', 'farm', 'market', 'warehouse', 'factory', 'fishshop'];
  if (signed.includes(bd.kind)) {
    const sw = Math.min(w, d, 14) * (bd.kind === 'mall' || bd.kind === 'cityhall' || bd.kind === 'factory' ? 1.6 : 0.9);
    const sy = bd.roof === 'gable' ? h * 0.62 - 0.9 : Math.min(h - 1.2, bd.kind === 'mall' ? 12 : 3.6);
    b.add(`sign:${bd.name}|${bd.color ?? '#1e3a8a'}`, T.plane, M(fx + ox * 0.08, sy, fz + oz * 0.08, a, sw, sw * 0.19, 1));
  }
  if (bd.kind === 'hospital') b.add('sign:✚|#dc2626', T.plane, M(fx + ox * 0.08, h - 2, fz + oz * 0.08, a, 2.4, 2.4, 1));
  if (bd.kind === 'fire') b.add('c:#b91c1c', T.box, M(fx + ox * 0.04 + Math.cos(a) * 5, 1.9, fz + oz * 0.04 - Math.sin(a) * 5, a, 4, 3.8, 0.1));
}

// ---------- реквизит ----------
function buildProp(b: Batcher, p: Prop, lift = 0) {
  const { x, z } = p; const r = p.r ?? 0; const s = p.h ?? 1;
  switch (p.t) {
    case 'tree':
      if (s <= 0.9) { // уличное дерево — облегчённое
        b.add('c:#5b3a1e', T.box, M(x, 1.1 * s, z, r, 0.26, 2.2 * s, 0.26));
        b.add(Math.abs(Math.round(r)) % 3 === 0 ? 'c:#4f8f33' : 'c:#3f7d2c', T.ico, M(x, 3.3 * s, z, r, 1.6 * s, 1.5 * s, 1.6 * s));
        break;
      }
      b.add('c:#5b3a1e', T.cylB, M(x, 0, z, 0, 0.18 * s, 2.2 * s, 0.18 * s));
      b.add('c:#3f7d2c', T.ico, M(x, 3.2 * s, z, r, 1.7 * s, 1.5 * s, 1.7 * s));
      b.add('c:#4c9a35', T.ico, M(x + 0.4, 3.9 * s, z - 0.3, r + 1, 1.1 * s, 1.0 * s, 1.1 * s));
      break;
    case 'pine':
      b.add('c:#5b3a1e', T.cylB, M(x, 0, z, 0, 0.16 * s, 1.6 * s, 0.16 * s));
      b.add('c:#1f5f3a', T.cone, M(x, 1.2 * s, z, 0, 1.6 * s, 2.6 * s, 1.6 * s));
      b.add('c:#2a7046', T.cone, M(x, 2.6 * s, z, 0, 1.15 * s, 2.2 * s, 1.15 * s));
      break;
    case 'bush': b.add('c:#3e7a2a', T.ico, M(x, 0.6, z, 0, 1.0 * s, 0.7 * s, 1.0 * s)); break;
    case 'walllamp': {
      // бра над дверью: кронштейн, плафон и тёплое пятно света на земле
      const ox = Math.sin(r), oz = Math.cos(r);
      b.add('c:#2b2f36', T.box, M(x + ox * 0.1, 2.9, z + oz * 0.1, r, 0.09, 0.09, 0.45));
      b.add('c:#2b2f36', T.box, M(x + ox * 0.3, 3.0, z + oz * 0.3, r, 0.36, 0.08, 0.36));
      b.add('lamp', T.box, M(x + ox * 0.32, 2.9, z + oz * 0.32, r, 0.3, 0.14, 0.3));
      b.add('lamppool', T.circle, M(x + ox * 1.1, 0.18, z + oz * 1.1, 0, 3.4, 3.4, 1, -Math.PI / 2));
      break;
    }
    case 'guntruck': {
      // оружейный грузовик: фургон с прилавком-окном, кабина и вывеска
      const c = 'c:' + (p.c ?? '#4b5320');
      const ox = Math.sin(r), oz = Math.cos(r);
      const at = (dz: number, dx = 0) => ({ x: x + ox * dz + oz * dx, z: z + oz * dz - ox * dx });
      b.add(c, T.box, M(x, 1.6, z, r, 3.4, 2.6, 9.4));                       // кузов
      b.add('c:#3b4223', T.box, M(x, 0.5, z, r, 3.5, 0.42, 9.5));             // рама/подножка
      const cab = at(5.4); b.add('c:#3f4a2a', T.box, M(cab.x, 1.35, cab.z, r, 3.1, 2.1, 2.6)); // кабина
      b.add('c:#1e293b', T.box, M(at(6.72).x, 1.75, at(6.72).z, r, 2.8, 1.0, 0.12));          // лобовое стекло
      for (const dz of [-3.2, -0.4, 3.6]) for (const side of [-1, 1]) {
        const w = at(dz, side * 1.62);
        b.add('c:#111827', T.box, M(w.x, 0.58, w.z, r, 0.42, 1.12, 1.12));   // колесо
        b.add('c:#6b7280', T.box, M(w.x, 0.58, w.z, r, 0.46, 0.5, 0.5));       // диск
      }
      // прилавок-окно со стороны улицы (спереди по +X локально)
      b.add('c:#0f172a', T.box, M(at(-1.2, 1.72).x, 1.65, at(-1.2, 1.72).z, r, 0.1, 0.95, 4.2));
      b.add('c:#e5e7eb', T.box, M(at(-1.2, 1.86).x, 1.15, at(-1.2, 1.86).z, r, 0.5, 0.12, 4.2)); // подоконник
      b.add('c:' + (p.c ?? '#4b5320'), T.box, M(at(-1.2, 2.3).x, 2.55, at(-1.2, 2.3).z, r, 1.3, 0.14, 4.6)); // навес
      b.add('sign:ОРУЖИЕ|#3f6212', T.box, M(at(-1.2, 1.8).x, 2.9, at(-1.2, 1.8).z, r + Math.PI / 2, 4.4, 0.55, 0.08));
      b.add('glow:#fde68a', T.box, M(at(-1.2, 1.78).x, 2.25, at(-1.2, 1.78).z, r, 0.06, 0.1, 3.6));
      b.add('c:#a8a29e', T.box, M(at(-1.2, 2.05).x, 0.25, at(-1.2, 2.05).z, r, 0.7, 0.5, 1.4)); // ступенька
      b.add('lamppool', T.circle, M(at(-1.2, 2.4).x, 0.2, at(-1.2, 2.4).z, 0, 5, 5, 1, -Math.PI / 2));
      break;
    }
    case 'lamp':
      b.add('c:#3a3d42', T.cylB, M(x, 0, z, 0, 0.09, 6, 0.09));
      b.add('c:#3a3d42', T.box, M(x + Math.sin(r) * 0.7, 6, z + Math.cos(r) * 0.7, r, 0.1, 0.1, 1.5));
      b.add('lamp', T.box, M(x + Math.sin(r) * 1.3, 5.92, z + Math.cos(r) * 1.3, r, 0.35, 0.12, 0.6));
      b.add('lamppool', T.circle, M(x + Math.sin(r) * 1.4, 0.2, z + Math.cos(r) * 1.4, 0, 5.2, 5.2, 1, -Math.PI / 2));
      // конус света: вершина у плафона, основание на земле (раньше конус стоял наоборот)
      b.add('lampcone', T.cone, M(x + Math.sin(r) * 1.3, 3.05, z + Math.cos(r) * 1.3, 0, 3.1, 2.8, 3.1));
      break;
    case 'bench':
      b.add('c:#8b5a2b', T.box, M(x, 0.45, z, r, 1.8, 0.07, 0.5));
      b.add('c:#8b5a2b', T.box, M(x - Math.cos(r) * 0 + Math.sin(r) * -0.22, 0.75, z + Math.cos(r) * -0.22, r, 1.8, 0.4, 0.06));
      b.add('c:#333', T.box, M(x, 0.22, z, r, 1.6, 0.44, 0.08));
      break;
    case 'hydrant': b.add('c:#dc2626', T.cylB, M(x, 0.15, z, 0, 0.15, 0.6, 0.15)); b.add('c:#dc2626', T.box, M(x, 0.5, z, 0, 0.45, 0.1, 0.1)); break;
    case 'trash': b.add('c:#14532d', T.cylB, M(x, 0.15, z, 0, 0.3, 0.8, 0.3)); break;
    case 'swing': {
      const ca = Math.cos(r), sa = Math.sin(r);
      for (const sx of [-1.5, 1.5]) for (const lz of [-0.6, 0.6]) b.add('c:#2563eb', T.box, M(x + ca * sx + sa * lz * 0.5, 1.1, z - sa * sx + ca * lz * 0.5, r, 0.08, 2.3, 0.08, lz * 0.4));
      b.add('c:#2563eb', T.box, M(x, 2.2, z, r, 3.2, 0.1, 0.1));
      for (const sx of [-0.7, 0.7]) { b.add('c:#999', T.box, M(x + ca * sx, 1.4, z - sa * sx, r, 0.03, 1.6, 0.03)); b.add('c:#ef4444', T.box, M(x + ca * sx, 0.6, z - sa * sx, r, 0.5, 0.06, 0.3)); }
      break;
    }
    case 'slide': {
      const ca = Math.cos(r), sa = Math.sin(r);
      b.add('c:#f59e0b', T.box, M(x - sa * 1.4, 0.75, z - ca * 1.4, r, 1, 1.5, 1));
      b.add('c:#ef4444', T.box, M(x + sa * 0.4, 0.85, z + ca * 0.4, r, 0.7, 0.06, 3, 0.5));
      b.add('c:#666', T.box, M(x - sa * 2.2, 0.75, z - ca * 2.2, r, 0.5, 1.5, 0.08, 0.3));
      break;
    }
    case 'sandbox': b.add('c:#a16207', T.box, M(x, 0.12, z, 0, 3, 0.25, 3)); b.add('tex:sand', T.box, M(x, 0.15, z, 0, 2.7, 0.22, 2.7), 3); break;
    case 'carousel': b.add('c:#dc2626', T.cylB, M(x, 0.2, z, 0, 1.3, 0.12, 1.3)); b.add('c:#facc15', T.cylB, M(x, 0.3, z, 0, 0.06, 0.9, 0.06)); b.add('c:#2563eb', T.torus, M(x, 1.1, z, 0, 0.6, 0.6, 0.6, Math.PI / 2)); break;
    case 'pool': {
      // 3D-чаша: дно и стенки в плитке, вода — прозрачная плоскость, видно дно и ноги
      const pw = p.w ?? 10, pd = p.d ?? 5;
      const rimTop = p.h ?? 0.34;                 // верх бортика над землёй
      const surfY = rimTop - 0.14;                // уровень воды в чаше
      const bottom = surfY - 1.5;                 // глубина 1.5 м — плаваем и ныряем
      const wallT = 0.16;
      // дно
      b.add('tex:pooltile', T.box, M(x, bottom, z, r, pw, 0.16, pd), 2);
      // стенки чаши
      for (const sd of [-1, 1]) {
        b.add('tex:pooltile', T.box, M(x + sd * (pw / 2 - wallT / 2), bottom + 0.08 + (rimTop - bottom) / 2, z, r, wallT, rimTop - bottom, pd), 2);
        b.add('tex:pooltile', T.box, M(x, bottom + 0.08 + (rimTop - bottom) / 2, z + sd * (pd / 2 - wallT / 2), r, pw, rimTop - bottom, wallT), 2);
      }
      // слив в глубокой части
      b.add('c:#334155', T.circle, M(x + pw * 0.18, bottom + 0.09, z, 0, 0.34, 0.34, 1, -Math.PI / 2));
      b.add('c:#64748b', T.circle, M(x + pw * 0.18, bottom + 0.1, z, 0, 0.42, 0.42, 1, -Math.PI / 2));
      // ступеньки-сходы в воду (видны сквозь воду)
      for (let k = 0; k < 4; k++) {
        const sy = surfY - 0.18 - k * 0.34;
        b.add('tex:pooltile', T.box, M(x - pw * 0.28, sy, z + pd / 2 - 0.5 - k * 0.42, r, 1.6, 0.12, 0.42), 1);
      }
      // бортик: плита по периметру (воду не накрывает)
      const rw = 0.55;
      b.add('c:#e7e5e4', T.box, M(x, rimTop / 2, z - pd / 2 - rw / 2, r, pw + rw * 2, rimTop, rw));
      b.add('c:#e7e5e4', T.box, M(x, rimTop / 2, z + pd / 2 + rw / 2, r, pw + rw * 2, rimTop, rw));
      b.add('c:#e7e5e4', T.box, M(x - pw / 2 - rw / 2, rimTop / 2, z, r, rw, rimTop, pd));
      b.add('c:#e7e5e4', T.box, M(x + pw / 2 + rw / 2, rimTop / 2, z, r, rw, rimTop, pd));
      // светлая кромка бортика
      b.add('c:#f1f5f9', T.box, M(x, rimTop + 0.03, z - pd / 2 - 0.25, r, pw + 1.0, 0.06, 0.5));
      b.add('c:#f1f5f9', T.box, M(x, rimTop + 0.03, z + pd / 2 + 0.25, r, pw + 1.0, 0.06, 0.5));
      b.add('c:#f1f5f9', T.box, M(x - pw / 2 - 0.25, rimTop + 0.03, z, r, 0.5, 0.06, pd + 1.0));
      b.add('c:#f1f5f9', T.box, M(x + pw / 2 + 0.25, rimTop + 0.03, z, r, 0.5, 0.06, pd + 1.0));
      // вода: тонкая прозрачная плоскость у самого верха чаши
      b.add('poolWater', T.plane, M(x, surfY, z, r, pw - 0.14, pd - 0.14, 1, -Math.PI / 2), 5);
      // подсветка чаши ночью
      b.add('glow:#38bdf8', T.box, M(x, bottom + 0.5, z, r, pw * 0.9, 0.05, 0.06));
      b.add('glow:#38bdf8', T.box, M(x, bottom + 0.5, z, r, 0.06, 0.05, pd * 0.9));
      break;
    }
    case 'poolstep': {
      const sw = p.w ?? 1.2, sh = p.h ?? 0.3;
      b.add('c:#e2e8f0', T.box, M(x, sh / 2, z, 0, sw, sh, 0.36));
      break;
    }
    case 'path': {
      // дорожки во дворах лежат на приподнятом основании квартала (+lift), на земле — на нуле
      const pw = p.w ?? 2, pd = p.d ?? 1.6;
      const col = 'c:' + (p.c ?? '#b8a99a');
      b.add(col, T.box, M(x, 0.045 + lift, z, r, pw, 0.09, pd));
      b.add('c:#8f8172', T.box, M(x, 0.005 + lift, z, r, pw + 0.12, 0.05, pd + 0.12));
      // швы плитки
      const n = Math.min(14, Math.max(1, Math.round(Math.max(pw, pd) / 1.2)));
      for (let i = 1; i < n; i++) {
        const t = i / n - 0.5;
        if (pw >= pd) b.add('c:#9c8f80', T.box, M(x + t * pw, 0.094, z, r, 0.05, 0.012, pd));
        else b.add('c:#9c8f80', T.box, M(x, 0.094, z + t * pd, r, pw, 0.012, 0.05));
      }
      break;
    }
    case 'greenhouse': {
      const gw = p.w ?? 6, gd = p.d ?? 4;
      b.add('c:#8b8b8b', T.box, M(x, 0.12, z, r, gw, 0.24, gd));
      b.add('c:#5a7d3a', T.box, M(x, 0.3, z, r, gw * 0.8, 0.2, gd * 0.7));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.add('c:#cbd5e1', T.box, M(x + sx * gw * 0.47, 1.1, z + sz * gd * 0.45, r, 0.1, 2.1, 0.1));
      b.add('glass:0.45', T.box, M(x, 1.6, z, r, gw, 1.2, gd));
      b.add('glass:0.45', T.prism, M(x, 2.7, z, r, gw, 0.8, gd));
      break;
    }
    case 'fountain': b.add('c:#9ca3af', T.cylB, M(x, 0, z, 0, 2.5, 0.6, 2.5)); b.add('water', T.cylB, M(x, 0.4, z, 0, 2.2, 0.25, 2.2)); b.add('c:#d1d5db', T.cylB, M(x, 0.5, z, 0, 0.35, 1.8, 0.35)); b.add('c:#d1d5db', T.cylB, M(x, 2.2, z, 0, 0.9, 0.15, 0.9)); break;
    case 'fence': {
      const w = p.w ?? 1, d = p.d ?? 0.1, h = p.h ?? 1.2;
      const c = 'c:' + (p.c ?? '#8b6b4a');
      b.box(c, x, 0.15, z, w, h - 0.15, d);
      const len = Math.max(w, d), n = Math.floor(len / 6);
      for (let i = 0; i <= n; i++) { const t = n ? i / n - 0.5 : 0; b.box('c:#57534e', x + (w > d ? t * w : 0), 0, z + (w > d ? 0 : t * d), 0.14, h + 0.1, 0.14); }
      break;
    }
    // декоративная оградка: столбики и две прожилины, ставится под любым углом
    case 'railing': {
      const len = p.w ?? 2, h = p.h ?? 1.0;
      const n = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) {
        const t = i / n - 0.5, ox = Math.cos(r) * t * len, oz = -Math.sin(r) * t * len;
        b.add('c:#3f3f46', T.cylB, M(x + ox, 0.1, z + oz, 0, 0.06, h, 0.06), 2);
        b.add('c:#52525b', T.sphere, M(x + ox, 0.1 + h, z + oz, 0, 0.08, 0.08, 0.08));
      }
      for (const yy of [h * 0.55, h * 0.95]) b.add('c:#3f3f46', T.box, M(x, 0.1 + yy, z, r, len, 0.05, 0.05));
      break;
    }
    case 'gate': break;   // створки ворот — динамические объекты (см. game.ts gates), в статику не запекаются
    case 'driveway': b.add('c:' + (p.c ?? '#9a8f7f'), T.box, M(x, 0.02 + lift, z, 0, p.w ?? 3, 0.04, p.d ?? 5)); break;
    // текстурированная плита (настил променада, площадки, дорожки по песку)
    case 'pave': b.add('tex:' + (p.c ?? 'sidewalk'), T.plane, M(x, (p.h ?? 0.12) + lift, z, r, (p.w ?? 3) / 2, (p.d ?? 5) / 2, 1, -Math.PI / 2), p.v ?? 4); break;
    // песчаная дюна: половина сферы, вкопанная в песок
    case 'dune': b.add('tex:sand', T.sphere, M(x, (p.h ?? 1.1) * -0.15, z, r, (p.w ?? 5) / 2, p.h ?? 1.1, (p.d ?? 5) / 2), 3); break;
    // деревенский столбик с красным светоотражателем
    case 'post': {
      b.box('c:#6b5a43', x, 0, z, 0.16, 0.95, 0.16);
      b.box('c:#ef4444', x, 0.72, z + 0.09, 0.1, 0.12, 0.04);
      break;
    }
    case 'ball': b.add('c:' + (p.c ?? '#ef4444'), T.sphere, M(x, 0.32, z, r, 0.32, 0.32, 0.32)); b.add('c:#ffffff', T.box, M(x, 0.32, z, r, 0.66, 0.06, 0.06)); break;
    case 'shell': b.add('c:' + (p.c ?? '#f5f0e3'), T.sphere, M(x, 0.1, z, r, 0.16, 0.05, 0.13)); break;
    // кабинка для переодевания
    case 'cabin': {
      b.box('c:' + (p.c ?? '#38bdf8'), x, 0, z, 1.3, 2.2, 1.3);
      b.box('c:#e2e8f0', x, 0.05, z - 0.66, 1.0, 1.9, 0.05);
      b.box('c:#0f172a', x, 2.25, z, 1.4, 0.1, 1.4);
      break;
    }
    // деревянный помост-настил (сход в воду, площадка)
    case 'jetty': {
      for (let i = 0; i < 6; i++) b.add('tex:boardwalk', T.box, M(x, 0.16, z + i * 1.2, r, p.w ?? 3.4, 0.12, 1.15), 2);
      for (const sx of [-1, 1]) b.box('c:#5b4630', x + sx * ((p.w ?? 3.4) / 2 - 0.2), 0, z + 2.5, 0.22, 0.5, 0.22);
      break;
    }
    // ---------- пляж ----------
    // деревянная лодка на песке / у настила
    case 'boat': {
      const col = 'c:' + (p.c ?? '#e8e2d4');
      b.add(col, T.prism, M(x, 0.28, z, r, (p.w ?? 3.4) / 2, 0.55, 1.05));
      b.add('c:#8a6a45', T.box, M(x, 0.5, z, r, (p.w ?? 3.4) * 0.92, 0.1, 1.7));
      b.box('c:#5b4630', x, 0.62, z - 1.35, 0.5, 0.5, 0.24);
      b.box('c:#57534e', x - 0.8, 0.72, z + 0.2, 0.08, 0.1, 1.5);
      b.box('c:#57534e', x + 0.8, 0.72, z + 0.2, 0.08, 0.1, 1.5);
      break;
    }
    // буёк на воде: поплавок с флажком
    case 'buoy':
      b.add('c:#ef4444', T.sphere, M(x, 0.12, z, 0, 0.42, 0.42, 0.42));
      b.add('c:#f8fafc', T.cyl, M(x, 0.42, z, 0, 0.05, 0.5, 0.05));
      b.box('c:#fbbf24', x + 0.16, 0.62, z, 0.3, 0.2, 0.04);
      break;
    // спасательный круг на стойке
    case 'ring': {
      b.box('c:#a8a29e', x, 0.6, z, 0.12, 1.2, 0.12);
      b.add('c:#ef4444', T.torus, M(x, 1.1, z + 0.08, 0, 0.34, 0.34, 0.34));
      b.add('c:#f8fafc', T.torus, M(x, 1.1, z + 0.08, 0, 0.24, 0.24, 0.24));
      break;
    }
    // гирлянда флажков между двумя столбиками
    case 'flagline': {
      const w = p.w ?? 8;
      const COLS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'];
      b.box('c:#6b5a43', x - w / 2, 0.9, z, 0.1, 1.8, 0.1);
      b.box('c:#6b5a43', x + w / 2, 0.9, z, 0.1, 1.8, 0.1);
      const n = Math.max(3, Math.round(w / 1.1));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const fx = x - w / 2 + w * t;
        const fy = 1.72 - Math.sin(Math.PI * t) * 0.35;
        b.add('c:' + COLS[i % COLS.length], T.plane, M(fx, fy, z, 0, 0.22, 0.34, 1), 1);
      }
      break;
    }
    // дюнная трава: пучки сухих стеблей
    case 'dunegrass': {
      const rng2 = (i: number) => Math.sin(i * 12.9898 + x * 0.7) * 0.5 + 0.5;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, rad = 0.15 + rng2(i) * 0.35;
        b.box('c:#b7a06a', x + Math.cos(a) * rad, 0.28, z + Math.sin(a) * rad, 0.06, 0.62, 0.06);
      }
      b.add('c:#8f9a5b', T.sphere, M(x, 0.1, z, 0, 0.35, 0.16, 0.35));
      break;
    }
    // лежак-раскладушка с матрасом
    case 'sunbed': {
      const col = 'c:' + (p.c ?? '#e8e2d4');
      b.add(col, T.box, M(x, 0.34, z, r, 0.72, 0.1, 1.9));
      b.add(col, T.box, M(x, 0.52, z - 0.78, r, 0.72, 0.1, 0.62, -0.6));
      for (const [sx, sz] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]] as const)
        b.box('c:#9ca3af', x + sx, 0.16, z + sz, 0.06, 0.32, 0.06);
      break;
    }
    // ---------- городские услуги ----------
    // бокс автомойки: две стойки, перекладина, щётки и мокрый пол
    case 'washbay': {
      const ca = Math.cos(r), sa = Math.sin(r);
      for (const sx of [-1, 1]) b.add('c:#334155', T.box, M(x + ca * sx * 2.1, 1.5, z - sa * sx * 2.1, r, 0.3, 3.0, 0.3));
      b.add('c:#1e293b', T.box, M(x, 3.0, z, r, 4.6, 0.24, 0.5));
      b.add('glow:#38bdf8', T.box, M(x, 2.86, z, r, 3.6, 0.06, 0.16));
      for (const sx of [-1, 1]) b.add('tex:metal', T.cyl, M(x + ca * sx * 1.5, 1.6, z - sa * sx * 1.5, 0, 0.42, 1.9, 0.42, 0, Math.PI / 2));
      b.add('c:#475569', T.box, M(x, 0.03, z, r, 4.4, 0.06, 6.0));
      b.add('c:#0ea5e9', T.box, M(x, 0.07, z - 2.6, r, 4.2, 0.02, 0.5));
      b.add('c:#e2e8f0', T.box, M(x - 2.6, 1.2, z, r, 0.7, 1.4, 0.4));   // пульт оплаты
      break;
    }
    // стопка покрышек у шиномонтажа
    case 'tirestack': {
      for (let i = 0; i < 4; i++) b.add('c:#1f2024', T.cyl, M(x + (i % 2) * 0.55, 0.16 + i * 0.3, z + (i > 1 ? 0.4 : 0), 0, 0.5, 0.28, 0.5));
      for (let i = 0; i < 3; i++) b.add('c:#2a2b30', T.cyl, M(x + 1.05, 0.15 + i * 0.3, z - 0.3, 0, 0.42, 0.28, 0.42));
      b.box('c:#f59e0b', x, 1.5, z, 0.12, 1.4, 0.12);
      b.box('c:#111827', x, 2.1, z, 1.1, 0.5, 0.06);
      break;
    }
    // паркомат: тумба с экраном
    case 'parkmeter': {
      b.add('c:#1e293b', T.cyl, M(x, 0.7, z, 0, 0.16, 1.4, 0.16));
      b.box('c:#334155', x, 1.45, z, 0.42, 0.5, 0.3);
      b.add('glow:#22d3ee', T.box, M(x, 1.5, z + 0.16, 0.16, 0.24, 0.03));
      b.box('c:#0ea5e9', x, 1.2, z + 0.01, 0.3, 0.08, 0.26);
      break;
    }
    // игровой автомат с подсвеченным экраном
    case 'slot': {
      b.box('c:#7c3aed', x, 0.95, z, 0.9, 1.9, 0.7);
      b.add('glow:#fbbf24', T.box, M(x, 1.35, z + (r ? 0.36 : 0.36), 0, 0.66, 0.5, 0.04));
      b.box('c:#111827', x, 0.55, z + 0.36, 0.5, 0.28, 0.06);
      b.box('c:#f472b6', x, 2.0, z, 1.0, 0.2, 0.8);
      break;
    }
    // ломбард: вывеска-щит с золотой монетой
    case 'pawnshop': {
      b.box('c:#334155', x, 0.9, z, 0.3, 1.8, 0.3);
      b.box('c:#0f172a', x, 2.1, z, 1.7, 0.8, 0.16);
      b.add('glow:#fbbf24', T.cyl, M(x, 2.1, z + 0.12, 0, 0.26, 0.06, 0.26, Math.PI / 2));
      b.add('glow:#fbbf24', T.box, M(x, 1.72, z + 0.12, 0, 1.2, 0.04, 0.02));
      break;
    }
    // стойка доставки еды: терминал и коробка
    case 'foodbox': {
      b.box('c:#dc2626', x, 0.55, z, 0.9, 1.1, 0.7);
      b.add('glow:#fde68a', T.box, M(x, 0.95, z + 0.36, 0, 0.5, 0.32, 0.03));
      b.box('c:#f8fafc', x + 0.05, 1.22, z, 0.55, 0.22, 0.55);
      break;
    }
    // садок для рыбы: бак с сеткой и льдом
    case 'fishkeeper': {
      b.add('c:#0e7490', T.cylB, M(x, 0.32, z, 0, 0.7, 0.64, 0.7));
      b.add('water', T.cylB, M(x, 0.55, z, 0, 0.62, 0.2, 0.62));
      b.add('c:#94a3b8', T.cyl, M(x, 0.66, z, 0, 0.7, 0.06, 0.7));
      b.box('c:#e2e8f0', x + 0.9, 0.5, z, 0.5, 0.9, 0.4);
      break;
    }
    // зарядная станция для электромобилей
    case 'evcharger': {
      b.box('c:#0f766e', x, 0.95, z, 0.7, 1.7, 0.5);
      b.add('glow:#22d3ee', T.box, M(x, 1.4, z + 0.26, 0, 0.5, 0.4, 0.03));
      b.box('c:#134e4a', x, 1.9, z, 0.9, 0.14, 0.6);
      b.add('c:#111827', T.cyl, M(x + 0.5, 0.5, z + 0.2, 0, 0.05, 1.0, 0.05, 0.35));
      b.box('c:#f8fafc', x, 0.18, z + 0.1, 0.5, 0.03, 0.9);
      break;
    }
    // автомагазин запчастей: витрина с колёсами и канистрами
    case 'partsshop': {
      b.box('c:#334155', x, 0.9, z, 1.6, 1.8, 0.9);
      b.box('c:#0f172a', x, 1.9, z, 1.8, 0.2, 1.1);
      b.add('glass:0.45', T.box, M(x, 1.15, z + 0.47, 0, 1.3, 0.9, 0.05));
      for (let i = 0; i < 2; i++) b.add('c:#1f2024', T.cyl, M(x - 0.4 + i * 0.8, 1.0, z + 0.3, 0, 0.32, 0.16, 0.32, 0, Math.PI / 2));
      b.box('glow:#f59e0b', x, 2.06, z, 1.2, 0.06, 0.1);
      b.box('c:#dc2626', x + 0.9, 0.45, z + 0.6, 0.3, 0.6, 0.3);
      break;
    }
    // будка штрафстоянки со шлагбаумом
    case 'impound': {
      b.box('c:#1d4ed8', x, 1.1, z, 2.2, 2.2, 2.0);
      b.add('glass:0.4', T.box, M(x, 1.35, z + 1.02, 0, 1.5, 0.9, 0.05));
      b.box('c:#0f172a', x, 2.35, z, 2.5, 0.2, 2.3);
      b.box('c:#e5e7eb', x + 1.9, 1.0, z, 0.14, 0.14, 3.4);
      b.box('c:#ef4444', x + 1.9, 1.05, z + 1.4, 0.12, 0.12, 0.9);
      b.box('c:#f59e0b', x - 1.4, 0.7, z + 1.1, 0.5, 0.5, 0.3);
      break;
    }
    case 'porch': {
      const ca = Math.cos(r), sa = Math.sin(r);
      b.add('c:#78716c', T.box, M(x, 0.15, z, r, p.w ?? 2.4, 0.3, p.d ?? 1.4));
      for (const sx of [-1, 1]) b.add('c:#a8a29e', T.box, M(x + ca * sx * 1.1, 1.4, z - sa * sx * 1.1, r, 0.1, 2.3, 0.1));
      b.add('c:#7f1d1d', T.box, M(x, 2.55, z, r, 2.8, 0.1, 1.8));
      break;
    }
    case 'bed': b.add('c:#5a3b1d', T.box, M(x, 0.12, z, 0, p.w ?? 1, 0.25, p.d ?? 4)); b.add('c:#4ade80', T.box, M(x, 0.3, z, 0, (p.w ?? 1) * 0.5, 0.14, (p.d ?? 4) * 0.9)); break;
    case 'banya': {
      b.add('facade:wood', T.box, M(x, 1.3, z, r, 4, 2.6, 4), [8, 10]);
      b.add('c:#3f2a17', T.prism, M(x, 2.6, z, r, 4.6, 1.3, 4.8));
      b.add('c:#44403c', T.cylB, M(x + Math.cos(r) * 1.2, 2.6, z - Math.sin(r) * 1.2, 0, 0.18, 1.8, 0.18));
      b.add('c:#3b2412', T.box, M(x + Math.sin(r) * 2.01, 1.0, z + Math.cos(r) * 2.01, r, 0.8, 1.8, 0.06));
      break;
    }
    case 'umbrella': b.add('c:#ddd', T.cylB, M(x, 0, z, 0, 0.04, 2.4, 0.04)); b.add('c:' + (p.c ?? '#ef4444'), T.cone, M(x, 2.0, z, 0, 1.4, 0.55, 1.4)); break;
    case 'towel': b.add('c:' + (p.c ?? '#60a5fa'), T.box, M(x, 0.11, z, 0.2, 0.9, 0.02, 1.8)); break;
    case 'lounger': b.add('c:#f5f5f5', T.box, M(x, 0.3, z, 0.2, 0.65, 0.08, 1.9)); b.add('c:#f5f5f5', T.box, M(x, 0.5, z - 0.7, 0.2, 0.65, 0.06, 0.6, 0.6)); b.add('c:#888', T.box, M(x, 0.13, z, 0.2, 0.6, 0.26, 1.6)); break;
    case 'lifeguard': for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.add('c:#fff', T.box, M(x + lx, 1.2, z + lz, 0, 0.12, 2.4, 0.12)); b.add('c:#ef4444', T.box, M(x, 2.5, z, 0, 2, 0.15, 2)); b.add('c:#ef4444', T.box, M(x, 3.4, z, 0, 2.2, 0.1, 2.2)); break;
    case 'container': {
      const c = 'c:' + (p.c ?? '#b91c1c');
      b.add(c, T.box, M(x, 1.3, z, r, 2.5, 2.6, 6));
      for (let i = 0; i < 6; i++) b.add('c:#00000033'.slice(0, 9) === 'c:#000000' ? 'c:#222' : c, T.box, M(x + Math.sin(r) * (-2.5 + i), 1.3, z + Math.cos(r) * (-2.5 + i), r, 2.56, 2.5, 0.08));
      break;
    }
    case 'tank': b.add('c:#d1d5db', T.cylB, M(x, 0, z, 0, p.w ?? 7, p.h ?? 10, p.w ?? 7).clone().multiply(new THREE.Matrix4().makeScale(0.5, 1, 0.5))); b.add('c:#9ca3af', T.cone, M(x, p.h ?? 10, z, 0, (p.w ?? 7) / 2, 1, (p.w ?? 7) / 2)); break;
    case 'crane': {
      const w = p.w ?? 34, d = p.d ?? 50, h = p.h ?? 14;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('c:#f59e0b', T.box, M(x + sx * w / 2 + 2 * -sx * 0, h / 2, z + sz * d / 2.1, 0, 1.2, h, 1.2));
      for (const sz of [-1, 1]) b.add('c:#f59e0b', T.box, M(x, h, z + sz * d / 2.1, 0, w + 2, 1.4, 1.4));
      b.add('c:#d97706', T.box, M(x - 4, h + 0.9, z, 0, 3, 1.5, d * 0.95));
      b.add('c:#374151', T.box, M(x - 4, h - 3, z, 0, 0.1, 6, 0.1));
      break;
    }
    case 'dock': b.box('tex:concrete', x, 0, z, p.w ?? 40, p.h ?? 1.2, p.d ?? 4, 0, 4); b.box('c:#facc15', x, (p.h ?? 1.2) - 0.05, z + (p.d ?? 4) / 2 - 0.1, p.w ?? 40, 0.1, 0.2); break;
    case 'booth': b.box('c:#e5e7eb', x, 0, z, 2.5, 2.6, 2.5); b.box('glass:0.5', x, 1.1, z, 2.55, 1.0, 2.55); b.box('c:#1e3a8a', x, 2.6, z, 2.9, 0.2, 2.9); break;
    case 'busstop': {
      // остановка: навес, стеклянная задняя стенка, боковины, лавочка и табличка с номером линии
      const c = p.c ?? '#f59e0b';
      b.box('c:#6b7280', x, 0, z, 3.6, 0.12, 1.5, r);                       // плита основания
      b.box('c:#374151', x, 0.12, z, 3.6, 0.08, 1.5, r);                    // пол
      for (const sx of [-1.7, 1.7]) {                                       // стойки навеса
        const px = x + Math.cos(r) * sx, pz = z - Math.sin(r) * sx;
        b.box('c:#374151', px, 0, pz, 0.12, 2.5, 0.12);
      }
      const backX = x + Math.sin(r) * 0.72, backZ = z + Math.cos(r) * 0.72;
      b.add('glass:0.35', T.box, M(backX, 1.35, backZ, r, 3.5, 1.9, 0.05)); // заднее стекло
      b.add(c, T.box, M(backX, 2.4, backZ, r, 3.5, 0.22, 0.1));             // цветная полоса линии
      b.box(c, x, 2.5, z, 4.0, 0.16, 1.7, r);                               // козырёк
      b.add('c:#111827', T.box, M(x, 0.42, z + Math.sin(r) * 0.1, r, 2.2, 0.06, 0.45)); // сиденье
      b.box('c:#374151', x - Math.cos(r) * 0.9, 0.12, z + Math.sin(r) * 0.9, 0.1, 0.32, 0.4);
      b.box('c:#374151', x + Math.cos(r) * 0.9, 0.12, z - Math.sin(r) * 0.9, 0.1, 0.32, 0.4);
      // указатель с номером маршрута
      const poleX = x - Math.cos(r) * 2.1, poleZ = z + Math.sin(r) * 2.1;
      b.box('c:#4b5563', poleX, 0, poleZ, 0.1, 2.6, 0.1);
      b.add(`sign:${p.v ?? 1}|${c}`, T.plane, M(poleX, 3.05, poleZ, r + Math.PI, 0.6, 0.6, 1));
      break;
    }
    case 'flag': {
      // 🏳️‍⚧️ пасхалка: пятиполосный флаг на мачте выше крыши
      const base = p.h ?? 30;
      b.add('c:#9ca3af', T.cylB, M(x, base, z, 0, 0.09, 2.4, 0.09));
      const stripes = ['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA'];
      for (let i = 0; i < 5; i++) {
        const y = base + 1.0 + i * 0.42;
        b.add('c:' + stripes[i], T.plane, M(x + 1.0, y, z, 0, 2.0, 0.42, 1));
        b.add('c:' + stripes[i], T.plane, M(x + 1.0, y, z, Math.PI, 2.0, 0.42, 1));
      }
      b.add('c:#e5e7eb', T.box, M(x + 2.02, base + 2.06, z, 0, 0.02, 2.1, 0.02));
      break;
    }
    case 'toilet': b.box('c:#dbeafe', x, 0, z, 2.2, 2.5, 2.2); b.box('c:#bfdbfe', x, 2.5, z, 2.5, 0.18, 2.5); b.box('c:#1d4ed8', x, 1.0, z + 1.11, 0.9, 1.9, 0.06); b.box('c:#ffffff', x, 2.05, z + 1.2, 0.5, 0.3, 0.04); break;
    case 'shower': b.box('c:#94a3b8', x, 0, z, 0.5, 0.12, 0.5); b.box('c:#64748b', x, 0.06, z, 0.16, 2.4, 0.16); b.box('c:#0ea5e9', x, 2.4, z + 0.2, 0.7, 0.12, 0.12); b.box('c:#38bdf8', x, 2.3, z + 0.5, 0.06, 0.3, 0.06); break;
    case 'palm': {
      const rh = 4.4 * (p.h ?? 1);
      b.box('c:#8b6b4a', x, 0, z, 0.36, rh, 0.36);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.box('c:#3f9142', x + Math.cos(a) * 1.05, rh - 0.1, z + Math.sin(a) * 1.05, 2.1, 0.1, 0.5); }
      b.box('c:#2f7d32', x, rh, z, 1.1, 0.32, 1.1); break;
    }
    case 'volleyball': b.box('c:#94a3b8', x, 0, z, 0.14, 2.4, 0.14); b.box('c:#ffffff', x, 2.2, z, 7.4, 0.8, 0.06); break;
    case 'barrier': b.box('c:#666', x, 0, z, 0.3, 1.1, 0.3); b.add('c:#dc2626', T.box, M(x, 2.6, z + 0.2, 0, 0.12, 3.4, 0.12, 0, 0.15)); break;
    case 'pump': b.box('c:#e5e7eb', x, 0, z, 0.8, 1.6, 0.5); b.box('c:#16a34a', x, 1.3, z, 0.82, 0.3, 0.52); b.box('glow:#a7f3d0', x, 1.0, z + 0.26, 0.4, 0.2, 0.01); break;
    case 'canopy': {
      const w = p.w ?? 12, d = p.d ?? 7;
      b.box('c:#f8fafc', x, 4.5, z, w, 0.5, d); b.box('c:#16a34a', x, 4.5, z, w + 0.05, 0.25, d + 0.05);
      for (const sx of [-1, 1]) b.box('c:#cbd5e1', x + sx * (w / 2 - 1), 0, z, 0.3, 4.5, 0.3);
      break;
    }
    case 'vsign': {
      const ca = Math.cos(r), sa = Math.sin(r);
      for (const sx of [-1, 1]) b.add('c:#444', T.box, M(x + ca * sx * 0.9, 1.1, z - sa * sx * 0.9, r, 0.08, 2.2, 0.08));
      b.add(`sign:${p.c}|#1e5631`, T.box, M(x, 1.9, z, r, 2.4, 0.6, 0.05));
      break;
    }
    case 'kiosk': {
      b.add('c:#f1f5f9', T.box, M(x, 1.25, z, r, 2.6, 2.5, 2.0));
      b.add('c:' + (p.c ?? '#f97316'), T.box, M(x, 2.6, z, r, 2.9, 0.25, 2.3));
      b.add('glass:0.5', T.box, M(x + Math.sin(r) * 1.0, 1.4, z + Math.cos(r) * 1.0, r, 2.0, 0.9, 0.05));
      b.add('c:' + (p.c ?? '#f97316'), T.box, M(x + Math.sin(r) * 1.4, 2.1, z + Math.cos(r) * 1.4, r, 2.6, 0.06, 0.8, 0.3));
      break;
    }
    case 'chimney': {
      const h = p.h ?? 30;
      for (let i = 0; i < 6; i++) b.add(i % 2 ? 'c:#f8fafc' : 'c:#b91c1c', T.cylB, M(x, (i * h) / 6, z, 0, 1.5 - i * 0.08, h / 6, 1.5 - i * 0.08));
      break;
    }
    case 'pipe': b.add('c:#9ca3af', T.cyl, M(x, p.h ?? 8, z, 0, 0.6, p.w ?? 10, 0.6, 0, Math.PI / 2)); break;
    case 'cow': {
      const ca = Math.cos(r), sa = Math.sin(r);
      b.add('c:#f5f5f4', T.box, M(x, 1.0, z, r, 0.8, 0.75, 1.7)); b.add('c:#1c1917', T.box, M(x + sa * 0.2, 1.05, z + ca * 0.2, r, 0.82, 0.5, 0.6));
      b.add('c:#f5f5f4', T.box, M(x + sa * 1.0, 1.25, z + ca * 1.0, r, 0.42, 0.42, 0.55)); b.add('c:#fda4af', T.box, M(x + sa * 1.3, 1.15, z + ca * 1.3, r, 0.3, 0.2, 0.08));
      for (const [lx, lz] of [[-0.28, 0.6], [0.28, 0.6], [-0.28, -0.6], [0.28, -0.6]]) b.add('c:#e7e5e4', T.box, M(x + ca * lx + sa * lz, 0.32, z - sa * lx + ca * lz, r, 0.16, 0.64, 0.16));
      break;
    }
    case 'chicken': b.add('c:#fafaf9', T.box, M(x, 0.22, z, r, 0.22, 0.2, 0.3)); b.add('c:#fafaf9', T.box, M(x + Math.sin(r) * 0.15, 0.36, z + Math.cos(r) * 0.15, r, 0.12, 0.14, 0.12)); b.add('c:#dc2626', T.box, M(x + Math.sin(r) * 0.15, 0.45, z + Math.cos(r) * 0.15, r, 0.03, 0.05, 0.08)); b.add('c:#f59e0b', T.box, M(x + Math.sin(r) * 0.23, 0.36, z + Math.cos(r) * 0.23, r, 0.04, 0.03, 0.06)); break;
    case 'crop': b.add(p.c === '#d9b44a' ? 'tex:wheat' : 'c:#8fbf4a', T.boxB, M(x, 0, z, p.r ?? 0, p.w ?? 20, 0.75, p.d ?? 4)); break;
    case 'hay': b.add('c:#d4a537', T.cylB, M(x, 0, z, 0, 0.8, 1.2, 0.8, 0, 0)); b.add('c:#b88a24', T.cylB, M(x, 0, z, 0, 0.82, 0.1, 0.82)); break;
    case 'trough': b.add('c:#78350f', T.box, M(x, 0.35, z, 0, 2.6, 0.7, 0.8)); b.add('c:#84cc16', T.box, M(x, 0.66, z, 0, 2.4, 0.06, 0.6)); break;
    case 'scooterdock': b.add('c:#334155', T.box, M(x, 0.9, z, 0, 0.12, 1.8, 0.12)); b.add('sign:🛴 Вжух · аренда|#16a34a', T.box, M(x, 1.75, z, 0, 0.9, 0.5, 0.05)); b.add('c:#16a34a', T.box, M(x + 1.9, 0.16, z, 0, 3.4, 0.02, 1.2)); break;
    case 'pallet': b.box('c:#a16207', x, 0, z, 1.2, 0.15, 1.0); b.box('c:#1f2937', x, 0.15, z, 0.9, 0.8, 0.9); break;
    case 'bridge': {
      // настил моста: бетонная балка + асфальт сверху + бортики
      const h = p.h ?? 0.4, w = p.w ?? 20, d = p.d ?? 8;
      b.box('c:#57534e', x, 0, z, w, h, d);
      b.add('tex:asphalt', T.plane, M(x, h + 0.02, z, r, w - 0.6, d - 0.6, 1, -Math.PI / 2), 6);
      b.add('c:#f1f1ec', T.box, M(x, h + 0.04, z, r, w - 1, 0.02, 0.16));
      break;
    }
    case 'bridge_rail': {
      const h = p.h ?? 1.15, w = Math.max(p.w ?? 1, 0.12), d = Math.max(p.d ?? 0.12, 0.12);
      b.box('c:' + (p.c ?? '#d6d3d1'), x, 0, z, w, h, d);
      const len = Math.max(w, d), n = Math.max(1, Math.floor(len / 2.4));
      for (let i = 0; i <= n; i++) {
        const t = n ? i / n - 0.5 : 0;
        b.box('c:#78716c', x + (w > d ? t * w : 0), 0, z + (w > d ? 0 : t * d), 0.12, h + 0.08, 0.12);
      }
      break;
    }
    case 'pillar': {
      const w = p.w ?? 2, d = p.d ?? 2, h = p.h ?? 6;
      b.box('c:#9ca3af', x, 0, z, w, h, d);
      b.box('c:#6b7280', x, 0, z, w + 0.4, h * 0.06, d + 0.4);
      b.box('c:#6b7280', x, h - 0.25, z, w + 0.5, 0.25, d + 0.5);
      break;
    }
    case 'silo': {
      const w = p.w ?? 7, h = p.h ?? 13;
      b.add('c:#d6d3d1', T.cylB, M(x, 0, z, 0, w / 2, h, w / 2));
      b.add('c:#a8a29e', T.cylB, M(x, h * 0.35, z, 0, w / 2 + 0.08, 0.25, w / 2 + 0.08));
      b.add('c:#a8a29e', T.cylB, M(x, h * 0.72, z, 0, w / 2 + 0.08, 0.25, w / 2 + 0.08));
      b.add('c:#78716c', T.cone, M(x, h, z, 0, w / 2 + 0.4, 2.6, w / 2 + 0.4));
      b.add('c:#cbd5e1', T.box, M(x + w / 2 + 0.1, h * 0.2, z, 0, 0.1, h * 0.5, 0.1));
      break;
    }
    case 'well': {
      // каменный круг + деревянный сруб вокруг него
      b.add('c:#78716c', T.cylB, M(x, 0, z, 0, 1.15, 0.95, 1.15));
      b.add('c:#57534e', T.cylB, M(x, 0.02, z, 0, 1.22, 0.16, 1.22));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('c:#8b5a2b', x + sx * 0.82, 0, z + sz * 0.82, 0.16, 0.95, 0.16);
      for (const s of [-1, 1]) { b.box('c:#9a6633', x + s * 0.9, 0.35, z, 0.12, 0.16, 1.6); b.box('c:#9a6633', x, 0.62, z + s * 0.9, 1.6, 0.16, 0.12); }
      // свая с воротом, цепь и ведро
      for (const sx of [-1, 1]) b.box('c:#6b4a25', x + sx * 0.95, 0.95, z, 0.14, 1.75, 0.14);
      b.add('c:#8b5a2b', T.cylB, M(x, 1.95, z, 0, 0.13, 1.9, 0.13, 0, Math.PI / 2));
      b.add('c:#3f3f46', T.cylB, M(x + 0.72, 1.95, z, 0, 0.24, 0.06, 0.24, 0, Math.PI / 2));
      b.add('c:#a1a1aa', T.cylB, M(x - 0.1, 1.55, z + 0.16, 0, 0.02, 0.72, 0.02));
      b.add('c:#7c5a3a', T.cylB, M(x - 0.1, 1.06, z + 0.16, 0, 0.17, 0.28, 0.17));
      b.add('c:#3f3f46', T.cylB, M(x - 0.1, 1.0, z + 0.16, 0, 0.18, 0.04, 0.18));
      // намокшая вода и навес-крыша
      b.add('water', T.cylB, M(x, 0.6, z, 0, 0.95, 0.02, 0.95));
      b.add('c:#7f1d1d', T.prism, M(x, 2.62, z, 0, 2.6, 0.9, 2.3));
      b.add('c:#5b3a1e', T.box, M(x, 2.62, z, 0, 2.7, 0.08, 0.1));
      break;
    }
    case 'trailer': {
      const w = p.w ?? 8;
      b.box('c:#334155', x, 0.55, z, w, 0.16, 2.6);
      b.box('c:#a16207', x, 0.85, z, w * 0.8, 0.55, 2.3);
      b.box('c:#15803d', x, 0.2, z, w * 0.55, 0.5, 0.12);
      for (const sx of [-1, 1]) {
        b.add('c:#1f2937', T.cylB, M(x + sx * w * 0.32, 0.5, z, 0, 0.5, 0.34, 0.5, 0, Math.PI / 2));
        b.box('c:#57534e', x + sx * w * 0.32, 0, z, 0.1, 0.6, 0.1);
      }
      b.box('c:#334155', x - w * 0.62, 0.6, z, w * 0.28, 0.12, 0.16);
      break;
    }
    // ---------- парк «Ракета»: аттракционы ----------
    // арка входа с названием парка
    case 'parkarch': {
      const w = p.w ?? 13, h = p.h ?? 7;
      for (const sx of [-1, 1]) {
        b.box('c:#7f1d1d', x + sx * w / 2, 0, z, 0.7, h, 0.7);
        b.box('c:#f8fafc', x + sx * w / 2, h - 0.7, z, 0.9, 0.24, 0.9);
      }
      b.box('c:#7f1d1d', x, h - 0.3, z, w + 0.7, 0.6, 0.7);
      b.add(`sign:${p.c ?? 'ПАРК «РАКЕТА»'}|#7f1d1d`, T.box, M(x, h + 0.35, z, 0, w * 0.86, 1.0, 0.14));
      b.add('glow:#fbbf24', T.box, M(x, h - 0.62, z + 0.4, 0, w * 0.9, 0.08, 0.1));
      break;
    }
    // ракета-памятник: ступенчатый постамент, корпус с кольцами, нос-конус, сопла
    case 'rocket': {
      const H = p.h ?? 27;
      b.add('c:#cbd5e1', T.cylB, M(x, 0.15, z, 0, 5.2, 0.9, 5.2), 2);
      b.add('c:#94a3b8', T.cylB, M(x, 1.05, z, 0, 4.1, 0.45, 4.1), 2);
      b.add('c:#e2e8f0', T.cylB, M(x, 1.5, z, 0, 2.6, H * 0.62, 2.6), 2);
      for (const yy of [0.3, 0.55, 0.8]) b.add('c:#94a3b8', T.cylB, M(x, 1.5 + H * 0.62 * yy, z, 0, 2.62, 0.16, 2.62), 2);
      b.add('c:#f8fafc', T.cone, M(x, 1.5 + H * 0.62, z, 0, 2.6, H * 0.38, 2.6), 2);
      b.add('c:#dc2626', T.cone, M(x, 1.5 + H * 0.93, z, 0, 0.62, H * 0.07, 0.62), 2);
      // стабилизаторы и сопла
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        b.add('c:#b91c1c', T.box, M(x + Math.cos(a) * 3.0, 3.0, z + Math.sin(a) * 3.0, -a, 0.22, 4.6, 2.3));
        b.add('c:#334155', T.cylB, M(x + Math.cos(a) * 1.5, 1.5, z + Math.sin(a) * 1.5, 0, 0.42, 1.1, 0.42), 2);
      }
      // иллюминатор и надпись
      b.add('glow:#7dd3fc', T.sphere, M(x, 4.4, z + 2.35, 0, 0.55, 0.55, 0.3));
      b.add('sign:ВОСТОК|#f8fafc', T.box, M(x, 6.4, z + 2.5, 0, 2.6, 0.7, 0.06));
      break;
    }
    // колесо обозрения: две A-образные опоры, обод из сегментов, спицы и кабинки
    case 'ferris': {
      const R = p.h ?? 12, cy = R + 2.4;
      const rad = 'c:#e2e8f0', strut = 'c:#94a3b8';
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) b.add(strut, T.box, M(x + sx * 1.9, cy / 2, z + sz * 0.5, 0, 0.22, cy * 1.02, 0.22, 0, sx * 0.06));
        b.add('c:#64748b', T.box, M(x, 0.5, z + sz * 1.6, 0, 5.2, 0.5, 0.9));
      }
      b.add('c:#475569', T.cyl, M(x, cy, z, 0, 0.42, 3.0, 0.42, 0, Math.PI / 2));
      const SEG = 24;
      for (let k = 0; k < SEG; k++) {
        const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2;
        const mx = (a0 + a1) / 2;
        b.add(rad, T.box, M(x, cy + Math.sin(mx) * R, z + Math.cos(mx) * R, 0, 0.24, 0.3, (2 * Math.PI * R) / SEG + 0.16, mx, 0));
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.add(strut, T.box, M(x, cy + Math.sin(a) * R / 2, z + Math.cos(a) * R / 2, 0, 0.16, R, 0.16, a, 0));
        // кабинка
        const gx = x, gy = cy + Math.sin(a) * R - 0.9, gz = z + Math.cos(a) * R;
        b.add(k % 2 ? 'c:#f97316' : 'c:#22c55e', T.box, M(gx, gy, gz, 0, 1.7, 1.5, 1.3));
        b.add('c:#0f172a', T.box, M(gx, gy + 0.5, gz, 0, 1.5, 0.7, 0.1));
      }
      b.add('glow:#fbbf24', T.sphere, M(x, cy + R + 0.4, z, 0, 0.35, 0.35, 0.35));
      break;
    }
    // карусель: платформа, пёстрый навес-шатёр, лошадки и фонарики
    case 'carouselbig': {
      const R = (p.w ?? 13) / 2, h = p.h ?? 8;
      b.add('c:#b91c1c', T.cylB, M(x, 0.15, z, 0, R, 0.35, R), 2);
      b.add('c:#f8fafc', T.cylB, M(x, 0.5, z, 0, R * 0.93, 0.12, R * 0.93), 2);
      b.add('c:#eab308', T.cylB, M(x, 0.4, z, 0, 0.42, h - 0.6, 0.42), 2);
      // навес: конус + полосы
      b.add('c:#dc2626', T.cone, M(x, h - 2.4, z, 0, R * 1.02, 2.6, R * 1.02), 2);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        b.add('c:#f8fafc', T.box, M(x + Math.cos(a) * R * 0.72, h - 2.1, z + Math.sin(a) * R * 0.72, -a, 0.5, 2.0, 0.14, 0, 0.36));
      }
      b.add('glow:#fbbf24', T.sphere, M(x, h + 0.35, z, 0, 0.4, 0.4, 0.4));
      // лошадки
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const hx = x + Math.cos(a) * R * 0.62, hz = z + Math.sin(a) * R * 0.62;
        b.add(k % 2 ? 'c:#f8fafc' : 'c:#7c3aed', T.box, M(hx, 1.5, hz, -a, 1.5, 0.9, 0.55));
        b.add('c:#f1f5f9', T.box, M(hx + Math.cos(a) * 0.75, 1.95, hz + Math.sin(a) * 0.75, -a, 0.55, 0.55, 0.4));
        b.add('c:#eab308', T.box, M(hx, 1.05, hz, -a, 0.14, 0.9, 0.14));
      }
      break;
    }
    // башня свободного падения
    case 'droptower': {
      const H = p.h ?? 22;
      b.add('c:#334155', T.cylB, M(x, 0.15, z, 0, 1.5, 0.5, 1.5), 2);
      b.add('c:#64748b', T.box, M(x, 0.6, z, 0, 1.0, H - 0.6, 1.0));
      b.add('c:#dc2626', T.box, M(x, H * 0.55, z, 0, 1.9, 0.9, 1.9));   // кабина
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
        b.add('c:#f8fafc', T.box, M(x + sx * 0.7, H * 0.55 + 0.75, z + sz * 0.7, 0, 0.3, 0.5, 0.3));
      b.add('c:#1e293b', T.box, M(x, H, z, 0, 2.6, 0.7, 2.6));
      b.add('glow:#ef4444', T.sphere, M(x, H + 0.7, z, 0, 0.34, 0.34, 0.34));
      break;
    }
    // американские горки: две рельсы по профилю с горкой, опоры, станция и вагонетки
    case 'coaster': {
      const len = p.w ?? 52, H = p.h ?? 9;
      const x0 = x - len / 2, x1 = x + len / 2;
      const prof = (t: number) => 1.2 + Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * H;   // горка посередине
      const N2 = 26;
      for (let k = 0; k < N2; k++) {
        const t0 = k / N2, t1 = (k + 1) / N2;
        const px0 = x0 + (x1 - x0) * t0, px1 = x0 + (x1 - x0) * t1;
        const y0 = prof(t0), y1 = prof(t1);
        const midx = (px0 + px1) / 2, midy = (y0 + y1) / 2, seg = Math.hypot(px1 - px0, y1 - y0) + 0.1;
        const ang = Math.atan2(y1 - y0, px1 - px0);
        for (const sz of [-0.65, 0.65]) {
          b.add('c:#f59e0b', T.box, M(midx, midy, z + sz, 0, seg, 0.16, 0.16, 0, ang));
          b.add('c:#fbbf24', T.box, M(midx, midy - 0.28, z + sz, 0, seg, 0.1, 0.1, 0, ang));
        }
        if (k % 2 === 0) b.add('c:#94a3b8', T.box, M(midx, midy / 2, z, 0, 0.24, midy, 1.5));
      }
      // станция и вагонетки
      b.add('c:#7f1d1d', T.box, M(x0 + 3, 1.0, z, 0, 7, 0.3, 3.2, 0, 0.05));
      for (let k = 0; k < 3; k++) {
        const t = 0.12 + k * 0.05;
        b.add(k === 0 ? 'c:#dc2626' : 'c:#1e293b', T.box, M(x0 + (x1 - x0) * t, prof(t) + 0.35, z, 0, 2.3, 0.75, 1.4, 0, Math.atan2(prof(t + 0.01) - prof(t), (x1 - x0) * 0.01)));
      }
      addFenceLine(b, x0, z - 1.9, x1, z - 1.9, 1.1);
      break;
    }
    // мини-пруд: каменный бортик, вода, кувшинки и камыш
    case 'pond': {
      const R = p.h ?? 7.5;
      // берег: невысокий земляной диск, внутри — вода, по кромке — камни (не сплошной блин!)
      b.add('c:#5b5f52', T.cylB, M(x, 0.15, z, 0, R + 0.95, 0.08, R + 0.95), 2);
      b.add('water', T.cylB, M(x, 0.19, z, 0, R, 0.14, R), 2);
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        b.add('c:#a8a29e', T.box, M(x + Math.cos(a) * (R + 0.1), 0.3, z + Math.sin(a) * (R + 0.1), -a, 1.1, 0.34, 0.62));
      }
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + 0.2, rr = R * (0.35 + ((k * 17) % 10) / 18);
        b.add('c:#166534', T.circle, M(x + Math.cos(a) * rr, 0.34, z + Math.sin(a) * rr, 0, 0.55, 0.55, 1, -Math.PI / 2));
      }
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2, rr = R - 0.2;
        b.add('c:#4d7c0f', T.cylB, M(x + Math.cos(a) * rr, 0.3, z + Math.sin(a) * rr, 0, 0.05, 0.9 + ((k * 7) % 5) / 10, 0.05));
      }
      break;
    }
    default: break;
  }
}

/** простая оградка из столбиков и двух прожилин — для аттракционов */
function addFenceLine(b: Batcher, x0: number, z0: number, x1: number, z1: number, h: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const n = Math.max(1, Math.round(len / 3));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    b.add('c:#57534e', T.box, M(x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t, 0, 0.12, h, 0.12));
  }
  for (const yy of [h * 0.45, h * 0.9]) b.add('c:#78716c', T.box, M((x0 + x1) / 2, yy, (z0 + z1) / 2, 0, len, 0.09, 0.09));
}
