import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createMemoryStore } from '../src/index.mjs';

const ORIGIN = 'https://kaneshiroakatsuki.github.io';
const SECRET = 'test-only-secret';

function sampleCourse(overrides = {}) {
  return {
    星期: '星期一',
    节次: '第1-2节',
    时间: '08:00-09:35',
    课程: '测试课程',
    授课分段: [{ 周次: '2-4', 教师: '测试教师' }],
    教室: ['公教楼101'],
    ...overrides
  };
}

function makeApp() {
  return createApp({
    store: createMemoryStore(),
    adminSecret: SECRET,
    allowedOrigin: ORIGIN,
    now: () => '2026-08-30T08:00:00.000Z'
  });
}

function request(path, init = {}) {
  return new Request(`https://sync.example.test${path}`, init);
}

function adminHeaders(extra = {}) {
  return {
    Origin: ORIGIN,
    Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

test('health endpoint responds without database access', async () => {
  const response = await makeApp().fetch(request('/api/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('public read reports an uninitialized schedule', async () => {
  const response = await makeApp().fetch(request('/api/schedule', { headers: { Origin: ORIGIN } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.deepEqual((await response.json()).data, {
    schemaVersion: 1,
    initialized: false,
    revision: 0,
    updatedAt: null,
    courses: []
  });
});

test('write requires the allowed origin and bearer secret', async () => {
  const app = makeApp();
  const body = JSON.stringify({ baseRevision: 0, courses: [sampleCourse()] });

  const missingOrigin = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json'
    },
    body
  }));
  assert.equal(missingOrigin.status, 403);

  const wrongOrigin = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders({ Origin: 'https://evil.example' }),
    body
  }));
  assert.equal(wrongOrigin.status, 403);

  const wrongSecret = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders({ Authorization: 'Bearer wrong' }),
    body
  }));
  assert.equal(wrongSecret.status, 401);
});

test('authorized write persists a validated revision', async () => {
  const app = makeApp();
  const save = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse()] })
  }));
  assert.equal(save.status, 200);
  const saved = (await save.json()).data;
  assert.equal(saved.initialized, true);
  assert.equal(saved.revision, 1);
  assert.equal(saved.updatedAt, '2026-08-30T08:00:00.000Z');
  assert.equal(saved.courses[0].课程, '测试课程');

  const read = await app.fetch(request('/api/schedule'));
  assert.deepEqual((await read.json()).data, saved);
});

test('stale revision is rejected without overwriting newer data', async () => {
  const app = makeApp();
  const first = JSON.stringify({ baseRevision: 0, courses: [sampleCourse()] });
  await app.fetch(request('/api/schedule', { method: 'PUT', headers: adminHeaders(), body: first }));

  const stale = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse({ 课程: '旧设备覆盖' })] })
  }));
  assert.equal(stale.status, 409);
  const payload = await stale.json();
  assert.equal(payload.error.code, 'REVISION_CONFLICT');
  assert.equal(payload.data.revision, 1);
  assert.equal(payload.data.courses[0].课程, '测试课程');
});

test('invalid and oversized schedules are rejected', async () => {
  const app = makeApp();
  const invalid = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse({ 时间: '25:99-28:00' })] })
  }));
  assert.equal(invalid.status, 422);

  const oversized = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse({ 课程: 'x'.repeat(270000) })] })
  }));
  assert.equal(oversized.status, 413);
});

test('duplicate and overlapping course meetings are rejected', async () => {
  const duplicate = await makeApp().fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse(), sampleCourse({ 教室: ['公教楼102'] })] })
  }));
  assert.equal(duplicate.status, 422);
  assert.match((await duplicate.json()).error.message, /重复课程/);

  const conflict = await makeApp().fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse(), sampleCourse({ 课程: '另一门课程' })] })
  }));
  assert.equal(conflict.status, 422);
  assert.match((await conflict.json()).error.message, /课程时间冲突/);

  const separated = await makeApp().fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({
      baseRevision: 0,
      courses: [sampleCourse(), sampleCourse({ 授课分段: [{ 周次: '5-6', 教师: '测试教师' }] })]
    })
  }));
  assert.equal(separated.status, 200);
});

test('preflight allows only the configured site origin', async () => {
  const response = await makeApp().fetch(request('/api/schedule', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN }
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, PUT, OPTIONS');
});
