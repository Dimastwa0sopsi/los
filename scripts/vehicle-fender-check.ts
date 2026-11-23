import './domstub';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import { VehicleModel } from '../src/game/vehicleModel';
import { VEHICLES, VEHICLE_BODY_NAMES } from '../src/game/data';
for (const v of Object.values(VEHICLES)) {
  assert.ok(VEHICLE_BODY_NAMES[v.body], `не указан тип: ${v.id}`);
  if (v.body !== 'moto') continue;
  const model = new VehicleModel(v.id);
  const part = model.parts.find(p => p.name === 'fenderF');
  assert.ok(part && part.items.length, `нет переднего крыла: ${v.id}`);
  const front = model.frontWheels[0];
  assert.ok(front);
  const center = new THREE.Vector3();
  for (const item of part.items) {
    center.setFromMatrixPosition(item.m);
    assert(center.y > front.position.y, `крыло ниже оси колеса: ${v.id}`);
  }
  model.dispose();
}
console.log('✓ передние крылья мотоциклов над колесом, типы транспорта заданы');
