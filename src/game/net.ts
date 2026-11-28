import type { VoiceSignal } from './voice';
// Онлайн-режим: клиент WebSocket под протокол сервера.
//
// Основной протокол (как в задании):
//   клиент → {type:'login', name, gender:'m'|'f'}
//   сервер → {type:'login_success', player:{id?, name?, money?, x?, z?, rot?, gender?}}
//   клиент → {type:'move', x, z, rot}                          — 15 раз в секунду
//   сервер → {type:'players_list', players:[{id,name,x,z,rot,gender?,money?,vehicle?}]}
//   клиент → {type:'chat', text}      сервер → {type:'chat', name, text}
//   сервер → {type:'error', text}                              — бан: показать текст и отключиться
//
// Дополнительно сохранена совместимость со «старым расширенным» сервером
// (init/players + состояние через chat с префиксами §LG / §LGE / §LGN).
// Префиксные сообщения отправляются ТОЛЬКО если сервер себя проявил как старый,
// иначе на простом сервере они превратились бы в мусор в общем чате.

/** Адрес сервера. Замените на адрес из Colab — или укажите его прямо в меню игры. */
export const ONLINE_URL = 'wss://sandbank-economic-zeppelin.ngrok-free.dev';

const SERVER_KEY = 'losgorod_server';
const TOKEN_KEY = 'losgorod_online_token_';
/** ключ устройства для ника: сервер привязывает аккаунт к нему, чтобы ник не мог занять кто угодно */
export function onlineToken(nick: string): string {
  const k = TOKEN_KEY + nick.trim().toLowerCase();
  try {
    let t = localStorage.getItem(k);
    if (!t) {
      t = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(k, t);
    }
    return t;
  } catch { return ''; }
}
export function setOnlineToken(nick: string, token: string) {
  try { if (token) localStorage.setItem(TOKEN_KEY + nick.trim().toLowerCase(), token); } catch { /* */ }
}
const PREFIX = '§LG';
const EV = '§LGE';
const PEDS = '§LGN';
const ME = '§LGM';
const NEWS = '§LGS';
/** переводы игрокам (деньги/предметы) — идут обычным сообщением чата */
const GIFT = '§LGT';
/** сколько раз пробуем переподключиться, если связь была установлена и оборвалась */
const MAX_RETRY = 4;
/** таймаут установки соединения, мс */
const CONNECT_TIMEOUT = 9000;

/** адрес сервера: сохранённый вручную → VITE_ONLINE_URL → ONLINE_URL */
/** приводит адрес из Colab к виду ws(s)://…: https://x → wss://x, голый хост → wss://хост */
export function normalizeServerUrl(raw: string): string {
  let t = String(raw || '').trim().replace(/\s+/g, '');
  if (!t) return '';
  t = t.replace(/^https?:\/\//i, (m) => (m.toLowerCase() === 'https://' ? 'wss://' : 'ws://'));
  if (!/^wss?:\/\//i.test(t)) t = 'wss://' + t.replace(/^\/+/, '');
  t = t.replace(/\/+$/, '');
  try { const u = new URL(t); if (!u.hostname) return ''; } catch { return ''; }
  return t;
}
export function getServerUrl(): string {
  // ?srv=wss://… — ссылка из Colab-панели: применяем один раз и запоминаем в браузере
  try {
    const q = new URLSearchParams(window.location.search).get('srv');
    if (q) {
      const url = normalizeServerUrl(q);
      if (url) { try { localStorage.setItem(SERVER_KEY, url); } catch { /* */ } return url; }
    }
  } catch { /* нет document/window — голова не нужна */ }
  try {
    const u = localStorage.getItem(SERVER_KEY);
    const url = u ? normalizeServerUrl(u) : '';
    if (url) return url;
  } catch { /* приватный режим */ }
  const env = (import.meta.env as Record<string, string | undefined> | undefined)?.VITE_ONLINE_URL;
  if (env && /^wss?:\/\//i.test(env)) return env;
  return ONLINE_URL;
}
/** сохранить адрес сервера (пустая строка — сброс на адрес по умолчанию) */
export function setServerUrl(url: string) {
  const t = normalizeServerUrl(url);
  try { if (t) localStorage.setItem(SERVER_KEY, t); else localStorage.removeItem(SERVER_KEY); } catch { /* */ }
}
export function savedServerUrl(): string { try { return localStorage.getItem(SERVER_KEY) ?? ''; } catch { return ''; } }
export function hostOf(url: string) { return url.replace(/^wss?:\/\//i, '').replace(/\/.*$/, ''); }

/** цвет игрока/машины по полу: синий — М, розовый — Ж */
export const GENDER_COLOR = { m: '#3b82f6', f: '#f472b6' } as const;
export function genderColor(g?: string | null): string { return g === 'f' ? GENDER_COLOR.f : GENDER_COLOR.m; }

export interface RemoteState {
  x: number; y: number; z: number; a: number; s: number;
  v: string; c: string; seat: number;            // машина, цвет (если водитель)
  r?: number;                                     // id водителя, если едет пассажиром
  n?: string;                                     // ник
  i?: string;                                     // ключ интерьера ('' — улица)
  p?: string; k?: number; w?: number; pt?: number; // поза, фаза 0..1, оружие в руке, наклон прицела
  hp?: number;
  l?: [string, string, string, string, string, string, string, string, string]; // gender, skin, hair, hairColor, top, topColor, bottom, bottomColor, shoes
  lean?: number; wh?: number; lt?: number; steer?: number; slip?: number;
  pn?: string; pf?: number; pb?: number;
  /** Local owner's inscription on the driven vehicle; cosmetic, not an ownership proof. */
  vt?: string;
  /** Cosmetic snapshots of the owner's parked inscribed buses/trucks while connected. */
  vp?: import('./parkedInscribedVehicles').ParkedInscribedVehicle[];
  /** Parked vehicles visible only while the owner is connected; cosmetic. */
  pv?: import('./parkedVehicleVisual').ParkedVehicleVisual[];
  pp?: import('./parkedVehicleVisual').ParkedVehiclePlate[];
  /** Visible parked trunk animations, cosmetic and valid only while owner is online. */
  tr?: import('./parkedTrunkVisual').ParkedTrunkVisual[];
  th?: string; // id of the car whose lid this player is pulling, cosmetic only
  fish?: 1;                                      // только визуальная удочка, не улов
  cr?: number;                                    // присед
  lk?: number;                                    // машина заперта
  em?: number;                                    // время начала эмоции
  tx?: number;                                    // счётчик такси включён
  pr?: [string, number][];                        // недвижимость: [id "b:unit", заперто 0/1]
  ls?: Listing[];                                 // объявления на автобазаре
}
export interface Listing { slot: number; type: string; color: string; year: number; mil: number; cond: number; price: number; tun?: string }
export type NetEvent =
  | { e: 'social'; t: number; op: 'request' | 'accept' | 'decline'; action: 'handshake' }
  | { e: 'shot'; o: [number, number, number]; p: [number, number, number]; i: string }
  | { e: 'hit'; t: number; d: number; k: 'fist' | 'gun' | 'knife'; hx: number; hz: number; heavy?: boolean }
  | { e: 'dead'; by: number }
  | { e: 'pedhit'; o: number; i: number; d: number; heavy?: boolean; gun?: boolean; fx: number; fz: number }
  | { e: 'pay'; t: number; amt: number; why: string }
  | { e: 'dm'; t: number; text: string; n: string }
  | { e: 'trade'; t: number; op: 'req' | 'acc' | 'dec' | 'cancel' | 'offer' | 'ready' | 'unready'; items?: [string, number][]; money?: number; h?: string; h2?: string }
  | { e: 'buyreq'; t: number; slot: number; price: number }
  | { e: 'sold'; t: number; slot: number; ok: boolean; car?: { type: string; color: string; year: number; mil: number; cond: number; tun?: string } };

export interface RemotePlayer {
  id: number; name: string; nick: string | null; color: string;
  x: number; y: number;            // y здесь — это координата Z мира (совместимость со старым кодом)
  rot: number; gender: 'm' | 'f';
  st: RemoteState | null; stT: number; seenT: number;
  vehicle?: string; money?: number;
  /** номерной знак с сервера (car_number) */
  number?: string;
}
export interface AuctionLot {
  id: number; kind: 'vehicle' | 'business' | 'house' | 'apartment'; assetKey: string;
  vehicleType: string; seller: string; startPrice: number; step: number; endsAt: number;
  bid: number | null; bidder: string | null;
}
export interface AuctionSnapshot { lots: AuctionLot[]; serverTime: number; receivedAt: number; }
export interface ChatMsg { name: string; text: string; color: string; t: number; me?: boolean; kind?: 'me' | 'news' | 'sys' | 'cmd' | 'weather' }
export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

/** данные игрока, пришедшие с сервера в login_success (деньги, координаты) */
/** объявление на щите, как его хранит сервер */
export interface RemoteAd { text: string; tag: string; who: string; until: number }

export interface ServerPlayer {
  id?: number; name?: string; nick?: string; money?: number;
  x?: number; y?: number; z?: number; rot?: number; a?: number; gender?: string;
  /** серверный номерной знак */
  number?: string | null;
}
export interface PlayersListEntry {
  id?: number; name?: string; nick?: string;
  x?: number; y?: number; z?: number; rot?: number; a?: number;
  gender?: string; color?: string; money?: number;
  vehicle?: string | null; v?: string | null;
  /** серверный номерной знак машины игрока */
  number?: string | null;
}
interface LegacyPlayer { x?: number; y?: number; z?: number; color?: string; name?: string; gender?: string; rot?: number }
export interface NetworkRadio { owner:number; kind:'vehicle'|'computer'; url:string; x:number; z:number; buildingId:number|null; exteriorX:number; exteriorZ:number; position:number; outside:number; inside:number; playing:boolean; updatedAt:number }
interface Msg {
  type?: string; id?: number; name?: string; nick?: string; text?: string; gender?: string;
  money?: number; player?: ServerPlayer;
  players?: PlayersListEntry[] | Record<string, LegacyPlayer | PlayersListEntry>;
  x?: number; z?: number; rot?: number;
  act?: string; reason?: string; accountState?: unknown; accountRevision?: number; accountSaveId?: string; saveId?: string; revision?: number; accounts?: number;
  /** 🎁 выдача предметов из панели Colab: режим, id предмета, количество */
  mode?: string; item?: string; qty?: number;
  /** авторизация онлайна: токен устройства и пароль-подсказка */
  token?: string; pass?: string;
  /** что умеет сервер (наш сервер пересылает §-протокол и умеет админ-команды) */
  caps?: { state?: number; peds?: number; adm?: number; relay?: number; accounts?: number; saveIds?: number; voice?: number; radio?: number; fullPlayers?: number; offlineVehicles?: number; hamsterWorld?: number };
  radios?: unknown; hamster?: unknown; hamsterWorld?: unknown; world?: unknown;
  /** реклама на щитах: полный список от сервера и ответ на покупку */
  ads?: Record<string, RemoteAd>; ok?: boolean; error?: string;
  from?: number; signal?: VoiceSignal;
  lots?: unknown; serverTime?: number; owners?: unknown; complete?: boolean;
  /** машиночитаемая причина отказа входа: banned / maintenance / device / replaced / name */
  code?: string;
  /** админ-команды: id модели авто для спавна и прочие параметры */
  carId?: string;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : undefined);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const gOf = (v: unknown, fallback: 'm' | 'f'): 'm' | 'f' => (v === 'f' || v === 'female' || v === 'ж' ? 'f' : v === 'm' || v === 'male' || v === 'м' ? 'm' : fallback);

/**
 * Проверка доступности сервера до загрузки мира.
 * Открывает сокет, ждёт onopen и сразу закрывает его.
 */
export function probeServer(url = getServerUrl(), timeout = CONNECT_TIMEOUT): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let ws: WebSocket | null = null;
    let done = false;
    let timer = 0;
    const finish = (err?: string) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try { ws?.close(); } catch { /* */ }
      if (err) reject(new Error(err)); else resolve();
    };
    try { ws = new WebSocket(url); } catch { reject(new Error('bad-url')); return; }
    timer = window.setTimeout(() => finish('timeout'), timeout);
    ws.onopen = () => finish();
    ws.onerror = () => finish('error');
    ws.onclose = () => finish('closed');
  });
}

/**
 * Подробная диагностика сервера для окна «Нет связи».
 * WebSocket-ошибка сама по себе ничего не объясняет, поэтому дополнительно
 * дёргаем HTTP-ручку /version и смотрим, что именно ответило:
 *   ok        — сервер жив и это наш сервер (можно жать «Повторить вход»);
 *   dead      — туннель не отвечает вовсе (Colab заснул / ngrok отключился);
 *   notserver — туннель отвечает, но игрового сервера за ним нет (типичный 404);
 *   blocked   — HTTP отвечает, а WebSocket не пускают (прокси, антивирус, сеть).
 */
export interface ServerDiag {
  reason: 'ok' | 'dead' | 'notserver' | 'blocked' | 'nohttp';
  url: string;
  http?: number;
  build?: string;
  version?: string;
  online?: number;
  uptime?: number;
  detail: string;
  /** короткая строка для окна ошибки */
  text: string;
}

/** https-адрес той же машины: wss://x → https://x */
function httpOf(url: string) {
  return url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://').replace(/\/+$/, '');
}

export async function diagnoseServer(url = getServerUrl(), timeout = 4500): Promise<ServerDiag> {
  const http = httpOf(url);
  const base: ServerDiag = { reason: 'dead', url, detail: 'нет ответа', text: 'Сервер не отвечает' };
  if (typeof fetch !== 'function') return { ...base, reason: 'nohttp', detail: 'в этом браузере нет fetch' };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : 0;
  // бесплатный ngrok показывает браузеру страницу-заглушку вместо ответа сервера;
  // заголовок её отключает. Шлём его только если первый ответ — не наш JSON.
  const get = (hdr?: Record<string, string>) =>
    fetch(`${http}/version?t=${Date.now()}`, { cache: 'no-store', signal: ctrl?.signal, headers: hdr });
  try {
    let r = await get();
    let type = r.headers.get('content-type') || '';
    if (!(r.ok && type.includes('json'))) {
      try {
        const r2 = await get({ 'ngrok-skip-browser-warning': '1' });
        if (r2.ok && (r2.headers.get('content-type') || '').includes('json')) { r = r2; type = r2.headers.get('content-type') || ''; }
      } catch { /* заглушка ngrok не главная причина — остаётся первый ответ */ }
    }
    if (r.ok && type.includes('json')) {
      const j = (await r.json()) as { ok?: boolean; server?: string; build?: string; version?: string; online?: number; uptime?: number };
      if (j && j.server === 'los-gorod') {
        const secs = j.uptime ?? 0;
        const up = secs > 3600 ? `${Math.round(secs / 3600)} ч` : secs > 60 ? `${Math.round(secs / 60)} мин` : `${Math.round(secs)} с`;
        return {
          reason: 'ok', url, http: r.status, build: j.build, version: j.version, online: j.online, uptime: secs,
          detail: `игровой сервер на связи · сборка ${j.build ?? '?'} · аптайм ${up}`,
          text: 'Сервер отвечает, но подключение не установилось — нажмите «Повторить вход»',
        };
      }
      return { reason: 'notserver', url, http: r.status, detail: 'по адресу отвечает не игровой сервер', text: 'Адрес туннеля ведёт не на игровой сервер' };
    }
    // 404/HTML — туннель жив, а сервера за ним нет: самый частый случай
    return {
      reason: 'notserver', url, http: r.status,
      detail: `туннель отвечает, но сервера за ним нет (HTTP ${r.status})`,
      text: 'Сервер не запущен: туннель ngrok работает, а игровой сервер за ним — нет. Перезапустите серверную ячейку в Colab',
    };
  } catch {
    return {
      reason: 'dead', url,
      detail: 'туннель не отвечает (Colab заснул или ngrok отключён)',
      text: 'Туннель сервера не отвечает. Запустите серверную ячейку в Colab и нажмите «Постоянная ссылка»',
    };
  } finally { if (timer) clearTimeout(timer); }
}

export class NetClient {
  ws: WebSocket | null = null;
  id: number | null = null;
  status: NetStatus = 'offline';
  players = new Map<number, RemotePlayer>();
  chat: ChatMsg[] = [];
  /** последние данные игрока с сервера (login_success) */
  me: ServerPlayer | null = null;
  /** был ли уже login_success в этой сессии (повторный приходит при смене денег) */
  private loggedOnce = false;
  private authenticated = false;
  /** текст бана, если сервер нас выкинул */
  kicked: string | null = null;
  onChange: (() => void) | null = null;
  onEvent: ((from: number, ev: NetEvent) => void) | null = null;
  voiceSupported = false;
  radioSupported = false;
  onRadios: ((radios:NetworkRadio[])=>void) | null = null;
  onHamsterSpawn: ((spawn: unknown)=>void) | null = null;
  onHamsterWorld: ((world: unknown)=>void) | null = null;
  onHamsterPetError: ((error: string)=>void) | null = null;
  hamsterWorldSupported = false;
  private fullPlayers = false;
  private offlineVehiclesSupported = false;
  private offlineVehiclesRequestedAt = -Infinity;
  offlineVehicles:unknown = [];
  onVoice: ((from:number, signal:VoiceSignal)=>void) | null = null;
  onVoiceDisconnect: (()=>void) | null = null;
  onPeds: ((from: number, list: number[][], vehs: (string | number)[][]) => void) | null = null;
  onNews: ((name: string, text: string) => void) | null = null;
  /** объявления на щитах: сервер прислал полный список (общий для всех игроков) */
  onAds: ((ads: Record<string, RemoteAd>) => void) | null = null;
  /** ответ на покупку щита: ok/причина */
  onAdResult: ((r: { id: string; ok: boolean; error?: string }) => void) | null = null;
  /** последние известные объявления (для панели СМИ) */
  ads: Record<string, RemoteAd> = {};
  auction: AuctionSnapshot | null = null;
  kioskOwners: { owners: Map<number, string | null>; complete: boolean; receivedAt: number } | null = null;
  private kioskOwnersRequested = 0;
  /** входящий перевод от другого игрока */
  onGift: ((from: number, g: { k: 'money' | 'item'; v: number | string; n: number; nick: string }) => void) | null = null;
  /** login_success: сервер прислал деньги/координаты (first — первый вход) */
  onLogin: ((p: ServerPlayer, first: boolean, state?: unknown) => void) | null = null;
  onSaveError: ((text: string) => void) | null = null;
  private revision: number | null = null;
  private flight: { json: string; revision: number; id: string } | null = null;
  private pending: string | null = null;
  private conflict = false;
  private handshake = false;
  private saveIds = false;
  get accountSaved() { return !this.flight && !this.pending && !this.conflict && this.authenticated; }
  /** Experimental synchronization must wait for this exact acknowledged revision. */
  get accountRevision() { return this.accountSaved ? this.revision : null; }
  /** Lab only: install an authoritative revision only with an idle save queue. */
  adoptEconomyRevisionLab(base: number, next: number): boolean {
    if (!this.ready || !this.accountSaved || this.revision !== base || !Number.isSafeInteger(next) || next < base) return false;
    this.revision = next; this.lastSaveMoney = NaN; return true;
  }
  /** {type:'error'} — бан/кик: показать текст и отключиться */
  onError: ((text: string) => void) | null = null;
  /** сервер недоступен (не удалось подключиться) */
  onServerDown: (() => void) | null = null;
  /** команда из админ-панели Colab (например, телепорт) */
  onAdmin: ((act: string, m: Msg) => void) | null = null;
  private want = false; private retry = 0; private retryTimer = 0; private connectTimer = 0;
  private everConnected = false; private dead = false;
  /** сколько раз подряд пробовали войти после «сессия занята» */
  private rejoin = 0;
  /** один пробный §-пакет для серверов без caps: если он вернётся эхом — протокол работает */
  private probeSent = false;
  /** сервер понимает расширенные §-сообщения */
  private legacy = false;
  private lastMove = { x: NaN, z: NaN, rot: NaN };
  /** деньги онлайна: единственный источник правды — сервер (никакого слияния с локальным сейвом) */
  money = 0;
  /** токен устройства для этого ника */
  token = '';
  constructor(public nick: string, public gender: 'm' | 'f' = 'm', public url = getServerUrl(), private credentials?: { mode: 'login' | 'register'; password: string; backup?: string }) {}
  /** локальное зеркало серверного баланса (только для отправки save) */
  setMoney(v: number) { this.money = Math.max(0, Math.min(2147483647, Math.round(v))); }
  private loginMsg() {
    // никах денег: новый ник создаётся сервером с чистым стартовым капиталом
    return { type: 'login', name: this.nick, gender: this.gender, ...this.credentials, mode: this.loggedOnce ? 'login' : this.credentials?.mode };
  }

  get legacyServer() { return this.legacy; }
  get ready() { return this.status === 'online' && !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  /** Открытый WebSocket сам по себе ещё не означает подтверждённый вход. */
  get sessionReady() { return this.ready && this.authenticated && !this.conflict; }

  connect() {
    if (this.want && this.ws) return;
    this.want = true; this.dead = false; this.everConnected = false; this.retry = 0; this.kicked = null;
    this.loggedOnce = false; this.authenticated = false; this.lastSaveMoney = NaN;
    this.open();
  }
  private open() {
    if (!this.want || this.dead) return;
    this.status = this.retry ? 'reconnecting' : 'connecting';
    this.auction = null; this.kioskOwners = null; this.kioskOwnersRequested = 0;
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.fail(); return; }
    this.ws = ws;
    window.clearTimeout(this.connectTimer);
    this.connectTimer = window.setTimeout(() => {
      if (this.ws === ws && ws.readyState !== WebSocket.OPEN) { try { ws.close(); } catch { /* */ } this.fail(); }
    }, CONNECT_TIMEOUT);
    ws.onopen = () => {
      if (this.ws !== ws) return; // late event from a replaced connection
      window.clearTimeout(this.connectTimer);
      this.status = 'online'; this.retry = 0; this.everConnected = true;
      // Пароль отправляется только серверу, подтвердившему поддержку аккаунтов.
      this.handshake = false;
      this.connectTimer = window.setTimeout(() => { if (this.ws === ws && !this.handshake) this.die('Обновите сервер Colab: безопасный вход не поддерживается'); }, CONNECT_TIMEOUT);
      this.sys('Подключено к серверу');
      this.onChange?.();
    };
    ws.onmessage = (e) => { if (this.ws === ws && typeof e.data === 'string') this.handle(e.data); };
    ws.onerror = () => { /* обработка в onclose */ };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      window.clearTimeout(this.connectTimer);
      this.onVoiceDisconnect?.(); this.voiceSupported=false; this.radioSupported=false; this.hamsterWorldSupported=false; this.offlineVehiclesSupported=false;this.offlineVehicles=[];this.offlineVehiclesRequestedAt=-Infinity; this.onRadios?.([]);
      this.ws = null; this.id = null; this.authenticated = false; this.lastSaveMoney = NaN; this.auction = null; this.kioskOwners = null; this.kioskOwnersRequested = 0;
      if (this.dead || !this.want) { this.status = 'offline'; this.onChange?.(); return; }
      this.fail();
    };
  }
  /** единая точка обработки обрыва: пока не подключались — сервер недоступен, иначе — переподключение */
  private fail() {
    if (!this.want || this.dead) return;
    if (!this.everConnected) { this.die(null); return; }
    this.retry++;
    if (this.retry > MAX_RETRY) { this.die(null); return; }
    this.status = 'reconnecting';
    if (this.retry === 1) this.sys('Соединение потеряно — переподключение…');
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.open(), Math.min(15000, 1200 * this.retry));
    this.onChange?.();
  }
  /** мягкий отказ: показываем причину, но не запрещаем повторную попытку входа */
  private softFail(text: string) {
    this.want = false; this.dead = false; this.status = 'offline';
    const ws = this.ws; this.ws = null; this.id = null; this.authenticated = false; this.lastSaveMoney = NaN;
    try { ws?.close(); } catch { /* */ }
    this.players.clear();
    this.kicked = text;
    this.sys(text);
    this.onError?.(text);
    this.onChange?.();
  }
  /** попытка снова войти после ошибки (кнопка «Повторить» в окне) */
  retryLogin() { const ws = this.ws; this.ws = null; try { ws?.close(); } catch { /* */ } this.authenticated = false; this.dead = false; this.want = true; this.rejoin = 0; this.retry = 0; this.kicked = null; this.open(); }
  /** окончательно отключаемся: текстом бана или «сервер недоступен» */
  private die(text: string | null) {
    this.dead = true; this.want = false;
    window.clearTimeout(this.retryTimer); window.clearTimeout(this.connectTimer);
    const ws = this.ws; this.ws = null; this.id = null; this.status = 'offline'; this.authenticated = false; this.lastSaveMoney = NaN;
    try { ws?.close(); } catch { /* */ }
    this.players.clear();
    if (text) { this.kicked = text; this.sys('Вы отключены сервером'); this.onError?.(text); }
    else { this.sys('Сервер недоступен'); this.onServerDown?.(); }
    this.onChange?.();
  }

  displayName(id: number) { const p = this.players.get(id); return p ? (p.nick ?? p.name) : 'Игрок' + id; }

  private handle(raw: string) {
    let m: Msg;
    try { m = JSON.parse(raw) as Msg; } catch { return; }
    const now = performance.now();
    switch (m.type) {
      case 'hello':
        if (m.accounts !== 1 || this.handshake || !this.credentials) return;
        this.handshake = true; window.clearTimeout(this.connectTimer); this.send(this.loginMsg()); return;
      case 'login_success':
        if (!this.handshake || !m.caps?.accounts || !Number.isSafeInteger(m.accountRevision)) { this.die('Сервер не поддерживает безопасные аккаунты'); return; }
        this.onLoginSuccess(m, now); return;
      case 'offline_vehicles':
        if(this.authenticated && this.offlineVehiclesSupported && Array.isArray(m.owners) && m.owners.length<=48)this.offlineVehicles=m.owners;
        return;
      case 'hamster_world':
        if (this.authenticated && this.hamsterWorldSupported) this.onHamsterWorld?.(m.world);
        return;
      case 'hamster_pet_result':
        if (this.authenticated && this.hamsterWorldSupported && m.ok === false) this.onHamsterPetError?.(String(m.error || 'unavailable'));
        return;
      case 'radio_list':
        if (this.authenticated && this.radioSupported && Array.isArray(m.radios)) this.onRadios?.(m.radios.slice(0,128) as NetworkRadio[]);
        return;
      case 'voice_signal':
        if (this.authenticated && this.voiceSupported && Number.isSafeInteger(m.from) && m.signal && typeof m.signal==='object') this.onVoice?.(m.from!, m.signal);
        return;
      case 'account_saved':
        if (!this.flight || (this.saveIds && m.saveId !== this.flight.id)) return;
        if (!m.ok || m.revision !== this.flight.revision + 1) { this.conflict = true; this.onSaveError?.('Сохранение отклонено. Не выходите: проверьте соединение и обратитесь к администратору.'); return; }
        this.revision = m.revision; this.flight = null; this.flushAccount(); return;
      case 'players_list': {
        // New servers explicitly advertise that each list is complete. Never
        // interpret a malformed list as everyone disconnecting.
        if (this.fullPlayers && (!Array.isArray(m.players) || !m.players.every(p=>p && typeof p.id==='number' && Number.isSafeInteger(p.id) && p.id>0))) return;
        this.applyPlayers(m.players, now, this.fullPlayers); return;
      }
      case 'chat': this.onChatMsg(m, now); return;
      case 'error': {
        const text = typeof m.text === 'string' && m.text.trim() ? m.text.trim() : 'Сервер отключил вас';
        const code = String(m.code || '');
        // «ник занят» на старом сервере: пробуем ещё раз сами (сервер мог не заметить мёртвый сокет)
        if (code === 'busy' && this.rejoin < 3) {
          this.rejoin++;
          this.sys('Сессия обновляется — повторный вход…');
          this.want = true; this.dead = false;
          const ws = this.ws; this.ws = null;
          try { ws?.close(); } catch { /* */ }
          window.clearTimeout(this.retryTimer);
          this.retryTimer = window.setTimeout(() => this.open(), 1200 * this.rejoin);
          return;
        }
        // «техработы», «ник за другим устройством» и «вход из другого окна» — не приговор:
        // причина показывается, повтор входа доступен кнопкой (иначе два окна с одним ником
        // бесконечно выбивали друг друга, потому что каждое переподключалось само)
        if (code === 'maintenance' || code === 'device' || code === 'replaced') { this.softFail(text); return; }
        this.die(text);
        return;
      }
      case 'adm': this.onAdmin?.(String(m.act || ''), m); return;
      case 'ads': {
        const ads = (m.ads && typeof m.ads === 'object' ? m.ads : {}) as Record<string, RemoteAd>;
        this.ads = ads; this.onAds?.(ads); return;
      }
      case 'kiosk_owners': {
        if (!Array.isArray(m.owners) || m.owners.length > 1000 || typeof m.complete !== 'boolean') return;
        const owners = new Map<number, string | null>();
        for (const entry of m.owners) {
          if (!entry || !Number.isSafeInteger(entry.id) || entry.id < 0 || entry.id > 1000000 ||
              (entry.name !== null && (typeof entry.name !== 'string' || !entry.name || entry.name.length > 32)) || owners.has(entry.id)) return;
          owners.set(entry.id, entry.name);
        }
        this.kioskOwners = { owners, complete:m.complete, receivedAt:Date.now() };
        this.onChange?.(); return;
      }
      case 'auction_list': {
        if (!Array.isArray(m.lots) || !Number.isSafeInteger(m.serverTime)) return;
        const lots: AuctionLot[] = [];
        for (const raw of m.lots.slice(0, 100)) {
          if (!raw || !['vehicle', 'business', 'house', 'apartment'].includes(raw.kind) || !Number.isSafeInteger(raw.id) || raw.id < 1 ||
            typeof raw.assetKey !== 'string' || raw.assetKey.length > 128 || typeof raw.seller !== 'string' || raw.seller.length > 32 ||
            typeof raw.vehicleType !== 'string' || !Number.isSafeInteger(raw.startPrice) || raw.startPrice < 1 || !Number.isSafeInteger(raw.step) || raw.step < 1 ||
            !Number.isSafeInteger(raw.endsAt) || (raw.bid !== null && (!Number.isSafeInteger(raw.bid) || raw.bid < 1)) ||
            (raw.bidder !== null && typeof raw.bidder !== 'string')) continue;
          lots.push(raw as AuctionLot);
        }
        this.auction = { lots, serverTime: m.serverTime!, receivedAt: Date.now() };
        this.onChange?.(); return;
      }
      case 'ad_result': {
        this.onAdResult?.({ id: String(m.id || ''), ok: !!m.ok, error: typeof m.error === 'string' ? m.error : undefined });
        return;
      }
      case 'init':
        this.legacy = true;
        if (typeof m.id === 'number') { this.id = m.id; }
        this.applyPlayers(m.players, now, true);
        return;
      case 'players': this.legacy = true; this.applyPlayers(m.players, now, true); return;
      default: return;
    }
  }

  private onLoginSuccess(m: Msg, now: number) {
    // Наш сервер пересылает чат всем и сообщает об этом в caps. Раньше расширенное состояние
    // включалось только по «эху» §-сообщения от другого игрока — если в сети был один человек
    // (или все зашли впервые), протокол не включался вообще: другие игроки ездили без машин,
    // поз и мест в авто. Теперь включаем сразу по caps, а если сервер старый — пробуем один пакет.
    if (m.caps && (m.caps.state || m.caps.relay)) this.legacy = true;
    this.probeSent = false;
    this.saveIds = m.caps?.saveIds === 1;
    this.voiceSupported = m.caps?.voice === 1;
    this.radioSupported = m.caps?.radio === 1;
    this.hamsterWorldSupported = m.caps?.hamsterWorld === 1;
    this.fullPlayers = m.caps?.fullPlayers === 1;
    this.offlineVehiclesSupported = m.caps?.offlineVehicles === 1;
    this.offlineVehicles=[];this.offlineVehiclesRequestedAt=-Infinity;
    const next = m.accountRevision!;
    if (this.loggedOnce && this.revision !== null) {
      const expected = this.flight?.revision ?? this.revision;
      if (this.flight && next === expected + 1 && m.accountSaveId === this.flight.id) this.flight = null;
      else if (next !== expected) { this.conflict = true; this.onSaveError?.('Конфликт сохранения: аккаунт открыт в другой сессии'); }
    }
    this.revision = next;
    const p = m.player ?? {};
    const id = num(p.id) ?? num(m.id);
    this.me = { ...p, id: id ?? this.id ?? undefined, name: String(p.name ?? p.nick ?? m.name ?? this.nick).slice(0, 24), gender: gOf(p.gender ?? m.gender, this.gender) };
    if (id !== undefined) this.id = id;
    const selfId = this.id;
    if (selfId !== null) {
      const x = num(p.x), z = num(p.z ?? p.y), rot = num(p.rot ?? p.a) ?? 0;
      const ex = this.players.get(selfId);
      const base: RemotePlayer = ex ?? {
        id: selfId, name: this.me.name ?? this.nick, nick: this.nick, color: genderColor(this.gender),
        x: 0, y: 0, rot: 0, gender: this.gender, st: null, stT: 0, seenT: now,
      };
      base.nick = this.nick; base.name = this.me.name ?? this.nick;
      base.gender = (this.me.gender as 'm' | 'f') ?? this.gender;
      base.color = GENDER_COLOR[base.gender];
      if (x !== undefined) base.x = x;
      if (z !== undefined) base.y = z;
      base.rot = rot;
      base.seenT = now;
      if (typeof p.money === 'number') base.money = p.money;
      this.players.set(selfId, base);
    }
    if (typeof this.me.money === 'number') this.money = this.me.money;
    this.rejoin = 0;
    this.authenticated = true; this.lastSaveMoney = NaN;
    const first = !this.loggedOnce;
    this.loggedOnce = true;
    if (first) this.sys(`Вы вошли как ${this.nick}`);
    this.onLogin?.(this.me, first, m.accountState);
    // A consumer may reject an incompatible snapshot and close the client.
    // Do not continue applying data or flushing a queued save afterwards.
    if (!this.authenticated || !this.ws) return;
    this.onHamsterSpawn?.(m.hamster);
    if (this.hamsterWorldSupported) this.onHamsterWorld?.(m.hamsterWorld);
    if (this.flight && !this.conflict) this.send({ type: 'account_save', revision: this.flight.revision, saveId: this.flight.id, state: JSON.parse(this.flight.json) });
    else this.flushAccount();
    this.onChange?.();
  }

  /** players_list (массив) или старые init/players (объект id → {x,y}) */
  private applyPlayers(list: Msg['players'], now: number, instantRemove: boolean) {
    if (!list) return;
    const seen = new Set<number>();
    const apply = (rawId: unknown, e: LegacyPlayer | PlayersListEntry) => {
      const id = num(rawId);
      if (id === undefined) return;
      seen.add(id);
      const gender = gOf(e.gender, id === this.id ? this.gender : 'm');
      const name = String(e.name ?? (e as PlayersListEntry).nick ?? `Игрок${id}`).slice(0, 24);
      const x = num(e.x), z = num(e.z ?? e.y), rot = num(e.rot ?? (e as PlayersListEntry).a);
      const veh = (e as PlayersListEntry).vehicle ?? (e as PlayersListEntry).v ?? undefined;
      const money = num((e as PlayersListEntry).money);
      const plateRaw = (e as PlayersListEntry).number;
      const plate = typeof plateRaw === 'string' && plateRaw.trim() ? plateRaw.trim() : undefined;
      const color = (e as PlayersListEntry).color ?? (id === this.id ? GENDER_COLOR[gender] : undefined);
      const ex = this.players.get(id);
      if (ex) {
        if (x !== undefined) ex.x = x;
        if (z !== undefined) ex.y = z;
        if (rot !== undefined) ex.rot = rot;
        if (e.name || (e as PlayersListEntry).nick) { ex.name = name; if (id !== this.id) ex.nick = name; }
        if ((e as PlayersListEntry).color) ex.color = (e as PlayersListEntry).color!;
        if (e.gender) { ex.gender = gender; if (!(e as PlayersListEntry).color) ex.color = GENDER_COLOR[gender]; }
        if (veh !== undefined) ex.vehicle = typeof veh === 'string' && veh ? veh : undefined;
        if (money !== undefined) ex.money = money;
        if (plate) ex.number = plate;
        ex.seenT = now;
        return;
      }
      this.players.set(id, {
        id, name, nick: id === this.id ? this.nick : name, color: color ?? genderColor(gender),
        x: x ?? 0, y: z ?? 0, rot: rot ?? 0, gender,
        st: null, stT: 0, seenT: now,
        vehicle: typeof veh === 'string' && veh ? veh : undefined,
        money,
        number: plate,
      });
    };
    if (Array.isArray(list)) list.forEach((e) => apply((e as PlayersListEntry).id, e as PlayersListEntry));
    else if (typeof list === 'object') for (const k in list) apply(k, (list as Record<string, LegacyPlayer>)[k]);

    for (const [id, p] of [...this.players]) {
      if (seen.has(id) || id === this.id) continue;
      if (instantRemove || now - p.seenT > 6000) {
        this.players.delete(id);
        if (id !== this.id) this.sys(`${p.nick ?? p.name} вышел`);
      }
    }
    this.onChange?.();
  }

  private onChatMsg(m: Msg, now: number) {
    const text = typeof m.text === 'string' ? m.text : '';
    if (!text) return;
    const id = num(m.id);
    const sender = id !== undefined ? this.players.get(id) : undefined;
    // переводы игрокам
    if (text.startsWith(GIFT)) {
      if (id === undefined || id === this.id) return;
      try {
        const d = JSON.parse(text.slice(GIFT.length)) as { k: 'money' | 'item'; v: number | string; n: number; nick: string };
        if (!d || (d.k !== 'money' && d.k !== 'item')) return;
        // перевод адресный: сообщение видят все, применяет только получатель
        if (String(d.nick ?? '').toLowerCase() !== (this.nick ?? '').toLowerCase()) return;
        this.onGift?.(id, d);
      } catch { /* битое */ }
      return;
    }
    // расширенные сообщения старого сервера
    if (text.startsWith(PEDS) || text.startsWith(EV) || text.startsWith(ME) || text.startsWith(NEWS) || text.startsWith(PREFIX)) this.legacy = true;
    if (text.startsWith(PEDS)) {
      if (id === undefined || id === this.id) return;
      try { const d = JSON.parse(text.slice(PEDS.length)) as { p: number[][]; v?: (string | number)[][] }; if (Array.isArray(d.p)) this.onPeds?.(id, d.p, Array.isArray(d.v) ? d.v : []); } catch { /* битое */ }
      return;
    }
    if (text.startsWith(EV)) {
      if (id === undefined || id === this.id) return;
      try { const ev = JSON.parse(text.slice(EV.length)) as NetEvent; if (ev && typeof ev.e === 'string') this.onEvent?.(id, ev); } catch { /* битое */ }
      return;
    }
    const nm = (m.name ?? m.nick ?? sender?.nick ?? sender?.name ?? 'Игрок').toString().slice(0, 24);
    if (text.startsWith(ME) || text.startsWith(NEWS)) {
      const news = text.startsWith(NEWS);
      const txt = text.slice(ME.length).slice(0, 220);
      this.chat.push({ name: nm, text: txt, color: news ? '#facc15' : '#c084fc', t: Date.now(), me: id !== undefined && id === this.id, kind: news ? 'news' : 'me' });
      if (this.chat.length > 80) this.chat.shift();
      if (news && id !== this.id) this.onNews?.(nm, txt);
      this.onChange?.();
      return;
    }
    if (text.startsWith(PREFIX)) {
      if (id === undefined) return;
      try {
        const st = JSON.parse(text.slice(PREFIX.length)) as RemoteState;
        const p = this.players.get(id);
        if (p && isFinite(st.x) && isFinite(st.z)) {
          if (st.l === undefined && p.st?.l) st.l = p.st.l;
          if (st.n === undefined && p.st?.n) st.n = p.st.n;
          if (st.pr === undefined && p.st?.pr) st.pr = p.st.pr;
          if (st.ls === undefined && p.st?.ls) st.ls = p.st.ls;
          if (st.n) { const nk = String(st.n).slice(0, 16); if (p.nick !== nk) { if (!p.nick && id !== this.id) this.sys(`${nk} в игре`); p.nick = nk; } }
          p.st = st; p.stT = now;
        }
      } catch { /* битое сообщение */ }
      return;
    }
    // обычный чат: {type:'chat', name, text}
    const mine = (id !== undefined && id === this.id) || nm === this.nick;
    this.chat.push({
      name: nm, text: text.slice(0, 200), t: Date.now(), me: mine,
      color: mine ? '#a5b4fc' : (sender?.color ?? genderColor(sender?.gender)),
    });
    if (this.chat.length > 80) this.chat.shift();
    this.onChange?.();
  }

  sys(text: string) {
    this.chat.push({ name: 'Сервер', text, color: '#fbbf24', t: Date.now(), kind: 'sys' });
    if (this.chat.length > 80) this.chat.shift();
    this.onChange?.();
  }
  private send(o: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(o)); } catch { /* сокет закрылся */ }
  }

  requestOfflineVehicles() {
    const now=performance.now();
    if(!this.sessionReady || !this.offlineVehiclesSupported || now-this.offlineVehiclesRequestedAt<2000)return;
    this.offlineVehiclesRequestedAt=now;this.send({type:'offline_vehicles_request'});
  }
  petHamster() { if(this.sessionReady && this.hamsterWorldSupported) this.send({type:'hamster_pet'}); }
  sendRadio(radio:unknown) { if(this.authenticated && this.radioSupported) this.send({type:'radio_update',radio}); }
  requestRadios() { if(this.authenticated && this.radioSupported) this.send({type:'radio_list'}); }

  private lastSaveMoney = NaN;
  /** {type:'save', money} — держим серверный баланс в актуальном состоянии (только при изменениях) */
  sendSave(money: number) {
    const m = Math.max(0, Math.round(money));
    this.money = m;
    if (!this.authenticated || !this.ws || this.ws.readyState !== WebSocket.OPEN || m === this.lastSaveMoney) return;
    try { this.ws.send(JSON.stringify({ type: 'save', money: m })); this.lastSaveMoney = m; } catch { /* повторим при следующем обновлении */ }
  }
  saveAccount(state: unknown) {
    try { this.pending = JSON.stringify(state); } catch { this.onSaveError?.('Не удалось подготовить сохранение'); return; }
    this.flushAccount();
  }
  private flushAccount() {
    if (!this.authenticated || this.conflict || this.flight || this.pending === null || this.revision === null || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const json = this.pending;
    try {
      const id = crypto.randomUUID();
      this.ws.send(JSON.stringify({ type: 'account_save', revision: this.revision, saveId: id, state: JSON.parse(json) }));
      this.flight = { json, revision: this.revision, id }; this.pending = null;
    } catch { /* повтор после переподключения */ }
  }
  /** {type:'move', x, z, rot} — вызывается 15 раз в секунду из игрового цикла */
  sendMove(x: number, z: number, rot = 0) {
    const nx = r3(x), nz = r3(z), nr = r3(rot);
    this.lastMove = { x: nx, z: nz, rot: nr };
    this.send({ type: 'move', x: nx, z: nz, rot: nr });
  }
  /** повторная отправка последней позиции (после переподключения) */
  resendMove() { if (isFinite(this.lastMove.x)) this.send({ type: 'move', ...this.lastMove }); }
  /** расширенное состояние мира: §LG через чат (сервер должен пересылать чат всем) */
  sendState(st: RemoteState) {
    if (!this.legacy) {
      // сервер не сообщил caps — пробуем один пакет: если он вернётся эхом, onChatMsg включит режим
      if (this.probeSent) return;
      this.probeSent = true;
    }
    this.send({ type: 'chat', text: PREFIX + JSON.stringify(st) });
  }
  sendPeds(list: number[][], vehs: (string | number)[][] = []) { if (this.legacy) this.send({ type: 'chat', text: PEDS + JSON.stringify({ p: list, v: vehs }) }); }
  sendVoice(to:number, signal:VoiceSignal) { if(this.authenticated && this.voiceSupported) this.send({type:'voice_signal',to,signal}); }
  sendEvent(ev: NetEvent) { if (this.legacy) this.send({ type: 'chat', text: EV + JSON.stringify(ev) }); }
  /** перевод игроку: работает на любом сервере, который пересылает чат */
  sendGift(k: 'money' | 'item', v: number | string, n: number, nick: string) {
    this.send({ type: 'chat', text: GIFT + JSON.stringify({ k, v, n, nick: nick.slice(0, 16) }) });
  }
  sendMe(text: string) {
    const t = text.slice(0, 200);
    this.send({ type: 'chat', text: this.legacy ? ME + t : `* ${this.nick}: ${t}` });
  }
  /** покупка щита: сервер сам проверит текст, цену и занятость, имя берёт из сессии */
  /** попросить у сервера актуальный список объявлений */
  requestAds() { this.send({ type: 'ads' }); }
  requestAuction() { if (this.authenticated) this.send({ type: 'auction_list' }); }
  requestKioskOwners() { const now = Date.now(); if (this.authenticated && now - this.kioskOwnersRequested >= 5000) { this.kioskOwnersRequested = now; this.send({ type: 'kiosk_owners' }); } }
  sendAd(id: string, text: string, tag: string) { this.send({ type: 'ad', id, text: text.slice(0, 120), tag }); }
  /** снять своё объявление досрочно */
  sendAdDrop(id: string) { this.send({ type: 'ad_drop', id }); }
  sendNews(text: string) {
    const t = text.slice(0, 200);
    this.send({ type: 'chat', text: this.legacy ? NEWS + t : `📰 ${this.nick}: ${t}` });
  }
  findByNick(nick: string) {
    const n = nick.trim().toLowerCase();
    return [...this.players.values()].find((p) => p.id !== this.id && ((p.nick ?? '').toLowerCase() === n || p.name.toLowerCase() === n)) ?? null;
  }
  /** номер машины для серверной базы (set_plate) */
  sendPlate(carId: string, number: string) { this.send({ type: 'set_plate', carId, number }); }
  /** {type:'inv', items} — снимок инвентаря для панели Colab (просмотр и выдача) */
  sendInventory(items: Record<string, number>) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(items || {})) { const n = Math.round(Number(v)); if (n > 0) clean[k] = n; }
    this.send({ type: 'inv', items: clean });
  }
  /** {type:'chat', text} */
  sendChat(text: string) {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    if (t.startsWith(PREFIX) || t.startsWith(EV) || t.startsWith(PEDS) || t.startsWith(ME) || t.startsWith(NEWS) || t.startsWith(GIFT)) return;
    this.send({ type: 'chat', text: t });
  }
  others() { return [...this.players.values()].filter((p) => p.id !== this.id); }
  close() {
    this.want = false; this.dead = true;
    window.clearTimeout(this.retryTimer); window.clearTimeout(this.connectTimer);
    const ws = this.ws; this.ws = null; this.id = null; this.status = 'offline'; this.authenticated = false; this.lastSaveMoney = NaN;
    try { ws?.close(); } catch { /* */ }
    this.players.clear();
  }
}
