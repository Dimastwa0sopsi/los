import { useState } from 'react';
import { getServerUrl } from '../game/net';

type Action = { id: string; g: string; t: string; need?: boolean; confirm?: boolean; text?: boolean; target?: boolean; xy?: boolean; number?: boolean; house?: boolean; car?: boolean; item?: boolean };
type Player = { name: string; money: number };
type State = { players: Player[]; online: string[]; actions: Action[]; groups: Record<string, string>; log: unknown[]; money: { amount: number; cap: number; step: number }; server: { version: string; uptime: number } };
type Catalog = { items: { id: string; name: string; icon: string }[]; actions: Action[]; kits: string[] };
type Result = { ok: boolean; error?: string; message?: string; rows?: unknown[]; [key: string]: unknown };
const sections: [string, string, string[]][] = [
  ['players', '👥 Игроки', ['player', 'tp']], ['money', '💵 Деньги', ['money']],
  ['items', '🎁 Инвентарь', ['give', 'kit']], ['car', '🚗 Транспорт', ['car']],
  ['chat', '📢 Чат и СМИ', ['chat']], ['mod', '🛡 Модерация', ['mod']],
  ['server', '🖥 Сервер', ['server', 'event']], ['log', '📜 Логи', []],
];

export function AdminPanel() {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('players');
  const [query, setQuery] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [searchAction, setSearchAction] = useState('');
  const [danger, setDanger] = useState(false);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [x, setX] = useState('0'); const [z, setZ] = useState('0');
  const [number, setNumber] = useState(''); const [house, setHouse] = useState('house_1'); const [carId, setCarId] = useState('volga');
  const [amount, setAmount] = useState('1000'); const [cap, setCap] = useState('1000000'); const [step, setStep] = useState('1000'); const [defaultAmount, setDefaultAmount] = useState('1000');
  const [item, setItem] = useState(''); const [qty, setQty] = useState('1');
  const [message, setMessage] = useState(''); const [history, setHistory] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const base = getServerUrl().replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');

  async function request(path: string, body?: object): Promise<Result> {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-token': token, 'ngrok-skip-browser-warning': '1' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json() as Result;
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }
  async function refresh() {
    const data = await request('/admin/state') as unknown as State;
    setState(data); // selected хранится отдельно, обновление его не меняет
    return data;
  }
  async function connect() {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      const [data, items] = await Promise.all([refresh(), request('/admin/items') as unknown as Promise<Catalog>]);
      setCatalog(items); setItem(items.items[0]?.id || '');
      setDefaultAmount(String(data.money.amount)); setCap(String(data.money.cap)); setStep(String(data.money.step));
      setConnected(true); setMessage('Подключено');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Нет связи с сервером'); }
    finally { setBusy(false); }
  }
  async function runAction(a: Action, extra: object = {}) {
    if (busy) return;
    if (a.id === 'money_give' && 'amount' in extra && (!Number((extra as { amount: number }).amount) || Number((extra as { amount: number }).amount) < 0)) { setMessage('Сумма должна быть больше нуля'); return; }
    if (a.need && !selected) { setMessage('Сначала выберите игрока'); return; }
    if (a.confirm && (!danger || !window.confirm(`Подтвердить: ${a.t}?`))) { setMessage('Опасное действие отменено'); return; }
    if (a.text && !text.trim()) { setMessage('Введите текст сообщения'); return; }
    if (a.target && !target) { setMessage('Выберите другого игрока'); return; }
    if (a.number && !number.trim()) { setMessage('Введите номер машины'); return; }
    if (a.item && !item) { setMessage('Выберите предмет'); return; }
    setBusy(true);
    try {
      const res = a.id === 'inv_view'
        ? await request('/admin/inventory?name=' + encodeURIComponent(selected))
        : await request('/admin/action', { action: a.id, ...(a.need ? { name: selected } : {}), text, target, reason: reason || 'Нарушение правил', x: Number(x), z: Number(z), number, house, carId, item, qty: Math.max(1, Number(qty) || 1), ...extra });
      const result = [res.message || 'Готово', ...(res.rows || []).map(String)].join(' · ');
      setMessage(result); setHistory(h => [`${a.t}${selected && a.need ? ' · ' + selected : ''}: ${result}`, ...h].slice(0, 30));
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Нет связи с сервером'); }
    finally { setBusy(false); }
  }
  async function saveMoney() {
    setBusy(true);
    try { await request('/admin/money', { amount: Number(defaultAmount), cap: Number(cap), step: Number(step) }); await refresh(); setMessage('Настройки сохранены'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  }
  const actions = [...(state?.actions || []), ...(catalog?.actions || [])];
  const groups = sections.find(s => s[0] === tab)?.[2] || [];
  const visible = actions.filter(a => groups.includes(a.g) && (a.t + ' ' + a.id).toLowerCase().includes(searchAction.toLowerCase()));
  const players = (state?.players || []).filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (!onlineOnly || state?.online.includes(p.name)));
  const input = (label: string, value: string, set: (s: string) => void, type = 'text') => <label className="adm-label">{label}<input className="lg-input" type={type} value={value} onChange={e => set(e.target.value)} /></label>;
  return <div className="tb-pad adm-panel">
    {!connected ? <><p>Введите админ-токен сервера. Он хранится только до закрытия панели.</p>{input('Админ-токен', token, setToken, 'password')}<button className="ui-btn" disabled={busy || !token} onClick={() => void connect()}>🔌 Подключиться</button><small>Адрес: {base}</small></> : <>
      <div className="adm-status">🟢 {state?.online.length || 0} в сети · {state?.players.length || 0} аккаунтов · v{state?.server?.version || '?'}<br /><button className="ui-btn sm" disabled={busy} onClick={() => { void refresh().catch(e => setMessage(String(e))); }}>🔄 Обновить</button> <button className="ui-btn sm" onClick={() => { setConnected(false); setToken(''); setState(null); }}>Отключиться</button></div>
      {input('Поиск игрока', query, setQuery)}<label><input type="checkbox" checked={onlineOnly} onChange={e => setOnlineOnly(e.target.checked)} /> Только онлайн</label>
      <select className="lg-input" aria-label="Выбранный игрок" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Выберите игрока</option>{selected && !players.some(p => p.name === selected) && <option value={selected}>{selected}</option>}{players.map(p => <option key={p.name} value={p.name}>{state?.online.includes(p.name) ? '🟢 ' : ''}{p.name} · ${Number(p.money || 0).toLocaleString('ru')}</option>)}</select>
      <b>Выбран: {selected || 'никто'}</b>
      <label><input type="checkbox" checked={danger} onChange={e => setDanger(e.target.checked)} /> Разрешить опасные действия</label>
      <div className="adm-buttons" aria-label="Быстрые действия">{['money_add_1k', 'money_add_10k', 'player_heal', 'player_feed', 'kit_start', 'tp_spawn'].map(id => actions.find(a => a.id === id)).filter((a): a is Action => !!a).map(a => <button className="ui-btn sm" disabled={busy} key={a.id} onClick={() => void runAction(a)}>{a.t}</button>)}</div>
      <div className="adm-tabs">{sections.map(([id, title]) => <button key={id} className={`ui-btn sm ${tab === id ? 'main' : ''}`} onClick={() => setTab(id)}>{title}</button>)}</div>
      {tab !== 'log' && <>{input('Поиск действия', searchAction, setSearchAction)}<details><summary>Параметры действий</summary>
        <label className="adm-label">К кому<select className="lg-input" value={target} onChange={e => setTarget(e.target.value)}><option value="">Выберите игрока</option>{state?.players.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
        {input('Причина', reason, setReason)}{input('Текст сообщения', text, setText)}{input('X', x, setX, 'number')}{input('Z', z, setZ, 'number')}{input('Номер машины', number, setNumber)}{input('Дом', house, setHouse)}{input('Авто ID', carId, setCarId)}
      </details></>}
      {tab === 'money' && <><h4>Любая сумма</h4>{input('Сумма $', amount, setAmount, 'number')}<div className="adm-buttons">{(['add', 'sub', 'set'] as const).map((mode, i) => <button key={mode} className="ui-btn sm" disabled={busy} onClick={() => void runAction({ id: 'money_give', g: 'money', t: ['Выдать', 'Забрать', 'Установить'][i], need: true }, { amount: Number(amount), mode })}>{['➕ Выдать', '➖ Забрать', '🎯 Установить'][i]}</button>)}</div></>}
      {tab === 'items' && <><label className="adm-label">Предмет<select className="lg-input" value={item} onChange={e => setItem(e.target.value)}>{catalog?.items.map(i => <option key={i.id} value={i.id}>{i.icon} {i.name}</option>)}</select></label>{input('Количество', qty, setQty, 'number')}</>}
      {tab === 'server' && <><h4>Настройки денег</h4>{input('Выдача $', defaultAmount, setDefaultAmount, 'number')}{input('Потолок $', cap, setCap, 'number')}{input('Шаг $', step, setStep, 'number')}<button className="ui-btn sm" disabled={busy} onClick={() => void saveMoney()}>💾 Сохранить</button><button className="ui-btn sm" disabled={busy} onClick={() => { void request('/admin/publish', {}).then(r => setMessage(r.message || 'Опубликовано')).catch(e => setMessage(String(e))); }}>📡 Опубликовать ссылку</button></>}
      {tab === 'log' ? <><h4>История панели</h4>{history.map((h, i) => <p key={i}>{h}</p>)}<h4>Журнал сервера</h4>{state?.log.map((l, i) => <p key={i}>{typeof l === 'string' ? l : JSON.stringify(l)}</p>)}</> : groups.map(group => <div key={group}><h4>{state?.groups[group] || (group === 'give' ? '🎁 Предметы' : group === 'kit' ? '📦 Наборы' : group)}</h4><div className="adm-buttons">{visible.filter(a => a.g === group).map(a => <button className="ui-btn sm" disabled={busy} key={a.id} onClick={() => void runAction(a)}>{a.t}</button>)}</div></div>)}
    </>}
    {message && <p className="adm-message" role="status">{message}</p>}
  </div>;
}
