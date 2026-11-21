import type { RoadKind } from './worldgen';

export type SurfaceSegment = { ax: number; az: number; bx: number; bz: number; kind: RoadKind };
const rank: Record<RoadKind, number> = { highway: 6, avenue: 5, city: 4, industrial: 3, village: 2, dirt: 1 };

/** Видимые части ребра. Скрываем только совпадающую ось более приоритетной дороги,
 * сохраняя исходный граф для навигации. Поперечные перекрёстки не обрезаем. */
export function visibleRoadIntervals(segments: SurfaceSegment[], index: number): [number, number][] {
  const a = segments[index];
  const dx = a.bx - a.ax, dz = a.bz - a.az, len = Math.hypot(dx, dz);
  if (len < 1e-6) return [];
  const ux = dx / len, uz = dz / len;
  let pieces: [number, number][] = [[0, 1]];
  for (let i = 0; i < segments.length && pieces.length; i++) {
    const b = segments[i];
    if (i === index || rank[b.kind] < rank[a.kind] || (rank[b.kind] === rank[a.kind] && i > index)) continue;
    const vx = b.bx - b.ax, vz = b.bz - b.az, bl = Math.hypot(vx, vz);
    if (bl < 1e-6 || Math.abs(ux * vz - uz * vx) / bl > 1e-6) continue;
    if (Math.abs((b.ax - a.ax) * uz - (b.az - a.az) * ux) > 1e-5) continue;
    const t0 = ((b.ax - a.ax) * ux + (b.az - a.az) * uz) / len;
    const t1 = ((b.bx - a.ax) * ux + (b.bz - a.az) * uz) / len;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    if (hi - lo < 1e-7) continue;
    pieces = pieces.flatMap(([x, y]) => hi <= x || lo >= y ? [[x, y] as [number, number]] : [
      ...(lo > x + 1e-7 ? [[x, lo] as [number, number]] : []),
      ...(hi < y - 1e-7 ? [[hi, y] as [number, number]] : []),
    ]);
  }
  return pieces;
}
