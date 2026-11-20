# ЛОС-ГОРОД: одна ячейка Colab — сервер и админ-панель.
# Домен должен принадлежать аккаунту ngrok, чей токен вы вводите.
import urllib.request

DOMAIN = 'sandbank-economic-zeppelin.ngrok-free.dev'
RAW = 'https://raw.githubusercontent.com/Dimastwa0sopsi/los/main/server/'

# При повторном запуске останавливаем сторож предыдущей ячейки.
_old = globals().get('_los_server')
if isinstance(_old, dict) and isinstance(_old.get('state'), dict):
    _old['state']['stop'] = True

def load(name):
    with urllib.request.urlopen(RAW + name, timeout=30) as response:
        return response.read().decode('utf-8')

try:
    server_code = load('colab_one.py')
    admin_code = load('colab_admin.py')
except Exception as error:
    raise RuntimeError('Не удалось скачать ячейки с GitHub. Проверьте интернет Colab и повторите запуск.') from error

# Не переключаемся молча на случайный адрес: нужна именно указанная ссылка.
old_domain = "STATIC_DOMAIN   = 'sandbank-economic-zeppelin.ngrok-free.dev'"
old_plan = 'for step in CL.tunnel_plan(dom):'
if old_domain not in server_code or old_plan not in server_code:
    raise RuntimeError('Формат серверной ячейки на GitHub изменился. Нужна обновлённая версия запуска.')
server_code = server_code.replace(old_domain, 'STATIC_DOMAIN   = ' + repr(DOMAIN), 1)
server_code = server_code.replace(old_plan, "for step in (s for s in CL.tunnel_plan(dom) if s.get('domain') == dom):", 1)

# Раздельные пространства имён: панель не перезапишет функции сторожа сервера.
_los_server = {'__name__': '__los_server__'}
exec(compile(server_code, 'colab_one.py', 'exec'), _los_server)
_los_admin = {'__name__': '__los_admin__'}
exec(compile(admin_code, 'colab_admin.py', 'exec'), _los_admin)
