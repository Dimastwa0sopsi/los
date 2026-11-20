/* Проверка поверхностей мира: что реально лежит под ногами в разных точках.
 * Собирает меши мира в node (без WebGL, canvas заглушен), стреляет лучом сверху вниз
 * и проверяет материал верхней поверхности. Так ловятся «бетонные газоны» и дыры в земле.
 *
 *   npm run check:terrain
 */
import * as THREE from 'three';
import { generateLayout } from '../src/game/worldgen';
import { buildWorldMeshes } from '../src/game/worldMesh';
import { allMaterials } from '../src/game/textures';

// ---- заглушка canvas: процедурные текстуры «рисуются» без браузера ----
const fakeCtx: any = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return { width: 256, height: 256 };
    if (k === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'getImageData') return (x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { /* */ } });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => { /* no-op */ };
  },
  set: () => true,
});
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx, style: {} }),
};
(globalThis as any).window = globalThis;
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* уже определён */ }

async function main() {
  const L = generateLayout();
  const iso = L.nodes.filter((n) => !L.adj[n.id]?.length);
  const alive = iso.filter((n) => !n.dead);
  if (alive.length) { console.error(`✗ ${alive.length} узлов дорог без единого ребра`); process.exit(1); }

  const W = await buildWorldMeshes(L, () => { /* */ });
  const keys = new Map<THREE.Material, string>();
  allMaterials().forEach((m, k) => keys.set(m, k));

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const top = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, 60, z), down);
    const hits = ray.intersectObject(W.root, true).filter((h) => h.object.visible);
    const h = hits[0];
    return { key: h ? (keys.get((h.object as THREE.Mesh).material as THREE.Material) ?? '?') : '—', y: h ? h.point.y : NaN };
  };

  type Case = { label: string; x: number; z: number; want: (k: string) => boolean; why: string };
  const isGrass = (k: string) => k === 'tex:grass';
  // внутри городского квартала допустим асфальт, газон, земля и тротуар — но не «плита вместо газона»
  const isCitySurface = (k: string) => k === 'tex:asphalt' || k === 'tex:grass' || k === 'tex:soil' || k === 'tex:sidewalk' || k === 'tex:patch';
  const cases: Case[] = [
    { label: 'жилой квартал', x: 330, z: 330, want: isCitySurface, why: 'внутри жилого квартала должна быть твёрдая поверхность (асфальт/газон)' },
    { label: 'деловой квартал', x: 870, z: 640, want: isCitySurface, why: 'внутри делового квартала должна быть поверхность' },
    { label: 'частный двор', x: 150, z: 810, want: isGrass, why: 'во дворе усадьбы должен быть газон' },
    { label: 'поле за городом', x: 900, z: 1500, want: isGrass, why: 'за городом должна быть трава' },
    { label: 'луг у реки', x: -500, z: 500, want: isGrass, why: 'у реки должна быть трава' },
    { label: 'двор деревни', x: 601, z: 1730, want: (k) => isGrass(k) || k.startsWith('road:'), why: 'в деревне должна быть трава или дорога' },
    { label: 'деревня: у улицы', x: 610, z: 1735, want: (k) => isGrass(k) || k.startsWith('road:'), why: 'у деревенской улицы должна быть трава' },
    { label: 'деревня: палисадник', x: 592, z: 1690, want: (k) => isGrass(k) || k.startsWith('road:') || k.startsWith('c:'), why: 'у дома должна быть трава' },
    { label: 'парк: газон', x: 452, z: 758, want: isGrass, why: 'между дорожками парка должен оставаться газон' },
    { label: 'парк: дорожка', x: 480, z: 750, want: (k) => k === 'tex:sidewalk' || k === 'tex:grass', why: 'от входа к площади парка должна идти плиточная дорожка' },
    { label: 'парк: площадь', x: 480, z: 790, want: (k) => k === 'tex:sidewalk' || k.startsWith('c:'), why: 'у ракеты должна быть вымощенная площадь' },
    { label: 'парк: пруд', x: 520, z: 810, want: (k) => k === 'water', why: 'в пруду должна быть вода' },
    { label: 'дорога-шоссе', x: 30, z: 540, want: (k) => k.startsWith('road:'), why: 'на шоссе должно быть полотно' },
    { label: 'дорога-город', x: 330, z: 540, want: (k) => k.startsWith('road:'), why: 'на городской улице должно быть полотно' },
  ];
  let fail = 0;
  console.log('  поверхности (луч сверху вниз):');
  for (const c of cases) {
    const r = top(c.x, c.z);
    const ok = c.want(r.key);
    if (!ok) fail++;
    console.log(`   ${ok ? '✓' : '✗'} ${c.label.padEnd(17)} (${c.x}, ${c.z}) → ${r.key}${ok ? '' : `  — ${c.why}`}`);
  }
  if (fail) { console.error(`✗ провалено проверок поверхностей: ${fail}`); process.exit(1); }
  console.log('  ✓ поверхности в порядке');
}
void main();
