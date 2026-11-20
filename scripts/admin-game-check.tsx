import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AdminPanel } from '../src/ui/AdminPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { window: unknown }).window = { location: { search: '' }, confirm: () => true };
const calls: { path: string; body?: Record<string, unknown>; token: string }[] = [];
const players = [{ name: 'Анна', money: 100 }, { name: 'Петя', money: 200 }];
const actions = [
  { id: 'money_add_1k', g: 'money', t: '+1 000 $', need: true },
  { id: 'ban', g: 'mod', t: 'Забанить', need: true, confirm: true },
];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, options: { body?: string; headers: Record<string, string> }) => {
  const path = new URL(url).pathname;
  calls.push({ path, body: options.body ? JSON.parse(options.body) : undefined, token: options.headers['x-admin-token'] });
  if (path === '/admin/state') return { ok: true, json: async () => ({ ok: true, players: [...players].reverse(), online: ['Петя'], actions, groups: { money: 'Деньги', mod: 'Модерация' }, log: [], money: { amount: 1000, cap: 1000000, step: 1000 }, server: { version: '0.6.2', uptime: 10 } }) };
  if (path === '/admin/items') return { ok: true, json: async () => ({ ok: true, items: [{ id: 'water', name: 'Вода', icon: '💧' }], actions: [{ id: 'item_give', g: 'give', t: 'Выдать', need: true, item: true }], kits: [] }) };
  if (path === '/admin/action') return { ok: true, json: async () => ({ ok: true, message: 'Готово' }) };
  throw new Error('Неожиданный путь: ' + path);
};
const assert = (condition: unknown, msg: string) => { if (!condition) throw new Error(msg); };
const label = (node: TestRenderer.ReactTestInstance): string => node.children.map(c => typeof c === 'string' ? c : '').join('');
const main = async () => {
  let app!: TestRenderer.ReactTestRenderer;
  await act(async () => { app = TestRenderer.create(<AdminPanel />); });
  const findButton = (text: string) => app.root.findAllByType('button').find(b => label(b).includes(text));
  const pass = app.root.findByProps({ type: 'password' });
  await act(async () => { pass.props.onChange({ target: { value: 'secret-for-test' } }); });
  await act(async () => { findButton('Подключиться')!.props.onClick(); });
  assert(calls.every(c => c.token === 'secret-for-test'), 'токен не передан заголовком');
  let select = app.root.findByProps({ 'aria-label': 'Выбранный игрок' });
  await act(async () => { select.props.onChange({ target: { value: 'Петя' } }); });
  await act(async () => { findButton('+1 000')!.props.onClick(); });
  select = app.root.findByProps({ 'aria-label': 'Выбранный игрок' });
  assert(select.props.value === 'Петя', 'выбранный игрок сбросился после обновления');
  assert(calls.some(c => c.body?.action === 'money_add_1k' && c.body.name === 'Петя'), 'деньги отправлены не выбранному игроку');
  await act(async () => { findButton('Инвентарь')!.props.onClick(); });
  await act(async () => { findButton('Выдать')!.props.onClick(); });
  assert(calls.some(c => c.body?.action === 'item_give' && c.body.name === 'Петя' && c.body.item === 'water'), 'предмет не дошёл до выбранного игрока');
  assert(app.root.findByProps({ 'aria-label': 'Выбранный игрок' }).props.value === 'Петя', 'выбор сбросился после выдачи предмета');
  await act(async () => { findButton('Модерация')!.props.onClick(); });
  await act(async () => { findButton('Забанить')!.props.onClick(); });
  assert(!calls.some(c => c.body?.action === 'ban'), 'опасное действие прошло без разрешения');
  await act(async () => { app.unmount(); });
  console.log('✓ игровая админка: токен, выбор игрока, деньги, предметы, защита опасных действий');
};
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
