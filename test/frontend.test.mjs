import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'kust-lab-v2.css'), 'utf8');
const weatherWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'weather-snapshot.yml'), 'utf8');
const weatherUpdateScript = fs.readFileSync(path.join(root, 'scripts', 'update-weather-snapshot.mjs'), 'utf8');
const weatherSnapshot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'weather.json'), 'utf8'));
const scriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);

assert.ok(scriptMatch, 'inline application script should exist');

const exposedNames = [
  'RAW_DATA', 'FALLBACK_DATA', 'DAYS_FULL', 'SLOT_TIMES', 'state', 'COURSES',
  'dayPartForMinutes',
  'teachingWeek', 'academicPhase', 'dateForWeekDay', 'dayIndex', 'isActive',
  'scheduleTermForDate',
  'courseSelectionStatus', 'isPersonalCourse', 'requiresAttendance',
  'normalizeWeekRange', 'weekDateRangeLabel', 'segmentDateHint', 'weekRangeValue', 'weekOptions',
  'isMentorCourseName', 'isMentorCourse', 'activeInfo', 'currentStatus', 'renderWeekMatrix', 'validateCoursesInput', 'tripleSlotConflicts',
  'stageCourseUpsert', 'stageCourseDelete', 'rawCourseSubset', 'rawCourseWithoutWeeks', 'weeksLabel',
  'cloudSaveButtonView',
  'weatherKind', 'weatherNumber', 'weatherSummary', 'visibleWeatherHours', 'weatherHourLabel', 'weatherDayLabel',
  'renderWeatherDialog', 'readWeatherCache', 'weatherDataIsStale', 'fetchWeatherData', 'fetchWeatherWithFallback', 'loadWeather', 'setupWeatherDialog', 'openWeatherDialog', 'closeWeatherDialog',
  'setupMobileMoreMenu', 'chinaTimeParts', 'chinaHourStart', 'formatUpdatedAt', 'formatUpdatedDateTime', 'latestModifiedAt',
  'getRememberedSecret', 'setRememberedSecret', 'clearRememberedSecret', 'normalizeNumericSecret'
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
    'managerCourseList', 'managerSearch', 'courseForm', 'saveCloud', 'syncPill',
    'weatherChip', 'weatherIcon', 'weatherPrimary', 'weatherSecondary',
    'weatherDialog', 'weatherShell', 'weatherDialogTitle', 'weatherDialogUpdated', 'refreshWeather', 'closeWeather',
    'weatherDialogTemperature', 'weatherDialogCondition', 'weatherDialogRange', 'weatherDialogIcon', 'weatherMetrics',
    'hourlyWeatherTitle', 'hourlyWeather', 'dailyWeatherTitle', 'dailyWeather', 'weatherDialogStatus'
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

test('course selection marks match the submitted plan without hiding timetable reference rows', () => {
  assert.equal(api.courseSelectionStatus({ name: '数值分析' }), 'selected');
  assert.equal(api.courseSelectionStatus({ name: '专业外语（农水专硕）' }), 'selected');
  assert.equal(api.courseSelectionStatus({ name: '设施农业与装备（专硕）' }), 'selected');
  assert.equal(api.courseSelectionStatus({ name: '生态水文原理及应用（专硕）' }), 'pending-drop');
  assert.equal(api.courseSelectionStatus({ name: '农业水土环境' }), 'pending-drop');
  assert.equal(api.courseSelectionStatus({ name: '土壤微生物学' }), 'unselected');
  assert.equal(api.courseSelectionStatus({ name: '农业面源污染控制工程（农水方向）' }), 'unselected');
  assert.equal(api.courseSelectionStatus({ name: '新增个人课程' }), 'selected', 'newly added personal courses should remain visible as selected by default');
  assert.equal(api.requiresAttendance({ name: '土壤微生物学' }, 2), true, 'every scheduled course is mandatory during experience week');
  assert.equal(api.requiresAttendance({ name: '土壤微生物学' }, 3), false, 'non-selected courses stop entering reminders after experience week');

  const unselectedNames = new Set(api.COURSES.filter((course) => api.courseSelectionStatus(course) === 'unselected').map((course) => course.name));
  assert.deepEqual(Array.from(unselectedNames).sort(), [
    '农业生态与环境工程', '农业生物环境控制工程', '农业面源污染控制工程（农水方向）',
    '农业面源污染控制工程（农生方向）', '农林废弃物处理工程', '土壤农化分析',
    '土壤微生物学', '土壤水分溶质动力学', '地理信息系统'
  ].sort());
  assert.equal(api.COURSES.some((course) => course.name === '农业水土环境'), false, 'the current 37 meetings do not contain this pending-drop course');
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
  assert.match(html, /scheduleTermForDate\(now\) \+ ' · 仅已选与待退选课程参与上课提醒'/);
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

test('experience week requires every scheduled class, then personal filtering starts in week three', () => {
  const experienceOnly = api.currentStatus(localDate(2026, 9, 6, 10, 30));
  assert.equal(experienceOnly.type, 'active');
  assert.equal(experienceOnly.course, '农业面源污染控制工程（农生方向）');
  assert.equal(experienceOnly.experience, true);

  const experienceAfternoon = api.currentStatus(localDate(2026, 8, 31, 14, 0));
  assert.equal(experienceAfternoon.type, 'active');
  assert.equal(experienceAfternoon.course, '农业生态与环境工程');
  assert.equal(experienceAfternoon.experience, true);

  const nonSelectedAfterExperience = api.currentStatus(localDate(2026, 9, 13, 10, 30));
  assert.equal(nonSelectedAfterExperience.type, 'free');
  assert.equal(nonSelectedAfterExperience.course, '今天没有课程安排');

  const afterPersonalClasses = api.currentStatus(localDate(2026, 9, 7, 14, 0));
  assert.equal(afterPersonalClasses.type, 'finished');
  assert.notEqual(afterPersonalClasses.course, '农业生态与环境工程');

  const pendingDrop = api.currentStatus(localDate(2026, 9, 8, 16, 30));
  assert.equal(pendingDrop.type, 'active');
  assert.equal(pendingDrop.course, '生态水文原理及应用（专硕）');
  assert.equal(api.courseSelectionStatus({ name: pendingDrop.course }), 'pending-drop');
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
  const otherTeacherMeeting = api.COURSES.find((course) => course.name === '设施农业与装备（专硕）' && course.dayLabel === '星期一');
  assert.ok(mentorMeeting);
  assert.ok(otherTeacherMeeting);
  assert.equal(api.isMentorCourse(mentorMeeting, 4), false);
  assert.equal(api.isMentorCourse(mentorMeeting, 5), true);
  assert.equal(api.isMentorCourse(mentorMeeting, 10), true);
  assert.equal(api.isMentorCourse(mentorMeeting, 11), false);
  assert.equal(api.isMentorCourse(otherTeacherMeeting, 11), true, 'mentor course name remains protected with another segment teacher');
  assert.equal(api.isMentorCourseName('农业节水与供水工程'), true);
  assert.equal(api.isMentorCourseName('普通课程'), false);

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
  assert.match(matrix.innerHTML, /非选课 · 无需上课/);
  assert.match(matrix.innerHTML, /待退选 · 请确认/);
  assert.match(matrix.innerHTML, /本周上课/);
  assert.match(matrix.innerHTML, /此时间段无课/);
  assert.match(matrix.innerHTML, />上午</);
  assert.match(matrix.innerHTML, />下午</);
  assert.match(matrix.innerHTML, />晚上</);
  assert.match(matrix.innerHTML, /16:10—17:45/);
  assert.match(css, /\.matrix-card\.is-unselected/);
  assert.match(css, /\.week-list > \.week-row\.is-pending-drop/);

  api.state.viewWeek = 2;
  api.renderWeekMatrix(localDate(2026, 8, 31, 14, 0));
  assert.match(matrix.innerHTML, /体验课 · 必须参加/);
  assert.match(matrix.innerHTML, /class="matrix-card[^"\n]*is-unselected[^"\n]*is-experience/);
  assert.match(css, /\.matrix-card\.is-experience\.is-unselected/);
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
  const parallel = api.validateCoursesInput([good[0], { ...good[0], '课程': '另一门课程' }]);
  assert.equal(parallel.length, 2, 'two different courses may share one period');
  assert.equal(api.tripleSlotConflicts(parallel).length, 0);
  assert.equal(api.tripleSlotConflicts(parallel.concat({ ...good[0], '课程': '第三门课程' })).length, 3);
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

test('scoped edits split selected and remaining weeks without losing teachers', () => {
  const source = {
    '星期': '星期二', '节次': '第3-5节', '时间': '09:50-12:15', '课程': '分段测试课',
    '授课分段': [{ '周次': '2-5', '教师': '教师甲' }, { '周次': '6-9', '教师': '教师乙' }], '教室': ['公教楼101']
  };
  const selected = api.rawCourseSubset(source, [4, 6, 8]);
  const remaining = api.rawCourseWithoutWeeks(source, [4, 6, 8]);
  assert.equal(selected['授课分段'].length, 3);
  assert.equal(selected['授课分段'][0]['周次'], '4');
  assert.equal(selected['授课分段'][1]['教师'], '教师乙');
  assert.equal(remaining['授课分段'].some((part) => part['周次'] === '2-3'), true);
  assert.equal(api.weeksLabel([4, 6, 8]), '第4周、第6周、第8周');
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

test('login gate, card actions and cloud recycle bin are available on every layout', () => {
  assert.match(html, /<body class="app-locked">/);
  assert.match(html, /id="loginAccount" value="KANESHIRO"/);
  assert.match(html, /id="loginPassword" type="password" inputmode="numeric"/);
  assert.match(html, /id="rememberLogin"/);
  assert.match(html, /data-course-action="edit"/);
  assert.match(html, /data-course-action="replace"/);
  assert.match(html, /data-course-action="parallel"/);
  assert.match(html, /data-course-action="delete"/);
  assert.match(html, /id="trashDialog"/);
  assert.match(html, /trash: state\.workingTrash/);
  assert.match(html, /mentorCourseNames: state\.mentorCourseNames/);
  assert.match(html, /第5周起清理非本人课程/);
  assert.doesNotMatch(html, /enterOfflineAfterLoginFailure|离线进入/);
  assert.match(html, /'Content-Type': 'text\/plain;charset=UTF-8'/);
  assert.match(html, /method: 'POST'[\s\S]*?auth: secret/);
  assert.equal(api.normalizeNumericSecret(' １１４ ５１４ '), '114514');
  assert.match(html, /window\.addEventListener\('online'/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*?\.tool-dialog \{ width: 100vw/);
});

test('course cards open details before mutually exclusive management and scope steps', () => {
  for (const id of ['courseDetailView', 'courseManageView', 'courseScopeView', 'courseActionBack', 'beginCourseManage', 'applyCourseAction']) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length, 1, `${id} should exist exactly once`);
  }
  assert.match(html, /id="courseDetailView"/);
  assert.match(html, /id="courseManageView" hidden/);
  assert.match(html, /id="courseScopeView" hidden/);
  assert.match(html, /id="detailTeacher"/);
  assert.match(html, /id="detailRoom"/);
  assert.match(html, /id="detailSegments"/);
  assert.match(html, /id="detailMentor" hidden/);
  assert.match(html, /function setCourseActionStep\(step\)[\s\S]*?courseDetailView[\s\S]*?courseManageView[\s\S]*?courseScopeView/);
  assert.match(html, /beginCourseManage[\s\S]*?setCourseActionStep\('manage'\)/);
  assert.match(html, /function chooseCourseAction\(action\)[\s\S]*?setCourseActionStep\('scope'\)/);
  assert.match(html, /applyCourseAction[\s\S]*?applyPendingCourseAction/);
  assert.match(css, /\.course-action-view\[hidden\],[^\{]*\.scope-range\[hidden\],[^\{]*\.scope-weeks\[hidden\][^\{]*\{ display: none !important; \}/);
  assert.match(css, /\.tool-sheet::\-webkit-scrollbar \{ width: 5px; \}/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*?\.tool-sheet \{[^}]*scrollbar-width: none;[^}]*\}[\s\S]*?\.tool-sheet::\-webkit-scrollbar \{ display: none; \}/);
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
  const version = html.match(/const SITE_VERSION = '([^']+)'/);
  assert.ok(version, 'site version constant should exist');
  assert.match(version[1], /^\d+\.\d+$/);
  assert.match(html, new RegExp('id="footerVersion">' + version[1].replace('.', '\\.') + '<'));
  assert.match(html, /getElementById\('footerVersion'\)\.textContent = SITE_VERSION/);
  assert.match(html, /<summary>数据与管理<\/summary>/);
  assert.match(html, /<summary>学校链接<\/summary>/);
  assert.match(css, /@media \(min-width: 980px\)[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 979px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('weather is readable, cached locally and refreshed automatically or on demand', async () => {
  assert.match(html, /const WEATHER_REFRESH_MS = 60 \* 60 \* 1000/);
  assert.match(html, /const WEATHER_SNAPSHOT_URL = 'data\/weather\.json'/);
  assert.equal(api.weatherKind('晴'), 'sun');
  assert.equal(api.weatherKind('多云'), 'cloud');
  assert.equal(api.weatherKind('雷阵雨'), 'storm');
  assert.equal(api.weatherKind('小雨'), 'rain');
  assert.equal(api.weatherKind('雾'), 'fog');
  assert.equal(api.weatherNumber(null), null);
  assert.equal(api.weatherNumber(''), null);

  const cachedData = {
    source: '百度地图天气',
    location: '呈贡区',
    observedAt: '2026-08-30T22:25:00+08:00',
    current: {
      condition: '多云', temperature: 17, feelsLike: 16, humidity: 73,
      windDirection: '东南风', windLevel: '2级', precipitation: 0, visibility: 18000, airQualityIndex: 35
    },
    today: { high: 22, low: 14 },
    hourly: [
      { time: '2026-08-31T00:00:00+08:00', condition: '小雨', temperature: 16, precipitationProbability: 55 },
      { time: '2026-08-30T22:00:00+08:00', condition: '多云', temperature: 16 },
      { time: '2026-08-30T23:00:00+08:00', condition: '多云', temperature: 17, precipitationProbability: 10 },
      { time: '2026-08-30T23:00:00+08:00', condition: '重复数据', temperature: 99 }
    ],
    daily: [
      { date: '2026-08-30', high: 22, low: 14, conditionDay: '多云', conditionNight: '小雨' },
      { date: '2026-08-31', high: 21, low: 13, conditionDay: '小雨', conditionNight: '小雨' }
    ]
  };
  const summary = api.weatherSummary(cachedData);
  assert.equal(summary.primary, '呈贡 17° · 多云');
  assert.equal(summary.secondary, '体感 16° · 今日 14—22°');
  assert.equal(summary.temperature, '17°');
  assert.equal(summary.condition, '多云');

  const weatherNow = new Date('2026-08-30T23:30:00+08:00');
  const visibleHours = api.visibleWeatherHours(cachedData.hourly, weatherNow);
  assert.equal(visibleHours.length, 2);
  assert.equal(visibleHours[0].time, '2026-08-30T23:00:00+08:00');
  assert.equal(visibleHours[0].condition, '多云', 'duplicate hours should keep the first chronologically sorted result');
  assert.equal(api.weatherHourLabel(visibleHours[0].time, 0, weatherNow), '现在');
  assert.equal(api.weatherHourLabel(visibleHours[1].time, 1, weatherNow), '明天 00:00');
  assert.equal(api.weatherHourLabel('2026-08-31T01:00:00+08:00', 0, weatherNow), '明天 01:00');
  assert.equal(api.chinaHourStart('2026-08-30T23:30:00+08:00'), Date.parse('2026-08-30T15:00:00Z'));
  assert.equal(api.chinaTimeParts('2026-08-30T15:30:00Z').hour, 23, 'weather labels should use China time even for a UTC timestamp');
  const afterMidnight = new Date('2026-08-31T00:05:00+08:00');
  const midnightHours = api.visibleWeatherHours(cachedData.hourly, afterMidnight);
  assert.equal(midnightHours.length, 1, 'the previous day 23:00 must disappear after midnight');
  assert.equal(midnightHours[0].time, '2026-08-31T00:00:00+08:00');
  assert.equal(api.weatherHourLabel(midnightHours[0].time, 0, afterMidnight), '现在');
  assert.equal(api.weatherDayLabel('2026-08-30', weatherNow), '今天');
  assert.equal(api.weatherDayLabel('2026-08-31', weatherNow), '明天');

  class WeatherElement {
    constructor() {
      this.className = '';
      this.attributes = {};
      this.textContent = '';
      this.innerHTML = '';
      this.listeners = {};
      this.open = false;
      this.disabled = false;
      this.classList = {
        add: (name) => { if (!this.className.includes(name)) this.className += ' ' + name; },
        remove: (name) => { this.className = this.className.replace(name, '').trim(); }
      };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    emit(type, event = {}) {
      for (const handler of this.listeners[type] || []) handler({ target: this, preventDefault() {}, ...event });
    }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }

  const elements = Object.fromEntries([
    'weatherChip', 'weatherIcon', 'weatherPrimary', 'weatherSecondary',
    'weatherDialog', 'weatherShell', 'weatherDialogUpdated', 'refreshWeather', 'closeWeather',
    'weatherDialogTemperature', 'weatherDialogCondition', 'weatherDialogRange', 'weatherDialogIcon',
    'weatherMetrics', 'hourlyWeather', 'dailyWeather', 'weatherDialogStatus'
  ].map((id) => [id, new WeatherElement()]));
  const storage = new Map();
  storage.set('kust-lab-weather-cache-v1', JSON.stringify({
    schemaVersion: 1,
    savedAt: Date.now(),
    data: cachedData
  }));
  context.document = { getElementById: (id) => elements[id] || null };
  context.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  };
  context.window = { setTimeout, clearTimeout };
  context.AbortController = AbortController;
  const fetchCalls = [];
  context.fetch = async (url) => {
    fetchCalls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          ...cachedData,
          current: { condition: '晴', temperature: 19, feelsLike: 18 }
        }
      })
    };
  };

  assert.equal(await api.loadWeather(), true);
  assert.equal(fetchCalls.length, 0, 'fresh local cache should render without another request');
  assert.equal(elements.weatherPrimary.textContent, '17°');
  assert.equal(elements.weatherSecondary.textContent, '多云');
  assert.equal(elements.weatherDialogTemperature.textContent, '17°');
  assert.match(elements.weatherMetrics.innerHTML, /相对湿度/);

  assert.equal(await api.loadWeather({ force: true }), true);
  assert.equal(fetchCalls.length, 1, 'click-to-refresh should bypass the fresh-cache shortcut');
  assert.match(fetchCalls[0], /^data\/weather\.json\?v=\d+$/, 'mobile refresh should use the same-origin snapshot first');
  assert.equal(elements.weatherPrimary.textContent, '19°');
  assert.equal(elements.weatherSecondary.textContent, '晴');
  assert.match(storage.get('kust-lab-weather-cache-v1'), /\"temperature\":19/);

  context.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).startsWith('data/weather.json')) return { ok: false, json: async () => null };
    return { ok: true, json: async () => ({ ok: true, data: cachedData }) };
  };
  assert.equal(await api.loadWeather({ force: true }), true);
  assert.match(fetchCalls.at(-2), /^data\/weather\.json\?v=/);
  assert.match(fetchCalls.at(-1), /workers\.dev\/api\/weather$/, 'Worker should remain a fallback when the same-origin snapshot is unavailable');

  api.state.weatherBusy = true;
  api.state.weatherData = {
    ...cachedData,
    hourly: [{ time: new Date().toISOString(), condition: '晴', temperature: 19 }]
  };
  api.setupWeatherDialog();
  elements.weatherChip.emit('click');
  assert.equal(elements.weatherDialog.open, true, 'weather chip should open the detail dialog');
  assert.match(elements.hourlyWeather.innerHTML, /hourly-item/);
  assert.match(elements.dailyWeather.innerHTML, /daily-row/);
  elements.closeWeather.emit('click');
  assert.equal(elements.weatherDialog.open, false, 'close button should close the weather dialog');
  elements.weatherDialog.showModal();
  elements.weatherDialog.emit('cancel');
  assert.equal(elements.weatherDialog.open, false, 'Escape/cancel should close the weather dialog');
  api.state.weatherBusy = false;

  assert.match(html, /class="clock-weather-row"[\s\S]*?id="clock"[\s\S]*?id="weatherChip"/);
  assert.match(html, /function setupWeatherDialog\(\)/);
  assert.match(html, /chip\.addEventListener\('click', openWeatherDialog\)/);
  assert.match(html, /refreshButton\.addEventListener\('click',[\s\S]*?loadWeather\(\{ force: true \}\)/);
  assert.match(html, /window\.setInterval\(function \(\) \{\s*if \(!document\.hidden\) loadWeather\(\);\s*\}, WEATHER_REFRESH_MS\)/);
  assert.match(html, /visibilitychange[\s\S]*?if \(!document\.hidden\)[\s\S]*?loadWeather\(\)/);
  assert.match(html, /数据来源：百度地图天气/);
  assert.match(css, /@keyframes weather-(?:sun-spin|cloud-float|rain-fall|storm-flash|fog-drift)/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.weather-dialog \{ width: 100vw; height: 100vh; height: 100dvh/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.weather-current \{ display: block;[\s\S]*?\.weather-current-symbol \{ position: absolute/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.weather-copy small \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.weather-symbol svg[\s\S]*?animation: none !important/);
});

test('same-origin weather snapshot is valid and refreshed hourly without exposing credentials', () => {
  assert.equal(weatherSnapshot.ok, true);
  assert.equal(weatherSnapshot.data.location, '呈贡区');
  assert.equal(weatherSnapshot.data.hourly.length, 24);
  assert.equal(weatherSnapshot.data.daily.length, 7);
  assert.doesNotMatch(JSON.stringify(weatherSnapshot), /(?:api[_-]?key|authorization|bearer|secret)/i);
  assert.match(weatherWorkflow, /cron: "12 \* \* \* \*"/);
  assert.match(weatherWorkflow, /permissions:[\s\S]*?contents: write/);
  assert.match(weatherWorkflow, /node scripts\/update-weather-snapshot\.mjs/);
  assert.match(weatherWorkflow, /git add data\/weather\.json[\s\S]*?git push/);
  assert.match(weatherUpdateScript, /AbortSignal\.timeout\(20000\)/);
  assert.match(weatherUpdateScript, /attempt <= 3/);
  assert.match(weatherUpdateScript, /data\.hourly\.length < 1/);
});

test('foldable and phone breakpoints avoid narrow side columns', () => {
  assert.match(css, /grid-template-areas:\s*"hero"\s*"today"\s*"week"/);
  assert.match(css, /@media \(min-width: 801px\) and \(max-width: 1159px\)[\s\S]*?"hero today"\s*"week week"/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.week-row \{ grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.week-time br \{ display: none; \}/);
  assert.doesNotMatch(css, /\.dock-item\.dock-manage \{[^}]*background: var\(--kust-red-soft\)/);
  assert.match(css, /\.week-list > \.week-row\.off[\s\S]*?border: 1px dashed/);
  assert.match(css, /\.on-label[\s\S]*?background: var\(--kust-red-soft\)/);
  assert.match(html, /if \(on && !experienceCourse && selection !== 'unselected'\) labels\.push\('<span class="on-label">本周上课<\/span>'\)/);
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

test('login school mark keeps its wide official proportion and scales across phone and desktop', () => {
  assert.match(css, /\.login-brand \.brand-logo \{[^}]*width: clamp\(104px,25vw,132px\);[^}]*height: auto;[^}]*aspect-ratio: 311 \/ 72;/);
  assert.doesNotMatch(css, /\.login-brand \.brand-logo \{[^}]*width: 48px;[^}]*height: 48px;/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.login-brand \.brand-logo \{[^}]*width: clamp\(92px,28vw,104px\);/);
  assert.match(css, /\.login-brand > span:last-child \{ min-width: 0; \}/);
});

test('modification sync status uses the latest page or schedule change in China time', () => {
  assert.match(html, /const SITE_UPDATED_AT = '2026-08-31T\d{2}:\d{2}:\d{2}\+08:00'/);
  assert.match(html, /function latestModifiedAt\(scheduleUpdatedAt\)/);
  assert.match(html, /getUTC(?:Month|Date|Hours|Minutes)/);
  assert.match(html, /修改同步时间/);
  assert.doesNotMatch(html, /'已同步' \+ \(time/);
});

test('China time formatting and remembered-secret storage behave deterministically', () => {
  assert.equal(api.formatUpdatedAt('2026-08-30T08:00:00.000Z'), '16:00');
  assert.equal(api.formatUpdatedDateTime('2026-08-30T08:00:00.000Z'), '2026年8月30日 16:00');
  const siteUpdatedAt = html.match(/const SITE_UPDATED_AT = '([^']+)'/)[1];
  assert.equal(api.latestModifiedAt(null), siteUpdatedAt);
  assert.equal(api.formatUpdatedAt(api.latestModifiedAt(null)), api.formatUpdatedAt(siteUpdatedAt));
  assert.equal(api.latestModifiedAt('2026-09-01T00:00:00.000Z'), '2026-09-01T00:00:00.000Z');

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
