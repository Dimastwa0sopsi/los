/** Experimental coordination for server-owned operations; only invoked by
 * explicit lab hooks, never by the live auction UI or network protocol.
 * Callers must prevent all gameplay mutations while `blocked` is true, pause
 * autosaves, and retain the request across reconnects. A barrier alone does not
 * authenticate a message or make account_save authoritative. */
export interface EconomyRequest { requestId: string; revision: number; action: string; payload: unknown }
export interface EconomyReceipt { ok: boolean; requestId?: string; revision?: number; state?: unknown; error?: string; committed?: boolean }
export interface EconomyRecovery { ok: boolean; requestId?: string; outcome?: 'committed' | 'cancelled'; revision?: number; committedRevision?: number; state?: unknown; error?: string }
type Pending = { request: EconomyRequest; baseJson: string; requiredRevision: number; accepted?: { json: string; revision: number } };
export class EconomyBarrier {
  private pending: Pending | null = null;
  get blocked() { return this.pending !== null; }
  /** Caller must flush and acknowledge the normal save queue first. */
  begin(request: EconomyRequest, saved: boolean, currentState: unknown): boolean {
    if (this.pending || !saved || !/^[a-zA-Z0-9-]{16,80}$/.test(request.requestId) ||
        !Number.isSafeInteger(request.revision) || request.revision < 0 || !/^[a-z_]{1,32}$/.test(request.action)) return false;
    try {
      const baseJson = JSON.stringify(currentState);
      const copy = JSON.parse(JSON.stringify(request)) as EconomyRequest;
      if (!baseJson || !copy || !currentState || typeof currentState !== 'object' || Array.isArray(currentState)) return false;
      this.pending = {request:copy,baseJson,requiredRevision:request.revision}; return true;
    } catch { return false; }
  }
  /** Same request and ID must be resent after a lost response. */
  retry(): EconomyRequest | null { return this.pending ? JSON.parse(JSON.stringify(this.pending.request)) as EconomyRequest : null; }
  /** While frozen, a later authenticated change notification invalidates an older snapshot. */
  notifyRevision(revision: number): boolean {
    if (!this.pending || !Number.isSafeInteger(revision) || revision < 0) return false;
    this.pending.requiredRevision = Math.max(this.pending.requiredRevision,revision);
    return true;
  }
  /** Returns a snapshot only when it belongs to the in-flight operation and no
   * local state was changed while paused. Never install an expired receipt. */
  accept(receipt: EconomyReceipt, currentState: unknown): {ok:true;state:unknown;revision:number} | {ok:false;error:string} {
    const pending = this.pending;
    if (!pending || receipt.requestId !== pending.request.requestId) return {ok:false,error:'unexpected_receipt'};
    if (!receipt.ok) return {ok:false,error:receipt.committed ? 'committed_recovery_required' : receipt.error || 'rejected'};
    if (!Number.isSafeInteger(receipt.revision) || receipt.revision! <= pending.request.revision || !receipt.state ||
        typeof receipt.state !== 'object' || Array.isArray(receipt.state)) return {ok:false,error:'invalid_receipt'};
    if (receipt.revision! < pending.requiredRevision) return {ok:false,error:'newer_snapshot_required'};
    try {
      if (JSON.stringify(currentState) !== pending.baseJson) return {ok:false,error:'local_changed'};
      const json = JSON.stringify(receipt.state);
      const state = JSON.parse(json) as unknown;
      pending.accepted = {json,revision:receipt.revision!};
      // Caller installs synchronously before unfreezing. Release is explicit.
      return {ok:true,state,revision:receipt.revision!};
    } catch { return {ok:false,error:'invalid_state'}; }
  }
  /** Install only the latest recovery snapshot; the server has atomically
   * either confirmed the exact request committed or durably cancelled it. */
  acceptRecovery(receipt: EconomyRecovery, currentState: unknown): {ok:true;state:unknown;revision:number;outcome:'committed'|'cancelled'} | {ok:false;error:string} {
    const pending=this.pending;
    if (!pending || receipt.requestId!==pending.request.requestId) return {ok:false,error:'unexpected_receipt'};
    if (!receipt.ok) return {ok:false,error:receipt.error || 'recovery_failed'};
    if ((receipt.outcome!=='committed' && receipt.outcome!=='cancelled') || !Number.isSafeInteger(receipt.revision) || receipt.revision! < pending.request.revision ||
        !receipt.state || typeof receipt.state!=='object' || Array.isArray(receipt.state)) return {ok:false,error:'invalid_receipt'};
    if (receipt.outcome==='committed' && (!Number.isSafeInteger(receipt.committedRevision) || receipt.committedRevision!<=pending.request.revision || receipt.committedRevision!>receipt.revision!)) return {ok:false,error:'invalid_receipt'};
    if (receipt.revision! < pending.requiredRevision) return {ok:false,error:'newer_snapshot_required'};
    try {
      if (JSON.stringify(currentState)!==pending.baseJson) return {ok:false,error:'local_changed'};
      const json=JSON.stringify(receipt.state), state=JSON.parse(json) as unknown;
      pending.accepted={json,revision:receipt.revision!};
      return {ok:true,state,revision:receipt.revision!,outcome:receipt.outcome};
    } catch { return {ok:false,error:'invalid_state'}; }
  }
  /** Call only after successfully installing the returned state and revision.
   * A rejected request needs a separate recovery/cancellation workflow. */
  installed(requestId: string, installedState: unknown, revision: number): boolean {
    const pending = this.pending;
    if (!pending?.accepted || pending.request.requestId !== requestId || pending.accepted.revision !== revision || revision < pending.requiredRevision) return false;
    try { if (JSON.stringify(installedState) !== pending.accepted.json) return false; } catch { return false; }
    this.pending = null; return true;
  }
}
