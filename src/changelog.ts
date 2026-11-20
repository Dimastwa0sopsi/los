// Журнал обновлений как данные для интерфейса: CHANGELOG.md подтягивается
// сборкой как строка, разбор — в version.ts (там же логика, которую проверяет
// npm run check:version).
import raw from '../CHANGELOG.md?raw';
import { parseChangelog, type ChangeEntry } from './version';

export const CHANGES: ChangeEntry[] = parseChangelog(String(raw));
export const LATEST = CHANGES[0] ?? null;
