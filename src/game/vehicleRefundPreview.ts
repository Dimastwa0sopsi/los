/* Dry-run only: no saving, no automatic migration and no ownership decisions.
 * A real online migration needs a fresh backup, conflict handling and a
 * server transaction protected from stale account_save messages. */
export interface RefundVehicle { uid: string; type: string; paid: number; trunk?: Record<string, number> }
export type RefundPreview = {ok:true; refund:number; balance:number; removed:string[]; kept:string[]} | {ok:false; error:'invalid_state'|'missing_price'|'trunk_not_empty'|'money_limit'};
const MAX_MONEY = 2147483647;
export function previewVehicleRefund(money: number, vehicles: RefundVehicle[], keepTypes: ReadonlySet<string>): RefundPreview {
  if (!Number.isSafeInteger(money) || money < 0 || money > MAX_MONEY || !Array.isArray(vehicles)) return {ok:false,error:'invalid_state'};
  let refund = 0; const removed:string[] = [], kept:string[] = [], seen = new Set<string>();
  for (const v of vehicles) {
    if (!v || typeof v.uid !== 'string' || !v.uid || typeof v.type !== 'string' || !v.type || seen.has(v.uid)) return {ok:false,error:'invalid_state'};
    seen.add(v.uid);
    if (keepTypes.has(v.type)) { kept.push(v.uid); continue; }
    if (!Number.isSafeInteger(v.paid) || v.paid < 0 || v.paid > MAX_MONEY) return {ok:false,error:'missing_price'};
    if (v.trunk !== undefined && (!v.trunk || typeof v.trunk !== 'object' || Array.isArray(v.trunk) || Object.values(v.trunk).some(n => !Number.isSafeInteger(n) || n !== 0))) return {ok:false,error:'trunk_not_empty'};
    refund += v.paid;
    if (!Number.isSafeInteger(refund) || refund > MAX_MONEY - money) return {ok:false,error:'money_limit'};
    removed.push(v.uid);
  }
  return {ok:true,refund,balance:money+refund,removed,kept};
}
