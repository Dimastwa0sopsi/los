import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/game';

/** вибро-отклик на касание (если телефон поддерживает) */
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* нет поддержки — молча */ } };

/**
 * Реестр нажатий по pointerId. Одна кнопка может держаться, палец — уезжать
 * куда угодно: отпускание ловим на window, поэтому «залипших» газа и огня нет.
 */
const presses = new Map<number, () => void>();
let bound = false;
function bindGlobalRelease() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  const fire = (e: Event) => { const id = (e as PointerEvent).pointerId; const f = presses.get(id); if (!f) return; presses.delete(id); try { f(); } catch { /* */ } };
  const all = () => { for (const [, f] of presses) { try { f(); } catch { /* */ } } presses.clear(); };
  // capture-фаза: срабатывает даже если палец ушёл с кнопки или её перекрыли
  window.addEventListener('pointerup', fire, true);
  window.addEventListener('pointercancel', fire, true);
  window.addEventListener('blur', all);
  document.addEventListener('visibilitychange', () => { if (document.hidden) all(); });
}
const releaseAll = () => { for (const [, f] of presses) { try { f(); } catch { /* */ } } presses.clear(); };

/** круглая «стеклянная» кнопка: hold — держать (газ/огонь), иначе тап */
function Btn({ g, name, ico, sub, hold = true, cls = '', onTap, active, label }: {
  g: Game; name?: string; ico: string; sub?: string; hold?: boolean; cls?: string; onTap?: () => void; active?: boolean; label?: string;
}) {
  const [on, setOn] = useState(false);
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (onTap) {
      // кнопки меню работают даже когда ввод приостановлен (например, открыт чат)
      buzz(6); setOn(true); setTimeout(() => setOn(false), 120); onTap();
      return;
    }
    if (!g.input.enabled) return;
    buzz(6);
    if (name) {
      if (hold) {
        g.input.setV(name, true);
        presses.set(e.pointerId, () => { g.input.setV(name, false); setOn(false); });
      } else {
        g.input.tapV(name);
        setTimeout(() => setOn(false), 130);
      }
    }
    setOn(true);
  };
  const up = (e: React.PointerEvent) => {
    const f = presses.get(e.pointerId);
    if (f) { presses.delete(e.pointerId); f(); }
    setOn(false);
  };
  return (
    <button className={`mui-btn ${cls} ${on || active ? 'on' : ''}`} onPointerDown={down} onPointerUp={up}
      onPointerCancel={up} onContextMenu={(e) => e.preventDefault()} aria-label={label ?? sub ?? name}>
      <span className="mui-ico">{ico}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** крестовина вместо джойстика: диагонали — двумя зажатыми стрелками */
function Dpad({ g }: { g: Game }) {
  const dirs = useRef(new Set<string>());
  const [, force] = useState(0);
  const apply = () => {
    let x = 0, y = 0;
    if (dirs.current.has('l')) x -= 1; if (dirs.current.has('r')) x += 1;
    if (dirs.current.has('u')) y += 1; if (dirs.current.has('d')) y -= 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    g.input.joy.x = x; g.input.joy.y = y; force((n) => n + 1);
  };
  const press = (d: string, on: boolean) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (on) {
      if (!g.input.enabled) return;
      buzz(5);
      bindGlobalRelease();
      dirs.current.add(d);
      presses.set(e.pointerId, () => { dirs.current.delete(d); apply(); });
    } else {
      dirs.current.delete(d);
      presses.delete(e.pointerId);
    }
    apply();
  };
  const Key = ({ d, ico }: { d: string; ico: string }) => (
    <button className={`mui-btn mini dpadk ${dirs.current.has(d) ? 'on' : ''}`} aria-label={d}
      onPointerDown={press(d, true)} onPointerUp={press(d, false)} onPointerCancel={press(d, false)}>
      <span className="mui-ico">{ico}</span>
    </button>
  );
  useEffect(() => () => { g.input.joy.x = 0; g.input.joy.y = 0; }, [g]);
  return (
    <div className="mui-dpad">
      <span /><Key d="u" ico="▲" /><span />
      <Key d="l" ico="◀" /><span className="mui-dpad-mid" /><Key d="r" ico="▶" />
      <span /><Key d="d" ico="▼" /><span />
    </div>
  );
}

type Tile = { ico: string; label: string; on: () => void };
type Group = { title: string; tiles: Tile[] };

/** подсказка «поверните телефон» — один раз, запоминаем в localStorage */
const ROT_KEY = 'los.rotate.hint';

export function MobileControls({ g, hud }: { g: Game; hud: HudState }) {
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const [run, setRun] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rot, setRot] = useState(() => {
    try {
      if (localStorage.getItem(ROT_KEY)) return false;
      return window.innerHeight > window.innerWidth;   // портрет — предложим повернуть
    } catch { return false; }
  });
  const look = useRef(new Map<number, { x: number; y: number }>());
  const v = hud.vehicle;

  useEffect(() => { bindGlobalRelease(); return releaseAll; }, []);
  // повернули в горизонталь — подсказка больше не нужна
  useEffect(() => {
    const onRot = () => { if (window.innerWidth > window.innerHeight) { setRot(false); try { localStorage.setItem(ROT_KEY, '1'); } catch { /* */ } } };
    window.addEventListener('resize', onRot);
    window.addEventListener('orientationchange', onRot);
    return () => { window.removeEventListener('resize', onRot); window.removeEventListener('orientationchange', onRot); };
  }, []);

  const hideRot = () => { setRot(false); try { localStorage.setItem(ROT_KEY, '1'); } catch { /* */ } };

  const resetStick = () => { stickId.current = null; g.input.joy.x = 0; g.input.joy.y = 0; setKnob({ x: 0, y: 0 }); };
  useEffect(() => resetStick, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stickMove = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return;
    const el = stickRef.current;
    if (!el || !g.input.enabled) { resetStick(); return; }
    const r = el.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const dz = (x: number) => (Math.abs(x) < 0.16 ? 0 : x);
    g.input.joy.x = dz(dx); g.input.joy.y = dz(-dy);
    setKnob({ x: dx * 46, y: dy * 46 });
  };
  const stickEnd = (e: React.PointerEvent) => { if (stickId.current !== e.pointerId) return; resetStick(); };
  const stickDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!g.input.enabled) return;
    bindGlobalRelease();
    stickId.current = e.pointerId;
    buzz(8);
    presses.set(e.pointerId, () => { if (stickId.current === e.pointerId) resetStick(); });
    stickMove(e);
  };

  // ---------- меню-шторка: сгруппированные плитки ----------
  const setS = <K extends keyof Game['settings']>(k: K, val: Game['settings'][K]) => g.setSettings({ ...g.settings, [k]: val });
  const groups: Group[] = [{
    title: 'Игра', tiles: [
      { ico: '🎒', label: 'Инвентарь', on: () => g.openPanel({ type: 'inventory' }) },
      { ico: '🗺️', label: 'Карта · GPS', on: () => g.openPanel({ type: 'map', mode: 'waypoint' }) },
      { ico: '🪪', label: 'Паспорт', on: () => g.openPanel({ type: 'passport' }) },
      { ico: '📜', label: 'Сюжет', on: () => g.openPanel({ type: 'quest' }) },
      { ico: '🎟️', label: 'Промокод', on: () => g.openPanel({ type: 'promo' }) },
      { ico: '📱', label: 'Телефон', on: () => g.openPanel({ type: 'phone' }) },
      { ico: '❓', label: 'Как играть?', on: () => g.openPanel({ type: 'help' }) },
      { ico: '⚙️', label: 'Настройки', on: () => g.openPanel({ type: 'settings' }) },
    ],
  }, {
    title: 'Общение и камера', tiles: [
      { ico: '💬', label: 'Чат', on: () => g.chatFocus?.() },
      { ico: '💃', label: 'Эмоции', on: () => g.openPanel({ type: 'emotes' }) },
      { ico: '🕺', label: 'Танцы', on: () => g.openPanel({ type: 'emotes', dance: true }) },
      { ico: hud.firstPerson ? '👁️' : '🎥', label: hud.firstPerson ? 'От 3-го лица' : 'От 1-го лица', on: () => g.toggleFirstPerson() },
    ],
  }, {
    title: 'Управление', tiles: [
      {
        ico: g.settings.moveStyle === 'pad' ? '🕹' : '✛',
        label: g.settings.moveStyle === 'pad' ? 'Крестовина → джойстик' : 'Джойстик → крестовина',
        on: () => setS('moveStyle', g.settings.moveStyle === 'pad' ? 'joy' : 'pad'),
      },
      {
        ico: '🔲', label: 'Во весь экран',
        on: () => {
          try {
            if (document.fullscreenElement) void document.exitFullscreen?.();
            else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
          } catch { /* браузер не разрешает — молча */ }
        },
      },
      {
        ico: '🖥', label: 'Это не телефон',
        on: () => { setS('control', 'pc'); g.toast('Управление: ПК (мышь и клавиатура). Вернуть — Настройки → Управление'); },
      },
    ],
  }];
  if (v && !v.passenger) groups.push({
    title: `Машина · ${v.name}`, tiles: [
      { ico: '🏁', label: hud.race ? 'Стоп гонку' : 'Уличная гонка', on: () => g.startRace() },
      { ico: '📻', label: 'Радио', on: () => g.openPanel({ type: 'radio' }) },
      { ico: '↯', label: hud.driftAssist ? 'Дрифт: вкл' : 'Дрифт-помощник', on: () => g.toggleDrift() },
      { ico: '🛞', label: v.cruise > 0 ? `Круиз ${Math.round(v.cruise * 3.6)} км/ч` : 'Круиз-контроль', on: () => { g.cruise = g.cruise > 0 ? 0 : Math.max(4.5, Math.abs(v.kmh / 3.6)); g.toast(g.cruise > 0 ? `Круиз-контроль: ${Math.round(g.cruise * 3.6)} км/ч` : 'Круиз-контроль выключен'); } },
      ...(v.canHydro ? [
        { ico: '🛠', label: 'Подвеска вверх', on: () => g.hydroUp() },
        { ico: '🔧', label: 'Подвеска вниз', on: () => g.hydroDown() },
        { ico: '⏫', label: 'Гидро-прыжок', on: () => g.hydroJump() },
      ] : []),
    ],
  });

  /** подсказка действия для большой кнопки E: обрезаем служебный префикс */
  const actLabel = hud.prompt ? hud.prompt.replace(/^(E|F|R|L)\s*—\s*/, '').replace(/[·•].*$/, '').trim().slice(0, 26) : 'действие';

  return (
    <div className="mui">
      {/* обзор: свайп по правой части, щипок двумя пальцами — зум */}
      <div className="mui-look"
        onPointerDown={(e) => {
          const el = e.currentTarget as HTMLElement;
          try { el.setPointerCapture(e.pointerId); } catch { /* не критично */ }
          bindGlobalRelease();
          look.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          presses.set(e.pointerId, () => look.current.delete(e.pointerId));
        }}
        onPointerMove={(e) => {
          const m = look.current; const p = m.get(e.pointerId); if (!p) return;
          if (m.size >= 2) {
            const o = [...m.entries()].find(([id]) => id !== e.pointerId)![1];
            const before = Math.hypot(p.x - o.x, p.y - o.y), after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
            g.input.zoomDelta += (before - after) * 0.03;
          } else { g.input.lookDX += e.clientX - p.x; g.input.lookDY += e.clientY - p.y; }
          m.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerUp={(e) => { look.current.delete(e.pointerId); presses.delete(e.pointerId); }}
        onPointerCancel={(e) => { look.current.delete(e.pointerId); presses.delete(e.pointerId); }} />

      {/* верх справа: системные кнопки (слева — мини-карта HUD) */}
      <div className="mui-top">
        <Btn g={g} ico="📱" hold={false} onTap={() => { buzz(); g.openPanel({ type: 'phone' }); }} cls="glass" label="Телефон" />
        <Btn g={g} ico="💬" hold={false} onTap={() => { buzz(); g.chatFocus?.(); }} cls="glass" label="Чат" />
        <Btn g={g} ico={menu ? '✕' : '☰'} hold={false} onTap={() => { setMenu(!menu); buzz(10); }} cls={`glass ${menu ? 'on' : ''}`} label="Меню" />
      </div>

      {/* портрет: подсказка повернуть телефон (один раз) */}
      {rot && (
        <div className="mui-rot">
          <span>📱↻</span>
          <div><b>Поверните телефон горизонтально</b><small>Кнопок станет больше и они не будут мешать друг другу</small></div>
          <button className="mui-rot-x" onPointerDown={(e) => { e.preventDefault(); hideRot(); }}>✕</button>
        </div>
      )}

      {/* шторка: группы плиток */}
      {menu && (
        <>
          <div className="mui-sheet-back" onPointerDown={() => setMenu(false)} />
          <div className="mui-sheet">
            <div className="mui-sheet-head"><b>Быстрое меню</b><button className="mui-x" onPointerDown={() => setMenu(false)}>✕</button></div>
            {groups.map((gr) => (
              <div key={gr.title} className="mui-group">
                <h5>{gr.title}</h5>
                <div className="mui-grid">
                  {gr.tiles.map((q) => (
                    <button key={q.label} className="mui-tile" onPointerDown={(e) => { e.preventDefault(); buzz(6); setMenu(false); q.on(); }}>
                      <span>{q.ico}</span><small>{q.label}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* лево низ: движение — джойстик или крестовина (настройки → «Движение на телефоне») */}
      {g.settings.moveStyle === 'pad' ? (
        <div className="mui-move padwrap">
          <Dpad g={g} />
        </div>
      ) : (
        <div className="mui-move">
          <div className={`mui-stick ${knob.x || knob.y ? 'active' : ''}`} ref={stickRef}
            onPointerDown={stickDown}
            onPointerMove={stickMove} onPointerUp={stickEnd} onPointerCancel={stickEnd}>
            <span className="ring" />
            <span className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
          </div>
        </div>
      )}
      {!v && (
        <div className="mui-run">
          <Btn g={g} ico={run ? '🏃 бег' : '🚶 шаг'} hold={false} onTap={() => { const n = !run; setRun(n); buzz(8); g.input.setV('run', n); }} cls={`pill ${run ? 'on' : ''}`} active={run} />
        </div>
      )}

      {/* центр низ: большое контекстное действие E (+ R/L по ситуации) */}
      <div className="mui-ctx">
        {hud.promptKeys.includes('R') && <Btn g={g} name="work" ico="💼" sub="R" hold={false} cls="mini" />}
        <div className="mui-main-wrap">
          <Btn g={g} name="interact" ico="✋" hold={false} cls="ctx-big" />
          {g.settings.hints !== 'off' && <span className="mui-ctx-label">{actLabel}</span>}
        </div>
        {hud.promptKeys.includes('L') && <Btn g={g} name="rob" ico="💰" sub="L" hold={false} cls="mini red" />}
      </div>

      {/* право низ: боевые/дорожные действия */}
      {v ? (
        <div className="mui-right drive">
          {v.passenger ? (
            <>
              {hud.gun && <Btn g={g} name="fire" ico="🔫" cls="main red" />}
              {hud.gun && <Btn g={g} name="aim" ico="🎯" hold={false} cls="mid" />}
              <Btn g={g} name="enter" ico="🚪" sub="выйти" hold={false} cls="mid grey" />
            </>
          ) : (
            <>
              <div className="mui-arc col">
                {hud.gun && <Btn g={g} name="fire" ico="🔫" cls="main red" />}
                {hud.gun && <Btn g={g} name="aim" ico="🎯" hold={false} cls="mini" active={hud.gun.aiming} />}
                <Btn g={g} ico="↯" sub="дрифт" hold={false} onTap={() => g.toggleDrift()} cls="mini blue" active={hud.driftAssist} />
                {v.canHydro && <Btn g={g} ico="⏫" sub="гидро" hold={false} onTap={() => g.hydroJump()} cls="mini pink" />}
                {!v.heli && <Btn g={g} name="handbrake" ico="🅿" sub="ручник" cls="mini" />}
                {!v.heli && <Btn g={g} name="lights" ico="💡" hold={false} cls="mini" />}
                {!v.heli && <Btn g={g} name="horn" ico="📣" hold={false} cls="mini" />}
                {!v.heli && <Btn g={g} name="hazard" ico="⚠" hold={false} cls="mini" />}
                {!v.heli && <Btn g={g} name="gearUp" ico="＋" hold={false} cls="mini" />}
                {!v.heli && <Btn g={g} name="gearDown" ico="－" hold={false} cls="mini" />}
                {v.moto && <Btn g={g} name="wheelie" ico="🏍" sub="вили" cls="mini" />}
                {v.canAuto && <Btn g={g} name="autopilot" ico="🤖" hold={false} cls="mini" />}
                <Btn g={g} name="enter" ico="🚪" sub="выйти" hold={false} cls="mini grey" />
              </div>
              <div className="mui-pedals">
                <Btn g={g} name={v.heli ? 'up' : 'gas'} ico={v.heli ? '⬆' : 'ГАЗ'} sub={v.heli ? 'вверх' : undefined} cls="pedal green" />
                <Btn g={g} name={v.heli ? 'down' : 'brake'} ico={v.heli ? '⬇' : 'ТОРМ'} cls="pedal red" />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mui-right">
          <div className="mui-arc col top">
            {hud.gun
              ? <><Btn g={g} name="aim" ico="🎯" hold={false} cls="mid" active={hud.gun.aiming} /><Btn g={g} name="reload" ico="⟳" hold={false} cls="mini" /></>
              : <><Btn g={g} name="jump" ico="⤒" hold={false} cls="mid blue" /><Btn g={g} name="block" ico="🛡" hold cls="mini grey" /></>}
            <Btn g={g} name="crouch" ico={hud.crouch ? '🧍' : '🧎'} hold={false} cls="mini" active={hud.crouch} />
            <Btn g={g} name="weapon" ico="⇄" sub={hud.weapon === 'none' ? undefined : ''} hold={false} cls="mini" />
            <Btn g={g} name="qmod" ico={hud.cover ? '🚪' : '🧱'} hold={false} cls="mini" active={hud.cover} />
          </div>
          <div className="mui-main-wrap">
            {hud.gun
              ? <Btn g={g} name="fire" ico="🔫" cls="main red" />
              : <Btn g={g} name="attack" ico="👊" cls="main red" />}
            <span className="mui-main-hint">{hud.gun ? 'огонь' : 'удар'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
