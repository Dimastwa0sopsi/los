#!/usr/bin/env python3
"""Прогон админ-панели без Colab: поддельные ipywidgets + поддельный сервер.

Зачем: панель — это ячейка Colab, её нельзя «просто запустить» в проверке. Здесь
подменяются ipywidgets, IPython и сеть, ячейка честно исполняется, а потом мы
смотрим, что получилось. Главное, что проверяется:

  • панель собирается без ошибок и без SystemExit;
  • разделов ровно 8 и в каждом есть кнопки;
  • выбор игрока НЕ сбрасывается после действия (тот самый баг из жалобы);
  • при мёртвом сервере панель всё равно открывается и объясняет причину.

Поддельный Select ведёт себя как настоящий ipywidgets: при смене options
выделение сбрасывается на первый элемент. Если панель не восстановит выбор,
проверка упадёт — именно так баг и ловится.

    python3 scripts/admin_panel_smoke.py     # npm run check:admin
"""
import io
import json
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PANEL = os.path.join(ROOT, 'server', 'colab_admin.py')

fail = 0


def t(name, ok, extra=''):
    global fail
    print(f"  {'✓' if ok else '✗'} {name}" + (f' — {extra}' if extra else ''))
    if not ok:
        fail += 1


# ── поддельные виджеты ──────────────────────────────────────────────────────
def make_widgets():
    mod = types.ModuleType('ipywidgets')

    def Layout(**kw):                                     # noqa: N802
        return dict(kw)

    class Base:
        _counter = 0

        def __init__(self, **kw):
            Base._counter += 1
            self._id = Base._counter
            self._obs = []
            self.children = list(kw.pop('children', []) or [])
            for k, v in kw.items():
                setattr(self, k, v)
            self.description = kw.get('description', '')

        def observe(self, cb, names='value'):
            self._obs.append(cb)

        def _notify(self, old, new):
            for cb in self._obs:
                cb({'name': 'value', 'old': old, 'new': new})

        def __repr__(self):
            return f'<{type(self).__name__} {getattr(self, "description", "")}>'

    class Val(Base):
        def __init__(self, value='', **kw):
            self._value = value
            super().__init__(**kw)

        @property
        def value(self):
            return self._value

        @value.setter
        def value(self, v):
            old = self._value
            self._value = v
            if old != v:
                self._notify(old, v)

    class Text(Val):
        pass

    class IntText(Val):
        pass

    class Checkbox(Val):
        pass

    class HTML(Val):
        pass

    class Button(Base):
        def __init__(self, description='', **kw):
            super().__init__(**kw)
            self.description = description
            self._click = None

        def on_click(self, cb):
            self._click = cb

        def click(self):
            if self._click:
                self._click(self)

    class _Options(Val):
        def __init__(self, options=None, value=None, **kw):
            opts = list(options or [])
            first = _val(opts[0]) if opts else ''
            super().__init__(value if value is not None else first, **kw)
            self._options = opts

        @property
        def options(self):
            return self._options

        @options.setter
        def options(self, opts):
            self._options = list(opts or [])
            vals = [_val(o) for o in self._options]
            # так ведёт себя настоящий ipywidgets: смена options сбрасывает выбор
            self.index = 0 if vals else None
            self.value = vals[0] if vals else ''

    class Dropdown(_Options):
        pass

    class Select(_Options):
        def __init__(self, options=None, **kw):
            super().__init__(options, **kw)
            self.index = 0 if self._options else None

    class Container(Base):
        def __init__(self, children=None, **kw):
            super().__init__(children=children or [], **kw)

    class Tab(Container):
        def __init__(self, children=None, **kw):
            super().__init__(children=children or [], **kw)
            self.titles = {}

        def set_title(self, i, title):
            self.titles[i] = title

        def all_widgets(self):
            seen, stack = [], list(self.children)
            while stack:
                w = stack.pop()
                seen.append(w)
                stack.extend(getattr(w, 'children', []) or [])
            return seen

    for cls in (Base, Val, Text, IntText, Checkbox, HTML, Button, Dropdown, Select, Container, Tab):
        setattr(mod, cls.__name__, cls)
    mod.Layout = Layout
    mod.VBox = Container
    mod.HBox = Container
    mod.Box = Container
    return mod


def _val(option):
    if isinstance(option, (tuple, list)) and len(option) == 2:
        return option[1]
    return option


# ── поддельный сервер ───────────────────────────────────────────────────────
class FakeResp:
    def __init__(self, status, payload):
        self.status = status
        self._body = json.dumps(payload).encode() if not isinstance(payload, (bytes, str)) else \
            (payload.encode() if isinstance(payload, str) else payload)

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def make_server(state_alive=True):
    calls = []
    players = [
        {'name': 'Вася', 'money': 1000, 'warns': 0},
        {'name': 'Петя', 'money': 50000, 'warns': 2, 'vehicle': 'volga'},
        {'name': 'Аня', 'money': 3000, 'warns': 0},
    ]
    actions = [
        {'id': 'money_add_1k', 'g': 'money', 't': '+1 000 $', 'need': True},
        {'id': 'ban', 'g': 'mod', 't': 'Забанить', 'need': True, 'confirm': True},
        {'id': 'kick', 'g': 'mod', 't': 'Кикнуть', 'need': True},
        {'id': 'tp_player', 'g': 'tp', 't': 'К другому игроку', 'need': True, 'target': True},
        {'id': 'tp', 'g': 'tp', 't': 'Телепорт X/Z', 'need': True, 'xy': True},
        {'id': 'car_number', 'g': 'car', 't': 'Задать номер', 'need': True, 'number': True},
        {'id': 'player_house', 'g': 'player', 't': 'Выдать дом', 'need': True, 'house': True},
        {'id': 'announce', 'g': 'chat', 't': 'Объявление', 'text': True},
        {'id': 'maintenance_on', 'g': 'server', 't': 'Техработы', 'confirm': True},
        {'id': 'event_rain', 'g': 'event', 't': 'Дождь'},
    ]

    def urlopen(req, data=None, timeout=None):
        url = req.full_url if hasattr(req, 'full_url') else str(req)
        calls.append(url + ('|' + data.decode() if data else ''))
        path = url.split('?')[0]
        if not state_alive:
            return FakeResp(404, '<html>ngrok</html>')
        if path.endswith('/admin/state'):
            return FakeResp(200, {'ok': True, 'players': players, 'online': ['Петя'],
                                  'chat': [{'text': 'привет'}],
                                  'server': {'uptime': 8123, 'version': '0.6.0',
                                             'maintenance': False, 'mute': False}})
        if path.endswith('/admin/actions'):
            return FakeResp(200, {'ok': True, 'groups': {'money': '💵 Деньги', 'mod': '🛡 Модерация',
                                                         'tp': '🚀 Телепорт', 'car': '🚗 Транспорт',
                                                         'player': '👤 Игрок', 'chat': '📢 Чат',
                                                         'server': '🖥 Сервер', 'event': '🎉 События'},
                                  'actions': actions})
        if path.endswith('/admin/items'):
            return FakeResp(200, {'ok': True, 'items': [{'id': 'bread', 'name': 'Хлеб', 'icon': '🍞', 'price': 40}],
                                  'kits': ['starter']})
        if path.endswith('/admin/money'):
            if data is not None:
                return FakeResp(200, {'ok': True, 'money': json.loads(data)})
            return FakeResp(200, {'ok': True, 'money': {'amount': 1000, 'cap': 1000000, 'step': 500}})
        if path.endswith('/admin/log'):
            return FakeResp(200, {'ok': True, 'log': [{'text': 'панель подключилась'}]})
        if path.endswith('/admin/tunnel'):
            return FakeResp(200, {'ok': True, 'url': 'https://x.ngrok-free.dev', 'source': 'PUBLIC_URL'})
        if path.endswith('/admin/publish'):
            return FakeResp(200, {'ok': True, 'site': 'https://example.github.io/los/'})
        if path.endswith('/admin/inventory'):
            return FakeResp(200, {'ok': True, 'rows': ['Хлеб ×3'], 'live': True})
        if path.endswith('/admin/action'):
            body = json.loads(data or b'{}')
            return FakeResp(200, {'ok': True, 'message': f"{body.get('action')} → {body.get('name', '')}".strip(),
                                  'rows': ['готово']})
        if path.endswith('/version'):
            return FakeResp(200, {'server': 'los-gorod', 'version': '0.6.0', 'build': 'test'})
        return FakeResp(404, {'ok': False, 'error': 'not found'})

    return urlopen, calls


def run_panel(state_alive=True):
    """Исполнить ячейку панели и вернуть её глобальные переменные."""
    widgets = make_widgets()
    ipy = types.ModuleType('IPython')
    disp = types.ModuleType('IPython.display')
    shown = []
    disp.display = lambda *a, **k: shown.append(a)
    ipy.display = disp

    urlopen, calls = make_server(state_alive)
    import urllib.request as ur

    real_urlopen = ur.urlopen
    ur.urlopen = urlopen
    sys.modules['ipywidgets'] = widgets
    sys.modules['IPython'] = ipy
    sys.modules['IPython.display'] = disp

    # адрес берём «из cfg»: подсовываем его через фиктивное значение по умолчанию
    src = open(PANEL, encoding='utf-8').read()
    src = src.replace("CFG_F = '/content/drive/MyDrive/los-gorod/cfg.json'",
                      f"CFG_F = {json.dumps(os.devnull)}")
    src = src.replace("BASE = ''\ntry:", f"BASE = 'https://test.ngrok-free.dev'\ntry:", 1)

    g = {'__name__': 'panel', '__file__': PANEL}
    # подмену НЕ снимаем: тесты жмут кнопки уже после exec, им нужен тот же сервер
    g['_restore'] = lambda: setattr(ur, 'urlopen', real_urlopen)
    try:
        exec(compile(src, PANEL, 'exec'), g)              # noqa: S102
    except BaseException:
        ur.urlopen = real_urlopen
        raise
    g['_shown'] = shown
    g['_calls'] = calls
    return g


print('  живой сервер:')
try:
    g = run_panel(True)
    t('панель собралась без исключения', True)
except Exception as e:                                    # noqa: BLE001
    t('панель собралась без исключения', False, repr(e))
    print('\n✗ панель не запускается — дальше проверять нечего')
    sys.exit(1)

w = sys.modules  # noqa: F841
PL = g['PL']
tabs = g['tabs']
t('окно панели показано', len(g['_shown']) == 1)
t('разделов восемь', len(tabs.children) == 8, str(len(tabs.children)))
t('у каждого раздела есть заголовок с числом кнопок',
  all('(' in tabs.titles.get(i, '') or i in (2, 7) for i in range(8)),
  ', '.join(tabs.titles.get(i, '?') for i in range(8)))
t('в разделах есть кнопки', all(getattr(bx, 'children', None) for bx in g['AREAS'].values()),
  str({k: len(v.children) for k, v in g['AREAS'].items()}))
t('состояние сервера прочитано', PL.players and len(PL.players) == 3)
t('карточка показывает аптайм-версию в шапке', 'v0.6.0' in g['status'].value, g['status'].value[:60])

# ── главный сценарий: выбрал Петю, дал денег — выбор остался на Пете ──
plist = g['plist']
plist.value = 'Петя'
g['draw_list']()
t('выбор через виджет попал в состояние', PL.selected == 'Петя', PL.selected)

def find_buttons(node):
    """Все кнопки внутри контейнера (в порядке появления)."""
    out, stack = [], [node]
    while stack:
        cur = stack.pop()
        if hasattr(cur, 'click'):
            out.append(cur)
            continue
        stack.extend(reversed(getattr(cur, 'children', []) or []))
    return out


money_btn = next((b for b in find_buttons(g['AREAS']['money']) if '1 000' in b.description), None)
t('кнопка «+1 000 $» есть', money_btn is not None)
money_btn.click()                                         # выдать 1000 Пете
def body_of(call):
    if '|' not in call:
        return {}
    try:
        return json.loads(call.split('|', 1)[1])
    except Exception:                                     # noqa: BLE001
        return {}


action_calls = [c for c in g['_calls'] if '/admin/action' in c]
bodies = [body_of(c) for c in action_calls]
t('действие ушло на Петю, а не на первого игрока',
  any(b.get('action') == 'money_add_1k' and b.get('name') == 'Петя' for b in bodies),
  ' · '.join(str(b) for b in bodies) or 'запросов /admin/action нет')
t('после выдачи выбор всё ещё Петя', PL.selected == 'Петя', PL.selected)
t('и в списке выделен Петя', plist.value == 'Петя', str(plist.value))
t('история панели заполняется', len(g['HIST'].items) >= 1)

# Срок вводится в разделе наказаний; мут уходит выбранному игроку сразу.
issue_btn = next((b for b in find_buttons(tabs.children[5]) if b.description == 'Выдать'), None)
t('кнопка выдачи наказания есть', issue_btn is not None)
before = len(g['_calls'])
issue_btn.click()
t('мут на 30 минут выдан без галочки', any(body_of(c).get('action') == 'mute' and body_of(c).get('name') == 'Петя' and body_of(c).get('minutes') == 30 for c in g['_calls'][before:]))

# ── быстрые кнопки под списком игроков ──
quick = find_buttons(g['quick_bar'])
names = [b.description for b in quick]
t('быстрая строка есть', len(quick) >= 6, ', '.join(names))
plist.value = 'Петя'
g['draw_list']()
before = len(g['_calls'])
next(b for b in quick if '+10 000' in b.description).click()
t('быстрые деньги уходят выбранному', any(
    body_of(c).get('action') == 'money_add_10k' and body_of(c).get('name') == 'Петя'
    for c in g['_calls'][before:]), str(len(g['_calls']) - before))
t('после быстрой кнопки выбор не сбился', PL.selected == 'Петя', PL.selected)
PL.clear() if hasattr(PL, 'clear') else None
g['plist'].value = ''
before = len(g['_calls'])
next(b for b in quick if 'Лечить' in b.description).click()
t('без выбора быстрая кнопка ничего не шлёт', len(g['_calls']) == before)

# ── прокликиваем все кнопки всех разделов: ни одна не должна падать ──
print('  прокликиваю все кнопки разделов:')
plist.value = 'Петя'
g['draw_list']()
g['reason'].value = 'проверка'
g['target'].value = (g['target'].options[0][1] if g['target'].options else '')
g['chat_text'].value = 'тест'
g['plate'].value = 'А123ВС'
start = len(g['_calls'])
errors = []
clicked = 0
for _area in g['AREAS'].values():
    for _b in find_buttons(_area):
        clicked += 1
        try:
            _b.click()
        except Exception as _e:                           # noqa: BLE001
            errors.append(f'{_b.description}: {_e!r}')
t('все кнопки разделов нажимаются без исключений', not errors,
  f'{clicked} кнопок' + (', ошибки: ' + '; '.join(errors[:3]) if errors else ''))
posted = [body_of(c).get('action') for c in g['_calls'][start:] if '/admin/action' in c]
t('кнопки действительно отправляют действия', len(posted) >= 5, str(sorted(set(posted))[:8]))
t('после прокликивания выбор всё ещё Петя', PL.selected == 'Петя', PL.selected)

# ── сервер мёртв: панель открывается и объясняет причину ──
print('  мёртвый сервер (тот самый ngrok 404):')
try:
    g2 = run_panel(False)
    t('панель открылась без SystemExit', True)
    t('объяснение связи на экране', '404' in g2['conn_view'].value or 'туннел' in g2['conn_view'].value.lower(),
      g2['conn_view'].value[:80].replace('\n', ' '))
    t('кнопки всё равно построены', bool(g2['AREAS']['server'].children))
except SystemExit as e:
    t('панель открылась без SystemExit', False, f'SystemExit({e.code})')
except Exception as e:                                    # noqa: BLE001
    t('панель открылась без SystemExit', False, repr(e))

try:
    g2['_restore']()
except Exception:                                         # noqa: BLE001
    pass
g['_restore']()

print('\n✗ провалов: %d' % fail if fail else '\n✓ админ-панель собирается и не теряет выбор игрока')
sys.exit(1 if fail else 0)
