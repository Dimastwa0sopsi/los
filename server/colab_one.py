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
cfg = {'NGROK_AUTHTOKEN': token, 'STATIC_DOMAIN': dom}
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
if not run('npm install --no-audit --no-fund --loglevel=error', cwd=APP + '/server',
           timeout=600, quiet=True) or not os.path.isdir(APP + '/server/node_modules'):
    out = run('npm install --no-audit --no-fund', cwd=APP + '/server', timeout=600, quiet=True)
    if not os.path.isdir(APP + '/server/node_modules'):
        say('❌', 'npm не поставил зависимости:'); print(out[-3000:])
        die('👉', 'Обычно это кончившееся место на Drive — освободите ~500 МБ и запустите снова.')

# ── глушим старый сервер и освобождаем порт ────────────────────────────────
run('pkill -f "node .*server\\.js" || true', quiet=True)
run(f'fuser -k {PORT}/tcp || true', quiet=True)
time.sleep(1)

# ── туннель ngrok ──────────────────────────────────────────────────────────
say('🌐', 'Туннель ngrok…')
run(f'"{sys.executable}" -m pip uninstall -y pyngrok', quiet=True)
run(f'"{sys.executable}" -m pip install -q --force-reinstall "pyngrok==7.2.3"', quiet=True)
for _m in [k for k in list(sys.modules) if k == 'pyngrok' or k.startswith('pyngrok.')]:
    del sys.modules[_m]
from pyngrok import conf, ngrok
import pyngrok as _pg
say('📦', 'pyngrok', getattr(_pg, '__version__', '?'))
conf.get_default().auth_token = token
try:
    ngrok.kill()                     # снять зависший агент от прошлого Run
except Exception:
    pass
try:
    t = ngrok.connect(PORT, 'http', **({'domain': dom} if dom else {}))
except Exception as e:
    msg = str(e)
    say('❌', 'ngrok не поднялся:', msg)
    if 'ERR_NGROK_3200' in msg or 'not found' in msg.lower():
        say('👉', f'Домен {dom or "(не задан)"} не привязан к этому аккаунту:',
            'ngrok → Domains → New Domain, и он должен принадлежать владельцу authtoken.')
    elif 'ERR_NGROK_108' in msg or 'simultaneously' in msg.lower():
        say('👉', 'Тот же authtoken уже держит сессию: перезапустите Colab (Runtime → Restart) и Run all.')
    elif 'ERR_NGROK_105' in msg or 'authentication' in msg.lower():
        say('👉', 'Неверный authtoken — скопируйте заново из dashboard.ngrok.com.')
    else:
        say('👉', 'Проверьте интернет Colab и лимит бесплатного плана ngrok, затем Run all.')
    die('⛔', 'Сервер не запущен: без туннеля игроки не подключатся.')

url_ws  = str(t.public_url).replace('https://', 'wss://').replace('http://', 'ws://')
url_web = url_ws.replace('wss://', 'https://').replace('ws://', 'http://')
cfg['LAST_URL'] = url_web
json.dump(cfg, open(CFG_F, 'w'))      # адрес для админ-панели (colab_admin.py)
say('✅', 'Туннель:', url_web)

# ── старт сервера: база на Drive ⇒ прогресс вечен ──────────────────────────
env = dict(os.environ, PORT=str(PORT), ADMIN_TOKEN='losgorod-admin',
           DB_FILE=LG + '/data/game.db', PUBLIC_URL=url_web)
LOG_F = LG + '/server.log'

def start_server():
    lf = open(LOG_F, 'wb')
    return subprocess.Popen([bin_node, 'server.js'], cwd=APP + '/server', env=env,
                            stdout=lf, stderr=subprocess.STDOUT, start_new_session=True)

proc = start_server()
state = {'restarts': 0, 'stop': False}

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
        if proc.poll() is not None:
            return False, code
    return False, code

alive, code = wait_up()
if not alive:
    say('❌', 'Сервер не поднялся', f'(код ответа /health: {code or "нет связи"})', '· лог:')
    print(tail_log())
    if code == 404:
        say('👉', 'Порт 7860 отвечает, но не игровым сервером — обычно занят старой программой.',
            'Выполните Runtime → Restart и Run all.')
    elif 'better-sqlite3' in tail_log():
        say('👉', 'Не собрался better-sqlite3: rm -rf', APP + '/server/node_modules и Run all.')
    die('⛔', 'Порт занят или Node-сервер падает при старте.')

code, ver = json_get(f'http://127.0.0.1:{PORT}/version', timeout=3)
if code == 200 and ver:
    say('✅', 'Сервер отвечает:', f"версия {ver.get('version', '?')}", '· сборка', ver.get('build', '?')[:12])
else:
    say('ℹ️', 'Сервер отвечает на /health, но не на /version — ок, старый server.js.',
        'Всё равно работает.')

# ── сторож: упавший сервер поднимаем сами (до 3 раз) ───────────────────────
def watchdog():
    global proc
    while not state['stop']:
        time.sleep(10)
        if state['stop']:
            return
        if proc.poll() is None:
            continue
        if state['restarts'] >= 3:
            say('⚠️', 'Сервер падал 3 раза — больше не перезапускаю. Лог:', LOG_F)
            return
        state['restarts'] += 1
        say('🔁', f"Сервер упал (код {proc.returncode}) — перезапуск {state['restarts']}/3…")
        proc = start_server()
        time.sleep(2)
        up, _ = wait_up(attempts=40)
        say('✅' if up else '⚠️', 'Сервер снова на связи' if up else 'Перезапуск не помог, лог: ' + LOG_F)

threading.Thread(target=watchdog, daemon=True).start()

# ── проверка ИЗ ИНТЕРНЕТА: туннель реально ведёт на наш сервер ─────────────
say('🔎', 'Проверяю адрес из интернета:', url_web + '/version')
pub = (0, None)
for i in range(15):
    pub = json_get(url_web + '/version', timeout=6, headers={'ngrok-skip-browser-warning': '1'})
    if pub[0] == 200 and isinstance(pub[1], dict) and pub[1].get('server') == 'los-gorod':
        break
    time.sleep(2)

pub_ok = pub[0] == 200 and isinstance(pub[1], dict) and pub[1].get('server') == 'los-gorod'
if pub_ok:
    say('✅', 'Туннель ведёт на игровой сервер:', f"версия {pub[1].get('version', '?')}",
        '· сборка', str(pub[1].get('build', '?'))[:12])
else:
    say('⚠️', 'Снаружи', url_web + '/version', 'ответил кодом', pub[0] or 'нет связи')
    if pub[0] == 404:
        say('👉', 'ngrok отдаёт 404: туннель поднят, но за ним не наш порт',
            f'{PORT}. Проверьте, что сервер выше в логе не падал.')
    elif pub[0] == 0:
        say('👉', 'Туннель не отвечает: домен не привязан или ngrok заблокирован.',
            'Проверьте домен в ngrok → Domains.')
    else:
        say('👉', 'Ответ не от нашего сервера (обычно страница-заглушка ngrok).',
            'Откройте /version в браузере и посмотрите, что там.')

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
print('  Домен         :', ('постоянный ✓ — ссылка не изменится никогда' if dom
                            else 'случайный ⚠ после рестарта адрес станет другим'))
print('\033[92m' + bar + '\033[0m')
print('  Следующий раз: просто Run all. Та же ссылка, тот же мир, тот же прогресс.')
print('  Если в игре «нет связи» — откройте', url_web + '/version',
      'в браузере:\n  JSON ⇒ сервер жив, страница ngrok/404 ⇒ перезапустите эту ячейку.\n')
