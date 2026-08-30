import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'kust-lab-v2.css'), 'utf8');
const scriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);

assert.ok(scriptMatch, 'inline application script should exist');

const exposedNames = [
  'RAW_DATA', 'FALLBACK_DATA', 'DAYS_FULL', 'SLOT_TIMES', 'state', 'COURSES',
  'teachingWeek', 'academicPhase', 'dateForWeekDay', 'dayIndex', 'isActive',
  'isMentorCourse', 'activeInfo', 'currentStatus', 'renderWeekMatrix', 'validateCoursesInput'
];

const testSource = scriptMatch[1].replace(/\s*init\(\);\s*$/, '') +
  `\nglobalThis.__kustTest = { ${exposedNames.join(', ')} };`;
const context = { console };
vm.runInNewContext(testSource, context, { filename: 'index-inline.js' });
const api = context.__kustTest;

function localDate(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

test('page keeps its identity, local assets and responsive layout system', () => {
  assert.match(html, /<title>KUST·Lab<\/title>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.match(html, /assets\/kust-lab-v2\.css/);
  assert.match(html, /昆明理工大学官方校标/);
  assert.match(html, /https:\/\/www\.kmust\.edu\.cn\/info\/1020\/20442\.htm/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(min-width: 900px\) and \(max-width: 1159px\)/);
  assert.match(css, /@media \(min-width: 1160px\)/);
  assert.match(css, /--workspace: 1880px/);
  assert.match(css, /grid-template-columns: 92px repeat\(7/);
});

test('required interactive ids exist exactly once', () => {
  const ids = [
    'clock', 'dateLine', 'statusCard', 'todayList', 'weekList', 'weekMatrix', 'dayTabs',
    'prevWeek', 'nextWeek', 'weekCurrent', 'openManager', 'openManagerTop', 'openManagerMobile', 'managerDialog',
    'managerCourseList', 'managerSearch', 'courseForm', 'saveCloud', 'syncPill'
  ];
  for (const id of ids) {
    const count = (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
    assert.equal(count, 1, `${id} should exist exactly once`);
  }
});

test('fallback data is immutable and contains all 37 course meetings', () => {
  assert.equal(api.RAW_DATA.length, 37);
  assert.equal(api.COURSES.length, 37);
  assert.ok(Object.isFrozen(api.FALLBACK_DATA));
  assert.ok(Object.isFrozen(api.FALLBACK_DATA[0]));
  assert.ok(Object.isFrozen(api.FALLBACK_DATA[0]['授课分段']));
});

test('first teaching week begins on Monday August 24 and Sunday stays day seven', () => {
  assert.equal(api.teachingWeek(localDate(2026, 8, 23)), 0);
  assert.equal(api.teachingWeek(localDate(2026, 8, 24)), 1);
  assert.equal(api.teachingWeek(localDate(2026, 8, 30)), 1);
  assert.equal(api.teachingWeek(localDate(2026, 8, 31)), 2);
  assert.equal(api.dayIndex(localDate(2026, 8, 30)), 6);
  assert.equal(api.dateForWeekDay(2, 0).getDate(), 31);
  assert.equal(api.dateForWeekDay(2, 6).getDate(), 6);
  assert.ok((html.match(/state\.selectedDay = 0;/g) || []).length >= 2, 'changing week should select Monday');
});

test('all 396 calendar dates return a visible phase without gaps', () => {
  const start = localDate(2026, 8, 1);
  for (let offset = 0; offset < 396; offset += 1) {
    const date = new Date(start.getTime());
    date.setDate(start.getDate() + offset);
    const phase = api.academicPhase(date);
    assert.equal(typeof phase.key, 'string');
    assert.ok(phase.key.length > 0);
    assert.equal(typeof phase.label, 'string');
    assert.ok(phase.label.length > 0);
  }
});

test('academic calendar switches phase on every published boundary', () => {
  const cases = [
    [[2026, 8, 21], 'before'], [[2026, 8, 22], 'first-registration'],
    [[2026, 8, 23], 'first-registration'], [[2026, 8, 24], 'orientation'],
    [[2026, 8, 30], 'orientation'], [[2026, 8, 31], 'first-teaching'],
    [[2027, 1, 3], 'first-teaching'], [[2027, 1, 4], 'first-exam'],
    [[2027, 1, 17], 'first-exam'], [[2027, 1, 18], 'winter'],
    [[2027, 2, 28], 'winter'], [[2027, 3, 1], 'second-registration'],
    [[2027, 3, 2], 'second-teaching'], [[2027, 7, 4], 'second-teaching'],
    [[2027, 7, 5], 'second-exam'], [[2027, 7, 11], 'second-exam'],
    [[2027, 7, 12], 'summer'], [[2027, 8, 20], 'summer'],
    [[2027, 8, 21], 'after']
  ];
  for (const [parts, expected] of cases) {
    assert.equal(api.academicPhase(localDate(...parts)).key, expected, parts.join('-'));
  }
});

test('live status reports current class, next class and remaining time', () => {
  const active = api.currentStatus(localDate(2026, 8, 31, 8, 30));
  assert.equal(active.type, 'active');
  assert.equal(active.course, '农业与生物系统工程专论');
  assert.equal(active.period, '08:00–09:35 · 第1–2节');
  assert.match(active.countdownLabel, /下课/);

  const next = api.currentStatus(localDate(2026, 8, 31, 9, 40));
  assert.equal(next.type, 'next');
  assert.equal(next.course, 'SPAC系统水分运转与调控');
  assert.equal(next.room, '公教楼448');
  assert.equal(next.label, '下一节 09:50');
  assert.equal(next.countdownLabel, '还有');
});

test('mentor class is specially marked only during mentor teaching weeks', () => {
  const mentorMeeting = api.COURSES.find((course) => course.name === '设施农业与装备（专硕）' && course.dayLabel === '星期五');
  assert.ok(mentorMeeting);
  assert.equal(api.isMentorCourse(mentorMeeting, 4), false);
  assert.equal(api.isMentorCourse(mentorMeeting, 5), true);
  assert.equal(api.isMentorCourse(mentorMeeting, 10), true);
  assert.equal(api.isMentorCourse(mentorMeeting, 11), false);

  const live = api.currentStatus(localDate(2026, 9, 25, 16, 30));
  assert.equal(live.course, '设施农业与装备（专硕）');
  assert.equal(live.teacher, '喻黎明');
  assert.equal(live.room, '公教楼247');
  assert.equal(live.mentor, true);
  assert.match(html, /导师课 · 不可缺席/);
});

test('desktop matrix renders all seven days, six time bands and mentor warning', () => {
  const matrix = { innerHTML: '' };
  context.document = { getElementById: (id) => id === 'weekMatrix' ? matrix : null };
  api.state.viewWeek = 5;
  api.renderWeekMatrix(localDate(2026, 9, 25, 16, 30));
  assert.equal((matrix.innerHTML.match(/class="matrix-head/g) || []).length, 7);
  assert.equal((matrix.innerHTML.match(/class="matrix-slot/g) || []).length, 6);
  assert.equal((matrix.innerHTML.match(/class="matrix-cell/g) || []).length, 42);
  assert.match(matrix.innerHTML, /设施农业与装备（专硕）/);
  assert.match(matrix.innerHTML, /导师课 · 不可缺席/);
  assert.match(matrix.innerHTML, /16:10—17:45/);
});

test('course editor validation matches the cloud contract', () => {
  const good = [{
    '星期': '星期一', '节次': '第1-2节', '时间': '08:00-09:35', '课程': '新增测试课',
    '授课分段': [{ '周次': '2-4', '教师': '测试教师' }], '教室': ['公教楼101']
  }];
  assert.equal(api.validateCoursesInput(good)[0]['课程'], '新增测试课');
  assert.throws(() => api.validateCoursesInput([{ ...good[0], '时间': '08:01-09:35' }]), /节次与时间不匹配/);
  assert.throws(() => api.validateCoursesInput([{ ...good[0], '授课分段': [{ '周次': '8-2', '教师': '测试教师' }] }]), /周次范围无效/);
  assert.throws(() => api.validateCoursesInput([good[0], { ...good[0], '教室': ['公教楼102'] }]), /重复课程/);
  assert.throws(() => api.validateCoursesInput([good[0], { ...good[0], '课程': '另一门课程' }]), /课程时间冲突/);
  const separated = api.validateCoursesInput([good[0], { ...good[0], '授课分段': [{ '周次': '5-6', '教师': '测试教师' }] }]);
  assert.equal(separated.length, 2, 'same course in non-overlapping weeks remains valid');
});

test('course management uses one unified entry on desktop and mobile', () => {
  assert.doesNotMatch(html, /id=["']openAdd/i);
  assert.match(html, /id="openManagerTop"/);
  assert.match(html, /id="openManagerMobile"/);
  assert.match(html, /id="addCourse"[^>]*>新增课程</);
});

test('admin secret is session-only and revision conflicts have a visible recovery path', () => {
  assert.match(html, /sessionStorage\.setItem\(SECRET_KEY/);
  assert.doesNotMatch(html, /localStorage\.setItem\(SECRET_KEY/);
  assert.match(html, /baseRevision: state\.revision/);
  assert.match(html, /response\.status === 409/);
  assert.match(html, /id="reloadCloud"/);
  assert.match(html, /function setupFooterDisclosure\(\)/);
  assert.match(html, /window\.setInterval\(function \(\) \{ loadCloudSchedule\(\); \}, SYNC_INTERVAL_MS\)/);
  assert.match(html, /function renderWeekMatrix\(now\)/);
  assert.match(html, /state\.workingData\.splice\(index, 1\)/);
  assert.match(html, /state\.workingData = validateCoursesInput\(nextData\)/);
});
