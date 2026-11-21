/** RP-документы хранятся в игровом сохранении. */
export type DocumentKind = 'passport' | 'driver' | 'weapon';
export type Documents = Partial<Record<DocumentKind, boolean>>;
export function issueDocument(docs: Documents, kind: DocumentKind): 'issued' | 'already' | 'passport_required' {
  if (docs[kind]) return 'already';
  if (kind !== 'passport' && !docs.passport) return 'passport_required';
  docs[kind] = true;
  return 'issued';
}
export function canDrive(docs: Documents | undefined, body: string): boolean {
  return body === 'scooter' || !!docs?.driver;
}
