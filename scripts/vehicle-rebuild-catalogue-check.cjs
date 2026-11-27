'use strict';
const assert = require('node:assert/strict');
const {vehicles} = require('../docs/vehicle-rebuild-catalogue.json');
assert.equal(vehicles.length,101);
assert.equal(new Set(vehicles.map(v=>v.name)).size,vehicles.length);
for (const v of vehicles) {
  assert.equal(typeof v.name,'string'); assert(v.name.trim());
  assert(Number.isSafeInteger(v.speedKmh) && v.speedKmh>=80 && v.speedKmh<=460,v.name);
  assert(Number.isSafeInteger(v.brakingPercent) && v.brakingPercent>=30 && v.brakingPercent<=99,v.name);
  assert(Number.isSafeInteger(v.price) && v.price>=15000 && v.price<=4500000,v.name);
  assert.equal(typeof v.category,'string'); assert(v.category.trim());
}
const pick=n=>vehicles.find(v=>v.name===n);
assert.deepEqual(pick('Lada Classic 2107'),{name:'Lada Classic 2107',speedKmh:140,brakingPercent:45,price:20000,category:'Седан'});
assert.deepEqual(pick('Hennessey Venom F5'),{name:'Hennessey Venom F5',speedKmh:460,brakingPercent:99,price:4500000,category:'Гиперкар'});
assert.deepEqual(pick('Урал (Мото с коляской)'),{name:'Урал (Мото с коляской)',speedKmh:120,brakingPercent:50,price:60000,category:'Мотоцикл (Ретро)'});
assert.deepEqual(pick('Audi A3 Sportback'),{name:'Audi A3 Sportback',speedKmh:210,brakingPercent:78,price:170000,category:'Хэтчбек'});
console.log('✓ каталог переделки: 101 уникальная модель, диапазоны и контрольные позиции');
