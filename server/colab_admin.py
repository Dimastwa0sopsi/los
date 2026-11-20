# ════════════════════════════════════════════════════════════════════════════
#  LOS GOROD — АДМИН-ПАНЕЛЬ (одна ячейка Colab, виджеты как раньше)
#
#  Вторая ячейка рядом с серверной (colab_one.py). Рисует интерактивную панель
#  прямо в ноутбуке: поиск и список игроков, карточка выбранного, ~100 кнопок
#  по группам (берутся живьём из каталога сервера), выдача предметов и наборов,
#  чат/объявления, настройки денег, публикация постоянной ссылки, логи.
#
#  Адрес сервера берётся сам из MyDrive/los-gorod/cfg.json (LAST_URL), иначе
#  спросит один раз. Токен админки — losgorod-admin (как в сервере).
#  Работает по HTTP /admin/* — сервер может жить где угодно.
# ════════════════════════════════════════════════════════════════════════════
import json, os, subprocess, sys, urllib.request, urllib.error

CFG_F = '/content/drive/MyDrive/los-gorod/cfg.json'
ADMIN_TOKEN = 'losgorod-admin'

def say(icon, *m): print(f'{icon} \033[1m{" ".join(map(str, m))}\033[0m')

BASE = ''
try:
    _cfg = json.load(open(CFG_F))
    BASE = str(_cfg.get('LAST_URL') or '').replace('wss://', 'https://').replace('ws://', 'http://').rstrip('/')
except Exception:
    pass
if not BASE:
    BASE = input('Адрес сервера (https://имя.ngrok-free.dev): ').strip().rstrip('/')
if not BASE.startswith('http'):
    BASE = 'https://' + BASE

def http_json(url, body=None, timeout=20):
    req = urllib.request.Request(url, method='POST' if body is not None else 'GET',
                                 headers={'Content-Type': 'application/json'})
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
        return json.loads(r.read())

def api(path, body=None, timeout=20):
    try:
        return http_json(f'{BASE}{path}{"&" if "?" in path else "?"}token={ADMIN_TOKEN}', body, timeout)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return {'ok': False, 'error': 'Неверный токен админки'}
        return {'ok': False, 'error': f'HTTP {e.code}'}
    except Exception as e:                      # noqa: BLE001
        return {'ok': False, 'error': f'Сервер недоступен: {e}'}

def http_text(url, timeout=8):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception:                                  # noqa: BLE001
        return 0, ''

def explain_down(err):
    """Объясняет причину вместо голого «HTTP 404»: жив ли туннель и жив ли сервер."""
    say('❌', 'Админ-панель не подключилась:', err)
    code, body = http_text(f'{BASE}/version')
    if code == 200 and 'build' in body:
        say('ℹ️', 'Сервер жив (', body.strip()[:120], '), но /admin/state ответил', err)
        say('👉', 'Похоже, на порту старый server.js: перезапустите серверную ячейку.')
    elif code == 0:
        say('👉', 'Туннель не отвечает. Запустите серверную ячейку (colab_one.py) и дождитесь ngrok.')
    else:
        say('👉', f'Туннель отвечает HTTP {code}, но игрового сервера за ним нет (обычно ngrok 404).')
        say('👉', 'Перезапустите серверную ячейку, затем «📡 Постоянная ссылка», и вставьте новый адрес сюда.')
    say('🔗', 'Проверка вручную: откройте в браузере', BASE + '/version')

chk = api('/admin/state')
if not chk.get('ok'):
    explain_down(chk.get('error'))
    raise SystemExit(1)
say('🔌', 'Админ-панель →', BASE)

# --- ipywidgets (в Colab иногда слетает) ------------------------------------
try:
    import ipywidgets as W                     # noqa: F401
except ImportError:
    say('📦', 'Ставлю ipywidgets…')
    subprocess.run(f'{sys.executable} -m pip install -q ipywidgets', shell=True)
    import ipywidgets as W
from IPython.display import display

L = W.Layout

def pill(text, bg='#1e293b', fg='#e2e8f0'):
    return (f'<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:{bg};'
            f'color:{fg};font-size:12px;margin:0 4px 4px 0">{text}</span>')

def box(inner, bg='#0b1220'):
    return (f'<div style="padding:10px 12px;border-radius:12px;background:{bg};'
            f'border:1px solid #1e293b;margin:4px 0">{inner}</div>')

def head(text):
    return W.HTML(f'<b style="font-size:13px;color:#cbd5e1">{text}</b>')

def flow(children):
    return W.Box(children=children, layout=L(display='flex', flex_flow='row wrap', align_content='flex-start'))

status = W.HTML(pill('Загрузка…'))
msg = W.HTML(pill('Выберите игрока слева, затем жмите кнопки.'))
result = W.HTML('')
card = W.HTML(pill('Игрок не выбран'))

search = W.Text(placeholder='поиск по нику…', layout=L(width='210px'))
filt = W.Dropdown(options=[('все', 'all'), ('в сети', 'online'), ('офлайн', 'offline')], value='all',
                  description='Кто', layout=L(width='190px'))
sort = W.Dropdown(options=[('по нику', 'name'), ('по деньгам', 'money')], value='name',
                  description='Сорт.', layout=L(width='210px'))
plist = W.Select(options=[], rows=12, layout=L(width='320px'))
danger = W.Checkbox(value=False, description='Разрешить опасные (с подтверждением)')
reason = W.Text(value='Нарушение правил', description='Причина', layout=L(width='330px'))
car_id = W.Text(value='volga', description='Авто (id)', layout=L(width='260px'))
chat_text = W.Text(placeholder='текст объявления / сообщения…', layout=L(width='560px'))
item_sel = W.Dropdown(options=[], description='Предмет', layout=L(width='360px'))
qty = W.IntText(value=1, description='Кол-во', layout=L(width='180px'))
inv_view = W.HTML('')
log_view = W.HTML('')

st = {'players': [], 'online': set()}

def picked():
    return (plist.value or '').split(' · ')[0].lstrip('🟢 ').strip()

def say_msg(ok, text):
    msg.value = pill(('✅ ' if ok else '⚠️ ') + str(text), '#065f46' if ok else '#7f1d1d', '#fff')

CATALOG = api('/admin/actions')
GROUPS = CATALOG.get('groups') or {}
ACTIONS = [a for a in (CATALOG.get('actions') or []) if isinstance(a, dict)]
ITEMS_CAT = api('/admin/items')
ITEMS_LIST = ITEMS_CAT.get('items') or []
KITS = ITEMS_CAT.get('kits') or []
if ITEMS_LIST:
    item_sel.options = [(f"{it.get('icon','')} {it.get('name')} (${it.get('price',0)})", it.get('id')) for it in ITEMS_LIST]

def run(aid, **kw):
    r = api('/admin/action', {'action': aid, **kw})
    rows = r.get('rows') or []
    result.value = box(''.join(f'<div>{x}</div>' for x in rows)) if rows else ''
    say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
    reload_players()
    return r

def make_action_btn(defn):
    b = W.Button(description=defn.get('t', defn.get('id')), button_style='danger' if defn.get('confirm') else '',
                 layout=L(margin='2px', width='auto'))
    def on_click(_b, d=defn):
        kw = {}
        if d.get('need'):
            p = picked()
            if not p:
                say_msg(False, 'Сначала выберите игрока в списке'); return
            kw['name'] = p
        if d.get('confirm') and not danger.value:
            say_msg(False, 'Опасно! Поставьте галочку «Разрешить опасные»'); return
        if d.get('text'):
            txt = chat_text.value.strip()
            if not txt:
                say_msg(False, 'Введите текст в поле на вкладке «Чат»'); return
            kw['text'] = txt
        if d.get('car'):
            kw['carId'] = car_id.value.strip() or 'volga'
        if d['id'] in ('ban', 'ban_silent', 'warn'):
            kw['reason'] = reason.value.strip() or 'Нарушение правил'
        run(d['id'], **kw)
    b.on_click(on_click)
    return b

group_boxes = []
for gk, gtitle in GROUPS.items():
    acts = [a for a in ACTIONS if a.get('g') == gk]
    if not acts:
        continue
    gb = W.VBox([head(gtitle), flow([make_action_btn(a) for a in acts])],
                layout=L(margin='6px 0'))
    group_boxes.append(gb)

def reload_players(_b=None):
    s = api('/admin/state')
    if not s.get('ok'):
        card.value = pill('Нет связи: ' + str(s.get('error')), '#7f1d1d', '#fff'); return
    st['players'] = s.get('players') or []
    st['online'] = set(s.get('online') or [])
    inf = s.get('server') or {}
    status.value = (pill(f"🟢 в сети: {len(st['online'])}", '#065f46', '#d1fae5')
                    + pill(f"👥 аккаунтов: {len(st['players'])}")
                    + pill(f"🖥 аптайм: {inf.get('uptime', '?')} с")
                    + (pill('🛠 ТЕХРАБОТЫ', '#7f1d1d', '#fff') if inf.get('maintenance') else ''))
    draw_list(); draw_card()

def draw_list():
    q = search.value.strip().lower(); f = filt.value; so = sort.value
    rows = []
    for p in st['players']:
        nm = p.get('name', '?')
        if q and q not in nm.lower():
            continue
        on = nm in st['online']
        if f == 'online' and not on:
            continue
        if f == 'offline' and on:
            continue
        rows.append((nm, int(p.get('money', 0)), on))
    rows.sort(key=lambda r: (r[0].lower() if so == 'name' else -r[1]))
    plist.options = [(('🟢 ' if on else '') + f'{nm} · ${m:,}'.replace(',', ' '), nm) for nm, m, on in rows]

def draw_card():
    p = picked()
    if not p:
        card.value = pill('Игрок не выбран'); return
    rec = next((x for x in st['players'] if x.get('name') == p), None)
    if not rec:
        card.value = pill(p); return
    on = p in st['online']
    bits = [pill(('🟢 онлайн' if on else '⚪ офлайн'), '#065f46' if on else '#334155', '#fff'),
            pill(f"💵 ${int(rec.get('money',0)):,}".replace(',', ' ')),
            pill(f"⚠ варны: {rec.get('warns', 0)}")]
    if rec.get('vehicle'):
        bits.append(pill('🚗 ' + str(rec['vehicle'])))
    card.value = box('<b>' + p + '</b><br>' + ''.join(bits))

search.observe(lambda _c: draw_list(), 'value')
filt.observe(lambda _c: draw_list(), 'value')
sort.observe(lambda _c: draw_list(), 'value')
plist.observe(lambda _c: draw_card(), 'value')

def plain(label, cb, style='', width='auto'):
    b = W.Button(description=label, button_style=style, layout=L(margin='2px', width=width))
    b.on_click(lambda _b: cb())
    return b

# ---- вкладка 1: игроки и все кнопки -----------------------------------------
players_tab = W.VBox([
    status,
    W.HBox([search, filt, sort, plain('🔄 Обновить', reload_players, 'info')]),
    W.HBox([plist, W.VBox([card, danger, reason, car_id, msg, result])]),
    W.HTML('<hr style="border-color:#1e293b">'),
    *group_boxes,
])

# ---- вкладка 2: предметы ------------------------------------------------------
def give_item(mode):
    p = picked()
    if mode in ('item_give', 'item_take') and not p:
        say_msg(False, 'Выберите игрока'); return
    if not item_sel.value:
        say_msg(False, 'Выберите предмет'); return
    kw = {'item': item_sel.value, 'qty': max(1, int(qty.value or 1))}
    if p:
        kw['name'] = p
    run(mode, **kw)

def show_inventory():
    p = picked()
    if not p:
        inv_view.value = pill('Выберите игрока'); return
    r = api('/admin/inventory?name=' + urllib.request.quote(p))
    rows = r.get('rows') or []
    inv_view.value = box('<b>🎒 ' + p + ('</b> 🟢' if r.get('live') else '</b>')
                         + '<br>' + (' · '.join(str(x) for x in rows[:30]) or '(пусто)'))

items_tab = W.VBox([
    msg,
    W.HBox([item_sel, qty]),
    flow([plain('🎁 Выдать игроку', lambda: give_item('item_give'), 'success'),
          plain('🗑 Забрать у игрока', lambda: give_item('item_take')),
          plain('📢 Выдать всем онлайн', lambda: give_item('item_give_all'), 'success'),
          plain('🧹 Забрать у всех', lambda: give_item('item_take_all'), 'danger'),
          plain('🗑 Очистить инвентарь', lambda: give_item('item_clear'), 'danger')]),
    W.HTML('<hr style="border-color:#1e293b">'),
    W.HBox([plain('🎒 Показать инвентарь выбранного', show_inventory, 'info')]),
    inv_view, result,
])

# ---- вкладка 3: чат ------------------------------------------------------------
chat_acts = [a for a in ACTIONS if a.get('g') == 'chat']
chat_tab = W.VBox([
    msg,
    W.HBox([chat_text]),
    head('Действия чата'),
    flow([make_action_btn(a) for a in chat_acts]),
    result,
])

# ---- вкладка 4: сервер ----------------------------------------------------------
def load_money_cfg():
    m = (api('/admin/money').get('money') or {})
    m_amount.value = int(m.get('amount', 5000)); m_cap.value = int(m.get('cap', 1000000)); m_step.value = int(m.get('step', 1000))

m_amount = W.IntText(description='Выдача $', layout=L(width='240px'))
m_cap = W.IntText(description='Потолок $', layout=L(width='260px'))
m_step = W.IntText(description='Шаг $', layout=L(width='220px'))

def save_money():
    r = api('/admin/money', {'amount': int(m_amount.value), 'cap': int(m_cap.value), 'step': int(m_step.value)})
    say_msg(bool(r.get('ok')), r.get('error') or 'Настройки денег сохранены')

def publish():
    r = api('/admin/publish', {})
    say_msg(bool(r.get('ok')), r.get('error') or f"Опубликовано: {r.get('site') or 'live.json обновлён'}")

def refresh_log():
    lg = api('/admin/log')
    lines = (lg.get('log') or [])[-30:]
    log_view.value = box('<div style="font-family:monospace;font-size:11px">'
                         + '<br>'.join(str(x) for x in lines) + '</div>' if lines else pill('Лог пуст'))

load_money_cfg()
server_tab = W.VBox([
    status, msg,
    head('💵 Настройки выдачи денег'),
    W.HBox([m_amount, m_cap, m_step, plain('💾 Сохранить', save_money, 'success')]),
    W.HTML('<hr style="border-color:#1e293b">'),
    head('🔗 Постоянная ссылка'),
    flow([plain('📡 Опубликовать live.json', publish, 'info')]),
    W.HTML('<hr style="border-color:#1e293b">'),
    W.HBox([plain('📜 Обновить лог', refresh_log, 'info')]),
    log_view,
])

reload_players()
panel = W.Tab(children=[players_tab, items_tab, chat_tab, server_tab])
panel.set_title(0, '👥 Игроки · 🎛 Кнопки')
panel.set_title(1, '🎁 Предметы')
panel.set_title(2, '📢 Чат')
panel.set_title(3, '🖥 Сервер')
say('🖥', 'Админ-панель готова. Вкладки сверху, игрок выбирается в списке.')
display(panel)
