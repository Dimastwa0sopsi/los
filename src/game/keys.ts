// Единая карта управления.
// Одна клавиша — одно действие в своём контексте: здесь же справка «Как играть?»
// и проверка `npm run check:keys` (в одном контексте не может быть двух одинаковых клавиш).
//
// Контексты: foot (пешком), car (за рулём), heli (вертолёт), ui (глобальные панели).

export type Ctx = 'ui' | 'foot' | 'car' | 'heli';

/** физические коды (e.code): работают в любой раскладке */
export const K = {
  // глобально
  phone: 'Tab',
  chat: 'KeyT',
  music: 'KeyU',
  help: 'F1',
  pause: 'Escape',
  map: 'KeyM',
  inventory: 'KeyI',
  camera: 'KeyV',
  online: 'Backquote',
  promo: 'BracketRight',
  dances: 'Slash',
  // пешком
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  jump: 'Space',
  crouch: 'KeyC',
  interact: 'KeyE',
  work: 'KeyR',
  rob: 'KeyL',
  reload: 'KeyG',
  cover: 'KeyQ',
  // за рулём
  handbrake: 'Space',
  lights: 'KeyH',
  horn: 'KeyN',
  hazard: 'KeyO',
  autopilot: 'KeyZ',
  cruise: 'KeyJ',
  race: 'KeyK',
  wheelie: 'KeyX',
  hydroJump: 'KeyY',
  hydroUp: 'PageUp',
  hydroDown: 'PageDown',
  // вертолёт
  heliUp: 'KeyQ',
  heliDown: 'KeyE',
} as const;

export type Action = keyof typeof K;

export type Binding = { ctx: Ctx; code: string; action: Action; what: string; note?: string };

/** полная таблица: её же рисует справка */
export const BINDINGS: Binding[] = [
  // ---- UI ----
  { ctx: 'ui', code: K.phone, action: 'phone', what: 'телефон: карта, работа, объявления, банк' },
  { ctx: 'ui', code: K.chat, action: 'chat', what: 'чат и команды · /help — список команд' },
  { ctx: 'ui', code: K.music, action: 'music', what: 'музыка и радио — где угодно' },
  { ctx: 'ui', code: K.help, action: 'help', what: 'эта справка в любой момент' },
  { ctx: 'ui', code: K.pause, action: 'pause', what: 'пауза и настройки' },
  { ctx: 'ui', code: K.map, action: 'map', what: 'карта города' },
  { ctx: 'ui', code: K.inventory, action: 'inventory', what: 'инвентарь' },
  { ctx: 'ui', code: K.camera, action: 'camera', what: 'вид от первого / третьего лица' },
  { ctx: 'ui', code: K.online, action: 'online', what: 'меню онлайна' },
  { ctx: 'ui', code: K.dances, action: 'dances', what: 'танцы и эмоции' },
  // ---- пешком ----
  { ctx: 'foot', code: K.forward, action: 'forward', what: 'идти вперёд (WASD)' },
  { ctx: 'foot', code: K.run, action: 'run', what: 'бег — тратит бодрость' },
  { ctx: 'foot', code: K.jump, action: 'jump', what: 'прыжок' },
  { ctx: 'foot', code: K.crouch, action: 'crouch', what: 'присесть: тише, ниже, не видно в окне' },
  { ctx: 'foot', code: K.interact, action: 'interact', what: 'действие рядом: войти, купить, сесть' },
  { ctx: 'foot', code: K.work, action: 'work', what: 'смена на работе (у кассы, у станка)' },
  { ctx: 'foot', code: K.rob, action: 'rob', what: 'ограбить кассу (если есть чем)' },
  { ctx: 'foot', code: K.reload, action: 'reload', what: 'перезарядка' },
  { ctx: 'foot', code: K.cover, action: 'cover', what: 'укрытие за стенами и машинами' },
  // ---- за рулём ----
  { ctx: 'car', code: K.forward, action: 'forward', what: 'газ (W), S — тормоз и задний ход' },
  { ctx: 'car', code: K.handbrake, action: 'handbrake', what: 'ручник: вместе с рулём — дрифт' },
  { ctx: 'car', code: K.lights, action: 'lights', what: 'фары' },
  { ctx: 'car', code: K.horn, action: 'horn', what: 'сигнал — пешеходы разбегаются' },
  { ctx: 'car', code: K.hazard, action: 'hazard', what: 'аварийка' },
  { ctx: 'car', code: K.autopilot, action: 'autopilot', what: 'автопилот по GPS-маршруту' },
  { ctx: 'car', code: K.cruise, action: 'cruise', what: 'круиз-контроль' },
  { ctx: 'car', code: K.race, action: 'race', what: 'уличная гонка' },
  { ctx: 'car', code: K.wheelie, action: 'wheelie', what: 'вили на мотоцикле' },
  { ctx: 'car', code: K.hydroJump, action: 'hydroJump', what: 'гидро-прыжок (если куплена гидравлика)' },
  { ctx: 'car', code: K.hydroUp, action: 'hydroUp', what: 'поднять подвеску' },
  { ctx: 'car', code: K.hydroDown, action: 'hydroDown', what: 'опустить подвеску' },
  // ---- вертолёт ----
  { ctx: 'heli', code: K.heliUp, action: 'heliUp', what: 'набрать высоту' },
  { ctx: 'heli', code: K.heliDown, action: 'heliDown', what: 'снизиться' },
];

const PRETTY: Record<string, string> = {
  Space: 'Пробел', ShiftLeft: 'Shift', ControlLeft: 'Ctrl', Escape: 'Esc', Backquote: '`',
  BracketRight: ']', Backslash: '\\', Slash: '/', PageUp: 'PgUp', PageDown: 'PgDn', Enter: 'Enter', Tab: 'Tab',
};

/** как клавишу показать игроку */
export function keyLabel(code: string): string {
  if (PRETTY[code]) return PRETTY[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** строки справки для контекста (в порядке таблицы) */
export function bindingsFor(ctx: Ctx) {
  return BINDINGS.filter((b) => b.ctx === ctx).map((b) => ({ key: keyLabel(b.code), what: b.what, action: b.action }));
}

/** поиск действия по коду клавиши в контексте */
export function actionOf(ctx: Ctx, code: string): Action | undefined {
  return BINDINGS.find((b) => b.ctx === ctx && b.code === code)?.action;
}

/** проверка: в одном контексте не должно быть двух действий на одной клавише */
export function duplicateKeys(): string[] {
  const seen = new Map<string, string>();
  const dup: string[] = [];
  for (const b of BINDINGS) {
    const id = `${b.ctx}:${b.code}`;
    const prev = seen.get(id);
    if (prev) dup.push(`${b.ctx}: ${keyLabel(b.code)} — ${prev} и ${b.action}`);
    else seen.set(id, b.action);
  }
  return dup;
}
