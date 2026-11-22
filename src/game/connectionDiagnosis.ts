/** Best-effort diagnostic only. A browser hides the reason for WebSocket failures;
 * an HTTP failure may also be caused by CORS, an app policy or a timeout. */
export async function connectionDiagnosis(wsUrl: string, timeout = 5000): Promise<string> {
  let url: URL;
  try {
    url = new URL(wsUrl);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') throw new Error('protocol');
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') + '/version';
  } catch { return 'Некорректный адрес сервера. Проверьте адрес подключения.'; }
  const host = url.host;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const read = async (headers?: Record<string, string>): Promise<{ status: number; game: boolean }> => {
      const response = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal, headers });
      let game = false;
      if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
        try { const data = await response.json(); game = data?.server === 'los-gorod'; } catch { /* not valid JSON */ }
      }
      return { status: response.status, game };
    };
    let result = await read();
    // Retry the ngrok interstitial with its documented bypass header. Some app
    // wrappers or CORS policies block the preflight, so retain the first result.
    if (!result.game) { try { result = await read({ 'ngrok-skip-browser-warning': '1' }); } catch { /* keep first response */ } }
    if (result.game) return `Адрес: ${host}. Сервер ответил по HTTPS, но игровое соединение WebSocket не установилось. Проверьте ограничения сети и WebView в APK.`;
    return `Адрес: ${host}. Проверка получила HTTP ${result.status}, но не ответ игрового сервера. Возможно, мешает страница ngrok или настройки приложения.`;
  } catch {
    return `Адрес: ${host}. Проверить сервер из этого приложения не удалось. Причиной могут быть сеть, CORS или ограничения WebView; это не означает, что сервер выключен.`;
  } finally { clearTimeout(timer); }
}
