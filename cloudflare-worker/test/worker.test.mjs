import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createApp,
  createBaiduWeatherProvider,
  createMemoryStore,
  createMemoryWeatherStore,
  createWeatherService,
  normalizeBaiduWeather
} from '../src/index.mjs';

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

function makeApp(overrides = {}) {
  return createApp({
    store: createMemoryStore(),
    adminSecret: SECRET,
    allowedOrigin: ORIGIN,
    now: () => '2026-08-30T08:00:00.000Z',
    ...overrides
  });
}

function baiduWeatherPayload() {
  return {
    status: 0,
    message: 'success',
    result: {
      location: { name: '呈贡区' },
      now: {
        text: '多云', temp: 17, feels_like: 16, rh: 74,
        wind_dir: '西南风', wind_class: '2级', prec_1h: 0.2,
        clouds: 72, vis: 18000, aqi: 35, uptime: '20260830222500'
      },
      forecasts: [
        {
          date: '2026-08-30', week: '星期日', high: 22, low: 14,
          text_day: '多云', text_night: '阵雨', wd_day: '西南风', wc_day: '2级'
        },
        {
          date: '2026-08-31', week: '星期一', high: 23, low: 15,
          text_day: '晴', text_night: '多云', wd_day: '南风', wc_day: '2级'
        }
      ],
      forecast_hours: [
        { data_time: '20260830230000', text: '多云', temp_fc: 17, rh: 76, prec_1h: 0, pop: 10, clouds: 70, wind_dir: '西南风', wind_class: '2级' },
        { data_time: '2026-08-31 00:00:00', text: '阵雨', temp_fc: 16, rh: 82, prec_1h: 0.8, pop: 45, clouds: 88, wind_dir: '西南风', wind_class: '2级' },
        { data_time: '202608310100', text: '暂无', temp_fc: null, rh: 999999, prec_1h: 999999, pop: 999999, clouds: 999999, wind_dir: '暂无', wind_class: '暂无' }
      ]
    }
  };
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

test('weather endpoint returns normalized Chenggong weather and reuses the 15-minute cache', async () => {
  let upstreamCalls = 0;
  const provider = createBaiduWeatherProvider({
    apiKey: 'test-only-baidu-key',
    now: () => Date.parse('2026-08-30T14:30:00.000Z'),
    fetchFn: async (url) => {
      upstreamCalls += 1;
      assert.match(url, /district_id=530114/);
      assert.match(url, /data_type=all/);
      return new Response(JSON.stringify(baiduWeatherPayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  const app = makeApp({ weatherProvider: provider });

  const first = await app.fetch(request('/api/weather', { headers: { Origin: ORIGIN } }));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(first.headers.get('cache-control'), /s-maxage=900/);
  const firstData = (await first.json()).data;
  assert.equal(firstData.location, '呈贡区');
  assert.equal(firstData.current.condition, '多云');
  assert.equal(firstData.current.temperature, 17);
  assert.equal(firstData.today.high, 22);
  assert.equal(firstData.observedAt, '2026-08-30T22:25:00+08:00');
  assert.equal(firstData.current.precipitation, 0.2);
  assert.equal(firstData.current.airQualityIndex, 35);
  assert.equal(firstData.hourly.length, 3);
  assert.equal(firstData.hourly[0].time, '2026-08-30T23:00:00+08:00');
  assert.equal(firstData.hourly[1].condition, '阵雨');
  assert.equal(firstData.hourly[1].precipitationProbability, 45);
  assert.equal(firstData.hourly[2].temperature, null);
  assert.equal(firstData.hourly[2].humidity, null);
  assert.equal(firstData.hourly[2].windDirection, '');
  assert.equal(firstData.daily.length, 2);
  assert.equal(firstData.daily[1].conditionDay, '晴');
  assert.equal(firstData.cached, false);

  const second = await app.fetch(request('/api/weather'));
  assert.equal((await second.json()).data.cached, true);
  assert.equal(upstreamCalls, 1);
});

test('hourly cloud weather survives closed webpages and refreshes on the cron schedule', async () => {
  let currentTime = Date.parse('2026-08-30T14:30:00.000Z');
  let providerCalls = 0;
  let providerFails = false;
  const store = createMemoryWeatherStore();
  const provider = async (options) => {
    assert.equal(options.force, true);
    providerCalls += 1;
    if (providerFails) throw new Error('upstream unavailable');
    return {
      source: '百度地图天气',
      location: '呈贡区',
      observedAt: new Date(currentTime).toISOString(),
      fetchedAt: new Date(currentTime).toISOString(),
      current: { condition: '多云', temperature: 17 },
      today: { high: 22, low: 14 },
      cached: false,
      stale: false
    };
  };
  const service = createWeatherService({
    store,
    provider,
    now: () => currentTime,
    maxAgeMs: 60 * 60 * 1000
  });

  const initial = await service.get();
  assert.equal(initial.cached, false);
  assert.equal(providerCalls, 1);

  currentTime += 30 * 60 * 1000;
  const halfHour = await service.get();
  assert.equal(halfHour.cached, true);
  assert.equal(providerCalls, 1, 'fresh D1 weather should not call Baidu again');

  await service.refresh();
  assert.equal(providerCalls, 2, 'scheduled refresh must run even when no webpage is open');

  currentTime += 61 * 60 * 1000;
  providerFails = true;
  const fallback = await service.get();
  assert.equal(fallback.cached, true);
  assert.equal(fallback.stale, true);
  assert.equal(fallback.current.temperature, 17);

  const wranglerConfig = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wranglerConfig, /"crons"\s*:\s*\["0 \* \* \* \*"\]/);
});

test('weather response validation and upstream failures never expose provider details', async () => {
  assert.throws(() => normalizeBaiduWeather({ status: 2, message: 'bad key' }), /天气响应无效/);
  const app = makeApp({ weatherProvider: async () => { throw new Error('sensitive upstream detail'); } });
  const response = await app.fetch(request('/api/weather', { headers: { Origin: ORIGIN } }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { code: 'WEATHER_UNAVAILABLE', message: '天气暂时不可用' }
  });
});

test('public read reports an uninitialized schedule', async () => {
  const response = await makeApp().fetch(request('/api/schedule', { headers: { Origin: ORIGIN } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.deepEqual((await response.json()).data, {
    schemaVersion: 2,
    initialized: false,
    revision: 0,
    updatedAt: null,
    courses: [],
    trash: [],
    mentorCourseNames: ['设施农业与装备', '设施农业与装备（专硕）', '农业节水与供水工程']
  });
});

test('admin password is verified before the editor opens', async () => {
  const app = makeApp();
  const valid = await app.fetch(request('/api/auth/verify', {
    method: 'POST',
    headers: adminHeaders()
  }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { ok: true });

  const invalid = await app.fetch(request('/api/auth/verify', {
    method: 'POST',
    headers: adminHeaders({ Authorization: 'Bearer wrong' })
  }));
  assert.equal(invalid.status, 401);

  const missingOrigin = await app.fetch(request('/api/auth/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` }
  }));
  assert.equal(missingOrigin.status, 403);
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

test('courses and recycle bin share one cross-device revision', async () => {
  const app = makeApp();
  const removedCourse = sampleCourse({ 课程: '已删除课程' });
  const trash = [{
    id: 'trash-test-1',
    deletedAt: '2026-08-31T10:00:00.000Z',
    reason: '手动删除',
    originalWeeks: '第2—4周',
    course: removedCourse
  }];
  const save = await app.fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ baseRevision: 0, courses: [sampleCourse()], trash, mentorCourseNames: ['设施农业与装备', '农业节水与供水工程'] })
  }));
  assert.equal(save.status, 200);
  const saved = (await save.json()).data;
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.trash.length, 1);
  assert.equal(saved.trash[0].course.课程, '已删除课程');
  assert.deepEqual(saved.mentorCourseNames, ['设施农业与装备', '农业节水与供水工程']);
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

test('duplicates are rejected, two courses may overlap, and a third requires confirmation', async () => {
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
  assert.equal(conflict.status, 200);

  const tripleCourses = [sampleCourse(), sampleCourse({ 课程: '另一门课程' }), sampleCourse({ 课程: '第三门课程' })];
  const triple = await makeApp().fetch(request('/api/schedule', {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ baseRevision: 0, courses: tripleCourses })
  }));
  assert.equal(triple.status, 422);
  assert.match((await triple.json()).error.message, /第三门需要再次确认/);

  const confirmedTriple = await makeApp().fetch(request('/api/schedule', {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ baseRevision: 0, courses: tripleCourses, confirmTriple: true })
  }));
  assert.equal(confirmedTriple.status, 200);

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

test('overlapping teacher segments inside one course are rejected', async () => {
  const response = await makeApp().fetch(request('/api/schedule', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({
      baseRevision: 0,
      courses: [sampleCourse({
        授课分段: [
          { 周次: '2-5', 教师: '教师甲' },
          { 周次: '5-8', 教师: '教师乙' }
        ]
      })]
    })
  }));
  assert.equal(response.status, 422);
  assert.match((await response.json()).error.message, /授课分段周次重叠/);
});

test('preflight allows only the configured site origin', async () => {
  const response = await makeApp().fetch(request('/api/schedule', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN }
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, PUT, OPTIONS');
});
