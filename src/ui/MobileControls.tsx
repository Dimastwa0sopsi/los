import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/game';
import { PAD_BUTTONS, PAD_DEFAULT, PAD_LABEL, type Settings } from '../game/config';

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

/** кнопка правой панели по id из настроек: одна точка правды для раскладки */
function padBtn(g: Game, id: string, hud: HudState, v: HudState['vehicle'] | null) {
  switch (id) {
    case 'jump': return <Btn key={id} g={g} name="jump" ico="⤒" hold={false} cls="mid blue" />;
    case 'crouch': return <Btn key={id} g={g} name="crouch" ico={hud.crouch ? '🧍' : '🧎'} hold={false} cls="mini" active={hud.crouch} />;
    case 'block': return <Btn key={id} g={g} name="block" ico="🛡" hold cls="mini grey" />;
    case 'weapon': return <Btn key={id} g={g} name="weapon" ico="⇄" hold={false} cls="mini" />;
    case 'cover': return <Btn key={id} g={g} name="qmod" ico={hud.cover ? '🚪' : '🧱'} hold={false} cls="mini" active={hud.cover} />;
    case 'reload': return <Btn key={id} g={g} name="reload" ico="⟳" hold={false} cls="mini" />;
    case 'drift': return <Btn key={id} g={g} ico="↯" sub="дрифт" hold={false} onTap={() => g.toggleDrift()} cls="mini blue" active={hud.driftAssist} />;
    case 'hydro': return v?.canHydro ? <Btn key={id} g={g} ico="⏫" sub="гидро" hold={false} onTap={() => g.hydroJump()} cls="mini pink" /> : null;
    case 'handbrake': return <Btn key={id} g={g} name="handbrake" ico="🅿" sub="ручник" cls="mini" />;
    case 'lights': return <Btn key={id} g={g} name="lights" ico="💡" hold={false} cls="mini" />;
    case 'horn': return <Btn key={id} g={g} name="horn" ico="📣" hold={false} cls="mini" />;
    case 'hazard': return <Btn key={id} g={g} name="hazard" ico="⚠" hold={false} cls="mini" />;
    case 'gearUp': return <Btn key={id} g={g} name="gearUp" ico="＋" hold={false} cls="mini" />;
    case 'gearDown': return <Btn key={id} g={g} name="gearDown" ico="－" hold={false} cls="mini" />;
    case 'wheelie': return v?.moto ? <Btn key={id} g={g} name="wheelie" ico="🏍" sub="вили" cls="mini" /> : null;
    case 'autopilot': return v?.canAuto ? <Btn key={id} g={g} name="autopilot" ico="🤖" hold={false} cls="mini" /> : null;
    case 'exit': return <Btn key={id} g={g} name="enter" ico="🚪" sub="выйти" hold={false} cls="mini grey" />;
    default: return null;
  }
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
  const [tray, setTray] = useState<null | 'foot' | 'drive'>(null);
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
  // Отпускаем удержанные элементы при переходе пешком / водитель / пассажир.
  // Иначе скрытый джойстик или педаль могут продолжить рулить после посадки.
  const controlMode = !v ? 'foot' : v.passenger ? 'passenger' : 'driver';
  useEffect(() => { releaseAll(); resetStick(); g.input.releaseAll(); setRun(false); }, [controlMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      ...(v?.beltAvailable ? [{ ico: '🔒', label: v.belt ? 'Снять ремень' : 'Пристегнуть ремень', on: () => g.toggleSeatbelt() }] : []),
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

  // ---- раскладка правой панели из настроек ----
  const padCfg: { foot: string[]; drive: string[] } = {
    foot: g.settings.padFoot ?? PAD_DEFAULT.foot,
    drive: g.settings.padDrive ?? PAD_DEFAULT.drive,
  };
  const known = (grp: 'foot' | 'drive', id: string) => PAD_BUTTONS.some((b) => b.group === grp && b.id === id);
  const padIds = {
    foot: padCfg.foot.filter((id) => known('foot', id)),
    drive: padCfg.drive.filter((id) => known('drive', id)),
    moreFoot: PAD_BUTTONS.filter((b) => b.group === 'foot' && !padCfg.foot.includes(b.id)).map((b) => b.id),
    moreDrive: PAD_BUTTONS.filter((b) => b.group === 'drive' && b.id !== 'handbrake' && !padCfg.drive.includes(b.id)).map((b) => b.id),
  };
  const setPad = (grp: 'foot' | 'drive', id: string, on: boolean) => {
    const cur = [...(grp === 'foot' ? padIds.foot : padIds.drive)];
    const next = on ? [...cur, id] : cur.filter((x) => x !== id);
    const s2 = { ...g.settings } as Settings;
    if (grp === 'foot') s2.padFoot = next; else s2.padDrive = next;
    g.setSettings(s2);
  };

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
        {hud.online && <Btn g={g} ico={g.voice.active && !g.voice.listeningOnly ? '🎙️' : '🎤'} hold={false} onTap={() => g.toggleVoice()} cls="glass" active={g.voice.active && !g.voice.listeningOnly} label={g.voice.active && !g.voice.listeningOnly ? 'Выключить микрофон' : 'Включить микрофон'} />}
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

      {/* «ещё»: кнопки, которые не поместились в дугу — их можно включить в настройках */}
      {tray && (
        <>
          <div className="mui-sheet-back" onPointerDown={() => setTray(null)} />
          <div className={`mui-tray ${tray}`}>
            <div className="mui-tray-head">{tray === 'foot' ? 'Ещё действия' : 'Ещё в машине'}</div>
            <div className="mui-tray-grid">
              {(tray === 'foot' ? padIds.moreFoot : padIds.moreDrive).map((id) => (
                <button key={id} className="mui-tray-cell" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setPad(tray, id, true); setTray(null); buzz(8); }}>
                  <span className="mui-ico">{PAD_BUTTONS.find((b) => b.id === id)?.ico}</span>
                  <small>{PAD_LABEL[id] ?? id}</small>
                </button>
              ))}
            </div>
          </div>
        </>
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

      {/* Пешком — выбранное управление; за рулём — отдельные кнопки поворота. */}
      {controlMode === 'driver' ? (
        <div className="mui-move mui-steering">
          <Btn g={g} name="steerL" ico="◀" cls="mid" label="Руль влево" />
          <Btn g={g} name="steerR" ico="▶" cls="mid" label="Руль вправо" />
        </div>
      ) : controlMode === 'passenger' ? null : g.settings.moveStyle === 'pad' ? (
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
              <div className={`mui-arc ${g.settings.padStyle === 'grid' ? 'grid2' : 'col'}`}>
                {hud.gun && <Btn g={g} name="fire" ico="🔫" cls="main red" />}
                {hud.gun && <Btn g={g} name="aim" ico="🎯" hold={false} cls="mini" active={hud.gun.aiming} />}
                {padIds.drive.filter((id) => id !== 'handbrake').map((id) => (v.heli && ['handbrake', 'lights', 'horn', 'hazard', 'gearUp', 'gearDown'].includes(id) ? null : padBtn(g, id, hud, v)))}
                {padIds.moreDrive.length > 0 && (
                  <Btn g={g} ico="⋯" hold={false} cls={`mini ${tray === 'drive' ? 'on' : ''}`} onTap={() => setTray(tray === 'drive' ? null : 'drive')} label="Ещё кнопки" />
                )}
              </div>
              <div className="mui-pedals">
                {v.heli ? <>
                  <Btn g={g} name="up" ico="⬆" sub="вверх" cls="pedal green" />
                  <Btn g={g} name="down" ico="⬇" cls="pedal red" />
                </> : <>
                  <Btn g={g} name="handbrake" ico="🅿" sub="ручник" label="Ручник" cls="handbrake" />
                  <Btn g={g} name="brake" ico="ТОРМ" label="Тормоз" cls="pedal red" />
                  <Btn g={g} name="gas" ico="ГАЗ" label="Газ" cls="pedal green" />
                </>}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mui-right">
          <div className={`mui-arc ${g.settings.padStyle === 'grid' ? 'grid2' : 'col top'}`}>
            {hud.gun && <Btn g={g} name="aim" ico="🎯" hold={false} cls="mid" active={hud.gun.aiming} />}
            {padIds.foot.map((id) => padBtn(g, id, hud, null))}
            {padIds.moreFoot.length > 0 && (
              <Btn g={g} ico="⋯" hold={false} cls={`mini ${tray === 'foot' ? 'on' : ''}`} onTap={() => setTray(tray === 'foot' ? null : 'foot')} label="Ещё кнопки" />
            )}
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
