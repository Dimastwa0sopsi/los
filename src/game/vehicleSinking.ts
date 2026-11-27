/** Vertical immersion for a ground vehicle, in metres below the water surface.
 * Bridge decks are treated as dry by the caller. No vehicle or inventory is
 * deleted: recovery remains possible. */
export function nextImmersion(current: number, depth: number, dt: number): number {
  if (![current,depth,dt].every(Number.isFinite)) return 0;
  if (depth <= 0.55) return 0;
  return Math.min(Math.max(0, depth - 0.08), Math.max(0,current) + Math.max(0,Math.min(dt,0.1)) * 0.38);
}
