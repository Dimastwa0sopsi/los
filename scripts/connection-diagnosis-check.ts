import { strict as assert } from 'node:assert';
import { connectionDiagnosis } from '../src/game/connectionDiagnosis';
async function main() {
  const original = globalThis.fetch;
  try {
    let calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(JSON.stringify({server:'los-gorod'}), {headers:{'content-type':'application/json'}}); }) as typeof fetch;
    assert.match(await connectionDiagnosis('wss://example.test/'), /Сервер ответил по HTTPS/);
    assert.equal(calls[0], 'https://example.test/version');
    globalThis.fetch = (async () => { throw new Error('blocked'); }) as typeof fetch;
    assert.match(await connectionDiagnosis('wss://example.test'), /не удалось/);
    assert.match(await connectionDiagnosis('not a url'), /Некорректный/);
    let count = 0;
    globalThis.fetch = (async () => { count++; return count === 1 ? new Response('warning') : new Response(JSON.stringify({server:'los-gorod'}), {headers:{'content-type':'application/json'}}); }) as typeof fetch;
    assert.match(await connectionDiagnosis('wss://example.test'), /Сервер ответил/);
    assert.equal(count, 2);
    console.log('✓ диагностика соединения: ответ сервера, ошибка сети и страница ngrok');
  } finally { globalThis.fetch = original; }
}
void main();
