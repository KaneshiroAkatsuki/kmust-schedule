const UPSTREAM_ORIGIN = 'https://kmust-schedule-sync.kaneshiroakatsuki.workers.dev';
const SITE_ORIGIN = 'https://kaneshiroakatsuki.github.io';
const ALLOWED_PATHS = new Set(['/api/auth/verify', '/api/schedule', '/api/weather']);

function json(body, status, origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (origin === SITE_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', SITE_ORIGIN);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export async function gatewayFetch(request, upstreamFetch = fetch) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (url.pathname === '/health' && request.method === 'GET') {
    return json({ ok: true, service: 'KUST Lab sync gateway' }, 200, origin);
  }
  if (!ALLOWED_PATHS.has(url.pathname)) {
    return json({ ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404, origin);
  }
  if (origin && origin !== SITE_ORIGIN) {
    return json({ ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不允许' } }, 403, origin);
  }
  if (request.method === 'OPTIONS') {
    return origin === SITE_ORIGIN
      ? new Response(null, { status: 204, headers: json({}, 200, origin).headers })
      : json({ ok: false, error: { code: 'ORIGIN_REQUIRED', message: '请求缺少来源' } }, 403, origin);
  }
  if (!['GET', 'POST', 'PUT'].includes(request.method)) {
    return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不允许' } }, 405, origin);
  }

  const headers = new Headers({
    Accept: 'application/json',
    Origin: SITE_ORIGIN
  });
  const contentType = request.headers.get('Content-Type');
  const authorization = request.headers.get('Authorization');
  if (contentType) headers.set('Content-Type', contentType);
  if (authorization) headers.set('Authorization', authorization);
  const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
  const upstreamRequest = new Request(UPSTREAM_ORIGIN + url.pathname, {
    method: request.method,
    headers,
    body,
    redirect: 'manual'
  });

  try {
    const response = await upstreamFetch(upstreamRequest);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    if (origin === SITE_ORIGIN) {
      responseHeaders.set('Access-Control-Allow-Origin', SITE_ORIGIN);
      responseHeaders.set('Vary', 'Origin');
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (_) {
    return json({ ok: false, error: { code: 'UPSTREAM_UNAVAILABLE', message: '同步服务暂时不可用' } }, 502, origin);
  }
}

export default {
  fetch(request) {
    return gatewayFetch(request);
  }
};
