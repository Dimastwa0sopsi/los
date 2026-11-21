"""Colab: create a new SQLite backup on Drive and run read-only audits.

This does NOT migrate or modify the live game database and does not enable
transactions. A report represents only the moment the backup was created.
"""
import importlib.util
import json
import os
import sqlite3
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path('/content/drive/MyDrive/los-gorod/data/game.db')
# Auditors and catalogue must come from one repository revision. Operators may
# pin a specific merged commit instead of main using LOS_AUDIT_REF.
REF = os.environ.get('LOS_AUDIT_REF', 'main')
FILES = ('audit_business_readiness.py', 'audit_auction_readiness.py', 'audit_plate_readiness.py', 'business-catalogue.json')


def create_backup(source, directory):
    source = Path(source).expanduser().resolve()
    directory = Path(directory).expanduser().resolve()
    if not source.is_file(): raise FileNotFoundError('Игровая база не найдена; новая база не создавалась')
    if not directory.is_dir(): raise FileNotFoundError('Папка для резервной копии не найдена')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target = directory / f'game-economy-audit-{stamp}.db'
    # Exclusive creation: never overwrite an earlier backup.
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    src = dst = None
    try:
        src = sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True, timeout=30)
        dst = sqlite3.connect(str(target), timeout=30)
        src.backup(dst)
        result = dst.execute('PRAGMA integrity_check').fetchall()
        if result != [('ok',)]: raise RuntimeError('Проверка целостности резервной копии не пройдена')
    finally:
        if dst is not None: dst.close()
        if src is not None: src.close()
    return target


def audit_backup(backup, scripts):
    scripts = Path(scripts)
    results = {}
    for key, filename in (('business','audit_business_readiness.py'), ('auction','audit_auction_readiness.py'), ('plates','audit_plate_readiness.py')):
        spec = importlib.util.spec_from_file_location('los_audit_' + key, scripts / filename)
        if spec is None or spec.loader is None: raise RuntimeError('Не удалось загрузить проверку')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        results[key] = module.audit(backup)
    return results


def download_auditors(directory, ref=REF):
    import re
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', ref): raise ValueError('Некорректная версия проверок')
    # Resolve a branch name once so all four files come from exactly one commit.
    if not re.fullmatch(r'[0-9a-f]{40}', ref):
        req = urllib.request.Request(f'https://api.github.com/repos/Dimastwa0sopsi/los/commits/{ref}', headers={'User-Agent':'los-economy-audit'})
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.load(response)
        ref = result.get('sha', '')
        if not re.fullmatch(r'[0-9a-f]{40}', ref): raise ValueError('Не удалось определить версию проверок')
    root = f'https://raw.githubusercontent.com/Dimastwa0sopsi/los/{ref}/server/'
    for name in FILES:
        with urllib.request.urlopen(root + name, timeout=30) as response:
            data = response.read(4 * 1024 * 1024 + 1)
        if len(data) > 4 * 1024 * 1024: raise ValueError('Файл проверки слишком велик')
        (Path(directory) / name).write_bytes(data)
    return ref


def main():
    from google.colab import drive
    drive.mount('/content/drive', force_remount=False)
    # Download first: a network failure should not create needless backups.
    with tempfile.TemporaryDirectory(prefix='los-audit-') as temp:
        revision = download_auditors(temp)
        backup = create_backup(SOURCE, SOURCE.parent)
        print('Резервная копия:', backup)
        try:
            report = audit_backup(backup, temp)
        except Exception:
            print('Проверка не завершена. Копия сохранена; база игры не менялась.')
            raise
        print('Проверки, коммит:', revision)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print('Только чтение. Функции не включены; после создания копии новые изменения игры в неё не попадают.')


if __name__ == '__main__':
    main()
