// Версия игры для интерфейса. Значения подставляет сборка (см. vite.config.ts):
// номер из package.json и момент сборки. Поэтому «каждое обновление — новая
// версия»: даже если номер версии не меняли, номер сборки другой.
// в сборке это константы (vite define); в node-проверках их нет — берём запасные
declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD__: string | undefined;
declare const __APP_BUILD_ID__: string | undefined;
const g = (name: string): string => {
  try { return String(new Function(`return typeof ${name} === 'undefined' ? '' : ${name}`)() || ''); } catch { return ''; }
};
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || g('__APP_VERSION__') || '0.0.0';
export const APP_BUILD = (typeof __APP_BUILD__ !== 'undefined' && __APP_BUILD__) || g('__APP_BUILD__') || 'dev';
export const APP_BUILD_ID = (typeof __APP_BUILD_ID__ !== 'undefined' && __APP_BUILD_ID__) || g('__APP_BUILD_ID__') || 'dev';

/** короткая подпись для угла экрана: «v0.3.0 · 19.11» */
export function versionShort(): string {
  const d = APP_BUILD.split(' ')[0].split('.');
  return `v${APP_VERSION} · ${d.length === 3 ? `${d[0]}.${d[1]}` : APP_BUILD}`;
}

export interface ChangeEntry { version: string; date: string; items: string[] }

/** разбор CHANGELOG.md: «## 0.3.0 — 19.11.2026» и строки «- …» */
export function parseChangelog(md: string): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  let cur: ChangeEntry | null = null;
  for (const line of String(md).split(/\r?\n/)) {
    const head = line.match(/^##\s+(?:v)?([0-9][\w.\-]*)\s*(?:—|-|–)\s*(.*)$/);
    if (head) { cur = { version: head[1], date: head[2].trim(), items: [] }; out.push(cur); continue; }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item && cur) cur.items.push(item[1].trim());
  }
  return out;
}


