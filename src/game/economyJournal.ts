import type { EconomyRequest } from './economyBarrier';

/** LAB ONLY. No passwords, snapshots or access tokens are stored here. A
 * journal is a recovery hint, never proof that a transaction was committed. */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type ReadResult = {ok:true;request:EconomyRequest | null} | {ok:false;error:string};
function isRequest(x: any): x is EconomyRequest {
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).sort().join(',') !== 'action,payload,requestId,revision' ||
    typeof x.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(x.requestId) || !Number.isSafeInteger(x.revision) || x.revision < 0 ||
    !x.payload || typeof x.payload !== 'object' || Array.isArray(x.payload)) return false;
  if (x.action === 'bid') return Object.keys(x.payload).sort().join(',') === 'bid,id' && Number.isSafeInteger(x.payload.id) && x.payload.id > 0 && Number.isSafeInteger(x.payload.bid) && x.payload.bid > 0 && x.payload.bid <= 2147483647;
  if (x.action === 'list') return Object.keys(x.payload).sort().join(',') === 'key,kind,price' && ['vehicle','business','apartment','house'].includes(x.payload.kind) && typeof x.payload.key === 'string' && x.payload.key.length > 0 && x.payload.key.length <= 128 && Number.isSafeInteger(x.payload.price) && x.payload.price > 0 && x.payload.price <= 2147483647;
  return false;
}
function journalKey(server: string, nick: string): string | null {
  try {
    const url = new URL(server), name = nick.normalize('NFKC').trim().toLowerCase();
    if (!['ws:','wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^[\p{L}\p{N} _.-]{2,16}$/u.test(name)) return null;
    return 'los.economy.pending.v1:' + encodeURIComponent(url.origin + url.pathname) + ':' + encodeURIComponent(name);
  } catch { return null; }
}
export class EconomyJournal {
  private key: string | null;
  constructor(private storage: Store, server: string, nick: string) { this.key=journalKey(server,nick); }
  read(): ReadResult {
    if (!this.key) return {ok:false,error:'invalid_identity'};
    try {
      const text=this.storage.getItem(this.key); if (text===null) return {ok:true,request:null};
      if (text.length>8192) return {ok:false,error:'invalid_journal'};
      const entry=JSON.parse(text);
      if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join(',')!=='request,version' || entry.version!==1 || !isRequest(entry.request)) return {ok:false,error:'invalid_journal'};
      return {ok:true,request:entry.request};
    } catch { return {ok:false,error:'storage_error'}; }
  }
  /** Refuses to overwrite an unresolved operation. Caller sends only after this returns true. */
  write(request: EconomyRequest): boolean {
    if (!this.key || !isRequest(request)) return false;
    try {
      const old=this.read(); if (!old.ok || old.request) return false;
      const text=JSON.stringify({version:1,request}); if (text.length>8192) return false;
      this.storage.setItem(this.key,text);
      return this.storage.getItem(this.key)===text;
    } catch { return false; }
  }
  /** Call only after authoritative recovery and verified installation. */
  clear(requestId: string): boolean {
    if (!this.key) return false;
    try {
      const current=this.read(); if (!current.ok || !current.request || current.request.requestId!==requestId) return false;
      this.storage.removeItem(this.key); return this.storage.getItem(this.key)===null;
    } catch { return false; }
  }
}
