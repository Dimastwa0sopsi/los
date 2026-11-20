# ════════════════════════════════════════════════════════════════════════════
#  ЛОС-ГОРОД — логика серверной ячейки Colab без самого Colab.
#
#  Всё, что раньше было «на честном слове» внутри colab_one.py и что нельзя
#  проверить в ноутбуке: проверка зависимостей, разбор причины падения Node,
#  план поднятия туннеля (постоянный домен → случайный) и вердикт «видно ли
#  сервер из интернета». Здесь это чистые функции — их гоняет
#  scripts/server_cell_check.py (npm run check:admin).
# ════════════════════════════════════════════════════════════════════════════
from __future__ import annotations

from typing import Any, Dict, List, Optional

OK_MARK = 'deps-ok'


def deps_cmd(bin_node: str) -> str:
    """Команда проверки зависимостей: обе библиотеки должны импортироваться."""
    inner = "require('ws');require('better-sqlite3');console.log('" + OK_MARK + "')"
    return f'"{bin_node}" -e "{inner}"'


def deps_ok_output(out: str) -> bool:
    return OK_MARK in (out or '')


def classify_start_failure(code: int, log: str) -> Dict[str, Any]:
    """Почему сервер не поднялся и что делать. Никаких голых трейсбеков."""
    low = (log or '').lower()
    if code == 404:
        return {'title': f'Порт отвечает, но не нашим сервером (HTTP 404)',
                'hints': ['Порт держит другая программа из прошлого запуска.',
                          'Runtime → Restart, затем Run all.']}
    if 'eaddrinuse' in low:
        return {'title': 'Порт занят', 'hints': ['Старый процесс не умер: Runtime → Restart и Run all.']}
    if 'better-sqlite3' in low or 'bindings' in low or 'node-gyp' in low:
        return {'title': 'Не собрался better-sqlite3',
                'hints': ['Удалите папку app/server/node_modules на Drive и запустите ячейку снова.',
                          'Если повторяется — Runtime → Restart.']}
    if 'sqlite_busy' in low or 'database is locked' in low:
        return {'title': 'База заблокирована',
                'hints': ['Базу держит другой запущенный Colab: закройте лишние сессии.',
                          'Затем Run all в этой ячейке.']}
    if 'eacces' in low or 'permission denied' in low:
        return {'title': 'Нет прав на файлы на Drive',
                'hints': ['Переподключите Google Drive (значок папки слева) и запустите снова.']}
    if 'enospc' in low or 'no space left' in low:
        return {'title': 'Кончилось место на Drive',
                'hints': ['Освободите ~500 МБ: Drive → los-gorod → удалите старые логи и node.tar.xz.']}
    if 'cannot find module' in low:
        return {'title': 'Не хватает модулей Node',
                'hints': ['Удалите app/server/node_modules и запустите ячейку снова.']}
    return {'title': 'Node-сервер упал при старте',
            'hints': ['Причина выше в логе.', 'Чаще всего помогает Runtime → Restart и Run all.']}


def tunnel_plan(domain: str) -> List[Dict[str, Any]]:
    """Порядок попыток: трижды постоянный домен, затем дважды случайный адрес.

    Случайный адрес — не «красиво», а «работает»: лучше другая ссылка, чем
    мёртвый сервер. Пустой словарь kwargs = ngrok выдаст свой адрес.
    """
    plan: List[Dict[str, Any]] = []
    if domain:
        plan += [{'domain': domain, 'try': 'постоянный'} for _ in range(3)]
    plan += [{}, {}]
    return plan


def tunnel_hint(error_text: str) -> str:
    """Расшифровка ошибки ngrok человеческим языком."""
    low = (error_text or '').lower()
    if 'err_ngrok_3200' in low or 'not found' in low:
        return 'Домен не привязан к аккаунту: ngrok → Domains → New Domain (и он должен быть у владельца токена).'
    if 'err_ngrok_108' in low or 'simultaneously' in low:
        return 'Этот authtoken уже держит другую сессию: Runtime → Restart, затем Run all.'
    if 'err_ngrok_105' in low or 'authentication' in low:
        return 'Неверный authtoken — скопируйте заново из dashboard.ngrok.com.'
    if 'err_ngrok_7024' in low or 'upstream' in low:
        return 'ngrok не видит наш порт: сервер не запущен или слушает другой порт.'
    if 'timeout' in low or 'connection' in low:
        return 'Colab не достучался до ngrok: проверьте интернет и лимит бесплатного плана.'
    return 'Проверьте домен в ngrok → Domains и запустите ячейку заново.'


def public_verdict(code: Optional[int], body: Any) -> Dict[str, Any]:
    """Вердикт по /version через туннель: видно ли игру из интернета."""
    if code == 200 and isinstance(body, dict) and body.get('server') == 'los-gorod':
        return {'ok': True, 'level': 'ok', 'title': 'Туннель ведёт на игровой сервер',
                'hint': f"версия {body.get('version', '?')} · сборка {str(body.get('build', '?'))[:12]}"}
    if code == 200:
        return {'ok': False, 'level': 'warn', 'title': 'Отвечает не наш сервер',
                'hint': 'По этому адресу живёт что-то другое — перезапустите туннель (Run all).'}
    if code == 404:
        return {'ok': False, 'level': 'warn', 'title': 'Туннель поднят, но за ним нет сервера (ngrok 404)',
                'hint': 'Node упал или слушает другой порт — серверная ячейка перезапустит его сама.'}
    if not code:
        return {'ok': False, 'level': 'down', 'title': 'Туннель не отвечает',
                'hint': 'Домен отвязался или ngrok заблокирован — проверьте ngrok → Domains.'}
    return {'ok': False, 'level': 'warn', 'title': f'Туннель ответил HTTP {code}',
            'hint': 'Откройте /version в браузере и посмотрите, что там.'}
