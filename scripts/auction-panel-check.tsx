import './domstub';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AuctionPanel } from '../src/ui/AuctionPanel';
import type { Game } from '../src/game/game';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window.setInterval = setInterval;
(globalThis as any).window.clearInterval = clearInterval;
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const text = (node: any): string => typeof node === 'string' ? node : !node ? '' : Array.isArray(node) ? node.map(text).join(' ') : text(node.children);
async function main() {
  let app!: TestRenderer.ReactTestRenderer;
  const offline = {net:null} as unknown as Game;
  await act(async () => { app = TestRenderer.create(<AuctionPanel g={offline} close={() => {}} />); });
  assert(text(app.toJSON()).includes('Подключитесь к онлайн'), 'офлайн-инструкция');
  await act(async () => app.unmount());
  const net: any = {ready:true, auction:null, requestAuction() {
    this.auction = {serverTime:Date.now(),receivedAt:Date.now(),lots:[{id:1,kind:'vehicle',assetKey:'uid',vehicleType:'lada',seller:'seller',startPrice:50000,step:1000,endsAt:Date.now()+60000,bid:null,bidder:null}]};
  }};
  const g = {net,L:{kiosks:[],buildings:[]},getState:()=>({vehicles:[{uid:'mycar',type:'lada'}],kiosks:[],properties:[]})} as unknown as Game;
  await act(async () => { app = TestRenderer.create(<AuctionPanel g={g} close={() => {}} />); });
  await act(async () => { app.update(<AuctionPanel g={g} close={() => {}} />); });
  assert(text(app.toJSON()).match(/№\s*1/), 'номер лота');
  assert(text(app.toJSON()).includes('Ваше имущество для будущих торгов'), 'показывается имущество');
  assert(text(app.toJSON()).includes('Выставление закрыто'), 'нет мнимых сделок');
  const buttons = app.root.findAllByType('button');
  assert(buttons.some(b => b.props.disabled && text(b.children).includes('Ставки закрыты')), 'ставки не должны быть включены');
  assert(text(app.toJSON()).includes('50 000') || text(app.toJSON()).includes('50 000'), 'начальная цена');
  await act(async () => app.unmount());
  console.log('✓ окно аукциона: офлайн, загрузка лота, цена, ставки закрыты');
}
main().then(() => process.exit(0)).catch(e => {console.error(e); process.exit(1);});
