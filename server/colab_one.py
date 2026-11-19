# ═══════════════════════════════════════════════════════════════════════════
#  LOS GOROD — СЕРВЕР В ОДНОЙ ЯЧЕЙКЕ (Colab)
#
#  Как пользоваться:
#    1) Скопируйте ВЕСЬ этот файл целиком и вставьте в одну пустую code-ячейку Colab.
#    2) Заполните блок «НАСТРОЙКИ» ниже (нужен один раз).
#    3) Runtime → Run. Дождитесь зелёной панели со ссылкой — заходите играть:
#         https://dimastwa0sopsi.github.io/los/?srv=wss://<ваш-домен>/
#    4) Можно выключать ноутбук и возвращаться когда угодно: сейвы игроков лежат
#       на вашем Google Drive (папка MyDrive/los-gorod), а постоянный домен не
#       меняется между запусками — снова Run и играете дальше с того же места.
#
#  НАСТРОЙКИ нужны две (обе бесплатные):
#    • NGROK_AUTHTOKEN — токен аккаунта ngrok (https://dashboard.ngrok.com/get-started/your-authtoken).
#      Без него туннель не поднять. Токен держите только здесь, в своей копии ноутбука —
#      никогда не коммитьте его в репозиторий и не кидайте в чат.
#    • STATIC_DOMAIN — ваш бесплатный статичный домен: в дашборде ngrok раздел
#      «Domains» → «New Domain» (дают один бесплатно навсегда, вида имя.ngrok-free.app).
#      С ним ссылка на сервер НЕ МЕНЯЕТСЯ между перезапусками Colab. Если оставить
#      пустым — будет случайный адрес каждый раз (тогда игрокам придётся заходить
#      по новой ссылке из вывода этой ячейки).
#
#  Необязательно: GH_TOKEN (fine-grained PAT, Contents: read+write ТОЛЬКО на репозиторий
#  Dimastwa0sopsi/File) — тогда адрес ещё и автоматически опубликуется в live.json,
#  и игроки найдут сервер вообще без ?srv=.
# ═══════════════════════════════════════════════════════════════════════════

CFG = {
    'NGROK_AUTHTOKEN': '',              # ← вставить сюда (один раз)
    'STATIC_DOMAIN':   '',              # ← вида 'something.ngrok-free.app' (один раз)
    'GH_TOKEN':        '',              # необязательно: автопубликация live.json
    'ADMIN_TOKEN':     'losgorod-admin',
    'REPO':            'Dimastwa0sopsi/los',
    'BRANCH':          'main',
}

# ───────────────────────────── служебное, не трогать ───────────────────────
import getpass, json, os, shutil, subprocess, sys, time, urllib.request

LG      = '/content/drive/MyDrive/los-gorod'
APP     = LG + '/app'
DATA    = LG + '/data'
NODEDIR = LG + '/node'
LOG     = LG + '/server.log'
PORT    = 7860
NODE_VER = 'v20.18.1'

def say(icon, *msg): print(f'{icon} \033[1m{" ".join(map(str, msg))}\033[0m')
def run(cmd, quiet=True, cwd=None, env=None, timeout=900):
    p = subprocess.run(cmd, shell=True, cwd=cwd, env=env, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, timeout=timeout)
    if p.returncode != 0:
        say('❌', 'Команда упала:', cmd); print((p.stdout or '')[-4000:]); raise SystemExit(1)
    return p.stdout or ''

if not CFG['NGROK_AUTHTOKEN']:
    CFG['NGROK_AUTHTOKEN'] = getpass.getpass('Ngrok authtoken (ввод скрыт, никуда не сохраняется кроме этой сессии): ').strip()
if not CFG['NGROK_AUTHTOKEN']:
    say('❌', 'Без NGROK_AUTHTOKEN туннель не поднять — возьмите на dashboard.ngrok.com'); raise SystemExit(1)

# 1) Google Drive: здесь живут код, node и база игроков
say('📁', 'Подключаю Google Drive…')
try:
    from google.colab import drive
    drive.mount('/content/drive', force_remount=False)
except Exception as e:
    say('❌', 'Не удалось подключить Drive (нужен для сохранения прогресса):', e); raise SystemExit(1)
for d in (APP, DATA, NODEDIR): os.makedirs(d, exist_ok=True)

# 2) свежий код игры (pull @branch каждый запуск — обновления подхватываются сами)
say('⬇️', f"Обновляю код {CFG['REPO']}@{CFG['BRANCH']}…")
if os.path.isdir(APP + '/.git'):
    run(f"git -C '{APP}' fetch --depth 1 origin {CFG['BRANCH']} && git -C '{APP}' reset --hard FETCH_HEAD", quiet=False)
else:
    run(f"git clone --depth 1 -b {CFG['BRANCH']} https://github.com/{CFG['REPO']}.git '{APP}'", quiet=False)

# 3) Node.js (свой, на Drive — переживает сбросы рантайма)
bin_node = shutil.which('node')
if not bin_node or not run('node -p "parseInt(process.versions.node)"', timeout=15).strip().isdigit():
    if os.path.exists(NODEDIR + f'/node-{NODE_VER}-linux-x64/bin/node'):
        pass
    else:
        say('⚙️', f'Ставлю Node.js {NODE_VER} на Drive…')
        tar = LG + '/node.tar.xz'
        run(f"wget -q https://nodejs.org/dist/{NODE_VER}/node-{NODE_VER}-linux-x64.tar.xz -O '{tar}' && tar -xf '{tar}' -C '{NODEDIR}' && rm -f '{tar}'")
    bin_node = NODEDIR + f'/node-{NODE_VER}-linux-x64/bin/node'
os.environ['PATH'] = os.path.dirname(bin_node) + ':' + os.environ['PATH']
say('🟢', 'Node:', run('node -v').strip())

# 4) зависимости сервера (better-sqlite3 + ws; server.js — CommonJS)
pkg = APP + '/server/package.json'
with open(pkg, 'w') as f:
    json.dump({'name': 'los-server', 'private': True, 'type': 'commonjs',
               'dependencies': {'better-sqlite3': '^12.0.0', 'ws': '^8.18.0'}}, f)
run('npm install --no-audit --no-fund --loglevel=error', cwd=APP + '/server', timeout=600)
say('📦', 'Зависимости сервера готовы')

# 5) глушим прошлый сервер, если ячейку запустили повторно
run('pkill -f "node .*server\\.js" || true')
time.sleep(1)

# 6) постоянный туннель ngrok — поднимаем ДО сервера, чтобы отдать ему PUBLIC_URL
say('🌐', 'Поднимаю туннель ngrok…')
run(f'"{sys.executable}" -m pip install -q pyngrok')
from pyngrok import conf, ngrok
conf.get_default().auth_token = CFG['NGROK_AUTHTOKEN']
try:
    tunnel = ngrok.connect(PORT, 'http', **({'domain': CFG['STATIC_DOMAIN']} if CFG['STATIC_DOMAIN'] else {}))
except Exception as e:
    say('❌', 'ngrok не поднялся:', e)
    if CFG['STATIC_DOMAIN']:
        say('ℹ️', 'Проверьте STATIC_DOMAIN: Domains → New Domain в дашборде ngrok (один даётся бесплатно).')
    raise SystemExit(1)
url_http = str(tunnel.public_url)
url_ws = url_http.replace('https://', 'wss://').replace('http://', 'ws://')
say('🔗', 'Публичный адрес:', url_ws)

# 7) старт сервера; база на Drive ⇒ прогресс игроков вечен; GH_TOKEN+PUBLIC_URL ⇒ автопубликация live.json
env = dict(os.environ, PORT=str(PORT), ADMIN_TOKEN=CFG['ADMIN_TOKEN'], DB_FILE=DATA + '/game.db', PUBLIC_URL=url_http)
if CFG['GH_TOKEN']: env['GH_TOKEN'] = CFG['GH_TOKEN']
log_f = open(LOG, 'wb')
proc = subprocess.Popen([bin_node, 'server.js'], cwd=APP + '/server', env=env,
                        stdout=log_f, stderr=subprocess.STDOUT, start_new_session=True)

for _ in range(60):
    time.sleep(0.5)
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=2) as r:
            doc = json.loads(r.read()); assert doc.get('ok'); break
    except Exception:
        if proc.poll() is not None:
            say('❌', 'Сервер умер при старте. Лог:'); print(run(f'tail -n 40 "{LOG}"')); raise SystemExit(1)
else:
    say('❌', 'Сервер не ответил на /health за 30 с. Лог:'); print(run(f'tail -n 40 "{LOG}"')); raise SystemExit(1)
say('✅', 'Сервер запущен и здоров (health OK)')

# 8) финальная панель
link = f'https://dimastwa0sopsi.github.io/los/?srv={url_ws}/'
bar = '═' * 72
print('\n\033[92m' + bar)
print('  ✅ СЕРВЕР LOS GOROD РАБОТАЕТ')
print(bar + '\033[0m')
print('  Адрес сервера :', url_ws)
print('  Ссылка в игру :', link)
print('  Сейвы         :', DATA + '/game.db  (Google Drive — переживут любой рестарт)')
print('  Админ-токен   :', CFG['ADMIN_TOKEN'])
print('  Домен         :', 'СТАТИЧНЫЙ — ссылка не изменится после перезапуска ✓' if CFG['STATIC_DOMAIN']
                     else 'случайный! После перезапуска Colab адрес будет новый')
print('\033[92m' + bar + '\033[0m')
print('  Игрокам достаточно открыть «Ссылку в игру» один раз — адрес запомнится.')
print('  Выключение: закройте вкладку Colab или Runtime → Disconnect. Повторный Run\n  этой ячейки вернёт всех в тот же мир с тем же прогрессом.\n')
