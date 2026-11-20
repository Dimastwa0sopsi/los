# ════════════════════════════════════════════════════════════════════════════
#  ЛОС-ГОРОД — логика админ-панели без виджетов.
#
#  Здесь всё, что можно проверить без Colab и без ipywidgets: список игроков с
#  сохранением выбора, группировка действий по разделам, диагностика связи с
#  сервером, форматирование денег и аптайма, история действий.
#
#  Правило, из-за которого файл и появился: панель НИКОГДА не должна терять
#  выбранного игрока. Раньше после каждого действия список перерисовывался и
#  выбор улетал на первого игрока — лечится классом PlayerList.
#
#  Проверка: python3 scripts/admin_check.py  (npm run check:admin)
# ════════════════════════════════════════════════════════════════════════════
from __future__ import annotations

import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

# ── разделы панели: ключ → (заголовок, подпись, какие группы действий внутри) ──
TABS: List[Tuple[str, str, str, Tuple[str, ...]]] = [
    ('players', '👥 Игроки', 'карточка, действия и телепорт', ('player', 'tp')),
    ('money', '💵 Деньги', 'выдать, забрать, обнулить', ('money',)),
    ('items', '🎁 Инвентарь', 'предметы и наборы', ()),
    ('car', '🚗 Транспорт', 'выдать авто, починить, угнать', ('car',)),
    ('chat', '📢 Чат и СМИ', 'объявления и сообщения', ('chat',)),
    ('mod', '🛡 Модерация', 'бан, мут, предупреждения', ('mod',)),
    ('server', '🖥 Сервер', 'техработы, события, туннель', ('server', 'event')),
    ('log', '📜 Логи', 'журнал сервера и история панели', ()),
]
TAB_GROUPS: Dict[str, Tuple[str, ...]] = {k: g for k, _t, _s, g in TABS}


def fmt_money(v: Any) -> str:
    """1234567 → «$1 234 567»; мусор → «$0»."""
    try:
        n = int(float(v))
    except Exception:                                     # noqa: BLE001
        n = 0
    sign = '−' if n < 0 else ''
    return f'{sign}${abs(n):,}'.replace(',', ' ')


def fmt_uptime(sec: Any) -> str:
    """Секунды → «2 ч 14 мин», «45 с», «3 сут 1 ч»."""
    try:
        s = int(float(sec))
    except Exception:                                     # noqa: BLE001
        return '?'
    s = max(0, s)
    if s < 60:
        return f'{s} с'
    m, s = divmod(s, 60)
    if m < 60:
        return f'{m} мин' + (f' {s} с' if s else '')
    h, m = divmod(m, 60)
    if h < 24:
        return f'{h} ч' + (f' {m} мин' if m else '')
    d, h = divmod(h, 24)
    return f'{d} сут' + (f' {h} ч' if h else '')


def short(text: Any, n: int = 90) -> str:
    s = ' '.join(str(text or '').split())
    return s if len(s) <= n else s[: n - 1] + '…'


# ── список игроков ───────────────────────────────────────────────────────────
class PlayerList:
    """Игроки + выбранный ник, который переживает любую перерисовку списка.

    Ошибка старой панели: `Select.options` присваивались целиком, а ipywidgets
    при смене options сбрасывает value на первый элемент. Теперь выбор живёт
    здесь, а виджет лишь показывает список и восстанавливает индекс.
    """

    def __init__(self) -> None:
        self.players: List[Dict[str, Any]] = []
        self.online: set = set()
        self.selected: str = ''
        # ник, которого больше нет в базе (удалён/переименован) — показываем явно
        self.stale: bool = False

    # — данные —
    def update(self, players: Optional[Iterable[Dict[str, Any]]], online: Optional[Iterable[str]] = None) -> None:
        rows = [p for p in (players or []) if isinstance(p, dict) and p.get('name')]
        self.players = rows
        if online is not None:
            self.online = set(str(x) for x in online)
        if self.selected and not self.has(self.selected):
            self.stale = True
        elif self.selected:
            self.stale = False

    def has(self, name: str) -> bool:
        return any(p.get('name') == name for p in self.players)

    def select(self, name: Optional[str]) -> str:
        """Выбрать игрока. Пустая строка — снять выбор (никакого «первого»)."""
        name = (name or '').strip()
        self.selected = name
        self.stale = bool(name) and not self.has(name)
        return self.selected

    def current(self) -> Optional[Dict[str, Any]]:
        return next((p for p in self.players if p.get('name') == self.selected), None)

    def is_online(self, name: Optional[str] = None) -> bool:
        return (name or self.selected) in self.online

    # — отображение —
    def rows(self, query: str = '', flt: str = 'all', sort: str = 'name') -> List[Tuple[str, str]]:
        """[(подпись, значение)] для Select. Значение — чистый ник."""
        q = (query or '').strip().lower()
        out: List[Tuple[str, int, bool, str]] = []
        for p in self.players:
            nm = str(p.get('name', ''))
            if q and q not in nm.lower():
                continue
            on = nm in self.online
            if flt == 'online' and not on:
                continue
            if flt == 'offline' and on:
                continue
            try:
                money = int(float(p.get('money', 0)))
            except Exception:                             # noqa: BLE001
                money = 0
            out.append((nm, money, on, nm))
        out.sort(key=lambda r: (r[0].lower() if sort == 'name' else -r[1]))
        return [(('🟢 ' if on else '') + f'{nm} · {fmt_money(m)}', nm) for nm, m, on, _v in out]

    def labels(self) -> List[str]:
        return [lab for lab, _v in self.rows()]

    def restore_index(self, options_values: List[str]) -> Optional[int]:
        """Индекс, который надо выделить после перерисовки (None — ничего)."""
        if not self.selected:
            return None
        try:
            return options_values.index(self.selected)
        except ValueError:
            return None

    def card(self) -> Dict[str, Any]:
        """Данные для карточки: то, что видно всегда, в одном месте."""
        p = self.current()
        if not p:
            return {'name': self.selected, 'found': False, 'stale': self.stale,
                    'online': False, 'money': 0, 'warns': 0, 'vehicle': '', 'rows': []}
        name = str(p.get('name'))
        money = p.get('money', 0)
        rows = [
            ('💰 Деньги', fmt_money(money)),
            ('⚠️ Предупреждения', str(p.get('warns', 0))),
        ]
        if p.get('vehicle'):
            rows.append(('🚗 Машина', str(p['vehicle'])))
        if p.get('wanted'):
            rows.append(('🚨 Розыск', str(p['wanted'])))
        if p.get('job'):
            rows.append(('🧰 Работа', str(p['job'])))
        return {'name': name, 'found': True, 'stale': self.stale,
                'online': name in self.online, 'money': money,
                'warns': p.get('warns', 0), 'vehicle': p.get('vehicle', ''),
                'rows': rows}


# ── действия ────────────────────────────────────────────────────────────────
def group_actions(actions: Iterable[Dict[str, Any]], groups: Dict[str, str],
                  tab: str, query: str = '') -> List[Tuple[str, List[Dict[str, Any]]]]:
    """Действия одного раздела, разбитые по группам сервера и отфильтрованные поиском.

    Возвращает [(заголовок группы, [действия])]. Пустые группы не попадают.
    """
    keys = TAB_GROUPS.get(tab, ())
    q = (query or '').strip().lower()
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for a in actions or []:
        if not isinstance(a, dict) or a.get('g') not in keys:
            continue
        if q and q not in str(a.get('t', '')).lower() and q not in str(a.get('id', '')).lower():
            continue
        buckets.setdefault(str(a['g']), []).append(a)
    order = list(groups.keys()) if groups else []
    return [(groups.get(g, g), buckets[g]) for g in order if buckets.get(g)] + \
           [(g, buckets[g]) for g in buckets if g not in order]


def action_count(actions: Iterable[Dict[str, Any]], tab: str) -> int:
    keys = TAB_GROUPS.get(tab, ())
    return sum(1 for a in actions or [] if isinstance(a, dict) and a.get('g') in keys)


# ── связь с сервером ────────────────────────────────────────────────────────
def diagnose(state_code: int, public_code: int, public_body: str = '', base: str = '') -> Dict[str, Any]:
    """Что случилось, по двум проверкам: /admin/state и /version снаружи.

    state_code — код ответа админского запроса (0 = сеть не ответила).
    public_code — код /version через туннель (0 = не ответил).
    Возвращает {'level': ok|warn|down, 'title': str, 'hints': [str, ...]}.
    """
    hints: List[str] = []
    if state_code == 200:
        if public_code == 200 and 'los-gorod' in (public_body or ''):
            return {'level': 'ok', 'title': 'Сервер и туннель в порядке', 'hints': []}
        if public_code == 200:
            hints.append('Порт отвечает, но это не наш сервер — на нём что-то чужое.')
            hints.append('Перезапустите серверную ячейку (Run all).')
            return {'level': 'warn', 'title': 'Отвечает чужой сервер', 'hints': hints}
        if public_code == 404:
            hints.append('Снаружи 404: туннель поднят, но за ним нет игрового сервера.')
            hints.append('Обычно это значит, что Node упал уже после проверки при старте.')
            hints.append('Перезапустите серверную ячейку — она поднимет сервер и туннель заново.')
            return {'level': 'warn', 'title': 'Туннель без сервера (ngrok 404)', 'hints': hints}
        hints.append('Туннель не ответил совсем. Домен мог отвязаться от аккаунта.')
        hints.append('Проверьте ngrok → Domains и перезапустите серверную ячейку.')
        return {'level': 'warn', 'title': 'Туннель молчит', 'hints': hints}

    if state_code in (401, 403):
        return {'level': 'down', 'title': 'Неверный токен админки',
                'hints': ['Токен задаётся в серверной ячейке (ADMIN_TOKEN) и должен совпадать с панелью.']}
    if state_code == 0:
        hints.append(f'Адрес {base or "(не задан)"} не отвечает: сервер не запущен или ссылка устарела.')
        hints.append('Откройте /version в браузере: JSON ⇒ сервер жив, страница ngrok/404 ⇒ сервера нет.')
        hints.append('Порядок запуска: сначала серверная ячейка, потом эта панель.')
        return {'level': 'down', 'title': 'Сервер недоступен', 'hints': hints}
    hints.append(f'Админский запрос вернул HTTP {state_code}.')
    hints.append('Если код 404 — на порту старый server.js без /admin/*: перезапустите серверную ячейку.')
    return {'level': 'down', 'title': f'Сервер ответил HTTP {state_code}', 'hints': hints}


# ── история действий панели ─────────────────────────────────────────────────
class History:
    """Что нажимали: последние N действий с результатом и временем."""

    def __init__(self, limit: int = 40) -> None:
        self.limit = limit
        self.items: List[Dict[str, Any]] = []

    def add(self, action: str, ok: bool, message: str, player: str = '') -> None:
        self.items.append({'t': time.strftime('%H:%M:%S'), 'action': action,
                           'ok': bool(ok), 'message': short(message, 120), 'player': player})
        if len(self.items) > self.limit:
            self.items = self.items[-self.limit:]

    def rows(self, limit: int = 12) -> List[Dict[str, Any]]:
        return list(reversed(self.items[-limit:]))

    def html(self, limit: int = 12) -> str:
        items = self.rows(limit)
        if not items:
            return '<div style="color:#94a3b8">Пока ничего не нажимали.</div>'
        out = []
        for it in items:
            mark = '✅' if it['ok'] else '⚠️'
            who = f" · {it['player']}" if it['player'] else ''
            out.append(f"<div><span style='color:#94a3b8'>{it['t']}</span> {mark} "
                       f"<b>{it['action']}</b>{who} — {it['message']}</div>")
        return ''.join(out)
