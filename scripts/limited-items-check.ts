import './domstub';
import { strict as assert } from 'node:assert';
import { Character } from '../src/game/character';
import { defaultLook, LIMITED } from '../src/game/data';
import { equipLimited, limitedWorn, slipperSpeedMultiplier, canUseWingJump } from '../src/game/limitedLook';
const expected: Record<string, number> = {la_cat_ears:25000, lt_lg:50000, lh_rainbow:100000, la_angel_wings:200000, ls_pink_slippers:10000};
let look = defaultLook('f');
for (const [id, price] of Object.entries(expected)) {
  const d = LIMITED.find(item => item.id === id);
  assert(d); assert.equal(d.price, price);
  look = equipLimited(look, d); assert(limitedWorn(look, d), id);
  const c = new Character(look); c.pose('idle', 0); c.dispose();
}
assert.equal(look.acc, 'cat_ears'); assert.equal(look.wings, true);
assert(canUseWingJump(look, false, false, 0)); assert(canUseWingJump(look, false, false, 1));
assert(!canUseWingJump(look, false, false, 2)); assert(!canUseWingJump(look, true, false, 0)); assert(!canUseWingJump(look, false, true, 0));
assert.equal(slipperSpeedMultiplier(look, true, true, 0, 5000), 1.1);
assert.equal(slipperSpeedMultiplier(look, true, false, 4900, 5000), 1.1);
assert.equal(slipperSpeedMultiplier(look, true, false, 1000, 5000), 1);
assert.equal(slipperSpeedMultiplier(look, false, true, 0, 5000), 1);
const wings = LIMITED.find(item => item.id === 'la_angel_wings')!;
look = equipLimited(look, wings); assert(!limitedWorn(look, wings)); assert.equal(look.acc, 'cat_ears');
const shoes = LIMITED.find(item => item.id === 'ls_pink_slippers')!;
look = equipLimited(look, shoes); assert(!limitedWorn(look, shoes));
console.log('✓ лимитки: цены, слоты, совместимость аксессуаров и сборка персонажа');
