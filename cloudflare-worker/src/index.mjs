const SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_COURSES = 200;
const DAYS = new Set(['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']);
const SLOTS = new Map([
  ['第1-2节', '08:00-09:35'],
  ['第3-5节', '09:50-12:15'],
  ['第6-8节', '13:30-15:55'],
  ['第9-10节', '16:10-17:45'],
  ['第11节', '17:50-18:35'],
  ['第12-13节', '19:30-21:05']
]);

class ValidationError extends Error {}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function publicState(state) {
  if (!state) {
    return {
      schemaVersion: SCHEMA_VERSION,
      initialized: false,
      revision: 0,
      updatedAt: null,
      courses: []
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    initialized: true,
    revision: state.revision,
    updatedAt: state.updatedAt,
    courses: clone(state.courses)
  };
}

function cleanText(value, label, maxLength) {
  if (typeof value !== 'string') throw new ValidationError(`${label}必须是文本`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new ValidationError(`${label}长度无效`);
  return text;
}

function cleanWeekRange(value) {
  const text = cleanText(value, '周次', 12);
  const match = text.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) throw new ValidationError('周次格式应为 2-5 或 8');
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (start < 1 || end > 60 || start > end) throw new ValidationError('周次范围无效');
  return start === end ? String(start) : `${start}-${end}`;
}

function weekRange(value) {
  const numbers = String(value).match(/\d+/g)?.map(Number) || [0];
  return [numbers[0], numbers[1] ?? numbers[0]];
}

function assertNoCourseConflicts(courses) {
  for (let leftIndex = 0; leftIndex < courses.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < courses.length; rightIndex += 1) {
      const left = courses[leftIndex];
      const right = courses[rightIndex];
      if (left.星期 !== right.星期 || left.节次 !== right.节次) continue;

      let overlap = null;
      left.授课分段.some((leftPart) => {
        const leftWeeks = weekRange(leftPart.周次);
        return right.授课分段.some((rightPart) => {
          const rightWeeks = weekRange(rightPart.周次);
          const start = Math.max(leftWeeks[0], rightWeeks[0]);
          const end = Math.min(leftWeeks[1], rightWeeks[1]);
          if (start > end) return false;
          overlap = start === end ? String(start) : `${start}-${end}`;
          return true;
        });
      });
      if (!overlap) continue;

      const where = `${left.星期} ${left.时间}（${left.节次}）第${overlap}周`;
      if (left.课程.toLowerCase() === right.课程.toLowerCase()) {
        throw new ValidationError(`重复课程：“${left.课程}”在${where}已经存在`);
      }
      throw new ValidationError(`课程时间冲突：“${left.课程}”和“${right.课程}”在${where}同时上课`);
    }
  }
}

function cleanCourse(course, index) {
  if (!course || typeof course !== 'object' || Array.isArray(course)) {
    throw new ValidationError(`第${index + 1}门课程格式无效`);
  }
  const day = cleanText(course.星期, '星期', 4);
  const slot = cleanText(course.节次, '节次', 10);
  const time = cleanText(course.时间, '时间', 20);
  if (!DAYS.has(day)) throw new ValidationError('星期无效');
  if (!SLOTS.has(slot) || SLOTS.get(slot) !== time) throw new ValidationError('节次与时间不匹配');

  if (!Array.isArray(course.授课分段) || course.授课分段.length < 1 || course.授课分段.length > 20) {
    throw new ValidationError('每门课程需要 1 至 20 个授课分段');
  }
  const parts = course.授课分段.map((part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw new ValidationError('授课分段格式无效');
    return {
      周次: cleanWeekRange(part.周次),
      教师: cleanText(part.教师, '教师', 40)
    };
  });

  if (!Array.isArray(course.教室) || course.教室.length < 1 || course.教室.length > 8) {
    throw new ValidationError('每门课程需要 1 至 8 个教室');
  }
  const rooms = [...new Set(course.教室.map((room) => cleanText(room, '教室', 50)))];

  return {
    星期: day,
    节次: slot,
    时间: time,
    课程: cleanText(course.课程, '课程名称', 80),
    授课分段: parts,
    教室: rooms
  };
}

function cleanPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ValidationError('请求格式无效');
  if (!Number.isInteger(payload.baseRevision) || payload.baseRevision < 0) throw new ValidationError('修订号无效');
  if (!Array.isArray(payload.courses) || payload.courses.length > MAX_COURSES) {
    throw new ValidationError(`课程数量不能超过 ${MAX_COURSES}`);
  }
  const courses = payload.courses.map(cleanCourse);
  assertNoCourseConflicts(courses);
  return {
    baseRevision: payload.baseRevision,
    courses
  };
}

async function secureEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  }
  return difference === 0;
}

function responseHeaders(origin, allowedOrigin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (origin && origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '600');
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function json(body, status, origin, allowedOrigin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, allowedOrigin)
  });
}

export function createMemoryStore(seed = null) {
  let state = clone(seed);
  return {
    async get() {
      return clone(state);
    },
    async put(expectedRevision, courses, updatedAt) {
      const currentRevision = state ? state.revision : 0;
      if (currentRevision !== expectedRevision) return { ok: false, current: clone(state) };
      state = {
        revision: currentRevision + 1,
        updatedAt,
        courses: clone(courses)
      };
      return { ok: true, current: clone(state) };
    }
  };
}

export function createD1Store(database) {
  if (!database) throw new Error('D1 binding DB is missing');
  const get = async () => {
    const row = await database.prepare('SELECT revision, updated_at, courses_json FROM schedule_state WHERE id = 1').first();
    if (!row) return null;
    return {
      revision: Number(row.revision),
      updatedAt: row.updated_at,
      courses: JSON.parse(row.courses_json)
    };
  };
  return {
    get,
    async put(expectedRevision, courses, updatedAt) {
      const encoded = JSON.stringify(courses);
      const current = await get();
      if (!current) {
        if (expectedRevision !== 0) return { ok: false, current: null };
        try {
          await database.prepare(
            'INSERT INTO schedule_state (id, revision, updated_at, courses_json) VALUES (1, 1, ?, ?)'
          ).bind(updatedAt, encoded).run();
          return { ok: true, current: await get() };
        } catch {
          return { ok: false, current: await get() };
        }
      }
      if (current.revision !== expectedRevision) return { ok: false, current };
      const result = await database.prepare(
        'UPDATE schedule_state SET revision = revision + 1, updated_at = ?, courses_json = ? WHERE id = 1 AND revision = ?'
      ).bind(updatedAt, encoded, expectedRevision).run();
      if (Number(result.meta?.changes || 0) !== 1) return { ok: false, current: await get() };
      return { ok: true, current: await get() };
    }
  };
}

export function createApp({ store, adminSecret, allowedOrigin, now = () => new Date().toISOString() }) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin') || '';
      if (origin && origin !== allowedOrigin) {
        return json({ ok: false, error: { code: 'ORIGIN_DENIED', message: '来源不允许' } }, 403, '', allowedOrigin);
      }

      if (request.method === 'OPTIONS') {
        if (!origin) return json({ ok: false, error: { code: 'ORIGIN_REQUIRED', message: '缺少来源' } }, 403, '', allowedOrigin);
        return new Response(null, { status: 204, headers: responseHeaders(origin, allowedOrigin) });
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true }, 200, origin, allowedOrigin);
      }
      if (url.pathname !== '/api/schedule') {
        return json({ ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404, origin, allowedOrigin);
      }
      if (request.method === 'GET') {
        return json({ ok: true, data: publicState(await store.get()) }, 200, origin, allowedOrigin);
      }
      if (request.method !== 'PUT') {
        return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不允许' } }, 405, origin, allowedOrigin);
      }

      if (!origin) {
        return json({ ok: false, error: { code: 'ORIGIN_REQUIRED', message: '管理操作缺少来源' } }, 403, '', allowedOrigin);
      }

      const authorization = request.headers.get('Authorization') || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!(await secureEqual(token, adminSecret))) {
        return json({ ok: false, error: { code: 'UNAUTHORIZED', message: '管理密码错误' } }, 401, origin, allowedOrigin);
      }

      const declaredLength = Number(request.headers.get('Content-Length') || 0);
      if (declaredLength > MAX_BODY_BYTES) {
        return json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: '课表数据过大' } }, 413, origin, allowedOrigin);
      }

      try {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: '课表数据过大' } }, 413, origin, allowedOrigin);
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: { code: 'INVALID_JSON', message: 'JSON格式无效' } }, 400, origin, allowedOrigin);
        }
        const payload = cleanPayload(parsed);
        const saved = await store.put(payload.baseRevision, payload.courses, now());
        if (!saved.ok) {
          return json({
            ok: false,
            error: { code: 'REVISION_CONFLICT', message: '课表已被其他设备更新，请先重新载入' },
            data: publicState(saved.current)
          }, 409, origin, allowedOrigin);
        }
        return json({ ok: true, data: publicState(saved.current) }, 200, origin, allowedOrigin);
      } catch (error) {
        if (error instanceof ValidationError) {
          return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: error.message } }, 422, origin, allowedOrigin);
        }
        console.error('schedule worker error', error);
        return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: '服务器暂时不可用' } }, 500, origin, allowedOrigin);
      }
    }
  };
}

export default {
  async fetch(request, env) {
    const app = createApp({
      store: createD1Store(env.DB),
      adminSecret: env.ADMIN_SECRET,
      allowedOrigin: env.ALLOWED_ORIGIN
    });
    return app.fetch(request);
  }
};
