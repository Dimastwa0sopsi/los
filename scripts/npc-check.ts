/* Проверка поведения НПС за рулём: в перестрелку рядом водитель должен жать
 * до ~100 км/ч и не стоять на красный, а после — вернуться к обычной скорости.
 *   npm run check:npc
 */
import { generateLayout } from '../src/game/worldgen';
import { AIDriver, type AICtx } from '../src/game/vehicles';

const L = generateLayout();
// берём обычную городскую улицу в жилой части
const startNode = L.nodes.find((n) => n.gi === 3 && n.gj === 6 && !n.dead);
if (!startNode) { console.error('✗ не найден стартовый узел'); process.exit(1); }

const fakeV = (x: number, z: number) => ({
  x, z, heading: 0, speed: 0, steer: 0, rpm: 0, shock: 0,
  spec: { maxSpeed: 28, accel: 3.2, len: 4.4, wid: 1.9 },
  model: { group: { visible: true } },
}) as unknown as Parameters<AIDriver['step']>[0];

// всё красное: обычная машина обязана замедлиться, паникующая — нет
const ctx: AICtx = {
  L,
  vehicles: [],
  player: { x: 9e9, z: 9e9, inVehicle: null },
  lightState: () => 'red',
  rand: () => 0.5,
};

const v = fakeV(startNode.x + 6, startNode.z + 6);
const ai = new AIDriver();
const first = L.adj[startNode.id].filter((e) => L.edges[e.e].kind !== 'dirt')[0];
ai.route = [startNode.id, first.n];
ai.mode = 'wander';

if (process.env.DBG) { const r0 = ai.step(v, 1/30, ctx); console.log('dbg', r0, ai.route, ai.mode); }
const run = (sec: number) => {
  let maxT = 0;
  for (let i = 0; i < sec * 30; i++) {
    const r = ai.step(v, 1 / 30, ctx);
    if (Number.isNaN(v.speed)) { console.log('speed NaN, r=', r, 'route', ai.route.slice(0,4), ai.k, ai.mode); return maxT; }
    if (Number.isNaN(r.target) || Number.isNaN(r.desired)) { console.log('NaN at', ai.mode, 'k', ai.k, 'route', ai.route.slice(Math.max(0, ai.k - 1), ai.k + 3), 'v', v.x.toFixed(1), v.z.toFixed(1)); return maxT; }
    maxT = Math.max(maxT, r.target);
    // AIDriver сам интегрирует движение машины (apply), дублировать не нужно
  }
  return maxT;
};

let bad = 0;
const calm = run(6);
console.log(`  ${calm <= 15 ? '✓' : '✗'} обычная езда: максимум ${(calm * 3.6).toFixed(0)} км/ч (красный свет уважает)`);
if (calm > 15) bad++;

ai.panic(v.x, v.z, 8);
const panicked = run(4);
console.log(`  ${panicked >= 24 && panicked <= 28.5 ? '✓' : '✗'} паника от перестрелки: ${(panicked * 3.6).toFixed(0)} км/ч (ожидаем ~100)`);
if (!(panicked >= 24 && panicked <= 28.5)) bad++;

// переждали панику — скорость возвращается к городской
for (let i = 0; i < 12 * 30; i++) ai.step(v, 1 / 30, ctx);
const after = run(4);
console.log(`  ${after <= 15 ? '✓' : '✗'} после паники: снова ${(after * 3.6).toFixed(0)} км/ч`);
if (after > 15) bad++;

// отдельно: красный свет у перекрёстка — обычный водитель стоит, паникующий едет
{
  const lightNode = L.nodes.find((n) => n.light && !n.dead && n.gi === 3 && n.gj === 6);
  if (lightNode) {
    const before = L.adj[lightNode.id][0];
    const vv = fakeV(lightNode.x, lightNode.z + 12);
    const a2 = new AIDriver();
    a2.mode = 'wander'; a2.route = [before.n, lightNode.id, L.adj[lightNode.id].find((e) => e.n !== before.n)!.n];
    let stopT = 99;
    for (let i = 0; i < 60; i++) stopT = Math.min(stopT, a2.step(vv, 1 / 30, ctx).target);
    const okStop = stopT < 6;
    console.log(`  ${okStop ? '✓' : '✗'} красный свет: обычный водитель сбрасывает скорость (${(stopT * 3.6).toFixed(0)} км/ч)`);
    if (!okStop) bad++;
    a2.panic(vv.x, vv.z, 8);
    let goT = 0;
    for (let i = 0; i < 90; i++) goT = Math.max(goT, a2.step(vv, 1 / 30, ctx).target);
    const okGo = goT > 18;
    console.log(`  ${okGo ? '✓' : '✗'} красный свет в панике игнорируется (${(goT * 3.6).toFixed(0)} км/ч)`);
    if (!okGo) bad++;
  }
}

// Обгон: впереди медленная машина, а встречная полоса должна быть свободной.
{
  const a = L.nodes.find(n => n.gi === 2 && n.gj === 2)!;
  const b = L.nodes.find(n => n.gi === 3 && n.gj === 2)!;
  const c = L.nodes.find(n => n.gi === 4 && n.gj === 2)!;
  const runCase = (oncoming: boolean) => {
    const car = fakeV(a.x + 5, a.z + 3); car.heading = Math.PI / 2; car.speed = 10;
    const slow = fakeV(a.x + 20, a.z + 3); slow.heading = Math.PI / 2; slow.speed = 2;
    const other = fakeV(a.x + 40, a.z - 3); other.heading = -Math.PI / 2; other.speed = 10;
    const driver = new AIDriver(); driver.route = [a.id, b.id, c.id];
    return driver.step(car, 0.5, { ...ctx, lightState: () => 'green', vehicles: oncoming ? [car, slow, other] : [car, slow] });
  };
  const free = runCase(false), blocked = runCase(true);
  const ok = free.desired > blocked.desired + 0.05;
  console.log(`  ${ok ? '✓' : '✗'} объезд медленной машины только при свободной встречной полосе`);
  if (!ok) bad++;
}
// Решение нарушить красный выбирается один раз на перекрёсток, а не каждый кадр.
{
  const light = L.nodes.find(n => n.gi === 3 && n.gj === 6)!;
  const before = L.adj[light.id][0].n, after = L.adj[light.id].find(e => e.n !== before)!.n;
  const a = L.nodes[before], dx = light.x - a.x, dz = light.z - a.z, len = Math.hypot(dx, dz);
  const car = fakeV(light.x - dx / len * 12 - dz / len * 3, light.z - dz / len * 12 + dx / len * 3);
  car.heading = Math.atan2(dx, dz);
  const driver = new AIDriver(); driver.route = [before, light.id, after]; driver.trafficViolations = true;
  const result = driver.step(car, 0.1, { ...ctx, rand: () => 0 });
  const ok = result.target > 6;
  console.log(`  ${ok ? '✓' : '✗'} редкое нарушение красного у обычного трафика`);
  if (!ok) bad++;
}

console.log(bad ? '✗ поведение водителей не то' : '  ✓ водители уходят от опасности и возвращаются к спокойной езде');
process.exit(bad ? 1 : 0);
