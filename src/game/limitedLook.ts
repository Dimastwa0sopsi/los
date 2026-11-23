import type { LimitedDef, Look } from './data';

/** Лимитки используют независимые слоты и не стирают остальные вещи. */
export function limitedWorn(look: Look, item: LimitedDef): boolean {
  switch (item.kind) {
    case 'hair': return look.hairColor === item.value;
    case 'top': return look.topColor === item.value && (item.value !== '@lgshirt' || look.top === 'tshirt');
    case 'bottom': return look.bottomColor === item.value;
    case 'acc': return look.acc === item.value;
    case 'wings': return !!look.wings;
    case 'shoes': return look.shoes === item.value;
  }
}
export function equipLimited(look: Look, item: LimitedDef): Look {
  const next = { ...look };
  switch (item.kind) {
    case 'hair': next.hairColor = item.value; break;
    case 'top': next.topColor = item.value; if (item.value === '@lgshirt') next.top = 'tshirt'; break;
    case 'bottom': next.bottomColor = item.value; break;
    case 'acc': next.acc = limitedWorn(look, item) ? undefined : item.value; break;
    case 'wings': next.wings = !look.wings; break;
    case 'shoes': next.shoes = limitedWorn(look, item) ? '#222222' : item.value; break;
  }
  return next;
}

/** Bonus is applied only while aiming or shortly after a real shot on foot. */
export function slipperSpeedMultiplier(look: Look, gunOut: boolean, aiming: boolean, lastShot: number, now: number): number {
  return look.shoes === '@pinkslippers' && gunOut && (aiming || (lastShot > 0 && now - lastShot >= 0 && now - lastShot < 900)) ? 1.1 : 1;
}
/** Two extra presses in the air, reset by the caller on landing. */
export function canUseWingJump(look: Look, onGround: boolean, inWater: boolean, used: number): boolean {
  return !!look.wings && !onGround && !inWater && used < 2;
}
