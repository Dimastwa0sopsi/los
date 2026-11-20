import { useEffect, useState } from 'react';
import { discoverServer } from '../game/discovery';
import menuBg from '../assets/menu.jpg';
import type { Game } from '../game/game';
import { ONLINE_URL, getServerUrl, hostOf, diagnoseServer, type ServerDiag } from '../game/net';
import { ensureServer } from '../game/discovery';
import { Modal } from './MenuScreens';

/** текст, который показываем, если сервер не отвечает */
export const SERVER_DOWN_TEXT = 'Сервер отключен, заходите позже';

export type JoinLaunch = { mode: 'solo' | 'online'; nick: string; gender: 'm' | 'f' };

/** модальное окно ошибки сети: само проверяет сервер и объясняет причину */
export function ServerDownModal({ text, onMenu, onRetry, onSolo }: { text?: string | null; onMenu: () => void; onRetry?: () => void; onSolo?: () => void }) {
  const [diag, setDiag] = useState<ServerDiag | null>(null);
  const [checking, setChecking] = useState(true);
  const run = async () => {
    setChecking(true);
    try {
      // заодно перечитываем live.json: адрес туннеля мог смениться
      await discoverServer(true).catch(() => null);
      setDiag(await diagnoseServer());
    } catch { setDiag(null); } finally { setChecking(false); }
  };
  useEffect(() => { void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const tone = diag?.reason === 'ok' ? 'ok' : diag ? 'bad' : 'wait';
  const head = diag ? diag.text : (text && text.trim() ? text : SERVER_DOWN_TEXT);
  return (
    <div className="lg-modal-back" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lg-modal" style={{ width: 'min(460px, 100%)' }}>
        <div className="lg-modal-head"><h2>⚠️ Нет связи к серверу!</h2></div>
        <div className="lg-modal-body">
          <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.45, textAlign: 'center', margin: '4px 0 10px' }}>{head}</p>
          <div className={`srv-diag ${tone}`}>
            <div className="srv-diag-row"><span>адрес</span><b>{hostOf(diag?.url || getServerUrl())}</b></div>
            <div className="srv-diag-row"><span>проверка</span><b>{checking ? 'идёт…' : diag ? diag.detail : 'не удалось'}</b></div>
            {diag?.build && <div className="srv-diag-row"><span>сборка сервера</span><b>{diag.build}</b></div>}
            {diag?.online !== undefined && <div className="srv-diag-row"><span>игроков в сети</span><b>{diag.online}</b></div>}
          </div>
          <p className="srv-diag-hint">
            {diag?.reason === 'dead' && 'Откройте Colab, выполните серверную ячейку и нажмите «📡 Постоянная ссылка».'}
            {diag?.reason === 'notserver' && 'Сервер в Colab остановлен (или туннель смотрит не на тот порт). Перезапустите ячейку — адрес подхватится сам.'}
            {diag?.reason === 'ok' && 'Сервер жив: попробуйте войти ещё раз — вход мог просто не успеть.'}
            {(diag?.reason === 'blocked' || diag?.reason === 'nohttp') && 'Сеть блокирует WebSocket: проверьте VPN/расширения браузера.'}
          </p>
          <button className="lg-btn w-full mt-2" style={{ width: '100%', marginTop: 10 }} disabled={checking}
            onClick={() => { void run(); if (onRetry) onRetry(); }}>
            {checking ? 'Проверяю…' : '🔍 Проверить снова'}
          </button>
          {onRetry && (
            <button className="lg-btn lg-btn-main w-full mt-2" style={{ width: '100%', marginTop: 8 }} onClick={onRetry}>🔄 Повторить вход</button>
          )}
          {onSolo && <button className="lg-btn lg-btn-main w-full mt-2" style={{ width: '100%', marginTop: 8 }} onClick={onSolo}>🎮 Продолжить офлайн</button>}
          <button className="lg-btn w-full" style={{ width: '100%', marginTop: 8 }} onClick={onMenu}>В меню</button>
        </div>
      </div>
    </div>
  );
}

/** не открываем экранную клавиатуру на телефоне сразу при запуске */
const isDesktop = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches;

function Fields({ nick, setNick, gender, setGender, disabled, onEnter }: {
  nick: string; setNick: (v: string) => void; gender: 'm' | 'f'; setGender: (g: 'm' | 'f') => void; disabled?: boolean; onEnter?: () => void;
}) {
  return (
    <>
      <label className="font-bold block mb-1">Никнейм</label>
      <input className="lg-input" style={{ letterSpacing: 0, fontSize: 18 }} value={nick} maxLength={16} disabled={disabled}
        placeholder="Ваш ник (2–16 символов)" autoComplete="off" autoFocus={isDesktop()}
        onChange={(e) => setNick(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onEnter?.(); }} />
      <label className="font-bold block mt-3 mb-1">Пол</label>
      <div className="lg-join-g">
        <button className={`lg-btn lg-big ${gender === 'm' ? 'on' : ''}`} disabled={disabled} onClick={() => setGender('m')}>👨<br />Мужской</button>
        <button className={`lg-btn lg-big ${gender === 'f' ? 'on' : ''}`} disabled={disabled} onClick={() => setGender('f')}>👩<br />Женский</button>
      </div>
    </>
  );
}

/** Стартовое окно (variant='start') и панель онлайна внутри игры (variant='panel') */
export function OnlineJoin({ variant = 'start', g, initial, onLaunch, onClose, onMenu, onHow, onSettings, hasSave }: {
  variant?: 'start' | 'panel';
  g?: Game;
  initial?: { nick?: string; gender?: 'm' | 'f' };
  onLaunch: (l: JoinLaunch) => void;
  onClose?: () => void;
  onMenu?: () => void;
  onHow?: () => void;
  onSettings?: () => void;
  hasSave?: boolean;
}) {
  const info = g ? g.onlineInfo() : null;
  const startNick = initial?.nick ?? info?.nick ?? '';
  const startGender = initial?.gender ?? info?.gender ?? 'm';
  const [nick, setNick] = useState(startNick);
  const [gender, setGender] = useState<'m' | 'f'>(startGender);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState<string | null>(null);
  // живой статус сервера прямо в панели «Онлайн»: чтобы не гадать, почему не пускает
  const [diag, setDiag] = useState<ServerDiag | null>(null);
  const [diagT, setDiagT] = useState(true);
  const check = async () => {
    setDiagT(true);
    try {
      await discoverServer(true).catch(() => null);
      setDiag(await diagnoseServer());
    } catch { setDiag(null); } finally { setDiagT(false); }
  };
  useEffect(() => { if (variant === 'panel') void check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [variant]);
  // те же правила, что и в Game.enterOnline: буквы/цифры/пробел/_-. , 2–16 символов
  const valid = /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nick.trim());
  const clean = () => nick.trim().slice(0, 16);
  const alreadyOnline = !!g?.online;

  // «Онлайн»: адрес сервера игрок не вводит — клиент сам находит живой туннель
  // (game/discovery.ts: опубликованный live.json → сохранённый → встроенный),
  // проверяет его подключением и только потом грузит общий мир.
  const goOnline = async () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      await ensureServer();   // сам находит живой адрес и проверяет его подключением
    } catch {
      setBusy(false);
      const d = await diagnoseServer().catch(() => null);
      setDown(d ? d.text : '');
      return;
    }
    setBusy(false);
    onLaunch({ mode: 'online', nick: clean(), gender });
  };
  const goSolo = () => onLaunch({ mode: 'solo', nick: clean(), gender });

  if (variant === 'panel') {
    return (
      <>
        <Modal title="🌐 Онлайн" onClose={onClose ?? (() => {})}>
          <div className={`srv-diag ${diag?.reason === 'ok' ? 'ok' : diag ? 'bad' : 'wait'}`} style={{ marginBottom: 12 }}>
            <div className="srv-diag-row"><span>сервер</span><b>{diagT ? 'проверяю…' : diag ? (diag.reason === 'ok' ? 'на связи' : 'недоступен') : 'неизвестно'}</b></div>
            <div className="srv-diag-row"><span>адрес</span><b>{hostOf(diag?.url || getServerUrl())}</b></div>
            <div className="srv-diag-row"><span>проверка</span><b>{diagT ? 'идёт…' : diag ? diag.detail : 'нет данных'}</b></div>
            {diag?.online !== undefined && <div className="srv-diag-row"><span>игроков</span><b>{diag.online}</b></div>}
            <button className="lg-btn sm" style={{ marginTop: 8 }} disabled={diagT} onClick={() => void check()}>🔍 Проверить</button>
          </div>
          {info?.exists && (
            <div className="lg-card mb-3">
              <b>Онлайн-сохранение</b>
              <p className="text-sm">Пол: {info.gender === 'f' ? 'женский' : 'мужской'} · деньги ${info.money.toLocaleString('ru')} · {info.place || 'на улице'}</p>
            </div>
          )}
          <Fields nick={nick} setNick={setNick} gender={gender} setGender={setGender} disabled={busy} onEnter={goOnline} />
          <div className="flex flex-col gap-2 mt-4">
            {!alreadyOnline && (
              <button className="lg-btn lg-btn-main" disabled={!valid || busy} style={{ opacity: valid && !busy ? 1 : 0.5 }} onClick={goOnline}>
                {busy ? 'Подключение…' : 'Войти в онлайн'}
              </button>
            )}
            <button className="lg-btn" onClick={goSolo}>{alreadyOnline ? '🎮 соло' : '🎮 локальная игра'}</button>
          </div>
          {alreadyOnline && <p className="text-xs opacity-60 mt-2">Ё — выйти из онлайна</p>}
        </Modal>
        {down !== null && <ServerDownModal onMenu={() => { setDown(null); if (onMenu) onMenu(); else onClose?.(); }} />}
      </>
    );
  }

  return (
    <div className="lg-menu" style={{ backgroundImage: `url(${menuBg})` }}>
      <div className="lg-menu-shade" />
      <div className="lg-menu-inner" style={{ maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
        <p className="lg-sub">Открытый мир · город 18×18 · играйте соло или онлайн</p>
        <Fields nick={nick} setNick={setNick} gender={gender} setGender={setGender} disabled={busy} onEnter={goOnline} />
        <div className="flex flex-col gap-2 mt-4" style={{ maxWidth: 380 }}>
          <button className="lg-btn lg-btn-main" style={{ minHeight: 52, fontSize: 17 }} onClick={goSolo}>🎮 Соло</button>
          <button className="lg-btn" style={{ minHeight: 52, fontSize: 17, opacity: valid && !busy ? 1 : 0.5 }} disabled={!valid || busy} onClick={goOnline}>
            {busy ? '🌐 Подключение…' : '🌐 Онлайн'}
          </button>
        </div>
        <p className="text-xs opacity-60 mt-2">
          {valid ? `Ник: ${clean()} · пол: ${gender === 'm' ? 'мужской' : 'женский'}` : 'Введите ник (2–16 символов), чтобы играть онлайн'}
          {hasSave ? ' · соло-сохранение найдено' : ''}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {onHow && <button className="lg-btn sm" onClick={onHow}>❓ Как играть</button>}
          {onSettings && <button className="lg-btn sm" onClick={onSettings}>⚙ Настройки</button>}
        </div>
      </div>
      {down !== null && <ServerDownModal onMenu={() => setDown(null)} />}
    </div>
  );
}
