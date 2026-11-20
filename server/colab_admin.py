# ════════════════════════════════════════════════════════════════════════════
#  LOS GOROD — АДМИН-ПАНЕЛЬ (одна ячейка Colab)
#
#  Консольная админка к вашему серверу: игроки онлайн, выдача денег, ~100
#  действий по группам (модерация, телепорт, транспорт, чат, события…),
#  инвентарь игрока, логи сервера, публикация постоянной ссылки.
#
#  Сервер берётся автоматически из MyDrive/los-gorod/cfg.json (его пишет
#  ячейка-сервер colab_one.py). Если сервер на другой машине — панель сама
#  спросит адрес. Токен админки по умолчанию losgorod-admin (как в сервере).
#  Запускайте прямо во время работающего сервера или позже — панель ходит по
#  HTTP, ей всё равно, где живёт сервер.
# ════════════════════════════════════════════════════════════════════════════
import json, os, urllib.request, urllib.error

CFG_F = '/content/drive/MyDrive/los-gorod/cfg.json'
ADMIN_TOKEN = 'losgorod-admin'

def say(icon, *m): print(f'{icon} \033[1m{" ".join(map(str, m))}\033[0m')

base = ''
try:
    cfg = json.load(open(CFG_F))
    base = str(cfg.get('LAST_URL') or '').replace('wss://', 'https://').replace('ws://', 'http://').rstrip('/')
except Exception:
    cfg = {}
if not base:
    base = input('Адрес сервера (например https://имя.ngrok-free.dev): ').strip().rstrip('/')
if not base.startswith('http'): base = 'https://' + base
say('🔌', 'Админ-панель →', base)

def api(path, method='GET', body=None, timeout=12):
    req = urllib.request.Request(base + path + ('&' if '?' in path else '?') + 'token=' + ADMIN_TOKEN,
                                 method=method, headers={'Content-Type': 'application/json'})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403): return {'ok': False, 'error': 'Неверный ADMIN_TOKEN (проверьте токен сервера)'}
        return {'ok': False, 'error': f'HTTP {e.code}'}
    except Exception as e:
        return {'ok': False, 'error': f'Сервер недоступен: {e}'}

h = api('/admin/state')
if not h.get('ok'):
    say('❌', 'Нет связи с сервером:', h.get('error')); raise SystemExit(1)

nick = ''          # выбранный игрок
groups, actions = {}, []

def load_catalog():
    global groups, actions
    c = api('/admin/actions')
    if c.get('ok'): groups, actions = c.get('groups', {}), c.get('actions', [])
load_catalog()

def fmt_players(st):
    ps = st.get('players') or []
    if not ps: print('   (онлайн никого нет)'); return [p.get('name', '?') for p in ps]
    names = []
    for i, p in enumerate(ps, 1):
        nm = p.get('name', '?'); names.append(nm)
        mark = ' ⭐' if nm == nick else ''
        print(f"   {i:>2}. {nm}{mark} · ${int(p.get('money', 0)):,}".replace(',', ' ') + f" · {p.get('vehicle', 'пешком')}")
    return names

def header(title): print('\n' + '─' * 60 + f'\n\033[96m{title}\033[0m\n' + '─' * 60)

def do_action(a):
    global nick
    body = {'action': a['id']}
    if a.get('need'):
        if not nick:
            say('⚠️', 'Это действие требует игрока — сначала выберите его в пункте 2.'); return
        body['name'] = nick
    if a['id'].startswith('chat') or a['id'] in ('announce', 'broadcast'):
        txt = input('   Текст сообщения: ').strip()
        if not txt: return
        body['text'] = txt
    if a.get('confirm') and input(f"   Точно выполнить «{a['t']}»? (y/N): ").strip().lower() != 'y':
        return
    res = api('/admin/action', 'POST', body)
    if res.get('ok'): say('✅', res.get('message') or a['t'])
    else: say('⚠️', res.get('error') or 'не получилось')

while True:
    header(f'🖥 АДМИНКА LOS GOROD · сервер: {base}' + (f' · игрок: {nick}' if nick else ''))
    print(' 1. 📊 Состояние сервера и игроки')
    print(' 2. 👤 Выбрать игрока')
    print(' 3. 🎛 Действия по группам (≈100 кнопок)')
    print(' 4. 🎒 Инвентарь игрока')
    print(' 5. 💵 Настройки выдачи денег')
    print(' 6. 📜 Лог сервера')
    print(' 7. 🔗 Адрес туннеля / опубликовать ссылку')
    print(' 8. 🔄 Переподключиться / другой адрес')
    print(' 0. Выход')
    ch = input('\n ▸ ').strip()

    if ch == '0' or ch == '': break

    elif ch == '1':
        st = api('/admin/state')
        if not st.get('ok'): say('⚠️', st.get('error')); continue
        inf = st.get('server', {})
        print(f"   онлайн: {len(st.get('players') or [])} · аптайм: {inf.get('uptime', '?')} с · сборка: {inf.get('build', '?')}")
        fmt_players(st)

    elif ch == '2':
        names = fmt_players(api('/admin/state'))
        sel = input('   Номер или ник (Enter — сброс): ').strip()
        if not sel: nick = ''; say('👤', 'Игрок не выбран')
        elif sel.isdigit() and 1 <= int(sel) <= len(names): nick = names[int(sel) - 1]; say('👤', 'Выбран:', nick)
        else: nick = sel; say('👤', 'Выбран:', nick)

    elif ch == '3':
        if not actions: load_catalog()
        gkeys = list(groups.keys())
        header('Группы действий')
        for i, k in enumerate(gkeys, 1): print(f' {i}. {groups[k]}')
        gi = input(' ▸ группа (Enter — назад): ').strip()
        if gi.isdigit() and 1 <= int(gi) <= len(gkeys):
            acts = [a for a in actions if a.get('g') == gkeys[int(gi) - 1]]
            gtitle = groups[gkeys[int(gi) - 1]]
            while True:
                who = nick or '—'
                header(f'{gtitle} · игрок: {who}')
                for i, a in enumerate(acts, 1): print(f" {i:>2}. {a['t']}" + (' · нужен игрок' if a.get('need') else ''))
                print('  0. ← назад')
                ai = input(' ▸ ').strip()
                if ai == '0' or ai == '': break
                if ai.isdigit() and 1 <= int(ai) <= len(acts): do_action(acts[int(ai) - 1])

    elif ch == '4':
        nm = nick or input('   Ник игрока: ').strip()
        if not nm: continue
        inv = api('/admin/inventory?name=' + urllib.request.quote(nm))
        if not inv.get('ok'): say('⚠️', inv.get('error')); continue
        rows = inv.get('rows') or []
        say('🎒', f'Инвентарь {nm}' + (' · в сети' if inv.get('live') else ''))
        for row in rows[:40]: print('  ', row)
        if not rows: print('   (пусто)')

    elif ch == '5':
        mn = api('/admin/money')
        if not mn.get('ok'): say('⚠️', mn.get('error')); continue
        m = mn.get('money', {})
        def fm(v): return f'{int(v):,}'.replace(',', ' ') if str(v).isdigit() else str(v)
        print(f"   сумма выдачи: ${fm(m.get('amount', '?'))} · потолок: ${fm(m.get('cap', '?'))} · шаг: ${fm(m.get('step', '?'))}")
        if input('   Изменить настройки? (y/N): ').strip().lower() == 'y':
            body = {}
            for k, label in (('amount', 'Сумма выдачи'), ('cap', 'Потолок баланса'), ('step', 'Шаг изменения')):
                val = input(f'   {label} (Enter — оставить {m.get(k)}): ').strip()
                if val.isdigit(): body[k] = int(val)
            res = api('/admin/money', 'POST', body)
            say('✅' if res.get('ok') else '⚠️', res.get('error') or 'Настройки сохранены')

    elif ch == '6':
        lg = api('/admin/log')
        for line in (lg.get('log') or [])[-25:]: print('  ', line)

    elif ch == '7':
        t = api('/admin/tunnel')
        say('🔗', 'Адрес:', t.get('url') or t.get('ws') or '(нет)')
        if input('   Опубликовать постоянную ссылку (live.json)? (y/N): ').strip().lower() == 'y':
            r = api('/admin/publish', 'POST', {})
            say('✅' if r.get('ok') else '⚠️', r.get('error') or r.get('site') or 'Опубликовано')

    elif ch == '8':
        base = input('   Новый адрес сервера: ').strip().rstrip('/')
        if not base.startswith('http'): base = 'https://' + base
        h2 = api('/admin/state')
        say('✅' if h2.get('ok') else '❌', 'Подключено' if h2.get('ok') else h2.get('error'))

print('\n👋 Админ-панель закрыта.')
