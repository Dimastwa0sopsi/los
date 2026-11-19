# ════════════════════════════════════════════════════════════════════════════
#  LOS GOROD — СЕРВЕР В ОДНОЙ ЯЧЕЙКЕ. Одна ссылка — навсегда.
#
#  Как пользоваться: скопируйте весь этот код в одну ячейку Colab и жмите Run.
#  ПЕРВЫЙ запуск задаст два вопроса (ответы сохранятся на ваш Google Drive):
#    1) ngrok authtoken — https://dashboard.ngrok.com/get-started/your-authtoken
#       (бесплатный аккаунт; токен держите в секрете, он теперь только у вас на Drive)
#    2) постоянный домен — там же в дашборде: «Domains» → «New Domain». Один
#       статичный домен дают бесплатно. Именно он делает ссылку вечной.
#  Все следующие разы: просто Run. Ничего вводить не надо, ссылка не меняется,
#  сейвы игроков лежат на Drive и переживают любые перезапуски. Играйте по ссылке
#  из зелёной панели: https://dimastwa0sopsi.github.io/los/?srv=wss://<домен>/
# ════════════════════════════════════════════════════════════════════════════
import getpass, json, os, shutil, subprocess, sys, time, urllib.request

LG     = '/content/drive/MyDrive/los-gorod'          # всё игрока живёт здесь
CFG_F  = LG + '/cfg.json'                            # токен+домен: спросим один раз
PORT   = 7860
NODE_VER = 'v20.18.1'

def say(icon, *m): print(f'{icon} \033[1m{" ".join(map(str, m))}\033[0m')
def run(cmd, cwd=None, timeout=900):
    p = subprocess.run(cmd, shell=True, cwd=cwd, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, timeout=timeout)
    if p.returncode != 0:
        say('❌', 'Ошибка:', cmd); print((p.stdout or '')[-4000:]); raise SystemExit(1)
    return p.stdout or ''

say('📁', 'Подключаю Google Drive…')
from google.colab import drive
drive.mount('/content/drive', force_remount=False)
for d in (LG + '/app', LG + '/data', LG + '/node'): os.makedirs(d, exist_ok=True)

# ── настройки: спрашиваем только при самом первом запуске ──────────────────
cfg = {}
if os.path.exists(CFG_F):
    try: cfg = json.load(open(CFG_F))
    except Exception: cfg = {}
if not cfg.get('NGROK_AUTHTOKEN'):
    cfg['NGROK_AUTHTOKEN'] = getpass.getpass('1/2 · Ngrok authtoken (dashboard.ngrok.com → Your Authtoken): ').strip()
if 'STATIC_DOMAIN' not in cfg:
    cfg['STATIC_DOMAIN'] = input('2/2 · Постоянный домен (ngrok → Domains → New Domain; Enter — случайный адрес): ').strip()
json.dump(cfg, open(CFG_F, 'w'))
if not cfg['NGROK_AUTHTOKEN']:
    say('❌', 'Без authtoken туннель не поднять'); raise SystemExit(1)

# ── свежий код игры (подтягивается при каждом Run) ─────────────────────────
APP = LG + '/app'
say('⬇️', 'Обновляю код игры…')
if os.path.isdir(APP + '/.git'):
    run(f"git -C '{APP}' fetch --depth 1 origin main && git -C '{APP}' reset --hard FETCH_HEAD")
else:
    run(f"git clone --depth 1 -b main https://github.com/Dimastwa0sopsi/los.git '{APP}'")

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
        run(f"wget -q https://nodejs.org/dist/{NODE_VER}/node-{NODE_VER}-linux-x64.tar.xz -O '{tar}' && tar -xf '{tar}' -C '{LG}/node' && rm -f '{tar}'")
    bin_node = nd
os.environ['PATH'] = os.path.dirname(bin_node) + ':' + os.environ['PATH']

# ── зависимости сервера ─────────────────────────────────────────────────────
json.dump({'name': 'los-server', 'private': True, 'type': 'commonjs',
           'dependencies': {'better-sqlite3': '^12.0.0', 'ws': '^8.18.0'}},
          open(APP + '/server/package.json', 'w'))
run('npm install --no-audit --no-fund --loglevel=error', cwd=APP + '/server', timeout=600)

# ── глушим старый сервер и поднимаем туннель ДО старта ─────────────────────
run('pkill -f "node .*server\\.js" || true'); time.sleep(1)
say('🌐', 'Туннель ngrok…')
run(f'"{sys.executable}" -m pip install -q pyngrok')
from pyngrok import conf, ngrok
conf.get_default().auth_token = cfg['NGROK_AUTHTOKEN']
try:
    dom = cfg.get('STATIC_DOMAIN', '')
    t = ngrok.connect(PORT, 'http', **({'domain': dom} if dom else {}))
except Exception as e:
    say('❌', 'ngrok:', e)
    if cfg.get('STATIC_DOMAIN'):
        say('ℹ️', 'Домен должен быть создан в ngrok → Domains → New Domain (бесплатно, один раз).')
    raise SystemExit(1)
url_ws = str(t.public_url).replace('https://', 'wss://').replace('http://', 'ws://')

# ── старт сервера: база на Drive ⇒ прогресс вечен ───────────────────────────
env = dict(os.environ, PORT=str(PORT), ADMIN_TOKEN='losgorod-admin',
           DB_FILE=LG + '/data/game.db', PUBLIC_URL=url_ws.replace('wss://', 'https://'))
log_f = open(LG + '/server.log', 'wb')
proc = subprocess.Popen([bin_node, 'server.js'], cwd=APP + '/server', env=env,
                        stdout=log_f, stderr=subprocess.STDOUT, start_new_session=True)
alive = False
for _ in range(60):
    time.sleep(0.5)
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=2) as r:
            assert json.loads(r.read()).get('ok'); alive = True; break
    except Exception:
        if proc.poll() is not None:
            say('❌', 'Сервер упал. Лог:'); print(run(f'tail -n 40 "{LG}/server.log"')); raise SystemExit(1)
if not alive:
    say('❌', 'Сервер не ожил за 30 с. Лог:'); print(run(f'tail -n 40 "{LG}/server.log"')); raise SystemExit(1)

link = f'https://dimastwa0sopsi.github.io/los/?srv={url_ws}/'
bar = '═' * 70
print('\n\033[92m' + bar)
print('  ✅ СЕРВЕР LOS GOROD РАБОТАЕТ')
print(bar + '\033[0m')
print('  ССЫЛКА В ИГРУ :', link)
print('  Адрес сервера :', url_ws)
print('  Сейвы         :', LG + '/data/game.db (Google Drive)')
print('  Домен         :', ('постоянный ✓ — ссылка не изменится никогда' if cfg.get('STATIC_DOMAIN')
                              else 'случайный ⚠ после рестарта адрес будет новый — создайте домен в ngrok'))
print('\033[92m' + bar + '\033[0m')
print('  Следующий раз: просто Run этой ячейки. Та же ссылка, тот же мир, тот же прогресс.\n')
