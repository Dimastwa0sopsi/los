import './domstub';
import {strict as assert} from 'node:assert';
import {SPEAKERS,speakerVolume} from '../src/game/speakers';
import {ITEMS,SHOP_ITEMS} from '../src/game/data';
import {makeHomeSpeaker,disposeHomeSpeaker} from '../src/game/speakerModel';
import {Game} from '../src/game/game';
assert.equal(SPEAKERS.length,10);assert.equal(SPEAKERS[0].price,1000);assert.equal(SPEAKERS[9].price,50000);
for(const s of SPEAKERS){
  assert.equal(ITEMS[s.id].price,s.price);assert(SHOP_ITEMS.supermarket.includes(s.id));
  const model=makeHomeSpeaker(s,{x:10,z:20}),cabinet=model.getObjectByName('speaker-cabinet');assert(cabinet);
  assert.equal(cabinet.position.y,s.placement==='desktop' ? .77 : 0);
  assert.equal(!!model.getObjectByName('speaker-amplifier'),s.amplifier);
  assert.equal(s.amplifier,s.placement==='floor');assert.equal(s.power,s.amplifier?1:.7);
  disposeHomeSpeaker(model);
}
assert.equal(new Set(SPEAKERS.map(s=>`${s.color}:${s.height}:${s.drivers}`)).size,10);
assert.equal(speakerVolume(1,'speaker_1'),.7);assert.equal(speakerVolume(1,'speaker_10'),1);assert.equal(speakerVolume(.5,'speaker_1'),.35);
const g=Object.create(Game.prototype) as any;let saves=0;
g.state={location:{b:1,unit:0},properties:['1:0'],inventory:{speaker_1:1,speaker_10:1}};g.L={buildings:[null,{id:1,kind:'apartment'}]};
g.interior={acts:[{action:'homepc'}]};g.toast=()=>{};g.save=()=>{saves++;};g.syncHomeSpeakerVisual=()=>{};
assert(g.installHomeSpeaker('speaker_1'));assert.equal(g.homeSpeaker(),'speaker_1');assert.equal(g.state.inventory.speaker_1,undefined);
assert(g.installHomeSpeaker('speaker_10'));assert.equal(g.homeSpeaker(),'speaker_10');assert.equal(g.state.inventory.speaker_1,1);
assert(g.removeHomeSpeaker());assert.equal(g.state.inventory.speaker_10,1);assert.equal(g.homeSpeaker(),null);assert.equal(saves,3);
g.state.properties=[];assert.equal(g.installHomeSpeaker('speaker_1'),false);assert.equal(g.state.inventory.speaker_1,1);
g.sound={coin:()=>{},error:()=>{}};g.state.money=999;g.buy('speaker_1');assert.equal(g.state.money,999);assert.equal(g.state.inventory.speaker_1,1);
g.state.money=1000;g.buy('speaker_1');assert.equal(g.state.money,0);assert.equal(g.state.inventory.speaker_1,2);
console.log('✓ 10 колонок: цены, покупка, установка/замена/снятие, проверка собственности, сохранение и громкость');
