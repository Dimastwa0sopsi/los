// 📰 СМИ Лос-Города — аренда рекламных щитов.
//
// Щит — физическое место в мире: в городе на тротуаре или на трассе за городом.
// Игрок платит за час, пишет текст, СМИ проверяет его на мат и ссылки и вешает
// объявление на выбранный щит. Через час место освобождается само.
import { useState } from 'react';
import type { Game } from '../game/game';
import { Modal } from './MenuScreens';
import { AD_MAX, checkText } from '../game/moderation';
import { AD_TAGS, type AdTag } from '../game/ads';

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');

type Tab = 'free' | 'city' | 'road' | 'mine';

export function AdsPanel({ g, close }: { g: Game; close: () => void }) {
  const [, force] = useState(0);
  const r = () => force((x) => x + 1);
  const s = g.getState();
  const list = g.adsList();
  const [tab, setTab] = useState<Tab>('free');
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [tag, setTag] = useState<AdTag>('biz');
  const [err, setErr] = useState<string | null>(null);

  const shown = list.filter((b) => {
    if (tab === 'free') return !b.busy;
    if (tab === 'city') return b.kind === 'city';
    if (tab === 'road') return b.kind === 'road';
    return b.mine;
  });
  const def = list.find((b) => b.id === picked) ?? null;
  const preview = def ? checkText(text, 'ad') : null;

  const buy = () => {
    if (!def) { setErr('Сначала выберите щит'); return; }
    const res = g.buyAd(def.id, text, tag);
    if (!res.ok) { setErr(res.error ?? 'Не получилось'); return; }
    setErr(null); setText(''); setPicked(null); r();
  };

  return (
    <Modal title="📰 СМИ Лос-Города" onClose={close} wide>
      <p className="tb-note" style={{ marginBottom: 10 }}>
        Рекламный щит — на час. Оплата в СМИ: <b>{$(s.money)}</b> на счету.
        Мат, ссылки, ники и телефоны не принимаются — текст проверяется автоматически.
        Короткое объявление в ленту новостей — команда <b>/smi</b> за $300.
      </p>

      <div className="lp-tabs">
        <button className={tab === 'free' ? 'on' : ''} onClick={() => setTab('free')}>🆓 Свободные ({list.filter((b) => !b.busy).length})</button>
        <button className={tab === 'city' ? 'on' : ''} onClick={() => setTab('city')}>🏙 В городе</button>
        <button className={tab === 'road' ? 'on' : ''} onClick={() => setTab('road')}>🛣 За городом</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>🪧 Мои ({list.filter((b) => b.mine).length})</button>
      </div>

      <div className="lg-list" style={{ maxHeight: '34vh', overflowY: 'auto' }}>
        {shown.length === 0 && <p className="tb-note">{tab === 'mine' ? 'У вас пока нет своих щитов.' : 'Свободных щитов нет — освободятся через час.'}</p>}
        {shown.map((b) => (
          <div className="lg-row" key={b.id} style={{ alignItems: 'center', gap: 10 }}>
            <span className="lg-ico">{b.kind === 'city' ? '🏙' : '🛣'}</span>
            <div style={{ flex: 1, minWidth: 150 }}>
              <b>{b.kind === 'city' ? 'Щит в городе' : 'Щит на трассе'} №{b.id.replace(/\D/g, '')}</b>
              <small>{Math.round(b.x)}:{Math.round(b.z)} · {b.w.toFixed(1)}×{b.h.toFixed(1)} м</small>
              {b.busy && <small style={{ display: 'block', color: '#fbbf24' }}>«{b.text}» · ещё {b.leftMin} мин{b.mine ? ' · ваш' : ''}</small>}
            </div>
            <b style={{ marginRight: 8 }}>{$(b.price)}/час</b>
            {!b.busy && <button className="ui-btn sm main" onClick={() => { setPicked(b.id); setText(''); setErr(null); }}>Арендовать</button>}
            {b.mine && <button className="ui-btn sm danger" onClick={() => { g.dropAd(b.id); r(); }}>Снять</button>}
            {b.busy && !b.mine && <span className="tb-note">занят</span>}
          </div>
        ))}
      </div>

      {def && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 10 }}>
          <b>Новое объявление · {$(def.price)} за час</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            {AD_TAGS.map((t) => (
              <button key={t.id} className={`ui-btn sm ${tag === t.id ? 'main' : ''}`} onClick={() => setTag(t.id)}>{t.name}</button>
            ))}
          </div>
          <input
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, AD_MAX + 10)); setErr(null); }}
            placeholder="Например: Кафе «Ракета» — кофе за $100, открыто до утра"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff' }}
          />
          <p className="tb-note" style={{ marginTop: 6 }}>
            {text.length}/{AD_MAX} символов
            {preview && !preview.ok && <span style={{ color: '#f87171' }}> · {preview.error}</span>}
            {preview && preview.ok && <span style={{ color: '#4ade80' }}> · текст принят</span>}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="lg-btn lg-btn-main" disabled={!preview?.ok} onClick={buy}>Повесить на час · {$(def.price)}</button>
            <button className="lg-btn" onClick={() => { setPicked(null); setText(''); setErr(null); }}>Отмена</button>
          </div>
        </div>
      )}
      {err && <p style={{ color: '#f87171', marginTop: 8 }}>{err}</p>}
      <p className="tb-note" style={{ marginTop: 10 }}>
        Платить можно только за свободный щит. Через час аренда кончается сама — объявление исчезает со щита.
      </p>
    </Modal>
  );
}
