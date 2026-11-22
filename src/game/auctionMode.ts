import type { Building, Box } from './worldgen';
import type { Collision } from './collision';

/** Auction exists only in online mode. IDs remain unchanged in the layout. */
export const availableInMode = (kind: string, online: boolean) => kind !== 'auction' || online;
export function auctionBoxes(buildings: Building[], boxes: Box[]): Box[] {
  const tags = new Set(buildings.filter(b => b.kind === 'auction').map(b => 'b' + b.id));
  return boxes.filter(b => b.tag !== undefined && tags.has(b.tag));
}
/** Toggle only these boxes; preserve dynamic garage gates and other obstacles. */
export function setAuctionMode(online: boolean, group: {visible: boolean}, collision: Collision, boxes: Box[]) {
  group.visible = online;
  const mine = new Set(boxes);
  collision.dynamic = collision.dynamic.filter(b => !mine.has(b));
  if (online) collision.dynamic.push(...boxes);
}
