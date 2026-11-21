import { useEffect, useState } from 'react';
import type { Game } from '../game/game';
import type { AuctionLot } from '../game/net';
import { KIOSK_TYPES, VEHICLES } from '../game/data';
import { Modal } from './MenuScreens';

const money = (n: number) => '$' + Math.round(n).toLocaleString('ru');
function lotName(g: Game, lot: AuctionLot): string {
  if (lot.kind === 'vehicle') return VEHICLES[lot.vehicleType]?.name ?? 'Транспорт';
  if (lot.kind === 'business') {
    const kiosk = g.L.kiosks[Number(lot.assetKey)];
    return kiosk ? KIOSK_TYPES[kiosk.type]?.name ?? 'Бизнес' : 'Бизнес';
  }
  const [id, unit] = lot.assetKey.split(':').map(Number);
  const b = g.L.buildings[id];
  if (lot.kind === 'apartment') return b ? `${b.name} · квартира ${unit + 1}` : 'Квартира';
  return b?.name ?? 'Дом';
}
export function AuctionPanel({ g, close }: { g: Game; close: () => void }) {
  const [tick, setTick] = useState(0);
  const [opened] = useState(Date.now());
  useEffect(() => {
    const refresh = () => g.net?.requestAuction();
    if (g.net) g.net.auction = null;
    refresh();
    const clock = window.setInterval(() => setTick(x => x + 1), 1000);
    const poll = window.setInterval(refresh, 6000);
    return () => { window.clearInterval(clock); window.clearInterval(poll); };
  }, [g, opened]);
  void tick;
  const net = g.net;
  const connected = !!net && net.ready;
  const snapshot = connected ? net.auction : null;
  const serverNow = snapshot ? snapshot.serverTime + (Date.now() - snapshot.receivedAt) : Date.now();
  const lots = snapshot?.lots.filter(l => l.endsAt > serverNow) ?? [];
  const state = connected ? g.getState() : null;
  // Это только просмотр сохранения; доступность и права проверит сервер,
  // когда торговля будет подключена.
  const candidates = state ? [
    ...state.vehicles.map(v => ({key:`vehicle:${v.uid}`, name:VEHICLES[v.type]?.name ?? v.type, kind:'Машина', step:1000})),
    ...state.kiosks.map(k => ({key:`business:${k.id}`, name:g.L.kiosks[k.id] ? KIOSK_TYPES[g.L.kiosks[k.id].type]?.name ?? 'Ларёк' : 'Неизвестный ларёк', kind:'Бизнес', step:10000})),
    ...state.properties.map(id => {
      const [bid, unit] = id.split(':').map(Number), b = g.L.buildings[bid];
      const apartment = b?.kind === 'apartment';
      return {key:`property:${id}`, name:b ? `${b.name}${apartment ? ` · квартира ${unit+1}` : ''}` : `Объект ${id}`, kind:apartment?'Квартира':'Дом', step:apartment?10000:20000};
    }),
  ] : [];
  return <Modal title="🔨 Городской аукцион" onClose={close} wide>
    <p className="lg-money-line">Просмотр лотов. Торги и выставление имущества пока закрыты; деньги не списываются.</p>
    {!connected ? <p className="opacity-75 mt-3">Подключитесь к онлайн-серверу через планшет, чтобы увидеть серверные лоты.</p>
      : !snapshot ? <p className="opacity-75 mt-3">{Date.now() - opened > 10000 ? 'Сервер не ответил. Проверьте, что сервер Colab обновлён.' : 'Получаем список лотов с сервера…'}</p>
      : <div className="lg-list mt-3">
        {!lots.length && <p className="opacity-75">Активных лотов пока нет.</p>}
        {lots.map(lot => <div className="lg-row wrap" key={lot.id}>
          <div className="flex-1"><b>№{lot.id} · {lotName(g, lot)}</b>
            <small>{lot.kind === 'business' ? 'Бизнес' : lot.kind === 'vehicle' ? 'Машина' : lot.kind === 'apartment' ? 'Квартира' : 'Дом'} · продавец {lot.seller}</small>
            <small>До окончания: {Math.max(0, Math.ceil((lot.endsAt - serverNow) / 1000))} сек · шаг {money(lot.step)}</small>
          </div>
          <span>{lot.bid === null ? `Начальная: ${money(lot.startPrice)}` : `Ставка: ${money(lot.bid)}`}</span>
          <button className="lg-btn sm" disabled>Ставки закрыты</button>
        </div>)}
      </div>}
    {connected && <div className="lg-card mt-3"><b>📦 Ваше имущество для будущих торгов</b>
      <p className="text-xs opacity-70">Предварительный список из вашего сохранения, не подтверждение права продажи. Выставление на 10 минут и ставки пока отключены.</p>
      {!candidates.length ? <p className="opacity-75">В сохранении нет подходящего имущества.</p> : <div className="lg-list mt-2">{candidates.map(item => <div className="lg-row wrap" key={item.key}>
        <div className="flex-1"><b>{item.name}</b><small>{item.kind} · шаг от {money(item.step)}</small></div>
        <button className="lg-btn sm" disabled>Выставление закрыто</button>
      </div>)}</div>}
    </div>}
  </Modal>;
}
