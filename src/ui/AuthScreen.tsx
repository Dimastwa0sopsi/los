// Стартовая заставка: статичный фон города и ОДНА кнопка — «▶ Играть».
//
// Никаких подсказок, шагов «выберите режим», логинов и полей с адресом сервера.
// По нажатию игра запускается без предварительной проверки сервера;
// ошибка реального соединения позволяет продолжить офлайн.
import { useState } from 'react';
import menuBg from '../assets/menu.jpg';
import { type JoinLaunch } from './OnlineJoin';
import { currentAccount, updateAccount } from '../game/accounts';
import { APP_BUILD, APP_VERSION, versionShort } from '../version';

const NICK_KEY = 'losgorod_nick';
const GENDER_KEY = 'losgorod_gender';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

/** ник для игры: из аккаунта → сохранённый в браузере → случайный «Игрок123» */
function pickNick(): string {
  const acc = currentAccount();
  const nick = (acc?.nick || savedNick() || `Игрок${Math.floor(100 + Math.random() * 899)}`).slice(0, 16);
  try { localStorage.setItem(NICK_KEY, nick); } catch { /* приватный режим */ }
  return nick;
}

export function AuthScreen({ onLaunch }: { onLaunch: (l: JoinLaunch) => void }) {
  const [busy, setBusy] = useState(false);

  const play = async () => {
    if (busy) return;
    setBusy(true);
    const acc = currentAccount();
    let gender: 'm' | 'f' = 'm';
    try { gender = (localStorage.getItem(GENDER_KEY) === 'f' ? 'f' : 'm'); } catch { /* */ }
    if (acc) {
      gender = acc.gender;
      updateAccount(acc.login, { gender });
    }
    const nick = pickNick();
    try { localStorage.setItem(GENDER_KEY, gender); } catch { /* приватный режим */ }
    onLaunch({ mode: 'online', nick, gender });
  };

  return (
    <div className="auth-root">
      {/* фон меню — статичная картинка */}
      <div className="auth-photo" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      <div className="auth-brand">
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
      </div>

      <div className="auth-side">
        <div className="auth-panel auth-panel-min">
          <button className="lg-btn lg-btn-main auth-play" onClick={play} disabled={busy}>
            {busy ? '⏳' : '▶ Играть'}
          </button>
        </div>
      </div>

      {/* версия сборки внизу экрана: у каждого обновления свой номер */}
      <div className="auth-ver" title={`Сборка ${APP_BUILD}`}>
        <i />{versionShort()}<span>· сборка {APP_BUILD}</span>
      </div>
    </div>
  );
}
