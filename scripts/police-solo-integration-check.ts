import './domstub';
import {strict as assert} from 'node:assert';
import {Game} from '../src/game/game';
import {newState,migrate} from '../src/game/state';
const station={id:0,kind:'police',enter:true,door:{x:20,z:0},x:20,z:0};
const vehicle={x:1,z:0,speed:0,role:'police',sirens:true,ai:null as any,hasDriver:false,addDummyDriver(){}};
let time=100000;const oldNow=Date.now;Date.now=()=>time;
try {
 const g=Object.create(Game.prototype) as any;
 Object.assign(g,{online:false,state:{wanted:3,location:null},L:{buildings:[station]},vehicles:[vehicle],px:0,pz:0,py:0,pa:0,bustT:4,inVeh:null,rideRemote:null,rideOn:false,interior:null,
  routeFor:()=>({onArrive:null,obeyLights:false}),closePanel:()=>{},save:()=>{},toast:()=>{},seat(v:any,passenger:boolean){this.inVeh=v;this.passenger=passenger;},
  exitVehicle(){this.inVeh=null;},enterBuilding(){this.interior={doorSpots:{custody:{x:6000,z:6001,y:0,a:0}}};this.state.location={b:0};},
  exitInterior(){assert(!this.soloDetained());this.interior=null;this.state.location=null;}});
 // Trigger through the actual police update; clearing stars must not reset the patrol route in that same frame.
 Object.assign(g,{L:{buildings:[station],nodes:[]},peds:{peds:[]},lastSeen:null,noPoliceT:0,policeSees:()=>true,sound:{sirenSound:()=>{}}});
 g.updatePolice(0.1);assert.equal(g.state.soloCustody.phase,'transport');assert.equal(g.state.wanted,0);assert.equal(g.inVeh,vehicle);assert.equal(g.passenger,true);assert(vehicle.sirens);assert.equal(typeof vehicle.ai.onArrive,'function');
 const transporting=JSON.parse(JSON.stringify(g.state.soloCustody));
 const restored=Object.create(Game.prototype) as any;
 Object.assign(restored,{online:false,state:{soloCustody:transporting},L:{buildings:[station]},px:4,pz:5,pa:0,interior:null,vehicles:[],routeFor:()=>({onArrive:null}),addVehicle(v:any){this.vehicles.push(v);},seat(v:any,passenger:boolean){this.inVeh=v;this.passenger=passenger;},toast:()=>{}});
 restored.restoreSoloCustody();assert.equal(restored.inVeh.role,'police');assert.equal(restored.passenger,true);assert.equal(typeof restored.inVeh.ai.onArrive,'function');assert.equal(restored.state.soloCustody.phase,'transport');
 restored.inVeh.dispose();
 time+=20000;vehicle.ai.onArrive();assert.equal(g.state.soloCustody.phase,'jailed');assert.equal(g.state.soloCustody.releaseAt,time+60000);assert.equal(g.state.location.b,0);assert.equal(g.pz,6001);
 const save=newState('m',{x:0,z:0,a:0});save.soloCustody=g.state.soloCustody;
 assert.deepEqual(migrate(JSON.parse(JSON.stringify(save)))?.soloCustody,g.state.soloCustody);
 // A reload retains the same timestamp and puts the player back into the cell.
 g.interior=null;g.state.location=null;g.restoreSoloCustody();assert.equal(g.pz,6001);assert.equal(g.state.soloCustody.releaseAt,time+60000);
 time+=59999;g.updateSoloCustody(0.1);assert.equal(g.state.soloCustody.phase,'jailed');
 time++;g.updateSoloCustody(0.1);assert.equal(g.state.soloCustody.phase,'free');assert.equal(g.state.location,null);
 const noRoute=Object.create(Game.prototype) as any;Object.assign(noRoute,{online:false,state:{wanted:3},L:{buildings:[station]},vehicles:[{...vehicle,sirens:true}],px:0,pz:0,rideRemote:null,rideOn:false,bustT:4,routeFor:()=>null,toast:()=>{}});
 assert(noRoute.startSoloCustody());assert.equal(noRoute.state.wanted,3);assert.equal(noRoute.state.soloCustody,undefined);assert.equal(noRoute.bustT,0);
 const retryVehicle={...vehicle,sirens:true,ai:null};g.state.wanted=3;g.vehicles=[retryVehicle];g.inVeh=null;g.custodyReplan=0;g.px=0;g.pz=0;
 assert(g.startSoloCustody());time+=121000;g.updateSoloCustody(121);assert.equal(g.state.soloCustody.phase,'jailed','застрявшая доставка не должна удерживать навсегда');
 assert.equal(g.state.soloCustody.releaseAt,time+60000);
 const taxiGame=Object.create(Game.prototype) as any, taxiVehicle={ai:{mode:'route'},speed:0};
 const patrol={...vehicle,sirens:true,ai:null};
 Object.assign(taxiGame,{online:false,state:{wanted:3,money:100},L:{buildings:[station]},vehicles:[patrol],px:0,pz:0,bustT:4,rideRemote:null,rideOn:false,inVeh:taxiVehicle,passenger:true,taxi:{v:taxiVehicle,stage:'riding',dist:1000,t:0},routeFor:()=>({onArrive:null}),closePanel:()=>{},save:()=>{},toast:()=>{},seat(v:any){this.inVeh=v;},exitVehicle(){assert.equal(this.taxi.stage,'arrived');this.taxi.stage='leaving';this.inVeh=null;}});
 taxiGame.startSoloCustody();assert.equal(taxiGame.state.money,87);assert.equal(taxiGame.taxi.stage,'leaving');assert.equal(taxiGame.inVeh,patrol);assert(patrol.hasDriver);
 console.log('✓ одиночный арест: игровой цикл, восстановление поездки и камеры, срок, отсутствие маршрута, застрявшая машина и такси');
} finally {Date.now=oldNow;}
