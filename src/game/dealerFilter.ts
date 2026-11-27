import { VEHICLES, VEHICLE_BODY_NAMES, type BodyKind, type VSpec } from './data';

export type DealerCategory = BodyKind | 'all';
export interface DealerFilters { query: string; category: DealerCategory; budget: string }
export function dealerVehicles(scooter = false): VSpec[] {
  return Object.values(VEHICLES).filter(v => v.forSale === (scooter ? 'scooter' : 'dealer')).sort((a,b)=>a.price-b.price || a.name.localeCompare(b.name,'ru'));
}
export function filterDealerVehicles(vehicles: readonly VSpec[], filters: DealerFilters): VSpec[] {
  const query=filters.query.normalize('NFKC').trim().toLocaleLowerCase('ru');
  const budgetText=filters.budget.trim();
  // Invalid input must never silently show unaffordable vehicles.
  const budget=budgetText === '' ? null : /^\d+$/.test(budgetText) && Number.isSafeInteger(Number(budgetText)) ? Number(budgetText) : -1;
  return vehicles.filter(v => (filters.category === 'all' || v.body === filters.category) &&
    (!query || `${v.name} ${v.id}`.normalize('NFKC').toLocaleLowerCase('ru').includes(query)) &&
    (budget === null || v.price <= budget));
}
export function dealerCategories(vehicles: readonly VSpec[]): BodyKind[] {
  return [...new Set(vehicles.map(v=>v.body))].sort((a,b)=>VEHICLE_BODY_NAMES[a].localeCompare(VEHICLE_BODY_NAMES[b],'ru'));
}
