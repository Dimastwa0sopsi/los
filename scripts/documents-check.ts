import './domstub';
import { canDrive, issueDocument } from '../src/game/documents';
import { migrate, newState } from '../src/game/state';
import { Game } from '../src/game/game';
import { VEHICLES } from '../src/game/data';
const check = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
const d: import('../src/game/documents').Documents = {};
check(issueDocument(d, 'driver') === 'passport_required', 'лицензия без паспорта');
check(issueDocument(d, 'passport') === 'issued' && issueDocument(d, 'passport') === 'already', 'выдача паспорта');
check(issueDocument(d, 'driver') === 'issued' && issueDocument(d, 'weapon') === 'issued', 'лицензии');
for (const spec of Object.values(VEHICLES)) {
  check(canDrive(undefined, spec.body) === (spec.body === 'scooter'), `доступ без прав ${spec.id}`);
  check(canDrive(d, spec.body), `доступ с правами ${spec.id}`);
}
const state = newState('m', {x:0,z:0,a:0}); state.documents = d;
check(migrate(JSON.parse(JSON.stringify(state)))?.documents?.driver, 'сохранение лицензии');
check(!migrate(newState('m', {x:0,z:0,a:0}))?.documents?.driver, 'новый игрок без прав');
let charged = false;
const fake = { state: { money: 5000, inventory: {}, documents: {} }, toast() {}, sound: { error() {}, coin() {} }, questEvent() { charged = true; } };
Game.prototype.buy.call(fake as unknown as Game, 'pistol');
check(fake.state.money === 5000 && !charged && !('pistol' in fake.state.inventory), 'продажа оружия без лицензии');
console.log('✓ паспорт, лицензии, 120 видов транспорта, сохранение и покупка оружия');
