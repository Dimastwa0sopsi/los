import { TestDrive } from './TestDrive';
import { useEffect, useState } from 'react';
import type { Game, Panel } from '../game/game';
import { Modal } from './MenuScreens';
import { Tablet } from './Tablet';
import { InventoryGrid } from './InventoryGrid';
import { PcPanel, OfficeHr, Livestock } from './Work';
import { BAR_DRINKS, DRESSES, ITEMS, VEHICLES, VEHICLE_BODY_NAMES, KIOSK_TYPES, PAINT_COLORS, NEON_COLORS, LIGHT_COLORS, HAIR_STYLES, HAIR_COLORS, TOPS, BOTTOMS, CLOTH_COLORS, SKINS, EYE_COLORS, BROWS, NOSES, LIP_SHAPES, LIP_COLORS, type Tuning, type Look, TUNE_PRICES, TUNE_CATALOG, TUNE_CATS, HYDRO_PRICE, type TuneCat } from '../game/data';
import { CarPreview } from './CarPreview';
import { LookPreview } from './LookPreview';
import { repairCost, sellPrice, demand, carValue, type MarketOffer } from '../game/state';
import { hasSubwooferTrunk } from '../game/data';
import { HelpPanel } from './Help';
import { AdsPanel } from './AdsPanel';
import { AuctionPanel } from './AuctionPanel';
import { CASINO_ITEMS, ROULETTE_MIN, ROULETTE_MAX, type RouletteBet } from '../game/roulette';

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');

/** Казино: дуэльная игра «Бомба» 3×3 — дилер прячет 3 бомбы, игрок открывает клетки.
 *  Название берём у здания: в городе «Золотой Лось», за городом «Жар-Птица». */
function CasinoPanel({ g, close, name }: { g: Game; close: () => void; name?: string }) {
  const [, tick] = useState(0); const r = () => tick((x) => x + 1);
  const [bet, setBet] = useState(30000);
  const [phase, setPhase] = useState<'idle' | 'play' | 'boom' | 'cash'>('idle');
  const [bombs, setBombs] = useState<number[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const safeCnt = open.length;
  const mult = +(1 + safeCnt * 0.45).toFixed(2);
  const start = () => { if (!g.casinoStart(bet)) { r(); return; } const b: number[] = []; while (b.length < 3) { const n = Math.floor(Math.random() * 9); if (!b.includes(n)) b.push(n); } setBombs(b); setOpen([]); setPhase('play'); };
  const pick = (i: number) => {
    if (phase !== 'play' || open.includes(i)) return;
    if (bombs.includes(i)) { setPhase('boom'); g.casinoPayout(0, `💥 Бомба под клеткой ${i + 1}! Ставка $${bet.toLocaleString('ru')} сгорела`); r(); return; }
    const nx = [...open, i]; setOpen(nx);
    if (nx.length >= 6) { setPhase('cash'); g.casinoPayout(Math.floor(bet * 5), '👑 ДЖЕКПОТ ×5 — все безопасные клетки ваши!'); r(); }
    else r();
  };
  const cashout = () => { if (phase !== 'play') return; setPhase('cash'); g.casinoPayout(Math.floor(bet * mult), `🪙 Забрали ×${mult}`); r(); };
  const presets = [30000, 100000, 250000, 500000, 1000000];
  return (
    <Modal title={`${name || 'Казино «Жар-Птица»'} · 💣 Бомба`} onClose={close}>
      <p className="text-sm opacity-80">Баланс: <b>{$(g.getState().money)}</b></p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 74px)', gap: 8, justifyContent: 'center', margin: '14px 0' }}>
        {Array.from({ length: 9 }, (_, i) => {
          const revealed = open.includes(i); const boomShow = phase === 'boom' && bombs.includes(i);
          const bg = boomShow ? '#7f1d1d' : revealed ? '#166534' : '#1f2937';
          return (
            <button key={i} disabled={phase !== 'play' || revealed} onClick={() => pick(i)}
              style={{ width: 74, height: 74, borderRadius: 14, background: bg, border: '2px solid #fbbf24', color: '#fff', fontSize: 30, cursor: phase === 'play' && !revealed ? 'pointer' : 'default', opacity: phase === 'idle' ? 0.5 : 1 }}>
              {boomShow ? '💣' : revealed ? '💎' : ''}
            </button>
          );
        })}
      </div>
      {phase === 'idle' && (<>
        <div className="btns" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {presets.map((p) => <button key={p} className={`ui-btn sm ${bet === p ? 'main' : ''}`} onClick={() => setBet(p)}>{$(p)}</button>)}
        </div>
        <div className="btns mt-2">
          <button className="ui-btn sm" onClick={() => setBet(Math.max(30000, bet - 10000))}>−10k</button>
          <b style={{ alignSelf: 'center' }}>Ставка: {$(bet)}</b>
          <button className="ui-btn sm" onClick={() => setBet(Math.min(1000000, bet + 10000))}>+10k</button>
        </div>
        <button className="lg-btn lg-btn-main mt-3" onClick={start}>Начать игру</button>
        <p className="tb-note mt-2">Дилер прячет 3 бомбы среди 9 клеток. Каждая 💎 даёт +0.45× к ставке; забрали — получили своё ×множитель. Все 6 алмазов — джекпот ×5!</p>
      </>)}
      {phase === 'play' && (<div className="text-center"><b style={{ fontSize: 22 }}>×{mult}</b><button className="lg-btn lg-btn-main mt-2" onClick={cashout}>Забрать {$(Math.floor(bet * mult))}</button></div>)}
      {(phase === 'boom' || phase === 'cash') && <button className="lg-btn lg-btn-main mt-2" onClick={() => { setPhase('idle'); r(); }}>Сыграть ещё</button>}
    </Modal>
  );
}

export function GamePanel({ g, panel, close }: { g: Game; panel: Panel; close: () => void }) {
  const [, force] = useState(0);
  const r = () => force((x) => x + 1);
  const s = g.getState();
  const wrap = (fn: () => void) => () => { fn(); r(); };
  switch (panel.type) {
    case 'context': return <Modal title="Выберите действие" onClose={close}>
      <div className="lg-list">{panel.choices.map((choice, i) => <button key={i} className="lg-btn" onClick={() => { close(); choice.run(); }}>{choice.label}</button>)}</div>
    </Modal>;
    case 'shop': return (
      <Modal title={panel.title} onClose={close}>
        <p className="lg-money-line">Ваши деньги: <b>{$(s.money)}</b></p>
        <div className="lg-list">{panel.items.map((id) => { const it = ITEMS[id]; return (
          <div key={id} className="lg-row"><span className="lg-ico">{it.icon}</span><div className="flex-1"><b>{it.name}</b><small>{[it.food && `🍗+${it.food}`, it.drink && `💧${it.drink > 0 ? '+' : ''}${it.drink}`, it.energy && `⚡+${it.energy}`, it.health && `❤${it.health > 0 ? '+' : ''}${it.health}`].filter(Boolean).join(' ')}</small></div>
            <button className="lg-btn sm" onClick={wrap(() => g.buy(id))}>{$(it.price)}</button>{!it.weapon && <button className="lg-btn sm" onClick={wrap(() => g.buy(id, 5))}>×5</button>}</div>); })}</div>
        {(panel.kind === 'vshop' || panel.kind === 'supermarket') && <button className="ui-btn mt-2" onClick={wrap(() => g.sellProduce('veg'))}>🧺 Продать урожай с огорода</button>}
        {panel.kind === 'gunshop' && <button className="ui-btn danger mt-2" onClick={wrap(() => g.sellProduce('drug'))}>🍁 Сбыть «дурман» из-под прилавка (риск розыска)</button>}
        <p className="text-xs opacity-70 mt-2">У кассы нажмите E и выберите действие. Для ограбления прицельтесь в кассира.</p>
      </Modal>);
    case 'kiosk': {
      const k = g.L.kiosks[panel.id]; const kt = KIOSK_TYPES[k.type]; const own = s.kiosks.find((o) => o.id === k.id); const owner = g.kioskOwner(k.id);
      return (<Modal title={`Ларёк «${kt.name}»`} onClose={close}>
        <div className="lg-list">{kt.items.map((id) => { const it = ITEMS[id]; return <div key={id} className="lg-row"><span className="lg-ico">{it.icon}</span><b className="flex-1">{it.name}</b><button className="lg-btn sm" onClick={wrap(() => g.buy(id))}>{$(it.price)}</button></div>; })}</div>
        <div className="lg-card mt-3">
          <b>Бизнес</b><p>Владелец: {owner.label}</p>
          {own ? <><p>Ларёк ваш. Доход: {$(kt.income)} каждую минуту. Накоплено: <b>{$(own.acc)}</b></p><button className="lg-btn" onClick={wrap(() => g.collectKiosks(k.id))}>Забрать доход</button></>
            : owner.kind === 'state' ? <><p>Стоимость: <b>{$(kt.price)}</b> · доход {$(kt.income)}/мин (окупаемость ≈ {Math.round(kt.price / kt.income)} мин)</p><button className="lg-btn lg-btn-main" onClick={wrap(() => g.buyKiosk(k.id))}>Купить ларёк</button></> : <p>Покупка недоступна: {owner.kind === 'player' ? 'ларёк принадлежит игроку' : 'владение не подтверждено сервером'}.</p>}
        </div></Modal>);
    }
    case 'property': {
      const b = g.L.buildings[panel.b]; const price = g.unitPrice(b, panel.unit);
      const desc = b.kind === 'apartment' ? (b.cls === 'lux' ? 'Люкс: спальня, гардероб, гостиная с угловым диваном и ТВ-панелью, кухня с островом, ванная' : b.cls === 'mid' ? 'Средний класс: спальня и кухня-гостиная, санузел' : 'Эконом: студия с кухонным уголком') : b.kind === 'vhouse' ? 'Деревенский дом: сени, комната с печью, участок с забором, огород и баня' : 'Частный дом: сени, комната, кухня, участок';
      return (<Modal title={b.kind === 'apartment' ? `Квартира ${panel.unit + 1} · ${b.name}` : b.name} onClose={close}>
        <p>{desc}</p><p className="mt-2">Цена: <b className="lg-money-inline">{$(price)}</b></p><p>Ваши деньги: {$(s.money)}</p>
        <button className="lg-btn lg-btn-main mt-3" onClick={() => g.buyProperty(panel.b, panel.unit)}>Купить</button></Modal>);
    }
    case 'garage': { const gr = g.L.garages[panel.id]; return (<Modal title={`Гараж №${panel.id + 1} · промзона`} onClose={close}><p>Кирпичный гараж с металлическими воротами и боковой дверью. Ворота открываются автоматически, когда подъезжает владелец. Машина, оставленная внутри, сохраняется.</p><p className="mt-2">Цена: <b>{$(gr.price)}</b></p><button className="lg-btn lg-btn-main mt-3" onClick={() => g.buyGarage(panel.id)}>Купить</button></Modal>); }
    case 'dealer': return <Dealer g={g} close={close} scooter={panel.scooter} />;
    case 'pc': return <PcPanel g={g} mode={panel.mode} close={close} />;
    case 'officehr': return <OfficeHr g={g} close={close} />;
    case 'livestock': return <Livestock g={g} close={close} />;
    case 'market': return <Market g={g} close={close} sellUid={panel.sellUid} />;
    case 'tuning': return <TuningPanel g={g} uid={panel.uid} close={close} />;
    case 'clothes': return <LookPanel g={g} close={close} mode="clothes" />;
    case 'barber': return <LookPanel g={g} close={close} mode="barber" />;
    case 'hospital': return (<Modal title="Больница" onClose={close}><p>Здоровье: {Math.round(s.health)}%</p>
      <div className="flex flex-col gap-2 mt-3"><button className="lg-btn" onClick={wrap(() => g.heal())}>Лечение — $200</button><button className="lg-btn" onClick={wrap(() => g.changeGender())}>Смена пола — $50 000</button></div>
      <p className="text-xs opacity-70 mt-2">Работа врачом: стойка «Смена врача» в приёмном отделении. Осмотрите пациента на кушетке, возьмите верный препарат в шкафу и введите его пациенту — $60 за приём и бонус за смену.</p></Modal>);
    case 'auction': return <AuctionPanel g={g} close={close} />;
    case 'cityhall': {
      const docs = s.documents ?? {};
      const entries = [
        { id: 'passport' as const, name: 'Паспорт', description: 'Первый документ жителя Лос-Города' },
        { id: 'driver' as const, name: 'Водительская лицензия', description: 'Даёт право управлять транспортом; без неё доступен электросамокат' },
        { id: 'weapon' as const, name: 'Лицензия на оружие', description: 'Для покупки огнестрельного оружия' },
      ];
      return <Modal title="🏛️ Мэрия · документы" onClose={close}>
        <p>Получение документов бесплатное. Для лицензий сначала оформите паспорт.</p>
        <div className="lg-list mt-3">{entries.map(d => <div className="lg-row" key={d.id}>
          <div className="flex-1"><b>{d.name}</b><small>{d.description}</small></div>
          {docs[d.id] ? <span>Получен</span> : <button className="lg-btn sm lg-btn-main" disabled={d.id !== 'passport' && !docs.passport} onClick={wrap(() => g.issueCityDocument(d.id))}>Получить</button>}
        </div>)}</div>
      </Modal>;
    }
    case 'police': {
      const insured = Date.now() < (s.insuredUntil ?? 0);
      return (<Modal title={panel.title} onClose={close}>
        <p className="opacity-85">Камеры отмечены на карте. Ограничение: в городе 100 км/ч, за городом 150 км/ч. Штрафы оплачиваются здесь.</p>
        <div className="lg-list mt-2">
          <div className="lg-row"><span className="flex-1">Розыск</span><span>{s.wanted ? '★'.repeat(s.wanted) : 'нет'}</span></div>
          <div className="lg-row"><span className="flex-1">Страховка</span><span>{insured ? `до ${new Date(s.insuredUntil!).toLocaleDateString('ru')}` : 'не оформлена'}</span></div>
        </div>
        <p className="text-xs opacity-70 mt-2">Снизить розыск можно пожертвованием в приют (команда /charity) или уйти от погони.</p>
        <div className="lg-card mt-3"><b>📷 Штрафы камер</b>
          {!(s.cameraFines?.length) && <p>Неоплаченных штрафов нет.</p>}
          <div className="lg-list">{(s.cameraFines ?? []).map(f => <div className="lg-row wrap" key={f.id}>
            <div className="flex-1"><b>{f.reason === 'speed' ? 'Превышение скорости' : 'Распознано лицо: нет номеров'}</b><small>{f.speed} км/ч · ограничение {f.limit} · {new Date(f.time).toLocaleString('ru')}</small></div>
            <button className="lg-btn sm" onClick={wrap(() => g.payCameraFine(f.id))}>Оплатить {$(f.amount)}</button>
          </div>)}</div>
        </div>
        <div className="lg-card mt-3"><b>🪪 Выдача номеров</b>
          {g.online ? <p>Серверная выдача уникальных номеров пока не подключена.</p> : <><p>Случайный комплект за $5 000 попадёт в инвентарь. Доступно только в одиночной игре; уникальность между игроками не гарантируется.</p>
            <button className="lg-btn sm lg-btn-main" onClick={wrap(() => g.issueLocalPlate())}>Получить случайный номер · $5 000</button></>}
        </div>
        <div className="lg-card mt-3">
          <b>🚘 Транспорт и документы</b>
          <p className="text-xs opacity-70">Показаны данные вашего сохранения.</p>
          {!s.vehicles.length && <p className="opacity-70">У вас пока нет транспорта.</p>}
          <div className="lg-list mt-2">{s.vehicles.map(o => <div className="lg-row wrap" key={o.uid}>
            <div className="flex-1"><b>{VEHICLES[o.type]?.name ?? o.type}</b><small>Номер: {o.tuning?.plate || 'не указан'} · передний: {!o.tuning?.plate || o.tuning.plateFront === false ? 'нет' : 'есть'} · задний: {!o.tuning?.plate || o.tuning.plateBack === false ? 'нет' : 'есть'}</small></div>
            <button className="lg-btn sm" onClick={() => { const text = g.vehicleDocument(o.uid); if (text) g.openPanel({type:'info',title:'📄 ПТС',text}); }}>ПТС</button>
          </div>)}</div>
        </div>
      </Modal>);
    }
    case 'bank': {
      return (<Modal title="Банк" onClose={close}>
        <div className="lg-card"><b>Доход бизнесов</b><p>Накоплено: {$(s.kiosks.reduce((a, k) => a + k.acc, 0))}</p><button className="lg-btn" onClick={wrap(() => g.collectKiosks())}>Получить</button></div>
        <p className="text-xs opacity-70 mt-2">Банк только хранит доход бизнесов.</p>
      </Modal>);
    }
    case 'vadmin': {
      const houses = g.L.buildings.filter((b) => b.kind === 'vhouse' && b.village === panel.village);
      return (<Modal title={`Администрация · ${panel.village}`} onClose={close}><p className="mb-2">Дома в деревне:</p>
        <div className="lg-list">{houses.map((b, i) => { const own = s.properties.includes(`${b.id}:0`); return <div className="lg-row" key={b.id}><span className="flex-1">Дом №{i + 1}</span><span>{own ? 'ваш' : b.forSale ? $(b.price ?? 0) : 'занят'}</span>{b.forSale && !own && <button className="lg-btn sm" onClick={() => { g.destination = { x: b.door.x, z: b.door.z }; g.toast('Дом отмечен на карте'); close(); }}>📍</button>}</div>; })}</div>
        <p className="text-xs opacity-70 mt-2">Купить дом можно у его двери (E).</p></Modal>);
    }
    case 'factory': { const on = g.job?.type === 'factory'; return (<Modal title="Проходная завода" onClose={close}><p>Работа грузчиком: возьмите деталь на складе (жёлтый маркер), донесите и загрузите в указанную фуру у рампы. Оплата $120 за рейс, бонус $400 за смену из 6 рейсов.</p>
      <button className="lg-btn lg-btn-main mt-3" onClick={() => { g.factoryHire(); close(); }}>{on ? 'Уволиться со смены' : 'Устроиться на смену'}</button></Modal>); }
    case 'farm': return (<Modal title="Агрохолдинг «Нива»" onClose={close}><p>Садитесь в зелёный комбайн у поля (E) и проезжайте по пшенице. За каждый убранный участок — $5, за полосу из 4 рядов — бонус $200, за всё поле — $500.</p><button className="lg-btn mt-3" onClick={close}>Понятно</button></Modal>);
    case 'trucker': return (
      <Modal title="🚚 Диспетчерская · Дальнобойщик" onClose={close} wide>
        <p className="mb-2 opacity-80">Выберите заказ: фура появится на площадке терминала. Довезите груз до точки и остановитесь — оплата сразу, повреждения снижают её до 50%. Возврат фуры — бонус $120. Заказы обновляются каждые 5 минут.</p>
        {!g.getState().trucker ? <div className="ui-card"><b>Вы ещё не работаете в «Восток-Транс»</b><p className="text-sm opacity-80">Устройство: медкомиссия $200. После этого доступны заказы.</p><button className="ui-btn main mt-2" onClick={() => { g.hireTrucker(); force((x) => x + 1); }}>Устроиться дальнобойщиком</button></div> : g.job?.type === 'truck' ? <div className="ui-card">У вас уже есть рейс. <button className="ui-btn sm danger ml-2" onClick={() => { g.quitJob(); close(); }}>Отменить рейс</button></div> :
        <div className="lg-list">{g.truckOrders().map((o, i) => <div className="lg-row wrap" key={i}><span className="lg-ico">📦</span><div className="flex-1 min-w-[180px]"><b>{o.cargo} → {o.name}</b><small>{(o.dist / 1000).toFixed(1)} км по дорогам</small></div><b className="text-green-400 mr-2">{$(o.pay)}</b><button className="ui-btn sm main" onClick={() => g.takeTruckOrder(o)}>Взять</button></div>)}</div>}
      </Modal>);
    case 'info': return <Modal title={panel.title} onClose={close}><p>{panel.text}</p></Modal>;
    case 'phone': return <Tablet g={g} close={close} initial={panel.tab} />;
    case 'inventory': return <Modal title="🎒 Инвентарь" onClose={close} wide><InventoryGrid g={g} /></Modal>;
    case 'bar': return <BarMenu g={g} close={close} name={panel.name} casino={panel.casino} />;
    case 'roulette': return <RoulettePanel g={g} close={close} />;
    case 'ozgim': return <Ozgim g={g} close={close} />;
    case 'casino': return <CasinoPanel g={g} close={close} name={panel.name} />;
    case 'help': return <HelpPanel close={close} startTab={(panel.tab as 'start') ?? 'start'} mobile={!!g.mobile} />;
    case 'promo': return <Promo g={g} close={close} />;
    case 'svc': return <SvcPanel g={g} kind={panel.kind} close={close} />;
    case 'ads': return <AdsPanel g={g} close={close} />;
    default: return null;
  }
}

function RoulettePanel({g,close}:{g:Game;close:()=>void}) {
  const [bet,setBet]=useState('1000'); const [choice,setChoice]=useState<RouletteBet>('red');
  const [result,setResult]=useState(''); const [,tick]=useState(0);
  const colors={red:'красное',black:'чёрное',green:'зелёное'};
  return <Modal title="🎡 Рулетка" onClose={close}>
    <p>Европейская рулетка: числа 0–36. Красное и чёрное платят 2× ставки, зелёный 0 — 36× (включая ставку).</p>
    <p>Баланс: {$(g.getState().money)}. Ставка от {$(ROULETTE_MIN)} до {$(ROULETTE_MAX)}.</p>
    <input aria-label="Ставка" type="number" min={ROULETTE_MIN} max={ROULETTE_MAX} step="1" value={bet} onChange={e=>setBet(e.target.value)} />
    <div className="flex gap-2 mt-3">{(['red','black','green'] as const).map(c=><button key={c} className={'lg-btn '+(choice===c?'lg-btn-main':'')} onClick={()=>setChoice(c)}>{colors[c]}</button>)}</div>
    <button className="lg-btn lg-btn-main mt-3" onClick={()=>{const r=g.casinoRoulette(Number(bet),choice);setResult(r.ok?`Выпало ${r.number} (${colors[r.color]}). Выплата ${$(r.payout)}.`:({online:'Рулетка пока доступна только в одиночной игре.',location:'Нужно находиться в казино.',funds:'Недостаточно денег.',invalid:'Введите целую ставку в допустимых пределах.',storage:'Не удалось сохранить результат.',random:'Не удалось провести розыгрыш.'}[r.error] ?? 'Не удалось провести розыгрыш.'));tick(x=>x+1);}}>Крутить</button>
    <p aria-live="polite">{result}</p>
  </Modal>;
}

function BarMenu({ g, close, name, casino }: { g: Game; close: () => void; name?: string; casino?: boolean }) {
  const [tab, setTab] = useState<'drinks' | 'shift'>('drinks');
  const [, refresh] = useState(0);
  const s = g.getState();
  const onShift = g.job?.type === 'shift';
  const buzz = (g as unknown as { buzzT: number }).buzzT;
  return (<Modal title={`🍸 ${name || 'Бар'}`} onClose={close} wide>
    <div className="lp-tabs">
      <button className={tab === 'drinks' ? 'on' : ''} onClick={() => setTab('drinks')}>🍹 Напитки</button>
      {!casino && <button className={tab === 'shift' ? 'on' : ''} onClick={() => setTab('shift')}>💼 Подработка</button>}
    </div>
    {tab === 'drinks' && <>
      <p className="lg-money-line">Ваши деньги: <b>{$(s.money)}</b>{buzz > 0 && <span className="ml-2 opacity-70">🍺 выпивка выветрится через {Math.ceil(buzz)} с</span>}</p>
      <div className="lg-list">{BAR_DRINKS.map((d) => (
        <div className="lg-row" key={d.id}>
          <span className="lg-ico">{d.buzz > 18 ? '🥃' : d.buzz > 0 ? '🍺' : '🥤'}</span>
          <div className="flex-1"><b>{d.name}</b><small>{d.text} · ⚡{d.energy > 0 ? '+' : ''}{d.energy}{d.buzz > 0 ? ` · опьянение ${d.buzz} с` : ''}</small></div>
          <button className="lg-btn sm" onClick={() => { g.drink(d.id); }}>{$(d.price)}</button>
        </div>))}
      </div>
      {casino && <div className="lg-list">{(['durman','cigarettes'] as const).map(id=><div className="lg-row" key={id}><div className="flex-1"><b>{ITEMS[id].name}</b><small>Игровой предмет · покупка только в одиночной игре</small></div><button className="lg-btn sm" onClick={()=>{g.casinoBuyItem(id);refresh(x=>x+1);}}>{$(CASINO_ITEMS[id])}</button></div>)}</div>}
      {!casino && <div className="flex gap-2 mt-3">
        <button className="lg-btn" onClick={() => { g.toggleDisco(); }}>🪩 {g.discoOn ? 'Выключить' : 'Включить'} диско-свет</button>
        <button className="lg-btn" onClick={() => { g.danceHere(); close(); }}>💃 Пойти танцевать</button>
      </div>}
      <p className="text-xs opacity-70 mt-2">Крепкое спиртное слегка качает руль. За руль после бара лучше не садиться.</p>
    </>}
    {tab === 'shift' && <>
      <p className="opacity-85">Разлейте напитки пятерым гостям: подойдите к стойке, нажмите E и выберите смену. За каждого гостя $35, за пять — бонус $80.</p>
      <div className="flex gap-2 mt-3">
        <button className="lg-btn lg-btn-main" onClick={() => { if (onShift) g.quitJob(); else g.startShift(); close(); }}>{onShift ? 'Завершить смену' : 'Устроиться барменом'}</button>
      </div>
      {onShift && <p className="mt-2">Вы за стойкой. Подходите к бару и нажимайте R, чтобы обслужить следующего гостя.</p>}
    </>}
  </Modal>);
}

function Ozgim({ g, close }: { g: Game; close: () => void }) {
  const [tab, setTab] = useState<'top' | 'bottom'>('top');
  const s = g.getState();
  const list = tab === 'top' ? TOPS : BOTTOMS;
  const wearing = tab === 'top' ? s.look.top : s.look.bottom;
  const c = () => close();
  return (<Modal title="🛍️ OZGIM — маркетплейс одежды" onClose={close} wide>
    <p className="lg-money-line">Ваши деньги: <b>{$(s.money)}</b> <small className="opacity-70 ml-2">доставка мгновенная, вещь сразу на вас</small></p>
    <div className="lp-tabs">
      <button className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>👕 Верх</button>
      <button className={tab === 'bottom' ? 'on' : ''} onClick={() => setTab('bottom')}>👖 Низ</button>
    </div>
    <div className="lp-grid">
      {list.map((it) => (
        <button key={it.id} className={`lp-item ${wearing === it.id ? 'on' : ''}`} onClick={() => { g.ozgimBuy(it.id, tab); }}>
          <span>{it.name}</span>
          <em>{wearing === it.id ? 'надето' : $(g.ozgimPrice(it.id, tab))}</em>
        </button>))}
    </div>
    <div className="lg-card mt-3">
      <b>Продать надетое</b>
      <p className="text-sm opacity-80">Маркетплейс выкупает вещь за 45% цены и возвращает базовую. Цвет — в примерочной.</p>
      <div className="flex gap-2 mt-2">
        <button className="lg-btn" onClick={() => { g.ozgimSell('top'); c(); }}>Продать верх</button>
        <button className="lg-btn" onClick={() => { g.ozgimSell('bottom'); c(); }}>Продать низ</button>
      </div>
    </div>
    <p className="text-xs opacity-70 mt-2">Переодевание на ходу: инвентарь (I) → «Одежда» — быстрый выбор майки, штанов, куртки и цвета.</p>
  </Modal>);
}

function Inventory({ g, close }: { g: Game; close: () => void }) {
  const [, f] = useState(0); const r = () => f((x) => x + 1);
  const s = g.getState(); const fridge = g.homeFridge();
  const inv = Object.entries(s.inventory);
  return (<Modal title="🎒 Инвентарь" onClose={close} wide>
    <div className={fridge ? 'grid md:grid-cols-2 gap-3' : ''}>
      <div><h3 className="font-bold mb-1">С собой</h3>
        <div className="lg-list">{inv.map(([id, n]) => { const it = ITEMS[id]; if (!it) return null; return <div className="lg-row" key={id}><span className="lg-ico">{it.icon}</span><span className="flex-1">{it.name} ×{n}</span>
          <button className="lg-btn sm" onClick={() => { g.useItem(id); r(); }}>{it.weapon ? 'Взять' : it.smoke ? 'Закурить' : 'Исп.'}</button>
          {fridge && it.fridge && <button className="lg-btn sm" onClick={() => { g.toFridge(id); r(); }}>→ ❄</button>}
          <button className="lg-btn sm" onClick={() => { g.dropItem(id); r(); }}>🗑</button></div>; })}{!inv.length && <p className="opacity-70">Пусто</p>}</div></div>
      {fridge && <div><h3 className="font-bold mb-1">❄ Холодильник</h3><div className="lg-list">{Object.entries(fridge).map(([id, n]) => { const it = ITEMS[id]; return <div className="lg-row" key={id}><span className="lg-ico">{it.icon}</span><span className="flex-1">{it.name} ×{n}</span>
        <button className="lg-btn sm" onClick={() => { g.useItem(id, true); r(); }}>Съесть</button><button className="lg-btn sm" onClick={() => { g.fromFridge(id); r(); }}>Взять</button></div>; })}{!Object.keys(fridge).length && <p className="opacity-70">Холодильник пуст</p>}</div></div>}
    </div>
    {!fridge && <p className="text-xs opacity-70 mt-2">Холодильник доступен у вас дома.</p>}
  </Modal>);
}

function Promo({ g, close }: { g: Game; close: () => void }) {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  return (<Modal title="🎁 Промокод" onClose={close}>
    <input className="lg-input" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Введите код" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setMsg(g.redeemPromo(code)); }} />
    <button className="lg-btn lg-btn-main mt-2" onClick={() => setMsg(g.redeemPromo(code))}>Активировать</button>
    {msg && <p className="mt-2">{msg}</p>}
  </Modal>);
}

function Dealer({ g, close, scooter }: { g: Game; close: () => void; scooter?: boolean }) {
  const list = Object.values(VEHICLES).filter((v) => v.forSale === (scooter ? 'scooter' : 'dealer')).sort((a, b) => a.price - b.price);
  const [color, setColor] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<{ type: string; color: string } | null>(null);
  return (<><Modal title={scooter ? '🛴 Электросамокаты «Вжух Store»' : '🚗 Автосалон'} onClose={close} wide>
    <p className="lg-money-line">Ваши деньги: <b>{$(g.getState().money)}</b></p>
    <div className="lg-list">{list.map((v) => <div className="lg-row wrap" key={v.id}>
      <div className="flex-1 min-w-[150px]"><b>{v.name}</b><small>{VEHICLE_BODY_NAMES[v.body]}</small><small>{v.autopilot ? '🤖 автопилот · ' : ''}{v.ev ? '⚡ электро · ' : ''}до {Math.round(v.maxSpeed * 3.6)} км/ч</small></div>
      <div className="flex gap-1">{v.colors.map((c) => <button key={c} className={`lg-swatch ${(color[v.id] ?? v.colors[0]) === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor({ ...color, [v.id]: c })} />)}</div>
      {!scooter && <button className="lg-btn sm" onClick={() => setTesting({ type: v.id, color: color[v.id] ?? v.colors[0] })}>Тест-драйв</button>}
      <button className="lg-btn sm lg-btn-main" onClick={() => g.buyVehicle(v.id, color[v.id] ?? v.colors[0])}>{$(v.price)}</button></div>)}</div>
  </Modal>{testing && <TestDrive g={g} type={testing.type} color={testing.color} close={() => setTesting(null)} />}</>);
}

/** реплики продавцов авторынка — 50 фраз по пяти темам */
const SELLER_LINES: string[] = [
  // похвала товару
  'Бери не пожалеешь — машина огонь, сам бы ездил!',
  'Это ж жемчужина! Таких на всём рынке одна.',
  'Двигатель шепчет, коробка шелестит — сел и поехал.',
  'По трассе идёт как по рельсам, честно говорю.',
  'Салон чистый, не курили, возили только тёщу в церковь.',
  'Крашена один раз, и то кисточкой… шучу, родная краска!',
  'Гаражное хранение, дедушка ездил летом за грибами.',
  'Масло менял каждые 5 тысяч, есть записи в тетрадке.',
  'Резина почти новая — зиму отстояла в тепле.',
  'Номера красивые, считай бонусом идут.',
  // честность и уклончивость
  'Ну… стучит там что-то. Это возраст, пройдёт само.',
  'Подтекает чуть-чуть — зато масло всегда с собой, практично!',
  'После ДТП была, но удар был в дерево. Дерево в хлам!',
  'Спидометр скручен? Нет, он просто устал считать.',
  'Ржавчина? Это патина, сейчас так модно.',
  'Кондиционер работает. Если ехать с горки и открыть окна.',
  'Один владелец. Ну два. Ладно, их было много, но все хорошие люди.',
  'Check engine горит для красоты, как ночник.',
  'Коробка пинается — это она здоровается.',
  'Документы чистые. Почти. Там мелкий нюанс, решаемый.',
  // про торг
  'Торгуешься — значит душа лежит к машине. Уважаю!',
  'Цена окончательная… хотя для хорошего человека подумаю.',
  'Дешевле только угнанную, но мы же честные люди?',
  'Скину, если без рассрочки и прямо сейчас.',
  'За такие деньги тебе её ещё и помоют. Ладно, не помоют.',
  'У конкурентов дороже и кот в подарок — а кот кому нужен?',
  'Могу скинуть, но тогда без запаски. Шучу. Или нет.',
  'Друг, я эту машину сам искал год, оцени труд!',
  'Ниже себестоимости никак — семья, дети, ипотека на авторынок.',
  'Так и быть, последняя цена. Точно последняя. Наверное.',
  // про жизнь
  'Я на этом рынке двадцать лет, меня каждая собака знает.',
  'Раньше гонял фуры в Магадан, а теперь вот отдыхаю душой.',
  'Купил-продал — это не бизнес, это философия.',
  'Вчера продал такую же твоему соседу. Он доволен. Кажется.',
  'Машины как люди: одни сразу любят, других надо заслужить.',
  'Жена говорит — хватит. А я говорю — ещё одну и хватит.',
  'К чаю ничего не предлагаю, потому что чая нет. Бизнес.',
  'Зимой торговля мёртвая, греюсь тем, что считаю деньги… свои.',
  'Мне этот рынок как дом родной. Даже сплю тут иногда.',
  'Если что сломается — звони. Телефон сменил, но ты всё равно звони.',
  // давление и закрытие сделки
  'Бери сегодня — завтра её уже купят, зуб даю.',
  'За ней очередь стоит, просто они ещё об этом не знают.',
  'Пока думаешь, инфляция растёт. Машина — лучшая инвестиция!',
  'Уходишь — теряешь мечту. Подумай о ней ночью.',
  'Давай рукопожатием закрепим, бумаги потом.',
  'Оформим за пять минут, у меня всё схвачено.',
  'В кредит не даю, но могу дать слово, что машина хорошая.',
  'Тест-драйв? Конечно! Два метра вперёд и два назад.',
  'Деньги вперёд, ключи назад — старая добрая традиция.',
  'Ну что, по рукам? У меня ещё три встречи и обед через час.',
];
const HAGGLE_NO = ['😤 Ни копейкой меньше!', '🙅 Дешевле никак, друг!', '😏 Смешно. Давай серьёзно.', '🚫 Цена окончательная, проверял дважды.'];

function Market({ g, close, sellUid }: { g: Game; close: () => void; sellUid?: string }) {
  const [, f] = useState(0); const r = () => f((x) => x + 1);
  const offers = g.getOffers(); const per = g.marketPeriod(); const s = g.getState();
  const [talk, setTalk] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [deals, setDeals] = useState<Record<string, { price: number; tries: number }>>({});
  const dealOf = (o: MarketOffer) => deals[o.id] ?? { price: o.price, tries: 0 };
  const say = (line: string) => setLog((l) => [...l.slice(-7), line]);
  const talkTo = (o: MarketOffer) => { setTalk(o.id); setLog([`Приветствую, уважаемый! ${SELLER_LINES[Math.floor(Math.random() * SELLER_LINES.length)]}`]); };
  const moreLine = () => say(SELLER_LINES[Math.floor(Math.random() * SELLER_LINES.length)]);
  const bargain = (o: MarketOffer) => {
    const d = dealOf(o);
    if (d.tries >= 4) { say('🙅 Хватит торговаться! Цена и так подарочная.'); return; }
    const chance = [0.65, 0.45, 0.3][Math.min(d.tries, 2)];
    if (Math.random() < chance) {
      const cut = 0.02 + Math.random() * 0.05; // уступка 2–7 %
      const floor = Math.round(carValue(o.type, o.year, o.mileage, o.condition) * 0.72 / 10) * 10;
      const np = Math.max(floor, Math.round(d.price * (1 - cut) / 10) * 10);
      setDeals({ ...deals, [o.id]: { price: np, tries: d.tries + 1 } });
      say(`🤝 Ладно-ладно, ${$(np)}. Но это между нами!`);
    } else {
      setDeals({ ...deals, [o.id]: { price: d.price, tries: d.tries + 1 } });
      say(HAGGLE_NO[Math.floor(Math.random() * HAGGLE_NO.length)]);
    }
  };
  const buy = (o: MarketOffer) => { g.buyMarket(o.id, dealOf(o).price); setTalk(null); r(); };
  return (<Modal title="🚙 Авторынок" onClose={close} wide>
    <p className="lg-money-line">Ваши деньги: <b>{$(s.money)}</b> · предложения обновляются каждые 10 минут</p>
    <h3 className="font-bold mt-2">Продавцы</h3>
    <div className="lg-list">{offers.map((o) => { const val = carValue(o.type, o.year, o.mileage, o.condition); const d = dealOf(o); const open = talk === o.id; return (
      <div className="lg-col-row" key={o.id}>
        <div className="lg-row wrap">
          <span className="lg-swatch" style={{ background: o.color }} /><div className="flex-1 min-w-[160px]"><b>{VEHICLES[o.type].name}</b><small>{VEHICLE_BODY_NAMES[VEHICLES[o.type].body]}</small><small>{o.year} г. · {o.mileage.toLocaleString('ru')} км · состояние {Math.round(o.condition * 100)}% · продавец {o.seller}</small><small>Оценка: {$(val)} · спрос ×{demand(o.type, per).toFixed(2)}</small></div>
          <div className="flex gap-1">
            <button className="lg-btn sm" onClick={() => (open ? setTalk(null) : talkTo(o))}>{open ? '✕' : '💬'}</button>
            <button className="lg-btn sm lg-btn-main" onClick={() => buy(o)}>{d.price < o.price && d.tries > 0 ? <>{<s>{$(o.price)}</s>} <b>→ ${d.price.toLocaleString('ru')}</b></> : $(d.price)}</button>
          </div>
        </div>
        {open && (
          <div className="lg-card mt-1" style={{ background: '#0b1220', border: '1px solid #334155' }}>
            <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>{log.map((m, i) => <p key={i} className="text-sm" style={{ color: '#e2e8f0' }}>🧑‍🔧 <i>{o.seller}:</i> «{m}»</p>)}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              <button className="lg-btn sm" onClick={moreLine}>🗣 Ещё реплика</button>
              <button className="lg-btn sm" disabled={d.tries >= 4} onClick={() => bargain(o)}>🤝 Поторговаться ({Math.max(0, 4 - d.tries)})</button>
              <button className="lg-btn sm lg-btn-main" onClick={() => buy(o)}>Купить за {$(d.price)}</button>
            </div>
          </div>
        )}
      </div>); })}</div>
    <h3 className="font-bold mt-3">Продать свою машину</h3>
    <div className="lg-list">{s.vehicles.map((o) => <div className={`lg-row ${o.uid === sellUid ? 'hl' : ''}`} key={o.uid}><div className="flex-1"><b>{VEHICLES[o.type].name}</b><small>куплена за {$(o.paid)} · состояние {Math.round(o.condition * 100)}% · ремонт {$(repairCost(o))}</small></div><button className="lg-btn sm" onClick={() => { g.sellVehicle(o.uid); r(); }}>Продать {$(sellPrice(o, per))}</button></div>)}{!s.vehicles.length && <p className="opacity-70">Нет машин</p>}</div>
    <p className="text-xs opacity-70 mt-2">Нажмите 💬 — продавец разговорится, а кнопкой «Поторговаться» можно сбить цену на пару процентов. Выгодно покупать ниже оценки и продавать при высоком спросе (рынок берёт 10%).</p>
  </Modal>);
}

function TuningPanel({ g, uid, close }: { g: Game; uid: string; close: () => void }) {
  const o = g.getState().vehicles.find((x) => x.uid === uid)!;
  const [t, setT] = useState<Tuning>({ ...o.tuning });
  const [cat, setCat] = useState<TuneCat>('body');
  const [msg, setMsg] = useState('');
  const [, f] = useState(0);
  useEffect(() => { g.previewTuning(uid, t); }, [t, g, uid]);
  useEffect(() => () => g.revertTuning(uid), [g, uid]);
  const cost = g.tuningCost(o.tuning, t);
  const v = g.ownedVehicleNear(uid);
  const rc = v ? repairCost({ ...o, missing: v.model.missingParts() }) + v.model.missingWheels() * 150 : 0;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="lg-tune-row"><span>{label}</span><div className="flex flex-wrap gap-1">{children}</div></div>;
  const Opt = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => <button className={`lg-chip ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>;
  const seenPatches = new Set<string>();
  const items = TUNE_CATALOG.filter(it => {
    if (it.cat !== cat || Object.keys(it.patch).length === 0 || it.patch.kit || (it.id === 'subwoofer' && !hasSubwooferTrunk(VEHICLES[o.type].body))) return false;
    const key = JSON.stringify(it.patch); if (seenPatches.has(key)) return false; seenPatches.add(key); return true;
  });
  const unavailable = !v;
  const repairPrice = Math.round(rc * (Date.now() < (g.getState().insuredUntil ?? 0) ? 0.5 : 1));
  return (<Modal title="🔧 Мастерская" onClose={() => { g.revertTuning(uid); close(); }} wide>
    <div className="workshop">
      <div className="workshop-hero">
        <div><small>АВТОСЕРВИС / МАШИНА</small><h2>{VEHICLES[o.type].name}</h2><p>Настройте машину и посмотрите результат до оплаты.</p></div>
        <div className="workshop-balance"><small>ВАШ БАЛАНС</small><b>{$(g.getState().money)}</b></div>
      </div>
      {unavailable && <p className="workshop-warning">Вызовите машину поблизости, чтобы выполнить работы.</p>}
      <div className="workshop-layout">
      <div className="workshop-car">
        <CarPreview type={o.type} color={t.paint ?? o.color} tuning={t} />
        <div className="workshop-repair"><div><small>СОСТОЯНИЕ</small><b>{Math.round(o.condition * 100)}%</b><span>Отсутствует деталей: {v ? v.model.missingParts().length + v.model.missingWheels() : '—'}</span></div><button className="lg-btn sm" disabled={unavailable} onClick={() => { g.repairVehicle(uid); f((x) => x + 1); }}>Ремонт · {$(repairPrice)}</button></div>
        {msg && <p className="text-xs mt-1" style={{ color: '#a5b4fc' }}>{msg}</p>}
      </div>
      <div className="workshop-controls">
        <div className="workshop-presets"><b>Готовые образы</b><div className="flex flex-wrap gap-1 mt-1">
          <button className="lg-chip" onClick={() => { setT(p => ({ ...p, rims: 3, spoiler: true, clearance: -1 })); setMsg('Спортивный вид — предпросмотр'); }}>🏁 Спорт</button>
          <button className="lg-chip" onClick={() => { setT(p => ({ ...p, chrome: true, rims: 0, tint: 1 })); setMsg('Классический вид — предпросмотр'); }}>✨ Классика</button>
          <button className="lg-chip" onClick={() => { setT(p => ({ ...p, rims: 1, clearance: 2, neon: null })); setMsg('Для бездорожья — предпросмотр'); }}>🌲 Бездорожье</button>
        </div></div>
        <div className="workshop-tabs">{TUNE_CATS.map((c) => <button key={c.id} className={`lg-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.icon} {c.name}</button>)}</div>
        <div className="workshop-items">
          {items.map((it) => (
            <button key={it.id} disabled={(it.patch.turbo !== undefined && it.patch.turbo < o.tuning.turbo) || (it.patch.engine !== undefined && it.patch.engine < o.tuning.engine)} className={`workshop-item ${Object.entries(it.patch).every(([k, val]) => t[k as keyof Tuning] === val) ? 'on' : ''}`}
              onClick={() => { setT((prev) => ({ ...prev, ...it.patch, turbo: Math.max(o.tuning.turbo, it.patch.turbo ?? prev.turbo), engine: Math.max(o.tuning.engine, it.patch.engine ?? prev.engine) })); setMsg(`${it.name} — предпросмотр`); }}>
              <span className="ti-ico">{it.icon}</span>
              <span className="ti-name">{it.name}</span>
              <span className="ti-price">{g.tuningCost(o.tuning, { ...t, ...it.patch }) ? `Итого ${$(g.tuningCost(o.tuning, { ...t, ...it.patch }))}` : 'Без доплаты'}</span>
            </button>
          ))}
        </div>
        <Row label={`Покраска (${$(TUNE_PRICES.paint)})`}>{PAINT_COLORS.map((c) => <button key={c} className={`lg-swatch ${t.paint === c ? 'on' : ''}`} style={{ background: c }} title={`Краска ${c}`} aria-label={`Краска ${c}`} onClick={() => setT({ ...t, paint: c })} />)}</Row>
        <Row label={`Тонировка (${$(TUNE_PRICES.tint)})`}>{[0, 1, 2, 3].map((n) => <Opt key={n} on={t.tint === n} onClick={() => setT({ ...t, tint: n })}>{['Нет', '30%', '60%', '90%'][n]}</Opt>)}</Row>
        <Row label={`Турбина (${$(TUNE_PRICES.turbo)}/ст.)`}>{[0, 1, 2, 3].map((n) => <Opt key={n} on={t.turbo === n} onClick={() => setT({ ...t, turbo: Math.max(o.tuning.turbo, n) })}>{n ? 'Ст.' + n : 'Сток'}</Opt>)}</Row>
        <Row label={`Двигатель (${$(TUNE_PRICES.engine)}/ст.)`}>{[0, 1, 2, 3].map((n) => <Opt key={n} on={t.engine === n} onClick={() => setT({ ...t, engine: Math.max(o.tuning.engine, n) })}>{n ? 'Ст.' + n : 'Сток'}</Opt>)}</Row>
        <Row label={`Клиренс (${$(TUNE_PRICES.clearance)})`}>{[-2, -1, 0, 1, 2].map((n) => <Opt key={n} on={t.clearance === n} onClick={() => setT({ ...t, clearance: n })}>{n > 0 ? '+' + n : n}</Opt>)}</Row>
        <Row label={`Неон (${$(TUNE_PRICES.neon)})`}><Opt on={!t.neon} onClick={() => setT({ ...t, neon: null })}>Нет</Opt>{NEON_COLORS.map((c) => <button key={c} className={`lg-swatch ${t.neon === c ? 'on' : ''}`} style={{ background: c }} title={`Неон ${c}`} aria-label={`Неон ${c}`} onClick={() => setT({ ...t, neon: c })} />)}</Row>
        <Row label={`Фары (${$(TUNE_PRICES.lights)})`}>{LIGHT_COLORS.map((c) => <button key={c} className={`lg-swatch ${!t.rainbow && t.lights === c ? 'on' : ''}`} style={{ background: c }} title={`Фары ${c}`} aria-label={`Фары ${c}`} onClick={() => setT({ ...t, lights: c, rainbow: false })} />)}<Opt on={!!t.rainbow} onClick={() => setT({ ...t, rainbow: !t.rainbow })}>🌈 радужные ($12 000)</Opt></Row>
        <div className="workshop-checkout"><div className="flex-1"><small>К ОПЛАТЕ</small><b>{$(cost)}</b></div><button className="lg-btn" onClick={() => setT({ ...o.tuning })}>Сброс</button><button className="lg-btn lg-btn-main" disabled={unavailable} onClick={() => { const ok = g.applyTuning(uid, t); setMsg(ok ? 'Установлено и сохранено' : 'Не удалось установить: проверьте баланс и машину'); f((x) => x + 1); }}>Установить</button></div>
        <p className="text-xs opacity-70 mt-1">Фары включаются клавишей H. Радужные фары переливаются всеми цветами. Изменения сохраняются.</p>
      </div>
      </div>
    </div>
  </Modal>);
}

function LookPanel({ g, close, mode }: { g: Game; close: () => void; mode: 'clothes' | 'barber' }) {
  const s = g.getState();
  const [l, setL] = useState<Look>({ ...s.look });
  const [tab, setTab] = useState<'top' | 'outer' | 'dress' | 'bottom' | 'shoes' | 'color' | 'face' | 'hair'>(mode === 'barber' ? 'hair' : 'top');
  useEffect(() => { g.previewLook(l); }, [l, g]);
  const set = (p: Partial<Look>) => setL((o) => ({ ...o, ...p }));
  const price = (() => {
    const old = s.look; let cost = 0;
    if (l.hair !== old.hair) cost += HAIR_STYLES.find((h) => h.id === l.hair)?.price ?? 0;
    if (l.hairColor !== old.hairColor) cost += 30;
    if (l.top !== old.top || l.topColor !== old.topColor) cost += TOPS.find((x) => x.id === l.top)?.price ?? 0;
    if (l.bottom !== old.bottom || l.bottomColor !== old.bottomColor) cost += BOTTOMS.find((x) => x.id === l.bottom)?.price ?? 0;
    if (l.shoes !== old.shoes) cost += 40;
    return cost;
  })();
  const Item = ({ id, name, p }: { id: string; name: string; p: number }) => (
    <button className={`lp-item ${l.top === id || l.bottom === id ? 'on' : ''}`} onClick={() => set(TOPS.some((t) => t.id === id) ? { top: id } : { bottom: id })}>
      <span>{name}</span><em>{l.top === id || l.bottom === id ? 'надето' : `$${p}`}</em>
    </button>
  );
  const Sw = ({ k, list }: { k: keyof Look; list: string[] }) => (
    <div className="lp-swatches">{list.map((c) => <button key={c} className={l[k] === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ [k]: c } as Partial<Look>)} aria-label={c} />)}</div>
  );
  const Chips = ({ k, opts }: { k: keyof Look; opts: { id: string; name: string }[] }) => (
    <div className="lp-chips">{opts.map((o) => <button key={o.id} className={l[k] === o.id ? 'on' : ''} onClick={() => set({ [k]: o.id } as Partial<Look>)}>{o.name}</button>)}</div>
  );
  const tops = TOPS.filter((t) => l.gender === 'f' || !DRESSES.has(t.id));
  const outerIds = ['coat', 'puffer', 'raincoat', 'jacket', 'bomber', 'denim', 'cardigan', 'suit', 'tuxedo', 'tracksuit'];
  const tabs: [typeof tab, string][] = mode === 'barber'
    ? [['hair', '💇 Причёска'], ['color', '🎨 Цвет'], ['face', '🙂 Лицо']]
    : [['top', '👕 Верх'], ['outer', '🧥 Верхняя'], ...(l.gender === 'f' ? [['dress', '👗 Платья'] as [typeof tab, string]] : []), ['bottom', '👖 Низ'], ['shoes', '👟 Обувь'], ['color', '🎨 Цвет'], ['face', '🙂 Лицо']];
  return (
    <Modal title={mode === 'clothes' ? '👕 Магазин одежды «Мода»' : '✂️ Парикмахерская «Стиль»'} onClose={() => { g.revertLook(); close(); }} wide>
      <div className="lp-wrap">
        <div className="lp-side">
          <LookPreview look={l} height={320} />
          <div className="lp-price">
            <div><small>К оплате</small><b>{price ? $(price) : 'бесплатно'}</b></div>
            <button className="lg-btn lg-btn-main" onClick={() => { g.buyLook(l); close(); }}>✔ Купить и надеть</button>
          </div>
        </div>
        <div className="lp-shop">
          <div className="lp-tabs">{tabs.map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
          <div className="lp-body">
            {tab === 'hair' && <>
              <h4>Причёска</h4><Chips k="hair" opts={HAIR_STYLES} />
              <h4>Цвет волос</h4><Sw k="hairColor" list={HAIR_COLORS} />
              <h4>Тон кожи</h4><Sw k="skin" list={SKINS} />
            </>}
            {tab === 'top' && <>
              <h4>Футболки, рубашки, майки</h4>
              <div className="lp-grid">{tops.filter((t) => !outerIds.includes(t.id) && !DRESSES.has(t.id)).map((t) => <Item key={t.id} id={t.id} name={t.name} p={t.price} />)}</div>
              <h4>Цвет</h4><Sw k="topColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'outer' && <>
              <h4>Верхняя одежда</h4>
              <div className="lp-grid">{tops.filter((t) => outerIds.includes(t.id)).map((t) => <Item key={t.id} id={t.id} name={t.name} p={t.price} />)}</div>
              <h4>Цвет</h4><Sw k="topColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'dress' && l.gender === 'f' && <>
              <h4>Платья и сарафаны</h4>
              <div className="lp-grid">{TOPS.filter((t) => DRESSES.has(t.id)).map((t) => <Item key={t.id} id={t.id} name={t.name} p={t.price} />)}</div>
              <h4>Цвет</h4><Sw k="topColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'bottom' && <>
              <h4>Низ</h4>
              <div className="lp-grid">{BOTTOMS.filter((b) => l.gender === 'f' || b.id !== 'skirt').map((b) => <Item key={b.id} id={b.id} name={b.name} p={b.price} />)}</div>
              <h4>Цвет</h4><Sw k="bottomColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'shoes' && <>
              <h4>Обувь ($40)</h4><Sw k="shoes" list={['#111111', '#ffffff', '#78350f', '#1e3a8a', '#be123c', '#a3a3a3']} />
            </>}
            {tab === 'color' && <>
              <h4>Цвет одежды</h4><Sw k="topColor" list={CLOTH_COLORS} />
              <h4>Цвет низа</h4><Sw k="bottomColor" list={CLOTH_COLORS} />
              <h4>Цвет волос</h4><Sw k="hairColor" list={HAIR_COLORS} />
              <h4>Тон кожи</h4><Sw k="skin" list={SKINS} />
            </>}
            {tab === 'face' && <>
              <h4>Глаза</h4><Sw k="eyes" list={EYE_COLORS} />
              <h4>Брови</h4><Chips k="brows" opts={BROWS} />
              <h4>Цвет бровей</h4><Sw k="browColor" list={HAIR_COLORS} />
              <h4>Нос</h4><Chips k="nose" opts={NOSES} />
              <h4>Губы</h4><Chips k="lips" opts={LIP_SHAPES} />
              <h4>Цвет губ</h4><Sw k="lipColor" list={LIP_COLORS} />
            </>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Городские услуги: мойка, шиномонтаж, доставка, парковка, автомат, ломбард, садок, стоянка, запчасти */
const SVC_PARTS = ['canister', 'spare_wheel', 'spare_body', 'spare_glass'];
function SvcPanel({ g, kind, close }: { g: Game; kind: import('../game/game').SvcKind; close: () => void }) {
  const [, force] = useState(0);
  const r = () => force((x) => x + 1);
  const s = g.getState();
  const act = (fn: () => void) => () => { fn(); r(); };
  const car = g.svcCar();
  const carName = car ? car.spec.name : 'машины рядом нет';
  const svc = (s.svc ??= {});
  const pawn = svc.pawn ?? [];
  const TITLES: Record<string, string> = {
    wash: '💦 Автомойка', tire: '🛞 Шиномонтаж', food: '🛵 Доставка еды', park: '🅿️ Платная парковка',
    slot: '🎰 Игровой автомат', pawn: '💰 Ломбард', fish: '🎣 Садок', impound: '🚨 Штрафстоянка и эвакуатор', parts: '🔧 Автомагазин',
  };
  const body = () => {
    if (kind === 'wash') return (<>
      <p className="lg-money-line">Машина у бокса: <b>{carName}</b></p>
      <div className="lg-list">
        <div className="lg-row"><span className="lg-ico">🧼</span><div className="flex-1"><b>Полировка кузова</b><small>+3% состояния кузова</small></div><button className="lg-btn sm" onClick={act(() => g.washCar('full'))}>$400</button></div>
        <div className="lg-row"><span className="lg-ico">✨</span><div className="flex-1"><b>Детейлинг</b><small>химчистка салона, +9% состояния</small></div><button className="lg-btn sm" onClick={act(() => g.washCar('premium'))}>$900</button></div>
      </div>
      <p className="text-xs opacity-70 mt-2">Машины больше не загрязняются.</p>
    </>);
    if (kind === 'tire') return (<>
      <p className="lg-money-line">Машина: <b>{carName}</b>{car && <> · колёс нет: <b>{car.model.missingWheels()}</b>, спущено: <b>{car.model.flatCount()}</b>, деталей нет: <b>{car.model.missingParts().length}</b></>}</p>
      <div className="flex flex-col gap-2">
        <button className="lg-btn" onClick={act(() => g.tireFix('pump'))}>Подкачать колёса — $40</button>
        <button className="lg-btn" onClick={act(() => g.tireFix('wheel'))}>Заменить отсутствующие колёса — $220</button>
        <button className="lg-btn lg-btn-main" onClick={act(() => g.tireFix('full'))}>Полный шиномонтаж + состояние — $650</button>
      </div>
      <p className="text-xs opacity-70 mt-2">Дешевле поставить запчасть самому: они продаются в автомагазине у автосервисов.</p>
    </>);
    if (kind === 'food') return (<>
      <p className="lg-money-line">Заказ привозят к вам: <b>{g.deliveryLeft() > 0 ? `в пути, ~${g.deliveryLeft()} с` : 'свободно'}</b></p>
      <div className="lg-list">
        <div className="lg-row"><span className="lg-ico">🍕</span><div className="flex-1"><b>Пицца ×2</b><small>~50 с</small></div><button className="lg-btn sm" onClick={act(() => g.orderFood('pizza'))}>$25</button></div>
        <div className="lg-row"><span className="lg-ico">🍔</span><div className="flex-1"><b>Бургер ×2</b><small>~35 с</small></div><button className="lg-btn sm" onClick={act(() => g.orderFood('burger'))}>$15</button></div>
        <div className="lg-row"><span className="lg-ico">🌯</span><div className="flex-1"><b>Шаурма ×2</b><small>~30 с</small></div><button className="lg-btn sm" onClick={act(() => g.orderFood('shawarma'))}>$12</button></div>
      </div>
    </>);
    if (kind === 'park') {
      const left = Math.ceil(g.parkingLeft() / 60000);
      return (<>
        <p className="lg-money-line">Оплачено: <b>{g.parkingLeft() > 0 ? `ещё ${left} мин` : 'нет'}</b> · своих машин у паркомата без оплаты увезут на штрафстоянку</p>
        <div className="flex flex-col gap-2">
          <button className="lg-btn" onClick={act(() => g.payParking(15))}>15 минут — $30</button>
          <button className="lg-btn" onClick={act(() => g.payParking(60))}>1 час — $90</button>
          <button className="lg-btn lg-btn-main" onClick={act(() => g.payParking(180))}>3 часа — $200</button>
        </div>
      </>);
    }
    if (kind === 'slot') {
      const res = g.slotResult;
      const stat = svc;
      return (<>
        <div className="lg-card" style={{ textAlign: 'center', fontSize: 30, letterSpacing: 8 }}>{res ? res.syms.join('') : '❔❔❔'}</div>
        <p className="lg-money-line">{res ? (res.win ? `Выигрыш: ${$(res.win)} (ставка ${$(res.bet)})` : `Ставка ${$(res.bet)} проиграна`) : 'Три одинаковых — ×9, редкие — ×25, два одинаковых — ×2'}</p>
        <div className="flex flex-col gap-2">
          <button className="lg-btn" onClick={act(() => g.spinSlot(50))}>Ставка $50</button>
          <button className="lg-btn" onClick={act(() => g.spinSlot(200))}>Ставка $200</button>
          <button className="lg-btn lg-btn-main" onClick={act(() => g.spinSlot(1000))}>Ставка $1 000</button>
        </div>
        <p className="text-xs opacity-70 mt-2">Спинов: {stat.slotSpins ?? 0} · в плюсе: {$(stat.slotWin ?? 0)}</p>
      </>);
    }
    if (kind === 'pawn') {
      const items = Object.entries(s.inventory).filter(([id, n]) => n > 0 && ITEMS[id] && !ITEMS[id].weapon && !ITEMS[id].seed && !ITEMS[id].drug);
      return (<>
        <p className="lg-money-line">Даём 40% цены, выкуп +15%. Залогов: <b>{pawn.length}</b></p>
        <div className="lg-list">
          {items.map(([id, n]) => (<div className="lg-row" key={id}><span className="lg-ico">{ITEMS[id].icon}</span><div className="flex-1"><b>{ITEMS[id].name}</b><small>×{n} · залог {$(ITEMS[id].price * 0.4)}</small></div>
            <button className="lg-btn sm" onClick={act(() => g.pawnItem(id, 1))}>1</button>
            <button className="lg-btn sm" onClick={act(() => g.pawnItem(id, n))}>всё</button></div>))}
          {!items.length && <p className="opacity-70">Закладывать нечего</p>}
        </div>
        <div className="lg-card mt-3"><b>Ваши залоги</b>
          {pawn.map((t) => (<div className="lg-row" key={t.id}><span className="lg-ico">{ITEMS[t.item]?.icon ?? '📦'}</span><div className="flex-1"><b>{ITEMS[t.item]?.name ?? t.item} ×{t.n}</b><small>заложено за {$(t.pay)}</small></div>
            <button className="lg-btn sm" onClick={act(() => g.pawnBuyBack(t.id))}>Выкуп {$(t.buy)}</button></div>))}
          {!pawn.length && <p className="opacity-70">Пока пусто</p>}
        </div>
      </>);
    }
    if (kind === 'fish') {
      const n = s.inventory.fish ?? 0;
      return (<>
        <p className="lg-money-line">В садке: <b>{n}</b> шт · цена $9/шт, от 10 шт — бонус $40</p>
        <button className="ui-btn lg-btn-main" onClick={act(() => g.sellFish())}>Сдать улов — {$(n * 9 + (n >= 10 ? 40 : 0))}</button>
        <p className="text-xs opacity-70 mt-2">Удочку и снасти продают в «Поплавке». У воды появится подсказка «Забросить удочку».</p>
      </>);
    }
    if (kind === 'impound') {
      const uidv = g.impoundUid();
      const car = uidv ? s.vehicles.find((v) => v.uid === uidv) : null;
      return (<>
        <p className="lg-money-line">На стоянке: <b>{car ? `${VEHICLES[car.type].name} (${car.color})` : 'пусто'}</b></p>
        <div className="flex flex-col gap-2">
          <button className="lg-btn lg-btn-main" onClick={act(() => g.retrieveImpound())}>Забрать машину — {$(g.impoundFee())}</button>
          <button className="lg-btn" onClick={act(() => g.callTow())}>🚚 Вызвать эвакуатор к себе — от $800</button>
        </div>
        <p className="text-xs opacity-70 mt-2">Эвакуатор привозит вашу машину прямо к вам — даже если она на другом конце карты.</p>
      </>);
    }
    if (kind === 'charge') return (<>
      <p className="lg-money-line">Машина: <b>{carName}</b>{car && <> · заряд <b>{Math.round(car.fuel)}%</b>{car.spec.ev ? ' · электромобиль' : ''}</>}</p>
      <button className="lg-btn lg-btn-main" onClick={act(() => g.chargeCar())}>⚡ Зарядить до 100%</button>
      <p className="text-xs opacity-70 mt-2">Станция заряжает только электромобили (Электра S, Лунь EV7, Тайфун X9). Цена ≈ $1,2 за процент.</p>
    </>);
    // запчасти
    return (<>
      <p className="lg-money-line">Запчасти ставятся из инвентаря (I) — подойдите к своей машине</p>
      <div className="lg-card mt-2 mb-2">
        <b>🛠 Гидравлическая подвеска</b>
        <small>{car
          ? !car.owned ? 'ставится только на свою машину'
            : car.owned.hydro ? 'уже установлена — PageUp/PageDown высота, U прыжок'
            : car.hydroCapable ? 'три положения высоты и прыжок кузова' : 'на этот кузов не встаёт'
          : 'подъедьте на машине'}</small>
        {car && car.owned && !car.owned.hydro && car.hydroCapable
          ? <button className="lg-btn lg-btn-main" onClick={act(() => g.installHydro())}>Установить — {$(HYDRO_PRICE)}</button>
          : <button className="lg-btn" disabled>{(car && car.owned && car.owned.hydro) ? 'Установлено ✓' : 'Недоступно'}</button>}
      </div>
      <div className="lg-list">{SVC_PARTS.map((id) => { const it = ITEMS[id]; return (
        <div className="lg-row" key={id}><span className="lg-ico">{it.icon}</span><div className="flex-1"><b>{it.name}</b><small>{it.fuel ? `+${it.fuel} л в бак` : it.part === 'wheel' ? 'замена колеса' : it.part === 'glass' ? 'вклейка стёкол' : 'кузовная деталь'}</small></div>
          <button className="lg-btn sm" onClick={act(() => g.buy(id))}>{$(it.price)}</button></div>); })}</div>
    </>);
  };
  return <Modal title={TITLES[kind] ?? 'Услуги'} onClose={close}>{body()}</Modal>;
}
