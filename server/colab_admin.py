# ════════════════════════════════════════════════════════════════════════════
#  ЛОС-ГОРОД — АДМИН-ПАНЕЛЬ 2.0 (одна ячейка Colab)
#
#  Что изменилось против прошлой версии:
#   • восемь разделов: Игроки · Деньги · Инвентарь · Транспорт · Чат и СМИ ·
#     Модерация · Сервер · Логи (вкладки больше не свалка из 100 кнопок);
#   • ВЫБОР ИГРОКА НЕ СБРАСЫВАЕТСЯ. Раньше после каждого действия список
#     перерисовывался и выбор улетал на первого игрока — теперь выбранный ник
#     живёт отдельно от виджета (server/admin_lib.py, проверка check:admin);
#   • выбор виден на всех вкладках: карточка игрока закреплена сверху;
#   • нет SystemExit: если сервер недоступен, панель всё равно открывается,
#     объясняет причину, показывает «Переподключиться» и сама ждёт сервер;
#   • поиск по кнопкам внутри раздела, быстрые суммы (выдать/забрать/установить
#     любую сумму), история последних действий, проверка туннеля.
#
#  Секретный токен админки берётся из cfg.json серверной ячейки.
#  Адрес сервера берётся из MyDrive/los-gorod/cfg.json (LAST_URL) или вводится
#  в поле сверху — в любой момент, без перезапуска ячейки.
# ════════════════════════════════════════════════════════════════════════════
import json, os, sys, threading, time, urllib.error, urllib.parse, urllib.request

CFG_F = '/content/drive/MyDrive/los-gorod/cfg.json'
APP_SERVER = '/content/drive/MyDrive/los-gorod/app/server'
# Для старых отдельно запущенных серверов оставлена совместимость; новый
# сервер создаёт личный токен в cfg.json и не использует общий пароль.
try:
    with open(CFG_F, encoding='utf-8') as _cfg_file:
        ADMIN_TOKEN = str(json.load(_cfg_file).get('ADMIN_TOKEN') or 'losgorod-admin')
except (OSError, ValueError, TypeError):
    ADMIN_TOKEN = 'losgorod-admin'
RAW_LIB = 'https://raw.githubusercontent.com/Dimastwa0sopsi/los/main/server/admin_lib.py'


def say(icon, *m):
    print(f'{icon} \033[1m{" ".join(map(str, m))}\033[0m')


# ── логика панели: с Drive, из текущей папки или прямо с GitHub ──────────────
def _candidates():
    """Где искать admin_lib.py: Drive → рядом с ячейкой → текущая папка → /server."""
    out = [APP_SERVER]
    try:
        out.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:                                     # в Colab у ячейки нет __file__
        pass
    cwd = os.getcwd()
    out += [cwd, os.path.join(cwd, 'server'), '/content', '/content/server']
    return [p for p in out if p]


def _load_lib():
    for p in _candidates():
        if p and p not in sys.path:
            sys.path.insert(0, p)
    try:
        import admin_lib  # noqa: F401
        return admin_lib
    except Exception:                                     # noqa: BLE001
        pass
    try:
        import tempfile
        d = tempfile.mkdtemp(prefix='los-admin-')
        urllib.request.urlretrieve(RAW_LIB, os.path.join(d, 'admin_lib.py'))
        sys.path.insert(0, d)
        import admin_lib  # noqa: F401
        return admin_lib
    except Exception as e:                                # noqa: BLE001
        say('❌', 'Не нашёл admin_lib.py:', e)
        say('👉', 'Сначала запустите серверную ячейку (colab_one.py) — она скачивает код игры,',
            'затем эту. Либо проверьте интернет Colab.')
        raise SystemExit(1)


lib = _load_lib()
PlayerList, History = lib.PlayerList, lib.History
TABS, diagnose, fmt_money, fmt_uptime = lib.TABS, lib.diagnose, lib.fmt_money, lib.fmt_uptime
group_actions, short = lib.group_actions, lib.short


# ── адрес сервера ───────────────────────────────────────────────────────────
def norm_base(url):
    u = str(url or '').strip().rstrip('/')
    u = u.replace('wss://', 'https://').replace('ws://', 'http://')
    if not u:
        return ''
    if not u.startswith('http'):
        u = 'https://' + u
    return u


BASE = ''
try:
    BASE = norm_base(json.load(open(CFG_F)).get('LAST_URL'))
except Exception:                                         # noqa: BLE001
    pass


def _request(url, body=None, timeout=15, admin=False):
    """→ (код, данные). Токен админки передаём заголовком, а не в URL."""
    headers = {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1'}
    if admin:
        headers['X-Admin-Token'] = ADMIN_TOKEN
    req = urllib.request.Request(
        url, method='POST' if body is not None else 'GET', headers=headers)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            raw = r.read().decode('utf-8', 'replace')
            try:
                return r.status, json.loads(raw)
            except Exception:                             # noqa: BLE001
                return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception:                                     # noqa: BLE001
        return 0, ''


def api(path, body=None, timeout=15):
    if not BASE:
        return {'ok': False, 'error': 'Адрес сервера не задан'}
    url = f'{BASE}{path}'
    code, data = _request(url, body, timeout, admin=True)
    if isinstance(data, dict):
        return data
    if code in (401, 403):
        return {'ok': False, 'error': 'Неверный токен админки'}
    return {'ok': False, 'error': f'HTTP {code}' if code else 'Сервер недоступен'}


def public_version(timeout=8):
    """Проверка снаружи: отвечает ли /version через туннель."""
    if not BASE:
        return 0, ''
    return _request(f'{BASE}/version', None, timeout)


# ── виджеты ─────────────────────────────────────────────────────────────────
import subprocess                                          # noqa: E402

try:
    import ipywidgets as W
except ImportError:
    say('📦', 'Ставлю ipywidgets…')
    subprocess.run(f'{sys.executable} -m pip install -q ipywidgets', shell=True)
    import ipywidgets as W

from IPython.display import display                        # noqa: E402

L = W.Layout


def pill(text, bg='#1e293b', fg='#e2e8f0'):
    return (f'<span style="display:inline-block;padding:3px 9px;border-radius:999px;'
            f'background:{bg};color:{fg};font-size:12px;margin:0 4px 4px 0">{text}</span>')


def card_box(inner, bg='#0b1220'):
    return (f'<div style="padding:10px 12px;border-radius:12px;background:{bg};'
            f'border:1px solid #1e293b;margin:4px 0">{inner}</div>')


def head(text):
    return W.HTML(f'<b style="font-size:13px;color:#cbd5e1">{text}</b>')


def flow(children):
    return W.Box(children=list(children),
                 layout=L(display='flex', flex_flow='row wrap', align_content='flex-start'))


# ── состояние панели ────────────────────────────────────────────────────────
PL = PlayerList()
HIST = History()
CONN = {'ok': False, 'code': 0, 'pub': 0, 'pub_body': '', 'info': {}, 'why': {}, 'checking': False}
DRAWING = {'on': False}                # защита от «эха» при перерисовке списка

status = W.HTML(pill('Подключение…'))
conn_view = W.HTML('')
msg = W.HTML(pill('Выберите игрока в списке, затем жмите кнопки.'))
result = W.HTML('')
card = W.HTML(pill('Игрок не выбран'))

addr = W.Text(value=BASE, description='Адрес', placeholder='https://имя.ngrok-free.dev',
              layout=L(width='430px'))
search = W.Text(placeholder='поиск по нику…', layout=L(width='210px'))
filt = W.Dropdown(options=[('все', 'all'), ('в сети', 'online'), ('офлайн', 'offline')],
                  value='all', description='Кто', layout=L(width='190px'))
sort = W.Dropdown(options=[('по нику', 'name'), ('по деньгам', 'money')],
                  value='name', description='Порядок', layout=L(width='210px'))
plist = W.Select(options=[], rows=11, layout=L(width='330px'))
act_search = W.Text(placeholder='поиск по кнопкам раздела…', layout=L(width='320px'))
reason = W.Text(value='Нарушение правил', description='Причина', layout=L(width='330px'))
car_id = W.Text(value='volga', description='Авто (id)', layout=L(width='260px'))
plate = W.Text(placeholder='номер, напр. А123ВС', description='Номер', layout=L(width='330px'))
target = W.Dropdown(options=[], description='К кому', layout=L(width='260px'))
house = W.Text(value='house_1', description='Дом', layout=L(width='260px'))
tp_x = W.IntText(value=0, description='X', layout=L(width='130px'))
tp_z = W.IntText(value=0, description='Z', layout=L(width='130px'))
chat_text = W.Text(placeholder='текст объявления / сообщения…', layout=L(width='560px'))
item_sel = W.Dropdown(options=[], description='Предмет', layout=L(width='380px'))
kit_sel = W.Dropdown(options=[], description='Набор', layout=L(width='300px'))
qty = W.IntText(value=1, description='Кол-во', layout=L(width='170px'))
money_amt = W.IntText(value=1000, description='Сумма $', layout=L(width='190px'))
inv_view = W.HTML('')
log_view = W.HTML('')
hist_view = W.HTML('')
money_cfg_view = W.HTML('')

CATALOG = {'groups': {}, 'actions': []}
ITEMS = {'items': [], 'kits': []}


# ── связь ───────────────────────────────────────────────────────────────────
def refresh_conn(deep=False):
    """Проверить /admin/state (и, по желанию, /version снаружи). Возвращает state."""
    if not BASE:
        CONN.update(ok=False, code=0, pub=0, why={'level': 'down', 'title': 'Адрес сервера не задан',
                                                  'hints': ['Вставьте адрес сверху и нажмите «Подключиться».']})
        return None
    code, data = _request(f'{BASE}/admin/state', None, 10, admin=True)
    state = data if isinstance(data, dict) and data.get('ok') else None
    pub, pub_body = (public_version() if (deep or not state) else (CONN['pub'], CONN['pub_body']))
    eff = code if state else (code if code and code != 200 else 0)
    body = pub_body if isinstance(pub_body, str) else json.dumps(pub_body or '')
    CONN.update(ok=bool(state), code=code, pub=pub, pub_body=body,
                why=diagnose(eff, pub, body, BASE), info=(state or {}).get('server') or {})
    return state


def draw_conn():
    if not BASE:
        conn_view.value = card_box(
            '<b>Адрес сервера не задан.</b><br>'
            'Запустите серверную ячейку (colab_one.py), затем вставьте адрес сверху.',
            '#3f1d1d')
        return
    why = CONN['why']
    level = why.get('level', 'down')
    bg = {'ok': '#052e16', 'warn': '#3f2d0a', 'down': '#3f1d1d'}.get(level, '#3f1d1d')
    icon = {'ok': '🟢', 'warn': '🟡', 'down': '🔴'}.get(level, '🔴')
    hints = ''.join(f'<div style="font-size:12px;color:#cbd5e1">👉 {h}</div>' for h in why.get('hints', []))
    extra = ''
    if level == 'ok':
        extra = (f'<div style="font-size:12px;color:#86efac">Панель работает: '
                 f'{BASE} · токен принят</div>')
    conn_view.value = card_box(
        f'<b>{icon} {why.get("title", "нет связи")}</b><br>'
        f'<div style="font-size:12px;color:#94a3b8">{short(BASE, 70)} · '
        f'ответ панели: {CONN["code"] or "—"} · снаружи: {CONN["pub"] or "—"}</div>{extra}{hints}', bg)


def draw_status():
    info = CONN['info'] or {}
    bits = [pill('🟢 в сети: %d' % len(PL.online), '#065f46', '#d1fae5'),
            pill('👥 аккаунтов: %d' % len(PL.players)),
            pill('🖥 аптайм: %s' % fmt_uptime(info.get('uptime', '?'))),
            pill('📦 v%s' % info.get('version', '?'))]
    if info.get('maintenance'):
        bits.append(pill('🛠 ТЕХРАБОТЫ', '#7f1d1d', '#fff'))
    if info.get('mute'):
        bits.append(pill('🤐 ГЛОБАЛЬНЫЙ МУТ', '#7f1d1d', '#fff'))
    status.value = ''.join(bits)


# ── список игроков: выбор не сбрасывается ───────────────────────────────────
def draw_list():
    rows = PL.rows(search.value, filt.value, sort.value)
    vals = [v for _l, v in rows]
    keep = PL.selected
    DRAWING['on'] = True
    try:
        plist.options = rows
        if keep and keep in vals:
            plist.value = keep            # восстановили выбор — главный фикс
        else:
            plist.index = None            # «никого», а не первый попавшийся
    finally:
        DRAWING['on'] = False
    draw_card()


def draw_card():
    c = PL.card()
    if not PL.selected:
        card.value = pill('Игрок не выбран — выберите в списке слева')
        return
    if not c['found']:
        card.value = card_box(f'<b>{PL.selected}</b><br>'
                              '<span style="color:#fca5a5">Игрока нет в базе: '
                              'удалён или переименован. Выбор оставил как есть.</span>', '#3f1d1d')
        return
    top = (pill('🟢 онлайн' if c['online'] else '⚪ офлайн', '#065f46' if c['online'] else '#334155', '#fff')
           + pill(fmt_money(c['money']))
           + pill(f'⚠️ варнов: {c["warns"]}'))
    rows = ''.join(f'<div style="font-size:12px;color:#cbd5e1">{k}: <b>{v}</b></div>'
                   for k, v in c['rows'])
    card.value = card_box(f'<div style="font-size:15px"><b>{c["name"]}</b></div>{top}{rows}')


def draw_targets():
    """Список «к кому телепортировать» — все игроки, кроме выбранного."""
    opts = [(nm, nm) for _l, nm in PL.rows() if nm != PL.selected]
    cur = target.value
    target.options = opts or [('— нет других игроков —', '')]
    if cur and any(v == cur for _l, v in target.options):
        target.value = cur


def draw_items():
    its = ITEMS.get('items') or []
    if its:
        item_sel.options = [(f"{it.get('icon', '')} {it.get('name')} (${it.get('price', 0)})", it.get('id'))
                            for it in its]
    kits = ITEMS.get('kits') or []
    if kits:
        kit_sel.options = [(str(k), str(k)) for k in kits]


def reload_players(deep=False):
    """Обновить состояние. Выбор игрока сохраняется всегда."""
    state = refresh_conn(deep)
    if not state:
        draw_conn()
        draw_status()
        return False
    PL.update(state.get('players') or [], state.get('online') or [])
    chat = state.get('chat') or []
    CONN['info'] = state.get('server') or {}
    extra = f' · 💬 последнее: {short((chat[0] or {}).get("text", ""), 40)}' if chat else ''
    draw_conn()
    draw_status()
    draw_list()
    draw_targets()
    if extra:
        msg.value = pill('Обновлено' + extra)
    return True


def do_select(change):
    if DRAWING['on']:
        return
    PL.select(change.get('new') or '')
    draw_card()
    draw_targets()


def say_msg(ok, text):
    msg.value = pill(('✅ ' if ok else '⚠️ ') + str(text), '#065f46' if ok else '#7f1d1d', '#fff')


def show_rows(rows):
    result.value = card_box(''.join(f'<div style="font-size:12px">{r}</div>' for r in rows)) if rows else ''


# ── выполнение действия ─────────────────────────────────────────────────────
def run(aid, title=None, **kw):
    title = title or aid
    if not PL.selected and kw.get('name'):
        say_msg(False, 'Сначала выберите игрока')
        return {'ok': False}
    r = api_admin_action(aid, kw)
    say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
    show_rows(r.get('rows') or [])
    HIST.add(title, bool(r.get('ok')), r.get('message') or r.get('error') or 'готово', kw.get('name', ''))
    hist_view.value = HIST.html()
    reload_players()
    return r


def api_admin_action(aid, kw):
    body = {'action': aid}
    body.update({k: v for k, v in kw.items() if v is not None})
    if body.get('name') is None:
        body.pop('name', None)
    return api('/admin/action', body)


def action_kwargs(d, loud=True):
    """Собрать параметры кнопки. Возвращает (kw, ошибка)."""
    kw = {}
    if d.get('need'):
        if not PL.selected:
            return None, 'Сначала выберите игрока в списке'
        kw['name'] = PL.selected
    if d.get('text'):
        txt = chat_text.value.strip()
        if not txt:
            return None, 'Введите текст в поле «Текст» на этой вкладке'
        kw['text'] = txt
    if d.get('target'):
        t = (target.value or '').strip()
        if not t:
            return None, 'Выберите «К кому» — другого игрока'
        kw['target'] = t
    if d.get('xy'):
        kw['x'], kw['z'] = int(tp_x.value), int(tp_z.value)
    if d.get('number'):
        num = plate.value.strip()
        if not num:
            return None, 'Введите номер машины'
        kw['number'] = num
    if d.get('house'):
        kw['house'] = house.value.strip() or 'house_1'
    if d.get('car'):
        kw['carId'] = car_id.value.strip() or 'volga'
    if d['id'] in ('ban', 'ban_silent', 'warn'):
        kw['reason'] = reason.value.strip() or 'Нарушение правил'
    return kw, None


def make_action_btn(d):
    b = W.Button(description=d.get('t', d.get('id')), tooltip=str(d.get('id', '')),
                 button_style='danger' if d.get('confirm') else '',
                 layout=L(margin='2px', width='auto'))
    def on_click(_b, dd=d):
        kw, err = action_kwargs(dd)
        if err:
            say_msg(False, err)
            return
        run(dd['id'], dd.get('t', dd['id']), **kw)
    b.on_click(on_click)
    return b


AREAS = {}          # раздел → контейнер с кнопками (перерисовывается поиском)


def actions_block(tab):
    """Кнопки раздела. Контейнер запоминается, чтобы поиск перерисовывал только его."""
    box = W.VBox([], layout=L(margin='6px 0'))
    AREAS[tab] = box
    return box


def fill_actions():
    """Перерисовать кнопки всех разделов с учётом поиска (выбор игрока не трогаем)."""
    for tab, box in AREAS.items():
        kids = []
        for title, acts in group_actions(CATALOG['actions'], CATALOG['groups'], tab, act_search.value):
            kids.append(head(title))
            kids.append(flow([make_action_btn(a) for a in acts]))
        if not kids:
            txt = 'Ничего не нашлось по запросу' if act_search.value.strip() else 'Сервер не отдал кнопки этого раздела'
            kids.append(W.HTML(f'<div style="color:#94a3b8;font-size:12px">{txt}</div>'))
        box.children = kids


def plain(label, cb, style='', width='auto'):
    b = W.Button(description=label, button_style=style, layout=L(margin='2px', width=width))
    b.on_click(lambda _b: cb())
    return b


# ── подключение / переподключение ───────────────────────────────────────────
RETRY = {'on': False, 'thread': None}


def after_connect():
    """Догрузить каталоги кнопок и настройки — вызывается при любом успешном подключении."""
    try:
        load_catalogs()
        fill_actions()
    except Exception as e:                                # noqa: BLE001
        say('⚠️', 'Каталог кнопок не загрузился:', e)
    for fn in (load_money_cfg, refresh_log):
        try:
            fn()
        except Exception:                                 # noqa: BLE001
            pass


def connect():
    global BASE
    BASE = norm_base(addr.value)
    if not BASE:
        say_msg(False, 'Введите адрес сервера')
        return
    say('🔌', 'Подключаюсь к', BASE)
    ok = reload_players(deep=True)
    if ok:
        after_connect()
        say('✅', 'Админ-панель →', BASE)
    else:
        say('⚠️', CONN['why'].get('title'), '— панель осталась открытой, кнопки ответят ошибкой')


def auto_retry_start():
    """Фоновая попытка подключиться, пока сервер не ответит (раз в 8 с)."""
    if RETRY['on']:
        return
    RETRY['on'] = True

    def loop():
        while RETRY['on']:
            time.sleep(8)
            if not RETRY['on'] or not BASE:
                break
            try:
                if reload_players():
                    say('✅', 'Сервер снова на связи:', BASE)
                    RETRY['on'] = False
                    try:
                        after_connect()
                    except Exception:                     # noqa: BLE001
                        pass
                    break
            except Exception:                             # noqa: BLE001
                pass

    RETRY['thread'] = threading.Thread(target=loop, daemon=True)
    RETRY['thread'].start()


def disconnect():
    RETRY['on'] = False
    CONN.update(ok=False, code=0, info={})
    CONN['why'] = {'level': 'down', 'title': 'Связь отключена вручную',
                   'hints': ['Нажмите «Подключиться», когда сервер будет готов.']}
    draw_conn()
    draw_status()


def show_tunnel():
    t = api('/admin/tunnel')
    info = (f"Адрес сервера: {t.get('url') or '—'} (источник: {t.get('source', '?')})")
    r = api('/admin/publish')
    say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'live.json обновлён')
    show_rows([info, f"Публикация: {r.get('site') or '—'}"])
    reload_players(deep=True)


# ── вкладки ─────────────────────────────────────────────────────────────────
def tab_players():
    quick = flow([
        plain('+1 000 $', lambda: run('money_add_1k', '+1 000 $', name=PL.selected), 'success'),
        plain('+10 000 $', lambda: run('money_add_10k', '+10 000 $', name=PL.selected), 'success'),
        plain('+100 000 $', lambda: run('money_add_100k', '+100 000 $', name=PL.selected), 'success'),
        plain('📇 Карточка', lambda: run('player_info', 'Карточка', name=PL.selected), 'info'),
        plain('❤️ Вылечить', lambda: run('player_heal', 'Лечение', name=PL.selected)),
        plain('👢 Кик', lambda: run('kick', 'Кик', name=PL.selected)),
        plain('🚀 На спавн', lambda: run('tp_spawn', 'Телепорт на спавн', name=PL.selected)),
    ])
    return W.VBox([
        head('Быстрые действия с выбранным'),
        quick,
        W.HTML('<hr style="border-color:#1e293b">'),
        head('Всё про игрока'),
        actions_block('players'),
        W.HTML('<hr style="border-color:#1e293b">'),
    ])


def money_custom(mode):
    n = int(money_amt.value or 0)
    if n <= 0:
        say_msg(False, 'Сумма должна быть больше нуля')
        return
    if not PL.selected:
        say_msg(False, 'Сначала выберите игрока')
        return
    labels = {'add': 'выдано', 'sub': 'забрано', 'set': 'установлено'}
    r = run('money_give', f'{labels[mode]} {fmt_money(n)}', name=PL.selected, amount=n, mode=mode)
    return r


def tab_money():
    return W.VBox([
        head('Любая сумма — выбранному игроку'),
        W.HBox([money_amt,
                plain('➕ Выдать', lambda: money_custom('add'), 'success'),
                plain('➖ Забрать', lambda: money_custom('sub')),
                plain('🎯 Установить', lambda: money_custom('set'), 'info')]),
        W.HTML('<div style="font-size:12px;color:#94a3b8">Сумма ограничена «потолком» из '
               'настроек (вкладка «Сервер»).</div>'),
        W.HTML('<hr style="border-color:#1e293b">'),
        head('Готовые кнопки'),
        actions_block('money'),
        money_cfg_view,
    ])


def give_item(mode):
    if mode in ('item_give', 'item_take', 'item_clear') and not PL.selected:
        say_msg(False, 'Выберите игрока')
        return
    if mode != 'item_clear' and not item_sel.value:
        say_msg(False, 'Выберите предмет')
        return
    kw = {'qty': max(1, int(qty.value or 1))}
    if item_sel.value:
        kw['item'] = item_sel.value
    if PL.selected:
        kw['name'] = PL.selected
    run(mode, {'item_give': 'выдать', 'item_take': 'забрать', 'item_give_all': 'всем',
               'item_take_all': 'забрать у всех', 'item_clear': 'очистить'}.get(mode, mode), **kw)


def give_kit():
    if not PL.selected:
        say_msg(False, 'Выберите игрока'); return
    val = str(kit_sel.value or '')
    if not val:
        say_msg(False, 'Выберите набор'); return
    # сервер знает наборы как отдельные действия (kit_start, kit_food, …),
    # поэтому название набора — это и есть имя действия
    act = val if val.startswith('kit_') else 'kit_' + val
    run(act, 'набор ' + act[4:].replace('_', ' '), name=PL.selected)


def show_inventory():
    if not PL.selected:
        inv_view.value = pill('Выберите игрока'); return
    r = api('/admin/inventory?name=' + urllib.parse.quote(PL.selected))
    rows = r.get('rows') or []
    inv_view.value = card_box(
        f'<b>🎒 {PL.selected}</b>' + (' 🟢' if r.get('live') else '') + '<br>'
        + (' · '.join(str(x) for x in rows[:40]) or '(пусто)'))


def tab_items():
    return W.VBox([
        head('Предметы'),
        W.HBox([item_sel, qty,
                plain('🎁 Выдать', lambda: give_item('item_give'), 'success'),
                plain('🗑 Забрать', lambda: give_item('item_take')),
                plain('📢 Всем онлайн', lambda: give_item('item_give_all'), 'success'),
                plain('🧹 Забрать у всех', lambda: give_item('item_take_all'), 'danger'),
                plain('🗑 Очистить инвентарь', lambda: give_item('item_clear'), 'danger')]),
        W.HTML('<hr style="border-color:#1e293b">'),
        head('Наборы (выдаются целиком)'),
        W.HBox([kit_sel, plain('📦 Выдать набор', give_kit, 'success')]),
        W.HTML('<hr style="border-color:#1e293b">'),
        W.HBox([plain('🎒 Показать инвентарь', show_inventory, 'info')]),
        inv_view,
    ])


def tab_car():
    return W.VBox([
        head('Машина выбранного игрока'),
        W.HBox([car_id, plate]),
        actions_block('car'),
        W.HTML('<div style="font-size:12px;color:#94a3b8">Здесь сервис: починить машину, '
               'поставить номер. Выдача транспорта живёт в разделе «Сервер» (события).</div>'),
    ])


def tab_chat():
    return W.VBox([
        head('Текст сообщения / объявления'),
        W.HBox([chat_text]),
        W.HTML('<hr style="border-color:#1e293b">'),
        head('Действия'),
        actions_block('chat'),
    ])


def tab_mod():
    kind = W.Dropdown(options=[('Мут', 'mute'), ('Бан', 'ban'), ('Варн', 'warn')], description='Наказание')
    minutes = W.IntText(value=30, description='Минут', layout=L(width='210px'))
    def issue():
        if not PL.selected:
            return say_msg(False, 'Сначала выберите игрока слева')
        if not 1 <= minutes.value <= 525600:
            return say_msg(False, 'Введите от 1 до 525600 минут')
        run(kind.value, 'наказание', name=PL.selected, minutes=minutes.value, reason=reason.value.strip())
    return W.VBox([
        head('Выберите игрока сверху, наказание и срок в минутах'),
        W.HBox([kind, minutes, plain('Выдать', issue, 'danger')]),
        W.HBox([plain('💬 Снять мут', lambda: run('unmute', 'размут', name=PL.selected), 'success'),
                plain('✅ Разбанить', lambda: run('unban', 'разбан', name=PL.selected), 'success'),
                plain('🧽 Снять варны', lambda: run('warns_clear', 'снять варны', name=PL.selected), 'success')]),
        head('Другие действия модерации'), actions_block('mod'),
    ])


def load_money_cfg():
    m = api('/admin/money')
    cfg = m.get('money') or {}
    money_amt.value = int(cfg.get('amount', 1000) or 0)
    money_cfg_view.value = card_box(
        f'Выдача по умолчанию: <b>{fmt_money(cfg.get("amount", 0))}</b> · '
        f'потолок: <b>{fmt_money(cfg.get("cap", 0))}</b> · шаг: <b>{fmt_money(cfg.get("step", 0))}</b>')


def save_money():
    r = api('/admin/money', {'amount': int(m_amount.value), 'cap': int(m_cap.value),
                             'step': int(m_step.value)})
    say_msg(bool(r.get('ok')), r.get('error') or 'Настройки денег сохранены')
    load_money_cfg()


m_amount = W.IntText(description='Выдача $', layout=L(width='230px'))
m_cap = W.IntText(description='Потолок $', layout=L(width='250px'))
m_step = W.IntText(description='Шаг $', layout=L(width='200px'))


def refresh_log():
    lg = api('/admin/log')
    lines = (lg.get('log') or [])[-40:]
    log_view.value = card_box(
        '<div style="font-family:monospace;font-size:11px">'
        + '<br>'.join(str(x.get('text', x)) if isinstance(x, dict) else str(x) for x in lines)
        + '</div>' if lines else pill('Лог пуст'))
    hist_view.value = HIST.html()


def tab_server():
    return W.VBox([
        head('Состояние сервера — в шапке панели'),
        W.HTML('<hr style="border-color:#1e293b">'),
        head('💵 Настройки выдачи денег'),
        W.HBox([m_amount, m_cap, m_step, plain('💾 Сохранить', save_money, 'success')]),
        W.HTML('<hr style="border-color:#1e293b">'),
        head('🔗 Туннель и постоянная ссылка'),
        flow([plain('🔎 Проверить туннель', lambda: reload_players(deep=True), 'info'),
              plain('📡 Опубликовать live.json', show_tunnel, 'warning')]),
        conn_view,
        W.HTML('<hr style="border-color:#1e293b">'),
        head('⚙️ Действия сервера и события'),
        actions_block('server'),
    ])


def clear_hist():
    HIST.items.clear()
    hist_view.value = HIST.html()


def tab_log():
    return W.VBox([
        W.HBox([plain('🔄 Обновить логи', refresh_log, 'info'),
                plain('🧽 Очистить историю панели', clear_hist, '')]),
        head('История нажатий (эта панель)'),
        hist_view,
        W.HTML('<hr style="border-color:#1e293b">'),
        head('Журнал сервера'),
        log_view,
    ])


# ── сборка ──────────────────────────────────────────────────────────────────
def build_tabs():
    built = {'players': tab_players, 'money': tab_money, 'items': tab_items, 'car': tab_car,
             'chat': tab_chat, 'mod': tab_mod, 'server': tab_server, 'log': tab_log}
    tab = W.Tab(children=[built[k]() for k, *_ in TABS])
    for i, (k, title, sub, _g) in enumerate(TABS):
        n = lib.action_count(CATALOG['actions'], k)
        tab.set_title(i, f'{title} ({n})' if n else title)
    return tab


def load_catalogs():
    CATALOG['groups'] = {}
    CATALOG['actions'] = []
    a = api('/admin/actions')
    if a.get('ok'):
        CATALOG['groups'] = a.get('groups') or {}
        CATALOG['actions'] = [x for x in (a.get('actions') or []) if isinstance(x, dict)]
    i = api('/admin/items')
    if i.get('ok'):
        ITEMS['items'] = i.get('items') or []
        ITEMS['kits'] = i.get('kits') or []
    draw_items()


# ── запуск панели ───────────────────────────────────────────────────────────
initial_ok = reload_players(deep=True) if BASE else False
if initial_ok:
    CONN['why'] = diagnose(200, CONN['pub'], CONN['pub_body'] if isinstance(CONN['pub_body'], str) else '', BASE)
    load_catalogs()
    try:
        load_money_cfg()
    except Exception:                                     # noqa: BLE001
        pass
else:
    say('⚠️', 'Сервер пока недоступен — панель открывается в режиме ожидания.')
    say('👉', 'Запустите серверную ячейку (colab_one.py), затем нажмите «Подключиться».')
    auto_retry_start()

if not BASE:
    draw_conn()

header = W.VBox([
    W.HBox([W.HTML('<b style="font-size:16px">🛠 Лос-Город · админка</b>'),
            addr, plain('🔌 Подключиться', connect, 'success'),
            plain('🔄 Обновить', lambda: reload_players(deep=True), 'info'),
            plain('⏹ Отключиться', disconnect)]),
    conn_view, status, msg, result,
])
players_bar = W.VBox([
    W.HBox([search, filt, sort, plain('🔄 Обновить список', reload_players, 'info'),
            plain('🎯 К выбранному', lambda: run('tp_player', 'к игроку', name=PL.selected,
                                                 target=(target.value or '')), '')]),
    W.HBox([plist, W.VBox([card, target, tp_x, tp_z, reason])]),
])

def quick(aid, title, icon, need_player=True):
    """Кнопка «в один клик» для выбранного игрока — без перехода по разделам."""
    def go():
        if need_player and not PL.selected:
            return say_msg(False, 'Сначала выберите игрока слева')
        run(aid, title, **({'name': PL.selected} if need_player else {}))
    return plain(icon, go, '')


def quick_ban():
    """Бан из быстрой строки для выбранного игрока."""
    if not PL.selected:
        return say_msg(False, 'Сначала выберите игрока слева')
    run('ban', 'бан', name=PL.selected, reason=reason.value.strip())


quick_bar = W.VBox([
    head('⚡ Быстро для выбранного'),
    flow([quick('money_add_1k', 'выдать 1 000 $', '💵 +1 000 $'),
          quick('money_add_10k', 'выдать 10 000 $', '💵 +10 000 $'),
          quick('player_heal', 'лечение', '🏥 Лечить'),
          quick('player_feed', 'покормить', '🍔 Покормить'),
          quick('kit_start', 'стартовый набор', '🎒 Стартовый набор'),
          quick('car_repair', 'починка машины', '🔧 Починить машину'),
          quick('tp_spawn', 'на спавн', '🏠 На спавн'),
          quick('kick', 'кик', '👢 Кикнуть'),
          plain('🚫 Забанить', quick_ban, 'danger')]),
])

tabs = build_tabs()
fill_actions()
try:
    refresh_log()
except Exception:                                         # noqa: BLE001
    pass
if initial_ok:
    try:
        load_money_cfg()
    except Exception:                                     # noqa: BLE001
        pass

for _w in (search, filt, sort):
    _w.observe(lambda _c: draw_list(), 'value')
plist.observe(do_select, 'value')
act_search.observe(lambda _c: fill_actions(), 'value')     # поиск по кнопкам — на лету

display(W.VBox([header, players_bar, quick_bar, act_search,
                W.HTML('<hr style="border-color:#1e293b">'), tabs]))
say('🖥', 'Панель готова: 8 разделов сверху, выбранный игрок не сбрасывается.')
if not initial_ok:
    say('⏳', 'Панель ждёт сервер и сама переподключится, как только он ответит.')
