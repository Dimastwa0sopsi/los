'use strict';
const assert = require('node:assert/strict');
const { reconcileAuctionState: merge } = require('../server/auction-reconcile.cjs');
const base = { money: 200000, vehicles: [{uid:'car',fuel:80}], kiosks: [{id:4,acc:0}], properties:['10:0'], fridges:{'10:0':{water:2}}, food:80 };
const copy = x => structuredClone(x);
let local=copy(base), remote=copy(base);
// Деньги игрока изменились одновременно с возвратом перебитой ставки.
local.money -= 3000; local.food = 70; remote.money += 100000;
let result=merge(base,local,remote);
assert(result.ok); assert.equal(result.state.money,297000); assert.equal(result.state.food,70);
// Удалённая в эскроу машина не возрождается старым снимком.
local=copy(base); remote=copy(base); remote.vehicles=[]; local.food=60;
result=merge(base,local,remote); assert(result.ok); assert.deepEqual(result.state.vehicles,[]); assert.equal(result.state.food,60);
// Одновременная поездка/ремонт машины и её изъятие не теряются молча.
local.vehicles[0].fuel=30; result=merge(base,local,remote); assert(!result.ok && result.conflicts.includes('vehicles:car'));
// Другие, не затронутые сервером машины и бизнесы сохраняются.
local=copy(base); remote=copy(base); local.vehicles.push({uid:'new',fuel:100}); remote.vehicles=[];
result=merge(base,local,remote); assert(result.ok); assert.deepEqual(result.state.vehicles,[{uid:'new',fuel:100}]);
// Недвижимость и холодильник нельзя молча восстановить после передачи.
local=copy(base); remote=copy(base); remote.properties=[]; remote.fridges={};
result=merge(base,local,remote); assert(result.ok); assert.deepEqual(result.state.properties,[]); assert.deepEqual(result.state.fridges,{});
local.fridges['10:0'].water=1; result=merge(base,local,remote); assert(!result.ok && result.conflicts.includes('fridges:10:0'));
// Недостаток средств при сочетании локальных расходов и серверной ставки отклоняется.
local=copy(base); remote=copy(base); local.money=0; remote.money=100000;
result=merge(base,local,remote); assert(!result.ok && result.conflicts.includes('money'));
local=copy(base); local.vehicles.push(copy(local.vehicles[0])); assert(!merge(base,local,base).ok);
assert.deepEqual(base.vehicles,[{uid:'car',fuel:80}]);
console.log('✓ согласование ставок, локальных расходов, эскроу, собственности и конфликтов без потери данных');
