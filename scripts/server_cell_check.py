#!/usr/bin/env python3
"""Проверка серверной ячейки Colab (server/colab_one.py) без самого Colab.

Смысл: серверная ячейка — это то, что чаще всего «просто не работает», а
причину видно только в ноутбуке. Здесь проверяется её логика и структура:

  • строка `deps_cmd` действительно грузит ws и better-sqlite3;
  • план туннеля: постоянный домен → случайный адрес, а не мёртвый сервер;
  • каждая известная причина падения Node объясняется по-человечески;
  • «туннель 404» отличается от «чужой сервер за туннелем» и от «нет связи»;
  • в самой ячейке есть сторож, лечение туннеля и нет голых SystemExit без
    объяснения.

    python3 scripts/server_cell_check.py     # npm run check:admin
"""
import ast
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))

import colab_logic as CL                                              # noqa: E402

fail = 0


def t(name, ok, extra=''):
    global fail
    print(f"  {'✓' if ok else '✗'} {name}" + (f' — {extra}' if extra else ''))
    if not ok:
        fail += 1


print('  зависимости сервера:')
cmd = CL.deps_cmd('/usr/bin/node')
t('одна команда грузит обе библиотеки', "require('ws')" in cmd and "require('better-sqlite3')" in cmd, cmd[:90])
t('маркер успеха распознаётся', CL.deps_ok_output('deps-ok\n') and not CL.deps_ok_output('ECONNREFUSED'))
t('путь к node в кавычках', cmd.startswith('"/usr/bin/node"'))

print('  план туннеля:')
plan = CL.tunnel_plan('sandbank-economic-zeppelin.ngrok-free.dev')
t('сначала постоянный домен', all(s.get('domain') for s in plan[:3]), str(len(plan[:3])))
t('запасной вариант — случайный адрес', any(not s.get('domain') for s in plan), str(plan[-2:]))
t('попыток не больше пяти', 0 < len(plan) <= 5, str(len(plan)))
t('без домена сразу случайный адрес', CL.tunnel_plan('') == [{}, {}], str(CL.tunnel_plan('')))

print('  причины падения Node:')
cases = [
    (404, 'random html', 'сервером'),
    (0, 'Error: listen EADDRINUSE: address already in use', 'Порт занят'),
    (0, 'Error: Cannot find module better-sqlite3', 'better-sqlite3'),
    (0, 'SqliteError: database is locked', 'База'),
    (0, 'EACCES: permission denied', 'прав'),
    (0, 'ENOSPC: no space left on device', 'место'),
    (0, 'Cannot find module ws', 'модулей'),
    (0, 'segfault', 'упал'),
]
for code, log, expect in cases:
    v = CL.classify_start_failure(code, log)
    t(f'{expect}: есть заголовок и совет', bool(v['title']) and bool(v['hints'])
      and (expect.lower() in v['title'].lower() or expect.lower() in ' '.join(v['hints']).lower()),
      v['title'])

print('  подсказки ngrok:')
for err, expect in [('ERR_NGROK_3200', 'Домен'), ('ERR_NGROK_108', 'сессию'),
                    ('ERR_NGROK_105', 'authtoken'), ('ERR_NGROK_7024', 'порт'),
                    ('socket timeout', 'интернет')]:
    hint = CL.tunnel_hint(err)
    t(f'{err} → по-русски', expect.lower() in hint.lower(), hint[:60])

print('  вердикт «видно ли сервер из интернета»:')
ok = CL.public_verdict(200, {'server': 'los-gorod', 'version': '0.6.1', 'build': 'abc123'})
t('наш сервер ⇒ ок', ok['ok'] and ok['level'] == 'ok' and '0.6.1' in ok['hint'], ok['hint'])
t('ngrok 404 ⇒ «туннель есть, сервера нет»', CL.public_verdict(404, '<html>')['title'].endswith('(ngrok 404)'))
t('чужой сервер за туннелем отличается от 404',
  'не наш' in CL.public_verdict(200, {'server': 'nginx'})['title'])
t('нет связи ⇒ down', CL.public_verdict(0, '')['level'] == 'down')
t('502 не считается успехом', not CL.public_verdict(502, '')['ok'])

# ── структура самой ячейки ────────────────────────────────────────────────
print('  серверная ячейка (colab_one.py):')
src = open(os.path.join(ROOT, 'server', 'colab_one.py'), encoding='utf-8').read()
tree = ast.parse(src)
funcs = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
for need in ('kill_server', 'start_server', 'wait_up', 'start_tunnel', 'apply_tunnel', 'heal', 'watchdog'):
    t(f'есть {need}()', need in funcs)
t('использует проверяемую логику', 'import colab_logic as CL' in src)
t('сторож перезапускает упавший Node', 'watchdog' in src and 'proc.poll()' in src)
t('лечит туннель (404 при живом сервере)', 'def heal(' in src and 'public_ok()' in src)
t('не выходит молча: SystemExit только в трёх объяснённых местах',
  src.count('SystemExit') == 3, f"{src.count('SystemExit')} (die, run и переустановка зависимостей)")
t('печатает ссылку в игру', 'srv=' in src)
t('лог пишется на Drive', "'/server.log'" in src)
t('нет отладочных заглушек', 'TODO' not in src and 'FIXME' not in src)
t('pyngrok ставится нужной версии', re.search(r"PYN\s*=\s*'7\.2\.3'", src) is not None)

print('\n✗ провалов: %d' % fail if fail else '\n✓ серверная ячейка в порядке: причины падений объясняются, туннель лечится')
sys.exit(1 if fail else 0)
