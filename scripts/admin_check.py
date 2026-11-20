#!/usr/bin/env python3
"""Проверка логики админ-панели без Colab: выбор игрока, разделы, диагностика.

Главный сценарий из жалобы: выбрал второго игрока, дал ему денег — и выбор
перескочил на первого. Здесь это ловится в чистом виде.

    python3 scripts/admin_check.py        # npm run check:admin
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))
import admin_lib as lib                                                # noqa: E402
from admin_lib import (PlayerList, History, diagnose, fmt_money, fmt_uptime,  # noqa: E402
                       group_actions, TABS, action_count)

fail = 0


def t(name, ok, extra=''):
    global fail
    print(f"  {'✓' if ok else '✗'} {name}" + (f' — {extra}' if extra else ''))
    if not ok:
        fail += 1


PLAYERS = [
    {'name': 'Вася', 'money': 1000, 'warns': 0},
    {'name': 'Петя', 'money': 50000, 'warns': 2, 'vehicle': 'volga'},
    {'name': 'Аня', 'money': 3000, 'warns': 0},
]

print('  список игроков:')
pl = PlayerList()
pl.update(PLAYERS, ['Петя'])
t('все игроки на месте', len(pl.players) == 3)
t('фильтр «в сети»', [v for _l, v in pl.rows(flt='online')] == ['Петя'])
t('фильтр «офлайн»', [v for _l, v in pl.rows(flt='offline')] == ['Аня', 'Вася'])
t('поиск по нику', [v for _l, v in pl.rows(query='пет')] == ['Петя'])
t('сортировка по деньгам', [v for _l, v in pl.rows(sort='money')] == ['Петя', 'Аня', 'Вася'])

print('  выбор игрока (баг из жалобы):')
pl.select('Петя')
before = pl.selected
# именно так панель перерисовывает список после каждого действия
opts = pl.rows(sort='money')
idx = pl.restore_index([v for _l, v in opts])
t('выбор пережил перерисовку', pl.selected == before == 'Петя')
t('индекс в новом списке указывает на Петю', idx is not None and opts[idx][1] == 'Петя', f'index={idx}')
# денег добавили — сортировка изменилась, выбор должен остаться
pl.update([{'name': 'Вася', 'money': 999999}, PLAYERS[1], PLAYERS[2]], ['Петя'])
opts = pl.rows(sort='money')
idx = pl.restore_index([v for _l, v in opts])
t('после выдачи денег выбор не улетел на первого', pl.selected == 'Петя')
t('и индекс всё ещё Петя', idx is not None and opts[idx][1] == 'Петя', f'index={idx}')
t('карточка — это Петя', pl.card()['name'] == 'Петя' and pl.card()['found'])
t('карточка знает про машину', pl.card()['vehicle'] == 'volga')
# игрока удалили: выбор не должен молча съехать
pl.update([PLAYERS[0], PLAYERS[2]], ['Петя'])
t('пропавший игрок помечен, а не подменён первым', pl.selected == 'Петя' and pl.stale)
t('карточка честно говорит, что игрока нет', not pl.card()['found'])
pl.select('')
t('пустой выбор — это «никого», а не первый игрок', pl.selected == '' and pl.restore_index(['Вася', 'Аня']) is None)

print('  разделы и действия:')
ACTS = [
    {'id': 'money_add_1k', 'g': 'money', 't': '+1 000 $', 'need': True},
    {'id': 'money_set_0', 'g': 'money', 't': 'Обнулить баланс', 'need': True},
    {'id': 'ban', 'g': 'mod', 't': 'Забанить', 'need': True, 'confirm': True},
    {'id': 'chat_clear', 'g': 'chat', 't': 'Очистить чат'},
    {'id': 'car_repair', 'g': 'car', 't': 'Починить авто', 'need': True},
    {'id': 'tp_spawn', 'g': 'tp', 't': 'Телепорт на спавн', 'need': True},
    {'id': 'maintenance_on', 'g': 'server', 't': 'Техработы', 'confirm': True},
    {'id': 'event_rain', 'g': 'event', 't': 'Дождь'},
]
GROUPS = {'money': '💵 Деньги', 'mod': '🛡 Модерация', 'chat': '📢 Чат и объявления',
          'car': '🚗 Транспорт', 'server': '🖥 Сервер', 'event': '🎉 События', 'tp': '🚀 Телепорт'}
t('вкладок восемь', len(TABS) == 8, ', '.join(k for k, *_ in TABS))
t('деньги — свой раздел', action_count(ACTS, 'money') == 2)
t('сервер собирает server+event', action_count(ACTS, 'server') == 2)
t('поиск по действиям', [a['id'] for _g, acts in group_actions(ACTS, GROUPS, 'money', 'обнул') for a in acts] == ['money_set_0'])
t('пустые группы не рисуются', group_actions(ACTS, GROUPS, 'car') == [('🚗 Транспорт', [ACTS[4]])])

print('  диагностика связи:')
d = diagnose(200, 200, '{"server":"los-gorod"}')
t('всё хорошо', d['level'] == 'ok')
d = diagnose(200, 404)
t('ngrok 404 объясняется как «туннель без сервера»', d['level'] == 'warn' and 'туннел' in d['title'].lower())
d = diagnose(0, 0, base='https://x.ngrok-free.dev')
t('нет связи — подсказка про порядок запуска', d['level'] == 'down' and any('/version' in h for h in d['hints']))
d = diagnose(403, 0)
t('403 — неверный токен', d['level'] == 'down' and 'токен' in d['title'].lower())

print('  форматирование и история:')
t('деньги с пробелами', fmt_money(1234567) == '$1 234 567', fmt_money(1234567))
t('отрицательные деньги', fmt_money(-500) == '−$500', fmt_money(-500))
t('аптайм: секунды', fmt_uptime(45) == '45 с')
t('аптайм: часы', fmt_uptime(3600 * 2 + 60 * 14) == '2 ч 14 мин', fmt_uptime(8064))
t('аптайм: сутки', fmt_uptime(86400 * 3 + 3600) == '3 сут 1 ч', fmt_uptime(262800))
h = History(limit=3)
for i in range(5):
    h.add(f'действие {i}', i % 2 == 0, 'ок')
t('история держит лимит', len(h.items) == 3)
t('свежие сверху', h.rows(1)[0]['action'] == 'действие 4')


# ── панель и сервер говорят на одном языке ─────────────────────────────────
print('  связка «кнопка → действие сервера»:')
import re as _re

ADMIN_SRC = open(os.path.join(ROOT, 'server', 'colab_admin.py'), encoding='utf-8').read()
SERVER_SRC = open(os.path.join(ROOT, 'server', 'server.js'), encoding='utf-8').read()

server_ids = set(_re.findall(r"id:\s*'([a-z0-9_]+)'", SERVER_SRC))
panel_ids = set(_re.findall(r"run\(\s*'([a-z0-9_]+)'", ADMIN_SRC))
missing = sorted(i for i in panel_ids if i not in server_ids)
t('каждое действие панели есть на сервере', not missing, 'нет на сервере: ' + ', '.join(missing))
t('панель не шлёт kit_give (набора с таким именем не существует)',
  'kit_give' not in panel_ids and 'kit_start' in server_ids)
t('наборы берутся из ответа сервера', 'kit_sel.options = [(str(k), str(k)) for k in kits]' in ADMIN_SRC)
t('каталог кнопок тоже с сервера', "/admin/actions" in ADMIN_SRC)

srv_groups = set(_re.findall(r"g: '([a-z]+)'", SERVER_SRC))
covered = set()
for _k, *_rest in TABS:
    covered |= set(lib.TAB_GROUPS.get(_k, ()))
# give/kit — это раздел «Инвентарь»: там свои поля выбора предмета и количества,
# поэтому каталог ITEM_ACTIONS в общий список групп сознательно не входит
covered |= {'give', 'kit'}
lost = sorted(srv_groups - covered)
t('ни одна группа кнопок не потерялась', not lost, 'некуда положить: ' + ', '.join(lost))
t('телепорт доступен из раздела «Игроки»', 'tp' in lib.TAB_GROUPS['players'])

print('\n✗ провалов: %d' % fail if fail else '\n✓ логика админ-панели в порядке')
sys.exit(1 if fail else 0)
