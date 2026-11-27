/** RP-документы хранятся в игровом сохранении. */
export type DocumentKind = 'passport' | 'driver' | 'weapon';
export type Documents = Partial<Record<DocumentKind, boolean>>;
export const DOCUMENT_PRICES: Readonly<Record<DocumentKind, number>> = {passport:500, driver:1000, weapon:5000};
/** Local purchase; online persistence still uses the existing client-owned save. */
export function purchaseDocument(state: {money:number; documents?:Documents}, kind: DocumentKind): 'issued' | 'already' | 'passport_required' | 'not_enough' | 'invalid' {
  if (!Object.prototype.hasOwnProperty.call(DOCUMENT_PRICES,kind) || !Number.isFinite(state.money) || state.money < 0 || state.money > Number.MAX_SAFE_INTEGER) return 'invalid';
  const docs=state.documents ?? {};
  if (docs[kind]) return 'already';
  if (kind !== 'passport' && !docs.passport) return 'passport_required';
  const cost=DOCUMENT_PRICES[kind];
  if (state.money < cost) return 'not_enough';
  state.money -= cost;
  state.documents={...docs,[kind]:true};
  return 'issued';
}
export function issueDocument(docs: Documents, kind: DocumentKind): 'issued' | 'already' | 'passport_required' {
  if (docs[kind]) return 'already';
  if (kind !== 'passport' && !docs.passport) return 'passport_required';
  docs[kind] = true;
  return 'issued';
}
export function canDrive(docs: Documents | undefined, body: string): boolean {
  return body === 'scooter' || !!docs?.driver;
}
