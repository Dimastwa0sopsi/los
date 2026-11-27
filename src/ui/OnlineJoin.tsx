import { useState } from 'react';
import menuBg from '../assets/menu.jpg';
import type { Game } from '../game/game';
import { Modal } from './MenuScreens';

/** текст, который показываем, если сервер не отвечает */
export const SERVER_DOWN_TEXT = 'Сервер отключен, заходите позже';

export type JoinLaunch = { mode: 'solo' | 'online'; nick: string; gender: 'm' | 'f'; credentials?: { mode: 'login' | 'register'; password: string; backup?: string } };

/** Ошибка подключения без отдельной проверки сервера. */
export function ServerDownModal({ text, onMenu, onRetry, onSolo }: { text?: string | null; onMenu: () => void; onRetry?: () => void; onSolo?: () => void }) {
  return <div className="lg-modal-back" onPointerDown={(e) => e.stopPropagation()}>
    <div className="lg-modal" style={{ width: 'min(460px, 100%)' }}>
      <div className="lg-modal-head"><h2>⚠️ Нет связи с сервером</h2></div>
      <div className="lg-modal-body">
        <p>{text?.trim() || SERVER_DOWN_TEXT}</p>
        {onRetry && <button className="lg-btn lg-btn-main w-full mt-2" onClick={onRetry}>🔄 Повторить вход</button>}
        {onSolo && <button className="lg-btn w-full mt-2" onClick={onSolo}>🎮 Продолжить офлайн</button>}
        <button className="lg-btn w-full mt-2" onClick={onMenu}>← Назад</button>
      </div>
    </div>
  </div>;
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
  const [busy] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [password, setPassword] = useState('');
  const [backup, setBackup] = useState('');
  const [down, setDown] = useState<string | null>(null);
  // те же правила, что и в Game.enterOnline: буквы/цифры/пробел/_-. , 2–16 символов
  const valid = /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nick.trim());
  const clean = () => nick.trim().slice(0, 16);
  const alreadyOnline = !!g?.online;

  const goOnline = () => {
    if (busy || !valid || (variant === 'panel' && (password.length < 10 || (authMode === 'register' && backup.length > 0 && backup.length < 10)))) return;
    onLaunch({ mode: 'online', nick: clean(), gender, credentials: variant === 'panel' ? { mode: authMode, password, backup: authMode === 'register' ? backup : '' } : undefined });
  };
  const goSolo = () => onLaunch({ mode: 'solo', nick: clean(), gender });

  if (variant === 'panel') {
    return (
      <>
        <Modal title="🌐 Онлайн" onClose={onClose ?? (() => {})}>
          <div className="flex gap-2 mb-3">
            <button className={`lg-btn ${authMode === 'login' ? 'lg-btn-main' : ''}`} onClick={() => setAuthMode('login')}>Вход</button>
            <button className={`lg-btn ${authMode === 'register' ? 'lg-btn-main' : ''}`} onClick={() => setAuthMode('register')}>Регистрация</button>
          </div>
          <label className="font-bold block mb-1">Никнейм</label>
          <input className="lg-input" value={nick} maxLength={16} autoComplete="username" placeholder="Ник от 2 до 16 символов" onChange={e => setNick(e.target.value)} onKeyDown={e => e.stopPropagation()} />
          <label className="font-bold block mt-3 mb-1">Пароль</label>
          <input className="lg-input" type="password" value={password} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder="Не менее 10 символов" onChange={e => setPassword(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') goOnline(); }} />
          {authMode === 'register' && <>
            <label className="font-bold block mt-3 mb-1">Запасной пароль (необязательно)</label>
            <input className="lg-input" type="password" value={backup} autoComplete="new-password" placeholder="Не менее 10 символов" onChange={e => setBackup(e.target.value)} onKeyDown={e => e.stopPropagation()} />
            <label className="font-bold block mt-3 mb-1">Пол персонажа</label>
            <div className="lg-join-g"><button className={`lg-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => setGender('m')}>Мужской</button><button className={`lg-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => setGender('f')}>Женский</button></div>
          </>}
          <p className="text-xs opacity-60 mt-2">{authMode === 'login' ? 'Можно ввести основной или запасной пароль.' : 'Запомните пароль: аккаунт не привязан к устройству.'}</p>
          <div className="flex flex-col gap-2 mt-4">
            {!alreadyOnline && <button className="lg-btn lg-btn-main" disabled={!valid || password.length < 10 || (authMode === 'register' && !!backup && backup.length < 10)} onClick={goOnline}>{authMode === 'login' ? 'Подключиться' : 'Зарегистрироваться'}</button>}
            {!g?.onlineRequired && <button className="lg-btn" onClick={goSolo}>{alreadyOnline ? '🎮 соло' : '🎮 локальная игра'}</button>}
          </div>
          {alreadyOnline && <p className="text-xs opacity-60 mt-2">Ё — {g?.onlineRequired ? 'выйти в меню' : 'выйти из онлайна'}</p>}
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
