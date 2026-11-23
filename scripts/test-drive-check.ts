import './domstub';
import { strict as assert } from 'node:assert';
import { testDriveCollision, testDriveSeconds } from '../src/game/testDrive';
import { Vehicle, playerDrive } from '../src/game/vehicles';
import { VEHICLES } from '../src/game/data';
assert.equal(testDriveSeconds(1000,1000), 300);
assert.equal(testDriveSeconds(1000,300000), 1);
assert.equal(testDriveSeconds(1000,301000), 0);
assert.equal(testDriveSeconds(1000,400000), 0);
for (const spec of Object.values(VEHICLES).filter(v=>v.forSale === 'dealer')) {
  const car = new Vehicle(spec.id, 'deco'); car.place(0, -15, 0);
  const track = testDriveCollision();
  for (let i=0; i<1200; i++) playerDrive(car, {throttle:1,brake:0,steer:0,handbrake:false,wheelie:false,up:0}, 1/60, track, false, () => false);
  assert(car.z < 42, `${spec.id}: выезд через ограждение`);
  car.model.dispose();
}
console.log('✓ тест-драйв: пять минут, отдельный коллайдер и ограждения для моделей салона');
