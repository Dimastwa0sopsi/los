import './domstub';
import {strict as assert} from 'node:assert';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {PcPanel} from '../src/ui/Work';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
async function main() {
  let selected=0,closed=0;
  const g:any={getState:()=>({officeDone:0,inventory:{},properties:[],gameTime:100,money:0}),homeSpeaker:()=>null,selectComputerRadioSource:()=>{selected++;return true;},sound:{click(){}},radio:{volume:1,insideVolume:1,state:()=>({playing:false,station:null}),onChange:null},online:false};
  let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(<PcPanel g={g} mode="home" close={()=>{closed++;}}/>);});
  const text=(node:any):string=>typeof node==='string'?node:(node.children??[]).map(text).join('');
  const press=async(label:string)=>{const b=view.root.findAllByType('button').find(n=>text(n).includes(label)||n.props.title===label);assert(b,label);await act(async()=>b.props.onClick());};
  await press('Поддержка');assert(view.root.findAllByType('textarea').length===1);assert.equal(closed,0);
  await press('Рабочий стол');await press('Музыка');assert.equal(selected,1);assert.equal(closed,0);assert(view.root.findAll(n=>n.props.className==='rd-back rd-embedded').length===1);
  await press('Рабочий стол');await press('Настройки');assert(view.root.findAll(n=>n.props.className==='lsos-speaker-list').length===1);assert.equal(closed,0);
  await act(async()=>view.unmount());console.log('✓ LSos: поддержка, музыка и настройки открываются внутри ПК');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
