/** Experimental coordination for server-owned operations; NOT wired into Game.
 * Callers must prevent all gameplay mutations while `blocked` is true, pause
 * autosaves, and retain the request across reconnects. A barrier alone does not
 * authenticate a message or make account_save authoritative. */
export interface EconomyRequest { requestId: string; revision: number; action: string; payload: unknown }
export interface EconomyReceipt { ok: boolean; requestId?: string; revision?: number; state?: unknown; error?: string; committed?: boolean }
type Pending = { request: EconomyRequest; baseJson: string; accepted?: { json: string; revision: number } };
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
      this.pending = {request:copy,baseJson}; return true;
    } catch { return false; }
  }
  /** Same request and ID must be resent after a lost response. */
  retry(): EconomyRequest | null { return this.pending ? JSON.parse(JSON.stringify(this.pending.request)) as EconomyRequest : null; }
  /** Returns a snapshot only when it belongs to the in-flight operation and no
   * local state was changed while paused. Never install an expired receipt. */
  accept(receipt: EconomyReceipt, currentState: unknown): {ok:true;state:unknown;revision:number} | {ok:false;error:string} {
    const pending = this.pending;
    if (!pending || receipt.requestId !== pending.request.requestId) return {ok:false,error:'unexpected_receipt'};
    if (!receipt.ok) return {ok:false,error:receipt.committed ? 'committed_recovery_required' : receipt.error || 'rejected'};
    if (!Number.isSafeInteger(receipt.revision) || receipt.revision! <= pending.request.revision || !receipt.state ||
        typeof receipt.state !== 'object' || Array.isArray(receipt.state)) return {ok:false,error:'invalid_receipt'};
    try {
      if (JSON.stringify(currentState) !== pending.baseJson) return {ok:false,error:'local_changed'};
      const json = JSON.stringify(receipt.state);
      const state = JSON.parse(json) as unknown;
      pending.accepted = {json,revision:receipt.revision!};
      // Caller installs synchronously before unfreezing. Release is explicit.
      return {ok:true,state,revision:receipt.revision!};
    } catch { return {ok:false,error:'invalid_state'}; }
  }
  /** Call only after successfully installing the returned state and revision.
   * A rejected request needs a separate recovery/cancellation workflow. */
  installed(requestId: string, installedState: unknown, revision: number): boolean {
    const pending = this.pending;
    if (!pending?.accepted || pending.request.requestId !== requestId || pending.accepted.revision !== revision) return false;
    try { if (JSON.stringify(installedState) !== pending.accepted.json) return false; } catch { return false; }
    this.pending = null; return true;
  }
}
