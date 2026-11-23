import { Collision } from './collision';
/** The test track is private to its renderer and never references the city collider. */
export function testDriveCollision(): Collision {
  return new Collision([
    { x0:-43, x1:-41, z0:-43, z1:43, y0:0, y1:1.2 },
    { x0:41, x1:43, z0:-43, z1:43, y0:0, y1:1.2 },
    { x0:-43, x1:43, z0:-43, z1:-41, y0:0, y1:1.2 },
    { x0:-43, x1:43, z0:41, z1:43, y0:0, y1:1.2 },
  ]);
}
export function testDriveSeconds(start: number, now: number): number {
  return Math.max(0, Math.ceil((300_000 - Math.max(0, now - start)) / 1000));
}
