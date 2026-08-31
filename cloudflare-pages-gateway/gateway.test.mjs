import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayFetch } from './_worker.js';

const SITE = 'https://kaneshiroakatsuki.github.io';

test('gateway only proxies the known KUST Lab API paths', async () => {
  const unknown = await gatewayFetch(new Request('https://gateway.test/anything'));
  assert.equal(unknown.status, 404);

  const forbidden = await gatewayFetch(new Request('https://gateway.test/api/schedule', { headers: { Origin: 'https://example.com' } }));
  assert.equal(forbidden.status, 403);
});

test('gateway preserves method and body without exposing an open proxy', async () => {
  let forwarded;
  const response = await gatewayFetch(new Request('https://gateway.test/api/schedule', {
    method: 'POST',
    headers: { Origin: SITE, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ auth: 'test-only', baseRevision: 1 })
  }), async (request) => {
    forwarded = request;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(response.status, 200);
  assert.equal(new URL(forwarded.url).hostname, 'kmust-schedule-sync.kaneshiroakatsuki.workers.dev');
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.redirect, 'manual');
  assert.equal(forwarded.headers.get('Origin'), SITE);
  assert.match(await forwarded.text(), /"baseRevision":1/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE);
});

test('gateway health check does not depend on the schedule database', async () => {
  const response = await gatewayFetch(new Request('https://gateway.test/health'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
