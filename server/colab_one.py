# ════════════════════════════════════════════════════════════════════════════
#  ЛОС-ГОРОД — СЕРВЕР В ОДНОЙ ЯЧЕЙКЕ (исправленная версия)
#
#  1) Вставьте NGROK_AUTHTOKEN ниже (dashboard.ngrok.com → Your Authtoken).
#     Токен — как пароль: не коммитьте в git и не кидайте в чат.
#  2) Runtime → Run all. В конце появится зелёная панель со ссылкой на игру.
#  3) Повторный запуск — просто Run all: код с GitHub, настройки и сейвы на Drive,
#     адрес постоянный (STATIC_DOMAIN), клиенты находят сервер сами.
#
#  Что нового против старой версии:
#   • после старта ячейка сама проверяет сервер ИЗ ИНТЕРНЕТА (/version через
#     туннель) — раньше можно было получить «HTTP 404» и не понять, кто виноват;
#   • у каждого сбоя теперь понятная причина и подсказка, без голого трейсбека;
#   • печатается версия сервера и время сборки — видно, что Colab подтянул новый код;
#   • сторож перезапускает упавший Node-сервер (до 3 раз), туннель не рвётся.
# ════════════════════════════════════════════════════════════════════════════

NGROK_AUTHTOKEN = ''                                             # ← ВСТАВЬТЕ ТОКЕН СЮДА
STATIC_DOMAIN   = 'sandbank-economic-zeppelin.ngrok-free.dev'    # ваш статичный домен ngrok

# ─────────────────────────── служебное, не менять ───────────────────────────
import getpass, json, os, shutil, subprocess, sys, threading, time, urllib.request

LG       = '/content/drive/MyDrive/los-gorod'   # код, node, база и настройки
CFG_F    = LG + '/cfg.json'
PORT     = 7860
NODE_VER = 'v20.18.1'
PYN      = '7.2.3'          # версия pyngrok, с которой дружит Colab
REPO     = 'https://github.com/Dimastwa0sopsi/los.git'

def say(icon, *m): print(f'{icon} \033[1m{" ".join(map(str, m))}\033[0m')

def die(icon, *m):
    """Понятная остановка: причина + что делать, без трейсбека."""
    print(); say(icon, *m); print()
    raise SystemExit(1)

def run(cmd, cwd=None, timeout=900, quiet=False):
    p = subprocess.run(cmd, shell=True, cwd=cwd, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, timeout=timeout)
    if p.returncode != 0 and not quiet:
        say('❌', 'Команда не выполнилась:', cmd)
        print((p.stdout or '')[-4000:])
        raise SystemExit(1)
    return p.stdout or ''

def http_get(url, timeout=5, headers=None):
    """→ (код, тело). Никаких исключений наружу: 0 = сеть не ответила."""
    req = urllib.request.Request(url, headers={'User-Agent': 'los-gorod-cell/1.0',
                                               **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception:
        return 0, ''

def json_get(url, timeout=5, headers=None):
    code, body = http_get(url, timeout, headers)
    if code != 200:
        return code, None
    try:
        return code, json.loads(body)
    except Exception:
        return code, None

# ── Drive ───────────────────────────────────────────────────────────────────
say('📁', 'Подключаю Google Drive…')
from google.colab import drive
drive.mount('/content/drive', force_remount=False)
for d in (LG + '/app', LG + '/data', LG + '/node'): os.makedirs(d, exist_ok=True)

# ── настройки: строки сверху главные; остальное помним на Drive ─────────────
saved = {}
if os.path.exists(CFG_F):
    try: saved = json.load(open(CFG_F))
    except Exception: saved = {}
token = NGROK_AUTHTOKEN.strip() or saved.get('NGROK_AUTHTOKEN', '')
dom   = STATIC_DOMAIN.strip() or saved.get('STATIC_DOMAIN', '')
if not token:
    token = getpass.getpass('Ngrok authtoken (один раз, сохранится на Drive): ').strip()
if not token:
    die('❌', 'Без authtoken туннель не поднять.',
        '\n   Возьмите токен: dashboard.ngrok.com → Your Authtoken.')
# Старая общедоступная строка больше не подходит: её знает любой игрок.
admin_token = str(saved.get('ADMIN_TOKEN', '')).strip()
if not admin_token or admin_token == 'losgorod-admin':
    admin_token = getpass.getpass('Придумайте новый секретный админ-токен (минимум 12 символов): ').strip()
    if len(admin_token) < 12 or admin_token == 'losgorod-admin':
        die('❌', 'Нужен новый секретный админ-токен длиной не менее 12 символов.',
            '\n   Запустите ячейку снова и не передавайте токен игрокам.')
cfg = {'NGROK_AUTHTOKEN': token, 'STATIC_DOMAIN': dom, 'ADMIN_TOKEN': admin_token}
json.dump(cfg, open(CFG_F, 'w'))

# ── свежий код игры (подтягивается при каждом Run) ─────────────────────────
APP = LG + '/app'
say('⬇️', 'Обновляю код игры с GitHub (ветка main)…')
if os.path.isdir(APP + '/.git'):
    run(f"git -C '{APP}' remote set-url origin {REPO}", quiet=True)
    out = run(f"git -C '{APP}' fetch --depth 1 origin main && git -C '{APP}' reset --hard FETCH_HEAD")
else:
    shutil.rmtree(APP, ignore_errors=True)
    out = run(f"git clone --depth 1 -b main {REPO} '{APP}'")
APP_BUILD = run(f"git -C '{APP}' log -1 --format='%h %cd' --date=format:'%d.%m.%Y %H:%M'",
                quiet=True).strip()
try:
    APP_VER = json.load(open(APP + '/package.json')).get('version', '?')
except Exception:
    APP_VER = '?'
say('✅', 'Код игры:', f'v{APP_VER}', '· коммит', APP_BUILD or '?')

srv_js = APP + '/server/server.js'
if not os.path.exists(srv_js):
    die('❌', 'В репозитории нет server/server.js — код скачался не полностью.',
        '\n   Запустите ячейку ещё раз; если повторяется — проверьте доступ к GitHub из Colab.')
if '/version' not in open(srv_js, encoding='utf-8').read():
    say('⚠️', 'Внимание: в server.js нет ручки /version — на GitHub (main) лежит старая версия сервера.')
    say('⚠️', 'Сервер поднимется, но самодиагностика в игре будет работать хуже.')

# ── Node.js (свой, на Drive) ────────────────────────────────────────────────
bin_node = shutil.which('node')
ok = False
if bin_node:
    try: ok = run('node -p "parseInt(process.versions.node)"', timeout=15).strip().isdigit()
    except Exception: pass
if not ok:
    nd = LG + f'/node/node-{NODE_VER}-linux-x64/bin/node'
    if not os.path.exists(nd):
        say('⚙️', f'Ставлю Node.js {NODE_VER}…')
        tar = LG + '/node.tar.xz'
        run(f"wget -q https://nodejs.org/dist/{NODE_VER}/node-{NODE_VER}-linux-x64.tar.xz -O '{tar}' "
            f"&& tar -xf '{tar}' -C '{LG}/node' && rm -f '{tar}'")
    bin_node = nd
os.environ['PATH'] = os.path.dirname(bin_node) + ':' + os.environ['PATH']
say('✅', 'Node.js', run(f'"{bin_node}" -v', timeout=15).strip())

# ── зависимости сервера ─────────────────────────────────────────────────────
json.dump({'name': 'los-server', 'private': True, 'type': 'commonjs',
           'dependencies': {'better-sqlite3': '^12.0.0', 'ws': '^8.18.0'}},
          open(APP + '/server/package.json', 'w'))
say('📦', 'Проверяю зависимости сервера (npm)…')
# ставим всегда: если всё уже стоит, npm отвечает «up to date» за пару секунд
run('npm install --no-audit --no-fund --loglevel=error', cwd=APP + '/server', timeout=900, quiet=True)
if not os.path.isdir(APP + '/server/node_modules'):
    out = run('npm install --no-audit --no-fund', cwd=APP + '/server', timeout=900, quiet=True)
    if not os.path.isdir(APP + '/server/node_modules'):
        say('❌', 'npm не поставил зависимости:'); print(out[-3000:])
        die('👉', 'Обычно это кончившееся место на Drive — освободите ~500 МБ и запустите снова.')

# ── логика ячейки (чистые функции, проверяются npm run check:admin) ─────────
sys.path.insert(0, APP + '/server')
try:
    import colab_logic as CL
except ImportError:
    die('⛔', 'В репозитории нет server/colab_logic.py — код не обновился.',
        '\n   Drive → los-gorod → удалите папку app и запустите ячейку снова.')


# ── зависимости: проверяем, что они реально грузятся ───────────────────────
def deps_ok():
    """ws и better-sqlite3 должны импортироваться — иначе сервер упадёт на старте."""
    return CL.deps_ok_output(run(CL.deps_cmd(bin_node), cwd=APP + '/server', quiet=True))


if not deps_ok():
    say('🔧', 'Зависимости сервера не грузятся — переустанавливаю с нуля…')
    shutil.rmtree(APP + '/server/node_modules', ignore_errors=True)
    run('npm cache verify || true', quiet=True)
    run('npm install --no-audit --no-fund --loglevel=error', cwd=APP + '/server', timeout=900, quiet=True)
    if not deps_ok():
        say('❌', 'better-sqlite3/ws так и не встали. Последние строки npm:')
        print(run('npm install --no-audit --no-fund', cwd=APP + '/server', timeout=900, quiet=True)[-2500:])
        say('👉', 'Обычно помогает: Runtime → Restart, затем Run all.',
            '\n   Если повторяется — на Drive кончилось место (нужно ~500 МБ).')
        raise SystemExit(1)
say('✅', 'Зависимости сервера на месте (ws, better-sqlite3)')

# ── ngrok: библиотека (переустанавливаем, если сломалась после рестарта) ────
say('🌐', 'Готовлю ngrok…')


def _load_pyngrok():
    """Свежий импорт: после Runtime → Restart старые модули остаются битыми."""
    for name in [k for k in list(sys.modules) if k == 'pyngrok' or k.startswith('pyngrok.')]:
        del sys.modules[name]
    from pyngrok import conf as _conf, ngrok as _ngrok
    import pyngrok as _pkg
    return _conf, _ngrok, _pkg


try:
    ngconf, ngrok, _pg = _load_pyngrok()
    if getattr(_pg, '__version__', '') != PYN:
        raise RuntimeError('нужна другая версия')
except Exception:                                        # noqa: BLE001
    say('📦', f'Ставлю pyngrok {PYN}…')
    run(f'"{sys.executable}" -m pip install -q "pyngrok=={PYN}"', timeout=300, quiet=True)
    ngconf, ngrok, _pg = _load_pyngrok()
say('📦', 'pyngrok', getattr(_pg, '__version__', '?'))
ngconf.get_default().auth_token = token

# ── порт, сервер, туннель: всё с самовосстановлением ───────────────────────
LOG_F = LG + '/server.log'
proc = None
tunnel = None
url_ws, url_web = '', ''
state = {'restarts': 0, 'stop': False, 'last_pub': 0.0, 'heals': 0}


def kill_server():
    run('pkill -f "server[.]js" || true', quiet=True)
    run(f'fuser -k {PORT}/tcp || true', quiet=True)
    time.sleep(1)


def start_server():
    lf = open(LOG_F, 'ab')
    env = dict(os.environ, PORT=str(PORT), ADMIN_TOKEN=admin_token,
               DB_FILE=LG + '/data/game.db', PUBLIC_URL=state.get('url_web', ''))
    lf.write(f'\n===== {time.strftime("%d.%m.%Y %H:%M:%S")} старт =====\n'.encode())
    lf.flush()
    return subprocess.Popen([bin_node, 'server.js'], cwd=APP + '/server', env=env,
                            stdout=lf, stderr=subprocess.STDOUT, start_new_session=True)


def tail_log(n=40):
    try:
        return open(LOG_F, encoding='utf-8', errors='replace').read()[-4000:]
    except Exception:
        return '(лог недоступен)'


def wait_up(attempts=90, pause=0.5):
    """Ждём /health. Возвращаем (жив?, последний код ответа)."""
    code = 0
    for _ in range(attempts):
        time.sleep(pause)
        code, body = json_get(f'http://127.0.0.1:{PORT}/health', timeout=2)
        if code == 200 and body and body.get('ok'):
            return True, code
        if proc is not None and proc.poll() is not None:
            return False, code
    return False, code


def explain_start_failure(code):
    log = tail_log()
    verdict = CL.classify_start_failure(code, log)
    say('❌', 'Сервер не поднялся:', verdict['title'], f"(код /health: {code or 'нет связи'})")
    print(log)
    for h in verdict['hints']:
        say('👉', h)


def public_probe():
    """Что видит интернет: (код, тело) у /version через туннель."""
    return json_get(state['url_web'] + '/version', timeout=8,
                    headers={'ngrok-skip-browser-warning': '1'})


def public_ok():
    code, body = public_probe()
    return code == 200 and isinstance(body, dict) and body.get('server') == 'los-gorod', code


def start_tunnel():
    """Поднять ngrok по плану: постоянный домен → случайный адрес."""
    say('🌐', 'Туннель ngrok…')
    try:
        ngrok.kill()
    except Exception:
        pass
    last = ''
    for step in CL.tunnel_plan(dom):
        try:
            kwargs = {k: v for k, v in step.items() if k != 'try'}
            t = ngrok.connect(PORT, 'http', **kwargs)
            if step.get('try'):
                say('✅', 'Туннель на постоянном домене')
            else:
                say('⚠️', 'Постоянный домен не отдался — работаем на случайном адресе (после рестарта он сменится)')
            return t
        except Exception as e:                            # noqa: BLE001
            last = str(e)
            say('⚠️', 'ngrok не пустил:', last[:180])
            time.sleep(3)
    say('👉', CL.tunnel_hint(last))
    return None


def apply_tunnel(t):
    """Запомнить адрес туннеля в cfg и в состоянии ячейки."""
    state['url_ws'] = str(t.public_url).replace('https://', 'wss://').replace('http://', 'ws://')
    state['url_web'] = state['url_ws'].replace('wss://', 'https://').replace('ws://', 'http://')
    cfg['LAST_URL'] = state['url_web']
    try:
        json.dump(cfg, open(CFG_F, 'w'))
    except Exception:                                     # noqa: BLE001
        pass
    say('✅', 'Туннель:', state['url_web'])


def heal(max_rounds=3):
    """Снаружи 404/молчание → перезапускаем сервер, при нужде и туннель."""
    global proc, tunnel
    for i in range(1, max_rounds + 1):
        ok, code = public_ok()
        if ok:
            return True
        say('🔁', f'Снаружи {CL.public_verdict(code, None)["title"].lower()} — лечу, попытка {i}/{max_rounds}')
        kill_server()
        proc = start_server()
        up, hcode = wait_up(attempts=60)
        if not up:
            explain_start_failure(hcode)
            return False
        # если после перезапуска сервера всё ещё 404 — перепривязываем туннель
        ok, code = public_ok()
        if ok:
            return True
        tunnel = start_tunnel()
        if not tunnel:
            return False
        apply_tunnel(tunnel)
        time.sleep(2)
    return public_ok()[0]


# 1) глушим прошлый запуск и освобождаем порт
kill_server()

# 2) туннель
tunnel = start_tunnel()
if not tunnel:
    die('⛔', 'Сервер не запущен: без туннеля игроки не подключатся.')
apply_tunnel(tunnel)
url_ws, url_web = state['url_ws'], state['url_web']

# 3) сервер
say('🚀', 'Запускаю игровой сервер…')
proc = start_server()
alive, code = wait_up()
if not alive:
    explain_start_failure(code)
    die('⛔', 'Сервер не отвечает на /health — смотрите причину выше.')

code, ver = json_get(f'http://127.0.0.1:{PORT}/version', timeout=3)
if code == 200 and ver:
    say('✅', 'Сервер отвечает:', f"версия {ver.get('version', '?')}", '· сборка', str(ver.get('build', '?'))[:12])
else:
    say('ℹ️', 'Сервер отвечает на /health, но не на /version — старый server.js, всё равно работает.')

# 4) проверка из интернета + лечение
say('🔎', 'Проверяю адрес из интернета:', url_web + '/version')
pub_ok = False
for i in range(10):
    pub_ok, pcode = public_ok()
    if pub_ok:
        break
    time.sleep(2)
if not pub_ok:
    pub_ok = heal()


def watchdog():
    """Сторож: поднимает упавший Node и чинит туннель, если снаружи 404."""
    global proc, tunnel
    while not state['stop']:
        time.sleep(15)
        if state['stop']:
            return
        if proc.poll() is not None:
            if state['restarts'] >= 5:
                say('⚠️', 'Сервер падал 5 раз — больше не перезапускаю. Лог:', LOG_F)
                continue
            state['restarts'] += 1
            say('🔁', f"Сервер упал (код {proc.returncode}) — перезапуск {state['restarts']}/5")
            print(tail_log()[-1200:])
            proc = start_server()
            time.sleep(2)
            up, _ = wait_up(attempts=40)
            say('✅' if up else '⚠️', 'Сервер снова на связи' if up else 'Перезапуск не помог, лог: ' + LOG_F)
            state['last_pub'] = 0
            continue
        # раз в две минуты сверяем, что снаружи действительно наш сервер
        if time.time() - state['last_pub'] > 120:
            state['last_pub'] = time.time()
            ok, pcode = public_ok()
            if not ok:
                state['heals'] += 1
                say('⚠️', f'Снаружи сервер не отвечает (код {pcode or "нет связи"}) — лечу ({state["heals"]}).')
                if heal(max_rounds=2):
                    say('✅', 'Из интернета снова видно сервер:', state['url_web'])


threading.Thread(target=watchdog, daemon=True).start()

# ── итоговая панель ────────────────────────────────────────────────────────
link = f'https://dimastwa0sopsi.github.io/los/?srv={url_ws}/'
bar = '═' * 70
print('\n\033[92m' + bar)
print('  ✅ СЕРВЕР ЛОС-ГОРОДА РАБОТАЕТ' if pub_ok else '  ⚠️ СЕРВЕР ЗАПУЩЕН, НО ИЗ ИНТЕРНЕТА НЕ ОТВЕЧАЕТ')
print(bar + '\033[0m')
print('  ССЫЛКА В ИГРУ :', link)
print('  Адрес сервера :', url_ws)
print('  Версия игры   : v' + str(APP_VER), '· сборка', APP_BUILD or '?')
print('  Сейвы         :', LG + '/data/game.db (Google Drive)')
print('  Лог сервера   :', LOG_F)
print('  Домен         :', ('постоянный ✓ — ссылка не изменится' if url_web.startswith('https://' + dom) and dom
                            else 'случайный ⚠ после рестарта адрес станет другим'))
print('\033[92m' + bar + '\033[0m')
if pub_ok:
    print('  Следующий раз: просто Run all. Та же ссылка, тот же мир, тот же прогресс.\n')
else:
    print('  Что делать: откройте', url_web + '/version', 'в браузере.')
    print('   JSON ⇒ сервер жив (проверьте адрес в игре); страница ngrok/404 ⇒ Run all ещё раз.\n')
