import './domstub';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import { GamePanel } from '../src/ui/Panels';
import type { Game } from '../src/game/game';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const assert = (ok: unknown, msg: string) => { if (!ok) throw Error(msg); };
const text = (node: any): string => typeof node === 'string' ? node : !node ? '' : Array.isArray(node) ? node.map(text).join(' ') : text(node.children);
async function main() {
  const state: any = {wanted:0,vehicles:[]}; let opened: any = null;
  const g = {getState:()=>state,vehicleDocument:(uid:string)=>`ПТС ${uid}`,openPanel:(p:unknown)=>{opened=p;}} as unknown as Game;
  let app!: TestRenderer.ReactTestRenderer;
  await act(async()=>{app=TestRenderer.create(<GamePanel g={g} panel={{type:'police',title:'Полиция'}} close={()=>{}} />);});
  assert(text(app.toJSON()).includes('У вас пока нет транспорта'),'пустой список');
  state.vehicles = [{uid:'car-1',type:'lada',tuning:{plate:'А123ВС 77',plateFront:false,plateBack:true}}];
  await act(async()=>{app.update(<GamePanel g={g} panel={{type:'police',title:'Полиция'}} close={()=>{}} />);});
  const rendered = text(app.toJSON());
  assert(rendered.includes('А123ВС 77') && rendered.includes('передний:') && rendered.includes('нет'),'номер и снятый знак');
  assert(rendered.includes('пока не подключена'),'не обещать выдачу номеров');
  const buttons = app.root.findAllByType('button');
  const pts = buttons.find(b=>text(b.children)==='ПТС'); assert(pts,'кнопка ПТС');
  await act(async()=>pts!.props.onClick());
  assert(opened?.type==='info' && opened.text==='ПТС car-1','ПТС выбранной машины');
  await act(async()=>app.unmount());
  console.log('✓ полиция: пустой список, номер, снятая табличка, ПТС без списаний');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
