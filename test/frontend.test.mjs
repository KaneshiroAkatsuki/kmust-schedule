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
  'dayPartForMinutes',
  'teachingWeek', 'academicPhase', 'dateForWeekDay', 'dayIndex', 'isActive',
  'scheduleTermForDate',
  'normalizeWeekRange', 'weekDateRangeLabel', 'segmentDateHint', 'weekRangeValue', 'weekOptions',
  'isMentorCourse', 'activeInfo', 'currentStatus', 'renderWeekMatrix', 'validateCoursesInput',
  'stageCourseUpsert', 'stageCourseDelete',
  'cloudSaveButtonView',
  'setupMobileMoreMenu', 'formatUpdatedAt', 'formatUpdatedDateTime', 'latestModifiedAt',
  'getRememberedSecret', 'setRememberedSecret', 'clearRememberedSecret'
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
  assert.match(css, /@media \(min-width: 801px\) and \(max-width: 1159px\)/);
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

test('course week selectors show exact Monday-to-Sunday dates and prevent reverse ranges', () => {
  assert.equal(api.weekDateRangeLabel(1), '第1周：8月24日—8月30日');
  assert.equal(api.weekDateRangeLabel(2), '第2周：8月31日—9月6日');
  assert.equal(api.weekDateRangeLabel(21), '第21周：1月11日—1月17日');
  assert.equal(api.segmentDateHint(2, 5), '第2周：8月31日—9月6日\n至第5周：9月21日—9月27日');
  assert.equal(api.weekRangeValue(2, 5), '2-5');
  assert.equal(api.weekRangeValue(7, 7), '7');
  assert.equal(api.normalizeWeekRange(8, 2, 'start')[0], 8);
  assert.equal(api.normalizeWeekRange(8, 2, 'start')[1], 8);
  assert.equal(api.normalizeWeekRange(8, 2, 'end')[0], 2);
  assert.equal(api.normalizeWeekRange(8, 2, 'end')[1], 2);
  assert.equal((api.weekOptions(4).match(/<option/g) || []).length, 21);
  assert.match(api.weekOptions(4), /value="4" selected>第4周/);
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

test('week heading term follows the current academic date', () => {
  assert.equal(api.scheduleTermForDate(localDate(2026, 8, 30)), '第一学期课程');
  assert.equal(api.scheduleTermForDate(localDate(2027, 2, 28)), '第一学期课程');
  assert.equal(api.scheduleTermForDate(localDate(2027, 3, 1)), '第二学期课程');
  assert.equal(api.scheduleTermForDate(localDate(2027, 8, 20)), '第二学期课程');
  assert.equal(api.scheduleTermForDate(localDate(2027, 8, 21)), '新学年课程');
  assert.match(html, /id="weekTermNote"/);
  assert.match(html, /scheduleTermForDate\(now\) \+ ' · 红色实线表示本周上课 · 灰色虚线表示此时间段无课'/);
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

test('day parts follow the published class times', () => {
  assert.equal(api.dayPartForMinutes(8 * 60).label, '上午');
  assert.equal(api.dayPartForMinutes(12 * 60 + 15).label, '上午');
  assert.equal(api.dayPartForMinutes(13 * 60 + 30).label, '下午');
  assert.equal(api.dayPartForMinutes(17 * 60 + 50).label, '下午');
  assert.equal(api.dayPartForMinutes(19 * 60 + 30).label, '晚上');
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
  assert.match(matrix.innerHTML, /本周上课/);
  assert.match(matrix.innerHTML, /此时间段无课/);
  assert.match(matrix.innerHTML, />上午</);
  assert.match(matrix.innerHTML, />下午</);
  assert.match(matrix.innerHTML, />晚上</);
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
  assert.throws(() => api.validateCoursesInput([{ ...good[0], '授课分段': [
    { '周次': '2-5', '教师': '教师甲' }, { '周次': '5-8', '教师': '教师乙' }
  ] }]), /教师安排周次重叠/);
  assert.throws(() => api.validateCoursesInput([good[0], { ...good[0], '教室': ['公教楼102'] }]), /重复课程/);
  assert.throws(() => api.validateCoursesInput([good[0], { ...good[0], '课程': '另一门课程' }]), /课程时间冲突/);
  const separated = api.validateCoursesInput([good[0], { ...good[0], '授课分段': [{ '周次': '5-6', '教师': '测试教师' }] }]);
  assert.equal(separated.length, 2, 'same course in non-overlapping weeks remains valid');
});

test('course staging really adds, edits and deletes without mutating the previous list', () => {
  const course = {
    '星期': '星期三', '节次': '第11节', '时间': '17:50-18:35', '课程': '事务测试课',
    '授课分段': [{ '周次': '2-3', '教师': '教师甲' }], '教室': ['公教楼101']
  };
  const empty = [];
  const added = api.stageCourseUpsert(empty, course, -1);
  assert.equal(empty.length, 0);
  assert.equal(added.length, 1);
  assert.equal(added[0]['课程'], '事务测试课');

  const edited = api.stageCourseUpsert(added, { ...course, '教室': ['公教楼202'] }, 0);
  assert.equal(added[0]['教室'][0], '公教楼101');
  assert.equal(edited[0]['教室'][0], '公教楼202');

  const deleted = api.stageCourseDelete(edited, 0);
  assert.equal(edited.length, 1);
  assert.equal(deleted.length, 0);
  assert.throws(() => api.stageCourseDelete(deleted, 0), /未找到要删除的课程/);
  assert.throws(() => api.stageCourseUpsert(added, { ...course, '教室': ['公教楼303'] }, -1), /重复课程/);
});

test('course deletion requires a second confirmation before it enters the pending upload list', () => {
  const confirmationIndex = html.indexOf("if (!window.confirm(warning + '确定删除“'");
  const deleteIndex = html.indexOf('state.workingData = stageCourseDelete(state.workingData, index)');
  assert.ok(confirmationIndex > 0, 'delete confirmation should exist');
  assert.ok(deleteIndex > confirmationIndex, 'course should only be staged for deletion after confirmation');
  assert.match(html, /这是导师课，标记为“不可缺席”/);
  assert.match(html, /删除后还需要回到主页点击“立即上传云端”才会生效/);
});

test('course management uses one unified entry on desktop and mobile', () => {
  assert.doesNotMatch(html, /id=["']openAdd/i);
  assert.match(html, /id="openManagerTop"/);
  assert.match(html, /id="openManagerMobile"/);
  assert.doesNotMatch(html, /id="lockManager"|>退出管理</);
  assert.match(html, /class="primary-button pane-add-course" id="addCourse"[^>]*>＋ 新增课程</);
  assert.match(html, /<div class="pane-head">[\s\S]*?id="courseListTitle"[\s\S]*?id="addCourse"/);
  assert.doesNotMatch(html, /<div class="manager-toolbar">\s*<button[^>]*id="addCourse"/);
  assert.match(html, /compactScreen = window\.matchMedia && window\.matchMedia\('\(max-width: 980px\)'\)\.matches[\s\S]*?editorPane\.scrollIntoView/);
  assert.match(html, /nameInput\.focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /@media \(max-width: 420px\)[\s\S]*?\.manager-toolbar #reloadCloud \{ flex-basis: 100%; \}/);
});

test('homepage owns the immediate cloud upload action and preserves staged edits when manager closes', () => {
  const saveButtonIndex = html.indexOf('id="saveCloud"');
  const mainIndex = html.indexOf('<main class="app"');
  const managerIndex = html.indexOf('<dialog class="manager-dialog"');
  assert.ok(saveButtonIndex > 0 && saveButtonIndex < mainIndex, 'cloud upload control should live in the homepage header');
  assert.ok(managerIndex > mainIndex);
  assert.equal((html.match(/id="saveCloud"/g) || []).length, 1);
  assert.match(html, /id="saveCloudText">暂无待上传</);
  assert.match(html, /document\.getElementById\('saveCloud'\)\.addEventListener\('click', requestCloudSaveFromHome\)/);
  assert.match(html, /openManagerDialog\(\{ uploadAfterAuth: true, authMessage:/);
  assert.match(html, /if \(uploadAfterAuth\)[\s\S]*?await saveWorkingDataToCloud\(\)/);

  const closeManagerSource = html.match(/function closeManagerDialog\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(closeManagerSource, /if \(state\.formDirty\)/);
  assert.match(closeManagerSource, /document\.getElementById\('managerDialog'\)\.close\(\)/);
  assert.doesNotMatch(closeManagerSource, /setManagerDirty\(false\)/);

  const clean = api.cloudSaveButtonView(false, false);
  const pending = api.cloudSaveButtonView(true, false);
  const busy = api.cloudSaveButtonView(true, true);
  assert.equal(clean.disabled, true);
  assert.equal(clean.label, '暂无待上传');
  assert.equal(pending.disabled, false);
  assert.equal(pending.label, '立即上传云端');
  assert.equal(busy.disabled, true);
  assert.equal(busy.label, '正在上传…');

  assert.match(css, /\.nav-cloud-save\.has-pending:not\(:disabled\)/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*?\.nav-manage, \.nav-cloud-save \{ width: 36px/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.nav-manage, \.nav-cloud-save \{ width: 33px/);
});

test('footer description is direct and functional rather than promotional', () => {
  assert.match(html, /昆明理工大学呈贡校区研究生课表，集中查看当前课程、每周安排和校历节点，并支持多设备同步。/);
  assert.doesNotMatch(html, /抬眼看时间|真正重要的事/);
});

test('course editor groups class periods and explains week-and-teacher ranges clearly', () => {
  assert.match(html, />上课周次与教师</);
  assert.match(html, /一行表示哪些周由哪位教师上课；如果整门课都是同一位教师，只填一行。/);
  assert.match(html, /data-week-start/);
  assert.match(html, /data-week-end/);
  assert.match(html, /data-date-hint/);
  assert.match(html, /\{ label: '上午', slots: \['第1-2节', '第3-5节'\] \}/);
  assert.match(html, /\{ label: '下午', slots: \['第6-8节', '第9-10节', '第11节'\] \}/);
  assert.match(html, /\{ label: '晚上', slots: \['第12-13节'\] \}/);
  assert.match(html, /<optgroup label="' \+ group\.label \+ '">/);
  assert.match(html, /normalizeSegmentWeekRange\(select\.closest\('\.segment-row'\)/);
  assert.match(css, /#courseEditorEmpty\[hidden\], #courseForm\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /\.manager-pane\.editor-pane \{ align-self: start; \}/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.manager-grid \{ grid-template-columns: 1fr; \}/);
});

test('footer expands to four columns and collapses responsively', () => {
  assert.equal((html.match(/class="footer-group"/g) || []).length, 4);
  assert.match(html, /@玉衡山科学院·KANESHIRO/);
  assert.match(html, /<summary>数据与管理<\/summary>/);
  assert.match(html, /<summary>学校链接<\/summary>/);
  assert.match(css, /@media \(min-width: 980px\)[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 979px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('foldable and phone breakpoints avoid narrow side columns', () => {
  assert.match(css, /grid-template-areas:\s*"hero"\s*"today"\s*"week"/);
  assert.match(css, /@media \(min-width: 801px\) and \(max-width: 1159px\)[\s\S]*?"hero today"\s*"week week"/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.week-row \{ grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.week-time br \{ display: none; \}/);
  assert.doesNotMatch(css, /\.dock-item\.dock-manage \{[^}]*background: var\(--kust-red-soft\)/);
  assert.match(css, /\.week-list > \.week-row\.off[\s\S]*?border: 1px dashed/);
  assert.match(css, /\.on-label[\s\S]*?background: var\(--kust-red-soft\)/);
  assert.match(html, /if \(on\) labels\.push\('<span class="on-label">本周上课<\/span>'\)/);
  assert.match(css, /\.week-list \{[\s\S]*?grid-auto-rows: 1fr/);
  assert.match(css, /\.matrix-cell \{[\s\S]*?grid-auto-rows: 1fr/);
  assert.match(css, /\.timeline \{ display: grid; grid-auto-rows: 1fr; \}/);
});

test('desktop left rail keeps today directly below the current status', () => {
  assert.match(html, /<div class="left-rail">\s*<section class="hero"[\s\S]*?<section class="section" id="todaySection"/);
  assert.match(css, /\.left-rail \{ display: contents; \}/);
  assert.match(css, /@media \(min-width: 1160px\)[\s\S]*?grid-template-areas:\s*"left week"/);
  assert.match(css, /@media \(min-width: 1160px\)[\s\S]*?\.left-rail \{[\s\S]*?display: grid;[\s\S]*?align-content: start/);
  assert.match(css, /\.left-rail > \.hero,[\s\S]*?\.left-rail > #todaySection \{ grid-area: auto; \}/);
  assert.doesNotMatch(css, /"hero week"\s*"today week"/);
});

test('mobile more menu keeps every compact-screen function reachable', () => {
  const ids = [
    'openMoreMobile', 'mobileMoreDialog', 'closeMoreMobile', 'moreToday',
    'moreWeek', 'moreCalendar', 'moreManager', 'moreSync', 'moreAbout'
  ];
  for (const id of ids) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length, 1, `${id} should exist exactly once`);
  }
  assert.match(html, /id="openMoreMobile"[^>]*aria-controls="mobileMoreDialog"[^>]*aria-expanded="false"/);
  assert.match(html, /function setupMobileMoreMenu\(\)/);
  assert.match(html, /openButton\.setAttribute\('aria-expanded', 'true'\)/);
  assert.match(html, /openButton\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(html, /document\.getElementById\('moreSync'\)\.addEventListener/);
  assert.match(css, /\.mobile-more-dialog/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*?\.mobile-more-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('mobile more menu opens and closes with synchronized accessibility state', () => {
  class MockElement {
    constructor() {
      this.listeners = {};
      this.attributes = {};
      this.open = false;
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    emit(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    querySelector(selector) { return this.children[selector]; }
    setPointerCapture() {}
    scrollIntoView() {}
  }

  const ids = Object.fromEntries([
    'openMoreMobile', 'mobileMoreDialog', 'closeMoreMobile', 'moreToday', 'moreWeek',
    'moreCalendar', 'moreManager', 'moreSync', 'moreAbout', 'todaySection', 'weekSection'
  ].map((id) => [id, new MockElement()]));
  const sheet = new MockElement();
  const handle = new MockElement();
  ids.mobileMoreDialog.children = { '.mobile-more-sheet': sheet, '.mobile-more-handle': handle };
  const calendar = new MockElement();
  const footer = new MockElement();

  context.document = {
    getElementById: (id) => ids[id],
    querySelector: (selector) => selector === '.calendar-card' ? calendar : footer
  };
  context.window = {
    requestAnimationFrame: (callback) => callback(),
    matchMedia: () => ({ matches: false, addEventListener() {} })
  };

  api.setupMobileMoreMenu();
  ids.openMoreMobile.emit('click');
  assert.equal(ids.mobileMoreDialog.open, true);
  assert.equal(ids.openMoreMobile.attributes['aria-expanded'], 'true');

  ids.closeMoreMobile.emit('click');
  assert.equal(ids.mobileMoreDialog.open, false);
  assert.equal(ids.openMoreMobile.attributes['aria-expanded'], 'false');
});

test('manager password is numeric, hidden by default and optionally remembered', () => {
  assert.match(html, /请输入管理员密码，密码为数字构成，忘记密码请联系金城中月管理员/);
  assert.match(html, /id="adminPassword"[^>]*type="password"[^>]*inputmode="numeric"[^>]*pattern="\[0-9\]\*"[^>]*placeholder="请输入管理员密码"/);
  assert.match(html, /id="showAdminPassword"[^>]*type="checkbox"/);
  assert.match(html, /id="rememberAdminPassword"[^>]*type="checkbox"/);
  assert.match(html, /showAdminPassword[\s\S]*?password\.type = event\.target\.checked \? 'text' : 'password'/);
  assert.match(html, /\/\^\\d\+\$\//);
  assert.match(html, /localStorage\.setItem\(REMEMBERED_SECRET_KEY, value\)/);
  assert.match(html, /localStorage\.removeItem\(REMEMBERED_SECRET_KEY\)/);
  assert.match(html, /async function verifyAdminSecret\(secret\)/);
  assert.match(html, /SYNC_ENDPOINT \+ '\/api\/auth\/verify'/);
  assert.match(html, /unlockManager'\)\.addEventListener\('click', async function/);
  assert.match(html, /response\.status === 401[\s\S]*?clearRememberedSecret\(\)/);
});

test('modification sync status uses the latest page or schedule change in China time', () => {
  assert.match(html, /const SITE_UPDATED_AT = '2026-08-30T21:30:26\+08:00'/);
  assert.match(html, /function latestModifiedAt\(scheduleUpdatedAt\)/);
  assert.match(html, /getUTC(?:Month|Date|Hours|Minutes)/);
  assert.match(html, /修改同步时间/);
  assert.doesNotMatch(html, /'已同步' \+ \(time/);
});

test('China time formatting and remembered-secret storage behave deterministically', () => {
  assert.equal(api.formatUpdatedAt('2026-08-30T08:00:00.000Z'), '16:00');
  assert.equal(api.formatUpdatedDateTime('2026-08-30T08:00:00.000Z'), '2026年8月30日 16:00');
  assert.equal(api.formatUpdatedAt(api.latestModifiedAt(null)), '21:30');
  assert.equal(api.latestModifiedAt('2026-08-31T00:00:00.000Z'), '2026-08-31T00:00:00.000Z');

  const remembered = new Map();
  context.localStorage = {
    getItem: (key) => remembered.get(key) || null,
    setItem: (key, value) => remembered.set(key, value),
    removeItem: (key) => remembered.delete(key)
  };
  api.setRememberedSecret('24680');
  assert.equal(api.getRememberedSecret(), '24680');
  api.clearRememberedSecret();
  assert.equal(api.getRememberedSecret(), '');
});

test('main clock uses a modern sans-serif tabular style', () => {
  assert.match(css, /\.clock \{[\s\S]*?font-family: "SF Pro Display", "Segoe UI Variable Display"[\s\S]*?font-weight: 700[\s\S]*?font-variant-numeric: tabular-nums/);
  assert.match(css, /\.clock-seconds \{[\s\S]*?background: var\(--kust-red-soft\)/);
  assert.doesNotMatch(css, /\.clock \{[^}]*Georgia/);
});

test('admin secret persistence is explicit and revision conflicts remain recoverable', () => {
  assert.match(html, /sessionStorage\.setItem\(SECRET_KEY/);
  assert.match(html, /const REMEMBERED_SECRET_KEY/);
  assert.match(html, /baseRevision: state\.revision/);
  assert.match(html, /response\.status === 409/);
  assert.match(html, /id="reloadCloud"/);
  assert.match(html, /function setupFooterDisclosure\(\)/);
  assert.match(html, /window\.setInterval\(function \(\) \{ loadCloudSchedule\(\); \}, SYNC_INTERVAL_MS\)/);
  assert.match(html, /function renderWeekMatrix\(now\)/);
  assert.match(html, /state\.workingData = stageCourseDelete\(state\.workingData, index\)/);
  assert.match(html, /state\.workingData = stageCourseUpsert\(state\.workingData, course, state\.editingIndex\)/);
  assert.match(html, /if \(!state\.managerDirty && !state\.formDirty\) return/);
  assert.match(html, /暂无待上传/);
  assert.match(html, /重新载入会放弃当前未保存的修改/);
  assert.match(html, /课程“' \+ course\['课程'\] \+ '”已从待上传列表删除/);
  assert.match(html, /editingCourse \? '课程修改已暂存/);
});
