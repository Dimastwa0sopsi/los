import './domstub';
import * as THREE from 'three';
import {Game} from '../src/game/game';
import assert from 'node:assert/strict';
const scene=new THREE.Scene(), body=new THREE.Group();scene.add(body);
const player=new THREE.Group(),root=new THREE.Group();body.add(player,root);player.scale.setScalar(.6);root.scale.setScalar(.6);
const g:any=Object.create(Game.prototype);
const veh:any={model:{body,seats:[{x:0,y:0,z:0,scale:.6,pose:'drive'}],group:new THREE.Group(),lightsOn:false,setLights(on:boolean){this.lightsOn=on;},animate(_d:number,s:number){this.steer=s;},tuning:{},updatePlate(){},steer:0},x:0,y:0,z:0,speed:0,heading:0,isHeli:false,isRide:false,spec:{hei:2},sync(){}};
const R:any={id:2,veh,vehKey:'lada|#fff',char:{root,pose(){},setItem(){},blob:{visible:true}},tag:new THREE.Object3D(),tagName:'Bob',name:'Bob',x:0,y:0,z:0,a:0,phase:0,lookKey:'',color:'#fff',spd:0,flinch:0,props:[],listings:[],listKey:'[]',driving:true,vehIdle:0};
const st:any={x:1,y:0,z:1,a:0,s:10,v:'lada',c:'#fff',seat:0,lt:1,steer:.8,slip:.7};
const p:any={id:2,nick:'Bob',name:'Bob',st,stT:performance.now(),gender:'m'};
Object.assign(g,{scene,player:{root:player},remotes:new Map([[2,R]]),net:{id:1,others:()=>[p]},remoteSmokeT:new Map(),interiorKey:()=>'',px:0,pz:0,drawDist:()=>1000,spawnSmoke:()=>g.smokes++,smokes:0,removeVehicle:()=>{},col:{groundAt:()=>0}});
g.updateRemotes(.1);assert.equal(veh.model.lightsOn,true);assert.equal(veh.model.steer,.4);assert.equal(g.smokes,1);
st.lt=0;st.slip=0;st.steer=Infinity;g.updateRemotes(.1);assert.equal(veh.model.lightsOn,false);assert.equal(veh.model.steer,0);assert.equal(g.smokes,1);
// Vehicle teardown reparents occupants to the scene; seat scale must not linger.
g.removeRemoteVeh(R);assert.equal(root.parent,scene);assert.equal(root.scale.x,1);assert.equal(player.scale.x,1);
// Even an already reparented stale seat-scaled character is corrected on foot.
root.scale.setScalar(.6);R.veh=null;R.vehKey='';R.driving=false;st.v='';st.steer=0;g.updateRemotes(.1);assert.equal(root.scale.x,1);
console.log('✓ сетевой персонаж: масштаб после выхода; фары, поворот и дым заноса');
