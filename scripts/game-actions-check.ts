/* Поведение контекстных клавиш и замка бани без запуска WebGL. */
import './domstub';
import { Game } from '../src/game/game';
import { generateLayout } from '../src/game/worldgen';
import { K } from '../src/game/keys';
import { buildInterior } from '../src/game/interiors';

const L = generateLayout();
const bath = L.buildings.find(b => b.kind === 'banya' && b.bathOwner !== undefined)!;
const owner = bath.bathOwner!;
let errors = 0;
const test = (name: string, ok: boolean) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) errors++; };
const g = Object.create(Game.prototype) as any;
g.state = { properties: [`${owner}:0`], locks: {}, location: null, money: 0 };
g.L = L; g.toast = () => {}; g.save = () => {}; g.sound = { door: () => {} }; g.netN = 0;
g.setInterior = (it: any) => { it.dispose(); g.entered = true; };
g.toggleBathLock(owner);
test('хозяин закрывает баню отдельным замком', g.state.locks[`bath:${owner}`] === true);
g.entered = false; g.enterBuilding(bath, true);
test('хозяин входит в свою закрытую баню', g.entered && g.state.location.b === bath.id);
g.state.properties = []; g.state.location = null;
g.takenBy = (id: string) => id === `${owner}:0` ? { name: 'Хозяин', locked: false } : id === `bath:${owner}` ? { name: 'Хозяин', locked: true } : null;
g.entered = false; g.enterBuilding(bath, true);
test('гость не входит в запертую баню', !g.entered);
g.takenBy = (id: string) => id === `${owner}:0` ? { name: 'Хозяин', locked: false } : id === `bath:${owner}` ? { name: 'Хозяин', locked: false } : null;
g.enterBuilding(bath, true);
test('гость входит в открытую баню', g.entered);
g.toggleBathLock(owner);
test('гость не может изменить замок', g.state.locks[`bath:${owner}`] === true);

const inputTest = (key: string, keys: string[], inVehicle = false, mobile = false) => {
  const h = Object.create(Game.prototype) as any;
  let enter = 0, action = 0, exit = 0;
  h.input = { down: () => false, vDown: () => false, pressed: (k: string) => !mobile && k === key, vPressed: (k: string) => mobile && k === 'interact', lookDX: 0, lookDY: 0, zoomDelta: 0 };
  h.settings = { sensitivity: 1 }; h.mobile = false; h.camMode = false; h.rideRemote = null; h.inVeh = inVehicle ? { isHeli: false } : null; h.passenger = true; h.lastLook = 0;
  h.prompt = { keys, act: () => action++ }; h.tryEnterVehicle = () => enter++; h.exitVehicle = () => exit++;
  h.handleInput(0.1);
  return { enter, action, exit };
};
let r = inputTest(K.interact, ['F']); test('E не сажает в машину', r.enter === 0 && r.action === 0);
r = inputTest(K.enterVehicle, ['F']); test('F сажает в машину', r.enter === 1 && r.action === 0);
r = inputTest(K.interact, ['E']); test('E выполняет действие', r.enter === 0 && r.action === 1);
r = inputTest(K.interact, [], true); test('E не выводит из машины', r.exit === 0);
r = inputTest(K.enterVehicle, [], true); test('F позволяет выйти из машины', r.exit === 1);
r = inputTest('', ['F'], false, true); test('контекстная кнопка телефона сажает в машину', r.action === 1);
{
  const h = Object.create(Game.prototype) as any;
  let selection: any = null, called = '';
  h.input = { down: () => false, vDown: () => false, pressed: (k: string) => k === K.interact, vPressed: () => false, lookDX: 0, lookDY: 0, zoomDelta: 0 };
  h.settings = { sensitivity: 1 }; h.mobile = false; h.camMode = false; h.rideRemote = null; h.inVeh = null; h.lastLook = 0;
  h.prompt = { text: 'E — войти · L — запереть', keys: ['E', 'L'], act: () => { called = 'enter'; }, l: () => { called = 'lock'; } };
  h.openPanel = (p: any) => { selection = p; };
  h.handleInput(0.1);
  test('E открывает выбор для нескольких действий', selection?.type === 'context' && selection.choices.length === 2 && selection.choices[1].label === 'запереть');
  selection.choices[1].run(); test('дополнительное действие доступно через E', called === 'lock');
}
{
  const h = Object.create(Game.prototype) as any;
  const it = buildInterior('house_village');
  const sofa = it.seats.filter(s => s.kind === 'sofa');
  test('в доме есть два места на диване, компьютер и туалет', sofa.length === 2 && it.seats.some(s => s.kind === 'computer') && it.seats.some(s => s.kind === 'toilet'));
  h.interior = it; h.state = { location: { b: 10 } }; h.remotes = new Map(); h.px = sofa[0].x - 1; h.pz = sofa[0].z; h.toast = () => {}; h.fallT = 0; h.lying = false;
  const start = { x: h.px, z: h.pz };
  h.toggleFurnitureSeat(); test('можно сесть на диван', h.furnitureSeat?.seat === sofa[0]);
  h.toggleFurnitureSeat(); test('можно встать на прежнее место', !h.furnitureSeat && h.px === start.x && h.pz === start.z);
  h.remotes.set(1, { ikey: h.interiorKey(), visible: true, x: sofa[0].x, z: sofa[0].z });
  h.toggleFurnitureSeat(); test('занятое другим игроком место не выбирается', h.furnitureSeat?.seat === sofa[1]);
  it.dispose();
  const bathInterior = buildInterior('banya');
  test('в бане два места на диване', bathInterior.seats.filter(s => s.kind === 'sofa').length === 2);
  bathInterior.dispose();
}
process.exit(errors ? 1 : 0);
