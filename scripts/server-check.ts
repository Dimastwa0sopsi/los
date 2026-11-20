/* Проверка диагностики сервера: игровая ручка /version, «туннель жив, а сервера
 * нет» (404 от ngrok) и полностью мёртвый адрес должны различаться.
 *   npm run check:server
 */
import http from 'http';
import { diagnoseServer } from '../src/game/net';

const listen = (handler: http.RequestListener) => new Promise<{ port: number; close: () => void }>((resolve) => {
  const s = http.createServer(handler);
  s.listen(0, '127.0.0.1', () => {
    const port = (s.address() as { port: number }).port;
    resolve({ port, close: () => s.close() });
  });
});

async function main() {
let fail = 0;
const t = (name: string, got: string, want: string, extra = '') => {
  const ok = got === want;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) { console.log(`      ожидалось ${want}, получено ${got}`); fail++; }
};

// 1) наш сервер: /version отдаёт JSON
const good = await listen((req, res) => {
  if ((req.url || '').startsWith('/version')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, server: 'los-gorod', build: 'abc123def456', version: '0.4.0', uptime: 125, online: 3 }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<html>404</html>');
});
const d1 = await diagnoseServer(`ws://127.0.0.1:${good.port}`);
t('игровой сервер жив', d1.reason, 'ok', d1.detail);
t('сборка сервера прочитана', String(d1.build), 'abc123def456');
good.close();

// 2) ngrok-заглушка: на всё отвечает HTML 404
const gh = await listen((_req, res) => { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<html>err_ngrok_3200</html>'); });
const d2 = await diagnoseServer(`ws://127.0.0.1:${gh.port}`);
t('туннель есть, сервера нет', d2.reason, 'notserver', d2.detail);
t('код ответа сохранён', String(d2.http), '404');
gh.close();

// 3) мёртвый адрес: порт закрыт
const dead = await listen((_q, r) => { r.end('x'); });
const deadPort = dead.port;
dead.close();
await new Promise((r) => setTimeout(r, 50));
const d3 = await diagnoseServer(`ws://127.0.0.1:${deadPort}`, 2000);
t('мёртвый туннель распознан', d3.reason, 'dead', d3.detail);
t('есть текст для игрока', String(!!d3.text), 'true');

console.log(fail ? `✗ провалов: ${fail}` : '✓ диагностика сервера в порядке');
process.exit(fail ? 1 : 0);
}

void main();
