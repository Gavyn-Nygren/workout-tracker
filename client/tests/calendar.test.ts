// Calendar rules (spec 2.5, roadmap G3.7), through the real code: the three plan types, several
// plans and workouts on one day, the missed-workout push forward and its undo, completion-date
// attribution, weekly streaks with partial workouts, and week-start and time-zone handling.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { addDays, daysBetween, fromISODate, isoWeekday, startOfWeek, toISODate } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { defaultPreferences } from '../src/data/preferences';
import { deriveStreak } from '../src/data/progress';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import { fixedFromPattern, originalDateFor, planShiftFor, scheduledWorkoutIds, scheduleOccurrences, shiftedDate, workoutsOn } from '../src/data/schedule';
import type { Goal, ISODate, LoggedSet, Plan, PlanSchedule, PlanShift, PlanWorkout, ScheduledOccurrence, Weekday, WorkoutSession } from '../src/data/types';
import { nextWorkout } from '../src/features/plans/position';
import { buildAgenda, latestMissed, type DayItem } from '../src/features/today/agenda';
import { askingMessage, askingTitle, missedBannerState, pushedMessage, undoneMessage, type MissedBannerState } from '../src/features/today/missed';
import { sessionForReopen } from '../src/features/workout/buildSession';
import { cycle } from './support/cycles';
import { openTestDatabase } from './support/nodeSqlite';

// ---------------------------------------------------------------------------
// Fixtures

/** Day `n` of the test calendar: day(0) is Monday 2026-10-19, day(2) Wednesday, day(7) the next Monday. */
const day = (n: number): ISODate => addDays('2026-10-19', n);
const STAMP = '2026-10-19T08:00:00.000Z';

const planWorkout = (id: string, reps = 5): PlanWorkout => ({
  id,
  name: `Workout ${id.toUpperCase()}`,
  blocks: [{ id: `b_${id}`, type: 'single', exercises: [{ id: `pe_${id}`, exerciseId: 'ex_back_squat', sets: [{ kind: 'normal', modifiers: [], targetReps: reps }] }] }],
});

function makePlan(id: string, schedule: PlanSchedule, extra: Partial<Plan> = {}): Plan {
  return {
    id,
    name: `Plan ${id}`,
    version: 1,
    status: 'active',
    startDate: day(0),
    schedule,
    workouts: [...scheduledWorkoutIds(schedule)].map((w) => planWorkout(w)),
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

const weeklyDays = (days: [Weekday, string[]][]): PlanSchedule => ({ type: 'weekly', days: days.map(([weekday, workoutIds]) => ({ weekday, workoutIds })) });

/** Weekly: A on Monday, B Wednesday, C Friday, D Sunday. */
const weekly = (extra: Partial<Plan> = {}) => makePlan('weekly', weeklyDays([[1, ['a']], [3, ['b']], [5, ['c']], [7, ['d']]]), extra);
/** A 2-week program whose weeks differ: heavy days in week 1, light days in week 2. */
const program = (extra: Partial<Plan> = {}) =>
  makePlan(
    'program',
    {
      type: 'fixed',
      weeks: 2,
      days: [
        { week: 1, weekday: 1, workoutIds: ['h1'] },
        { week: 1, weekday: 3, workoutIds: ['h2'] },
        { week: 1, weekday: 5, workoutIds: ['h3'] },
        { week: 2, weekday: 1, workoutIds: ['l1'] },
        { week: 2, weekday: 3, workoutIds: ['l2'] },
        { week: 2, weekday: 5, workoutIds: ['l3'] },
      ],
    },
    extra,
  );
/** An 8-week Monday/Wednesday/Friday program: long enough to run past the 4 weeks the calendar holds. */
const longProgram = () => makePlan('long', fixedFromPattern(8, { 1: ['x'], 2: [], 3: ['y'], 4: [], 5: ['z'], 6: [], 7: [] }));
/** Rotating: A, B, rest, repeating whatever the weekday. */
const rotating = (extra: Partial<Plan> = {}) => makePlan('rotating', cycle(['a'], ['b'], []), extra);

let db: ReturnType<typeof openTestDatabase>;
let today: ISODate;
let repo: SqliteRepository;

/** A new, empty database with today pinned. */
function fresh(on: ISODate) {
  db = openTestDatabase();
  migrate(db);
  eraseAllData(db);
  today = on;
  repo = createSqliteRepository(db, { today: () => today });
}

/** Moves the clock to another day, as midnight passing would. */
function setToday(on: ISODate) {
  today = on;
  repo.forgetCache();
}

/** Saves plans on Monday, day(0), so their calendars start then, and moves the clock to `on`. */
async function plansSavedMonday(plans: Plan[], on: ISODate) {
  fresh(day(0));
  for (const plan of plans) await repo.savePlan(plan);
  setToday(on);
}

const original = (o: ScheduledOccurrence) => o.shiftedFromDate ?? o.scheduledDate;

const occurrences = async (from: ISODate, to: ISODate, planId?: string) =>
  (await repo.listOccurrences({ from, to })).filter((o) => !planId || o.planId === planId);

/** Every stored occurrence of a plan, from well before to well after today. */
const allOf = (planId: string) => occurrences(day(-60), day(150), planId);

/** A plan's calendar as [date, workout] pairs, by date. */
const dated = async (planId: string, from: ISODate, to: ISODate) =>
  (await occurrences(from, to, planId)).map((o): [ISODate, string] => [o.scheduledDate, o.planWorkoutId]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

/** Where each of a plan's workouts sits: occurrence id → date. */
const positions = async (planId: string) => new Map((await allOf(planId)).map((o) => [o.id, o.scheduledDate]));

async function occurrenceOf(planId: string, originalDate: ISODate, workoutId?: string): Promise<ScheduledOccurrence> {
  const found = (await allOf(planId)).find((o) => original(o) === originalDate && (!workoutId || o.planWorkoutId === workoutId));
  assert.ok(found, `${planId} has a workout originally on ${originalDate}`);
  return found;
}

/** What Today shows, built the way the app builds it. */
async function agenda() {
  const [occ, sessions, plans, planVersions] = await Promise.all([
    repo.listOccurrences({ from: addDays(today, -21), to: addDays(today, SCHEDULE_AHEAD_DAYS) }),
    repo.listSessions(),
    repo.listPlans(),
    repo.listPlanVersions(),
  ]);
  return buildAgenda({ occurrences: occ, sessions, plans, planVersions, today });
}
const itemsOn = async (date: ISODate) => ((await agenda()).get(date) ?? []).slice().sort((a, b) => a.key.localeCompare(b.key));

/** What the Today banner's "Push plan forward" does: pushes the latest missed workout. */
async function pushLatestMissed(shiftId: string): Promise<DayItem & { occurrence: ScheduledOccurrence }> {
  const missed = latestMissed(await agenda(), today);
  assert.ok(missed?.occurrence, 'a missed workout is offered');
  await repo.pushPlanForward(missed.occurrence.id, shiftId);
  return { ...missed, occurrence: missed.occurrence };
}

/**
 * The calendar for the next 4 weeks holds exactly what the plan and its pushes say (each workout
 * once), apart from started workouts, which stay where they were done.
 */
async function assertCalendarFollowsPushes(planId: string) {
  const plan = await repo.getPlan(planId);
  assert.ok(plan);
  const to = addDays(today, SCHEDULE_AHEAD_DAYS);
  const all = await allOf(planId);
  const started = new Set(all.filter((o) => o.sessionId).map((o) => o.id));
  const stored = all.filter((o) => !o.sessionId && o.scheduledDate >= today && o.scheduledDate <= to).map((o) => `${o.scheduledDate} ${o.id}`);
  const expected = scheduleOccurrences(plan, today, to, await repo.listPlanShifts()).filter((o) => !started.has(o.id)).map((o) => `${o.scheduledDate} ${o.id}`);
  assert.deepEqual(stored.sort(), expected.sort(), `the calendar from ${today} follows the plan and its pushes`);
}

/**
 * The 7 days from `start` hold exactly the plan's usual pattern: every workout on its own day,
 * under its own id, and nothing pushed in or out (a weekly push stays within its week).
 */
async function assertUsualWeek(planId: string, start: ISODate) {
  const plan = await repo.getPlan(planId);
  assert.ok(plan);
  const end = addDays(start, 6);
  const usual = scheduleOccurrences(plan, start, end).map((o) => `${o.scheduledDate} ${o.id}`);
  const stored = (await occurrences(start, end, planId)).map((o) => `${o.scheduledDate} ${o.id}${o.shiftedFromDate ? ` (from ${o.shiftedFromDate})` : ''}`);
  assert.ok(usual.length > 0, `the plan has workouts in the week from ${start}`);
  assert.deepEqual(stored.sort(), usual.sort(), `the week from ${start} is exactly as usual`);
}

// Sessions

const at = (date: ISODate, time = '15:00') => `${date}T${time}:00.000Z`;

const doneSet = (id: string, date: ISODate, patch: Partial<LoggedSet> = {}): LoggedSet => ({
  id,
  kind: 'normal',
  modifiers: [],
  reps: 5,
  loadKg: 100,
  completedAt: at(date),
  ...patch,
});

/** A workout finished on `date`, for a scheduled occurrence or on its own. */
function finished(
  id: string,
  date: ISODate,
  occurrence?: ScheduledOccurrence,
  options: { sets?: LoggedSet[]; completion?: 'full' | 'partial'; skippedExercise?: boolean; time?: string } = {},
): WorkoutSession {
  return {
    id,
    name: occurrence ? `Workout ${occurrence.planWorkoutId.toUpperCase()}` : 'Extra workout',
    occurrenceId: occurrence?.id,
    planId: occurrence?.planId,
    planWorkoutId: occurrence?.planWorkoutId,
    status: 'completed',
    completion: options.completion ?? 'full',
    scheduledDate: occurrence?.scheduledDate,
    startedAt: at(date, '14:00'),
    completedAt: at(date, options.time ?? '15:00'),
    completedDate: date,
    blocks: [
      {
        id: `${id}_block`,
        type: 'single',
        exercises: [{ id: `${id}_entry`, exerciseId: 'ex_back_squat', skipped: options.skippedExercise ?? false, sets: options.sets ?? [doneSet(`${id}_set`, date)] }],
      },
    ],
    createdAt: at(date, '14:00'),
    updatedAt: at(date, '15:00'),
  };
}

/** A workout started ("Start" or "Start early") and not finished. */
const started = (id: string, date: ISODate, occurrence: ScheduledOccurrence): WorkoutSession => ({
  ...finished(id, date, occurrence, { sets: [] }),
  status: 'in_progress',
  completion: undefined,
  completedAt: undefined,
  completedDate: undefined,
});

/** A scheduled workout skipped from its card's menu. */
const skipped = (id: string, occurrence: ScheduledOccurrence): WorkoutSession => ({ ...started(id, occurrence.scheduledDate, occurrence), status: 'skipped', startedAt: undefined });

// Set before every test week: a week's weekly goal is the one that existed when the week ended.
const GOAL_STAMP = '2026-09-01T08:00:00.000Z';
const frequencyGoal = (workoutsPerWeek: number): Goal => ({ id: 'goal_weekly', type: 'frequency', title: 'Train every week', workoutsPerWeek, createdAt: GOAL_STAMP, updatedAt: GOAL_STAMP });
const weekStartingOn = (weekStartsOn: Weekday) => repo.savePreferences({ ...defaultPreferences, weekStartsOn });

/** Runs `task` with the process in another time zone. */
const systemZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
function inZone<T>(zone: string, task: () => T): T {
  process.env.TZ = zone;
  try {
    return task();
  } finally {
    process.env.TZ = systemZone;
  }
}

// ---------------------------------------------------------------------------

describe('the three plan types', () => {
  beforeEach(() => fresh(day(0)));

  test('weekly plans repeat on their weekdays, from their start date', async () => {
    const plan = weekly({ startDate: day(2) });
    assert.deepEqual(
      scheduleOccurrences(plan, day(0), day(20)).map((o): [ISODate, string] => [o.scheduledDate, o.planWorkoutId]),
      [[day(2), 'b'], [day(4), 'c'], [day(6), 'd'], [day(7), 'a'], [day(9), 'b'], [day(11), 'c'], [day(13), 'd'], [day(14), 'a'], [day(16), 'b'], [day(18), 'c'], [day(20), 'd']],
    );
    // Through the database: 4 weeks ahead, every workout on its own weekday.
    await repo.savePlan(weekly());
    const stored = await occurrences(day(0), day(SCHEDULE_AHEAD_DAYS), 'weekly');
    const weekdayOf: Record<string, Weekday> = { a: 1, b: 3, c: 5, d: 7 };
    assert.equal(stored.length, 17, '4 workouts a week for 4 weeks, plus the Monday 28 days ahead');
    for (const o of stored) assert.equal(isoWeekday(o.scheduledDate), weekdayOf[o.planWorkoutId], `${o.planWorkoutId} on ${o.scheduledDate}`);
  });

  test('a weekday can hold two workouts', () => {
    const plan = makePlan('twice', weeklyDays([[2, ['am', 'pm']]]));
    assert.deepEqual(
      scheduleOccurrences(plan, day(0), day(8)).map((o) => `${o.scheduledDate} ${o.planWorkoutId}`),
      [`${day(1)} am`, `${day(1)} pm`, `${day(8)} am`, `${day(8)} pm`],
    );
  });

  test('a fixed-length program follows its week-by-week days, then ends after its last week', async () => {
    await repo.savePlan(program());
    assert.deepEqual(await dated('program', day(0), day(SCHEDULE_AHEAD_DAYS)), [
      [day(0), 'h1'], [day(2), 'h2'], [day(4), 'h3'],
      [day(7), 'l1'], [day(9), 'l2'], [day(11), 'l3'],
    ]);
    assert.equal(scheduleOccurrences(program(), day(12), day(120)).length, 0, 'nothing after week 2');
    // Weeks count from the start date: a program started on a Thursday runs Thursday to Wednesday.
    const midweek = scheduleOccurrences(program({ startDate: day(3) }), day(0), day(30));
    assert.deepEqual(midweek.map((o): [ISODate, string] => [o.scheduledDate, o.planWorkoutId]), [
      [day(4), 'h3'], [day(7), 'h1'], [day(9), 'h2'],
      [day(11), 'l3'], [day(14), 'l1'], [day(16), 'l2'],
    ]);
  });

  test('a rotating cycle repeats by day with its rest steps, whatever the weekday', async () => {
    const plan = makePlan('cycle', cycle(['a'], ['b'], [], ['c'], []), { startDate: day(3) });
    await repo.savePlan(plan);
    const stored = await dated('cycle', day(0), day(17));
    assert.deepEqual(stored, [
      [day(3), 'a'], [day(4), 'b'], [day(6), 'c'],
      [day(8), 'a'], [day(9), 'b'], [day(11), 'c'],
      [day(13), 'a'], [day(14), 'b'], [day(16), 'c'],
    ]);
    // A 5-day cycle lands A on a different weekday each time round.
    assert.deepEqual(stored.filter(([, w]) => w === 'a').map(([d]) => isoWeekday(d)), [4, 2, 7]);
  });

  test('a paused or archived plan schedules nothing, and pausing clears its calendar', async () => {
    for (const status of ['paused', 'archived'] as const) {
      assert.equal(scheduleOccurrences(weekly({ status }), day(0), day(60)).length, 0, status);
    }
    await repo.savePlan(weekly());
    await repo.savePlan(rotating());
    await repo.savePlan({ ...(await repo.getPlan('weekly'))!, status: 'paused' });
    assert.equal((await occurrences(day(0), day(40), 'weekly')).length, 0);
    assert.ok((await occurrences(day(0), day(40), 'rotating')).length > 0, 'other plans carry on');
    // Days passing doesn't bring a paused plan back.
    setToday(day(10));
    assert.equal((await occurrences(day(0), day(40), 'weekly')).length, 0);
  });
});

describe('several plans, and several workouts on one day', () => {
  // Friday, day(4): weekly C and rotating B.
  const FRIDAY = day(4);
  beforeEach(() => plansSavedMonday([weekly(), rotating(), makePlan('paused', weeklyDays([[5, ['p']]]), { status: 'paused' })], FRIDAY));

  test('active plans merge on the calendar: two workouts make two agenda items', async () => {
    const items = await itemsOn(FRIDAY);
    assert.deepEqual(items.map((i) => [i.plan?.id, i.workout?.id, i.status]), [['rotating', 'b', 'planned'], ['weekly', 'c', 'planned']]);
    assert.notEqual(items[0].occurrence?.id, items[1].occurrence?.id);
  });

  for (const order of [[0, 1], [1, 0]]) {
    test(`they can be done in either order (${order.join(' then ')}), each linked to its own occurrence`, async () => {
      const items = await itemsOn(FRIDAY);
      for (const [n, i] of order.entries()) {
        const item = items[i];
        await repo.saveSession(finished(`s${i}`, FRIDAY, item.occurrence, { time: `1${n}:00` }));
        const now = await itemsOn(FRIDAY);
        assert.equal(now[i].status, 'completed');
        if (n === 0) assert.equal(now[order[1]].status, 'planned', 'the other is still to do');
      }
      const done = await itemsOn(FRIDAY);
      assert.equal(done.length, 2, 'no extra items: both were done on their day');
      for (const [i, item] of done.entries()) {
        assert.equal(item.session?.id, `s${i}`);
        assert.equal(item.session?.occurrenceId, item.occurrence?.id);
        assert.equal(item.occurrence?.sessionId, `s${i}`);
        assert.equal(item.completedOn, undefined);
      }
      assert.equal((await repo.listSessions({ from: FRIDAY, to: FRIDAY })).length, 2);
      assert.equal((await repo.getStreak()).thisWeekCompleted, 2, 'both count toward the week');
    });
  }

  test('one plan can put two workouts on one day, and they can be done in either order', async () => {
    await repo.savePlan(makePlan('twice', weeklyDays([[5, ['am', 'pm']]])));
    const twice = (await itemsOn(FRIDAY)).filter((i) => i.plan?.id === 'twice');
    assert.deepEqual(twice.map((i) => i.workout?.id), ['am', 'pm']);
    await repo.saveSession(finished('pm', FRIDAY, twice[1].occurrence, { time: '10:00' }));
    await repo.saveSession(started('am', FRIDAY, twice[0].occurrence!));
    const now = (await itemsOn(FRIDAY)).filter((i) => i.plan?.id === 'twice');
    assert.deepEqual(now.map((i) => [i.workout?.id, i.status, i.session?.id]), [['am', 'in_progress', 'am'], ['pm', 'completed', 'pm']]);
  });

  test('pushing one plan forward leaves the other plans alone', async () => {
    setToday(day(2));
    const weeklyBefore = await positions('weekly');
    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.plan?.id, 'rotating', 'the latest missed is rotating B on Tuesday');
    assert.deepEqual(await positions('weekly'), weeklyBefore);
    assert.equal((await itemsOn(day(0))).find((i) => i.plan?.id === 'weekly')?.status, 'missed', "weekly's Monday is still missed");
  });
});

describe('pushing a missed workout forward', () => {
  test('weekly: the missed workout lands today, and the rest of this week keeps its spacing', async () => {
    await plansSavedMonday([weekly()], day(2));
    const missed = latestMissed(await agenda(), today);
    assert.equal(missed?.date, day(0));
    assert.equal(missed?.status, 'missed');

    await pushLatestMissed('push');
    assert.deepEqual(await dated('weekly', day(0), day(20)), [
      // This week: A, B and C each two days later. Sunday's D would cross into next week, so it stays (below).
      [day(2), 'a'], [day(4), 'b'], [day(6), 'c'], [day(6), 'd'],
      // Next week and after: the usual days.
      [day(7), 'a'], [day(9), 'b'], [day(11), 'c'], [day(13), 'd'],
      [day(14), 'a'], [day(16), 'b'], [day(18), 'c'], [day(20), 'd'],
    ]);
    await assertUsualWeek('weekly', day(7));
    assert.deepEqual(await itemsOn(day(0)), [], 'the missed workout left Monday');
    const [moved] = (await itemsOn(day(2))).filter((i) => i.workout?.id === 'a');
    assert.equal(moved.status, 'planned');
    assert.equal(moved.occurrence?.shiftedFromDate, day(0), 'it knows where it came from');
    assert.equal(latestMissed(await agenda(), today), undefined, 'nothing left to offer');

    const shifts = await repo.listPlanShifts();
    assert.deepEqual(
      shifts.map(({ planId, occurrenceId, fromDate, untilDate, days }) => ({ planId, occurrenceId, fromDate, untilDate, days })),
      [{ planId: 'weekly', occurrenceId: missed?.occurrence?.id, fromDate: day(0), untilDate: day(6), days: 2 }],
    );
  });

  test("weekly: a workout that would be pushed past the week's end stays on its day, and next week is exactly as usual", async () => {
    // Sunday's D would move two days, to next Tuesday. It stays on Sunday instead, beside C
    // (pushed there from Friday), so next week holds its usual four workouts and no more.
    await plansSavedMonday([weekly()], day(2));
    await pushLatestMissed('push');
    const sunday = (await occurrences(day(6), day(6), 'weekly')).map((o) => `${o.planWorkoutId} ${o.scheduledDate}${o.shiftedFromDate ? ` (from ${o.shiftedFromDate})` : ''}`);
    assert.deepEqual(sunday.sort(), [`c ${day(6)} (from ${day(4)})`, `d ${day(6)}`]);
    assert.deepEqual((await itemsOn(day(6))).map((i) => [i.workout?.id, i.status]).sort(), [['c', 'planned'], ['d', 'planned']], 'Sunday shows both');
    assert.deepEqual(await dated('weekly', day(7), day(13)), [[day(7), 'a'], [day(9), 'b'], [day(11), 'c'], [day(13), 'd']]);
    await assertUsualWeek('weekly', day(7));
  });

  test('weekly, with weeks starting on Sunday: only through Saturday moves', async () => {
    await plansSavedMonday([weekly()], day(2));
    await weekStartingOn(7);
    await pushLatestMissed('push');
    assert.equal((await repo.listPlanShifts())[0].untilDate, day(5), "the Sunday-start week's Saturday");
    assert.deepEqual(await dated('weekly', day(0), day(13)), [
      [day(2), 'a'],
      // B moves to Friday. Friday's C would cross into the next (Sunday-start) week, so it stays beside B.
      [day(4), 'b'], [day(4), 'c'],
      // The next week, Sunday to Saturday, is exactly as usual, starting with its own D.
      [day(6), 'd'], [day(7), 'a'], [day(9), 'b'], [day(11), 'c'],
      [day(13), 'd'],
    ]);
    assert.equal((await occurrences(day(6), day(6), 'weekly'))[0].shiftedFromDate, undefined, "Sunday's D never moved");
    await assertUsualWeek('weekly', day(6));
  });

  test("weekly: a workout missed late last week moves this week along with it, up to the week's end", async () => {
    // Sunday's D was missed; on Monday it lands today and this week moves a day, apart from
    // this Sunday's D, which would cross into next week and so stays.
    fresh(day(-7));
    await repo.savePlan(weekly({ startDate: day(-7) }));
    setToday(day(0));
    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.date, day(-1));
    assert.equal((await repo.listPlanShifts())[0].untilDate, day(6));
    assert.deepEqual(await dated('weekly', day(-1), day(13)), [
      [day(0), 'd'], [day(1), 'a'], [day(3), 'b'], [day(5), 'c'], [day(6), 'd'],
      [day(7), 'a'], [day(9), 'b'], [day(11), 'c'], [day(13), 'd'],
    ]);
    await assertUsualWeek('weekly', day(7));
    await assertCalendarFollowsPushes('weekly');
  });

  /** Monday, Wednesday and Friday, started last week: last Monday's A missed, Wednesday and Friday done. Today is this Monday. */
  async function weekOldMiss() {
    fresh(day(-7));
    await repo.savePlan(makePlan('mwf', weeklyDays([[1, ['a']], [3, ['b']], [5, ['c']]]), { startDate: day(-7) }));
    await repo.saveSession(finished('wed', day(-5), await occurrenceOf('mwf', day(-5))));
    await repo.saveSession(finished('fri', day(-3), await occurrenceOf('mwf', day(-3))));
    setToday(day(0));
  }

  test('weekly: a week-old miss pushed 7 days moves alone; this week stays and next week is as usual', async () => {
    // Last Monday's A is pushed 7 days and lands today. Every one of this week's workouts would
    // cross into next week, so they all stay, and today holds two A's.
    await weekOldMiss();
    const before = await positions('mwf');

    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.date, day(-7));
    const shifts = await repo.listPlanShifts();
    assert.deepEqual(shifts.map((s) => [s.fromDate, s.untilDate, s.days]), [[day(-7), day(6), 7]]);
    const after = await positions('mwf');
    assert.equal(after.get(pushed.occurrence.id), today);
    for (const [id, date] of before) if (id !== pushed.occurrence.id) assert.equal(after.get(id), date, `${id} stays`);
    assert.deepEqual(await dated('mwf', day(-7), day(13)), [
      // Last week: Wednesday and Friday stay where they were done; Monday is empty now.
      [day(-5), 'b'], [day(-3), 'c'],
      // This week: the pushed A beside this Monday's own, then the usual days.
      [day(0), 'a'], [day(0), 'a'], [day(2), 'b'], [day(4), 'c'],
      [day(7), 'a'], [day(9), 'b'], [day(11), 'c'],
    ]);
    assert.deepEqual(
      (await itemsOn(day(0))).map((i) => [i.workout?.id, i.status, i.occurrence?.shiftedFromDate]),
      [['a', 'planned', day(-7)], ['a', 'planned', undefined]],
      'today holds two workouts',
    );
    assert.deepEqual(await itemsOn(day(-7)), [], 'the missed workout left last Monday');
    assert.equal(latestMissed(await agenda(), today), undefined, 'nothing left to offer');
    await assertUsualWeek('mwf', day(7));
    await assertCalendarFollowsPushes('mwf');

    await repo.undoPlanShift('push');
    assert.deepEqual(await positions('mwf'), before, 'undo puts it back on last Monday');
  });

  // A push keeps the workouts that were done when it was made, so deleting one later doesn't let
  // the push (or a plan edit) move it.
  test(
    "a workout whose session was deleted after a push stays missed on its day when the plan is edited",
    async () => {
      // Deleting last Wednesday's workout puts B back to missed on its day (spec 2.5). A later
      // rename mustn't move it into this Wednesday, beside this week's own B: nothing is ever
      // rescheduled automatically.
      await weekOldMiss();
      await pushLatestMissed('push');
      await repo.deleteSession('wed');
      const before = await positions('mwf');
      assert.equal(before.get((await occurrenceOf('mwf', day(-5))).id), day(-5), 'missed on last Wednesday');
      await repo.savePlan({ ...(await repo.getPlan('mwf'))!, name: 'Renamed' });
      const after = await positions('mwf');
      for (const [id, date] of before) assert.equal(after.get(id), date, `the rename moves nothing: ${id}`);
      assert.deepEqual(await dated('mwf', day(0), day(6)), [[day(0), 'a'], [day(0), 'a'], [day(2), 'b'], [day(4), 'c']]);
    },
  );

  test('weekly: two pushes apply in the order they were made, each kept within the week', async () => {
    // Wednesday: Monday's A is pushed 2 days. Thursday: A was missed again and is pushed 1 more.
    await plansSavedMonday([weekly()], day(2));
    await pushLatestMissed('push1');
    const afterFirst = await positions('weekly');
    assert.deepEqual(await dated('weekly', day(0), day(6)), [[day(2), 'a'], [day(4), 'b'], [day(6), 'c'], [day(6), 'd']]);

    setToday(day(3));
    const again = await pushLatestMissed('push2');
    assert.deepEqual([again.workout?.id, again.date], ['a', day(2)]);
    const shifts = await repo.listPlanShifts();
    assert.deepEqual(shifts.map((s) => [s.id, s.fromDate, s.untilDate, s.days]), [['push1', day(0), day(6), 2], ['push2', day(0), day(6), 1]]);
    // C reached Sunday with the first push; the second would carry it into next week, so it
    // stays. (The other way round, the 1-day push would fit and C would end on Saturday.)
    assert.deepEqual(await dated('weekly', day(0), day(6)), [[day(3), 'a'], [day(5), 'b'], [day(6), 'c'], [day(6), 'd']]);
    await assertUsualWeek('weekly', day(7));
    await assertCalendarFollowsPushes('weekly');

    await repo.undoPlanShift('push2');
    assert.deepEqual(await positions('weekly'), afterFirst, 'undoing the second leaves the first');
    await assertUsualWeek('weekly', day(7));
  });

  test('fixed-length program: every later workout moves for good, so the program ends later', async () => {
    await plansSavedMonday([program()], day(2));
    const before = await dated('program', day(0), day(40));
    assert.deepEqual(before.at(-1), [day(11), 'l3']);
    await pushLatestMissed('push');
    assert.deepEqual(await dated('program', day(0), day(40)), [
      [day(2), 'h1'], [day(4), 'h2'], [day(6), 'h3'],
      [day(9), 'l1'], [day(11), 'l2'], [day(13), 'l3'],
    ]);
    assert.equal((await repo.listPlanShifts())[0].untilDate, undefined);
  });

  test('rotating cycle: every later workout moves for good; an older missed one stays missed', async () => {
    // A Mon, B Tue, rest Wed... Both A and B were missed; the banner offers the latest, B.
    await plansSavedMonday([rotating()], day(2));
    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.date, day(1));
    assert.deepEqual(await dated('rotating', day(0), day(12)), [
      [day(0), 'a'],
      [day(2), 'b'], [day(4), 'a'], [day(5), 'b'],
      [day(7), 'a'], [day(8), 'b'], [day(10), 'a'], [day(11), 'b'],
    ]);
    assert.equal((await itemsOn(day(0)))[0].status, 'missed', 'Monday stays missed on its own date');
  });

  test("a workout that isn't missed can't be pushed, and nothing changes", async () => {
    await plansSavedMonday([weekly(), rotating()], day(2));
    const rotatingA = await occurrenceOf('rotating', day(0));
    const rotatingB = await occurrenceOf('rotating', day(1));
    await repo.saveSession(finished('late', day(2), rotatingA)); // done late
    await repo.saveSession(skipped('skip', rotatingB));
    const before = { weekly: await positions('weekly'), rotating: await positions('rotating') };

    const notMissed = [
      ['planned today', await occurrenceOf('weekly', day(2))],
      ['in the future', await occurrenceOf('weekly', day(4))],
      ['completed late', rotatingA],
      ['skipped', rotatingB],
    ] as const;
    for (const [label, occ] of notMissed) {
      await assert.rejects(repo.pushPlanForward(occ.id, `shift_${label}`), /Only a missed workout/, label);
    }
    await assert.rejects(repo.pushPlanForward('occ_nope', 'shift_unknown'), /no longer scheduled/);
    assert.deepEqual(await repo.listPlanShifts(), []);
    assert.deepEqual({ weekly: await positions('weekly'), rotating: await positions('rotating') }, before);

    // A deleted plan's missed workout is gone, so it can't be pushed either.
    const weeklyMissed = await occurrenceOf('weekly', day(0));
    await repo.deletePlan('weekly');
    await assert.rejects(repo.pushPlanForward(weeklyMissed.id, 'shift_deleted'), /no longer scheduled/);
  });

  test('on a two-workout day, pushing one missed workout moves both; one already done stays', async () => {
    // Both workouts share the original date the push starts from, so both move.
    const twice = () => makePlan('twice', weeklyDays([[1, ['am', 'pm']], [3, ['b']]]));
    await plansSavedMonday([twice()], day(2));
    await pushLatestMissed('push');
    assert.deepEqual(await dated('twice', day(0), day(6)), [[day(2), 'am'], [day(2), 'pm'], [day(4), 'b']]);
    await assertUsualWeek('twice', day(7));

    await plansSavedMonday([twice()], day(2));
    await repo.saveSession(finished('pm', day(0), await occurrenceOf('twice', day(0), 'pm')));
    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.workout?.id, 'am');
    assert.deepEqual(await dated('twice', day(0), day(6)), [[day(0), 'pm'], [day(2), 'am'], [day(4), 'b']]);
    await assertUsualWeek('twice', day(7));
  });

  test('on a two-workout cycle day, the same: one done stays, the missed one lands today, and every later day moves', async () => {
    // AM + PM, B, rest, from Monday. Cycles move for good, so the whole cycle runs a day later.
    const double = () => makePlan('double', cycle(['am', 'pm'], ['b'], []));
    await plansSavedMonday([double()], day(1));
    await pushLatestMissed('push');
    assert.deepEqual(await dated('double', day(0), day(7)), [[day(1), 'am'], [day(1), 'pm'], [day(2), 'b'], [day(4), 'am'], [day(4), 'pm'], [day(5), 'b'], [day(7), 'am'], [day(7), 'pm']]);
    await assertCalendarFollowsPushes('double');

    await plansSavedMonday([double()], day(1));
    const am = await occurrenceOf('double', day(0), 'am');
    await repo.saveSession(finished('am', day(0), am));
    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.workout?.id, 'pm', 'only the missed one is asked about');
    assert.deepEqual((await repo.listPlanShifts()).map((s) => s.keptIds), [[am.id]], 'the push keeps the done one');
    assert.deepEqual(await dated('double', day(0), day(7)), [[day(0), 'am'], [day(1), 'pm'], [day(2), 'b'], [day(4), 'am'], [day(4), 'pm'], [day(5), 'b'], [day(7), 'am'], [day(7), 'pm']]);
    assert.deepEqual((await itemsOn(day(0))).map((i) => [i.workout?.id, i.status]), [['am', 'completed']], 'done on Monday, where it was done');
    await assertCalendarFollowsPushes('double');

    await repo.undoPlanShift('push');
    assert.deepEqual(await dated('double', day(0), day(4)), [[day(0), 'am'], [day(0), 'pm'], [day(1), 'b'], [day(3), 'am'], [day(3), 'pm'], [day(4), 'b']]);
  });

  for (const status of ['paused', 'archived'] as const) {
    test(`a ${status} plan's missed workout can't be pushed onto today`, async () => {
      // Pausing clears the plan's upcoming workouts, so a push would put one back on its own.
      await plansSavedMonday([weekly()], day(2));
      await repo.savePlan({ ...(await repo.getPlan('weekly'))!, status });
      const missed = await occurrenceOf('weekly', day(0));
      await assert.rejects(repo.pushPlanForward(missed.id, 'push'), /Only a missed workout/);
      assert.deepEqual(await repo.listPlanShifts(), []);
      assert.deepEqual(await dated('weekly', day(0), day(30)), [[day(0), 'a']], 'still missed on Monday, nothing upcoming');
    });
  }

  test('undoing a push that no longer exists does nothing', async () => {
    await plansSavedMonday([weekly()], day(2));
    const before = await positions('weekly');
    await repo.undoPlanShift('shift_nope');
    assert.deepEqual(await positions('weekly'), before);
  });

  const kinds = [
    { name: 'weekly', make: () => weekly() },
    { name: 'fixed-length', make: longProgram },
    { name: 'rotating', make: () => rotating() },
  ];

  for (const { name, make } of kinds) {
    describe(`${name} plans`, () => {
      const planId = make().id;
      beforeEach(() => plansSavedMonday([make()], day(2)));

      /** The plan's next unstarted workouts from today on. */
      const upcoming = async () => (await allOf(planId)).filter((o) => o.scheduledDate >= today && !o.sessionId);

      test('the pushed workout lands today, and the workouts after it keep their spacing', async () => {
        await assertCalendarFollowsPushes(planId);
        const before = await positions(planId);
        const missed = await pushLatestMissed('push');
        const [shift] = await repo.listPlanShifts();
        assert.equal(shift.days, daysBetween(missed.date, today));
        const after = await positions(planId);

        assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'the push adds and removes nothing');
        assert.equal(after.get(missed.occurrence.id), today);
        const moved: string[] = [];
        const stayed: string[] = [];
        for (const [id, date] of before) {
          const covered = date >= shift.fromDate && (!shift.untilDate || date <= shift.untilDate);
          // A weekly push never carries a workout past its week's end: that one stays on its day.
          const lands = covered && (!shift.untilDate || addDays(date, shift.days) <= shift.untilDate);
          assert.equal(after.get(id), lands ? addDays(date, shift.days) : date, id);
          if (lands) moved.push(id);
          else if (covered) stayed.push(id);
        }
        assert.ok(moved.length > 2);
        const gaps = (where: Map<string, ISODate>) => moved.slice(1).map((id, i) => daysBetween(where.get(moved[i])!, where.get(id)!));
        assert.deepEqual(gaps(after), gaps(before), 'same spacing and rest days');
        if (shift.untilDate) {
          assert.ok(stayed.length > 0, "a workout that would cross the week's end stayed on its day");
          assert.ok([...before.values()].some((d) => d > shift.untilDate!), 'later weeks exist and stayed');
          for (let start = addDays(shift.untilDate, 1); start <= addDays(today, 21); start = addDays(start, 7)) await assertUsualWeek(planId, start);
        } else {
          assert.deepEqual(stayed, [], 'programs and cycles move everything later');
        }
        await assertCalendarFollowsPushes(planId);
      });

      test('started and completed workouts never move, even when a push is undone', async () => {
        const [first, second] = await upcoming();
        await repo.saveSession(finished('done', today, first)); // done already, today or early
        await repo.saveSession(started('going', today, second)); // started early
        const missed = await pushLatestMissed('push');
        assert.equal((await repo.listOccurrences({ from: first.scheduledDate, to: first.scheduledDate })).find((o) => o.id === first.id)?.sessionId, 'done');
        const after = await positions(planId);
        assert.equal(after.get(first.id), first.scheduledDate);
        assert.equal(after.get(second.id), second.scheduledDate);
        assert.equal(after.get(missed.occurrence.id), today);
        await assertCalendarFollowsPushes(planId);

        await repo.undoPlanShift('push');
        const undone = await positions(planId);
        assert.equal(undone.get(first.id), first.scheduledDate);
        assert.equal(undone.get(second.id), second.scheduledDate);
        assert.equal(undone.get(missed.occurrence.id), missed.date);
      });

      test('undo puts every workout back where it was', async () => {
        const before = await allOf(planId);
        const missed = await pushLatestMissed('push');
        await repo.undoPlanShift('push');
        assert.deepEqual(await allOf(planId), before, 'same dates, and no "moved from" left behind');
        assert.deepEqual(await repo.listPlanShifts(), []);
        assert.equal(latestMissed(await agenda(), today)?.occurrence?.id, missed.occurrence.id, 'missed again, so it can be offered again');
      });

      test('undo after the moved workout was started leaves that one where it was done', async () => {
        const before = await positions(planId);
        const missed = await pushLatestMissed('push');
        await repo.saveSession(started('going', today, { ...missed.occurrence, scheduledDate: today }));
        await repo.undoPlanShift('push');
        const after = await positions(planId);
        assert.equal(after.get(missed.occurrence.id), today);
        for (const [id, date] of before) if (id !== missed.occurrence.id) assert.equal(after.get(id), date, id);
      });

      test('pushing twice adds up, and each push undoes on its own', async () => {
        const before = await positions(planId);
        const missed = await pushLatestMissed('push1');
        const afterFirst = await positions(planId);

        setToday(addDays(today, 1));
        const again = await pushLatestMissed('push2');
        assert.equal(again.occurrence.id, missed.occurrence.id, 'the pushed workout was missed again');
        assert.equal(again.occurrence.shiftedFromDate, missed.date);
        const shifts = await repo.listPlanShifts();
        assert.deepEqual(shifts.map((s) => [s.id, s.fromDate, s.days]), [['push1', missed.date, daysBetween(missed.date, today) - 1], ['push2', missed.date, 1]]);
        const afterSecond = await positions(planId);
        assert.equal(afterSecond.get(missed.occurrence.id), today);
        for (const [id, date] of before) assert.equal(afterSecond.get(id), shiftedDate(date, shifts), id);
        await assertCalendarFollowsPushes(planId);

        await repo.undoPlanShift('push2');
        const undoneSecond = await positions(planId);
        for (const [id, date] of afterFirst) assert.equal(undoneSecond.get(id), date, id);

        await repo.undoPlanShift('push1');
        const undoneBoth = await positions(planId);
        for (const [id, date] of before) assert.equal(undoneBoth.get(id), date, id);
      });

      test('a plan edit after a push keeps the push', async () => {
        await pushLatestMissed('push');
        const pushed = await dated(planId, today, addDays(today, SCHEDULE_AHEAD_DAYS));
        const plan = (await repo.getPlan(planId))!;
        await repo.savePlan({ ...plan, workouts: plan.workouts.map((w) => planWorkout(w.id, 8)) });
        assert.deepEqual(await dated(planId, today, addDays(today, SCHEDULE_AHEAD_DAYS)), pushed);
        assert.ok((await upcoming()).every((o) => o.planVersion === plan.version + 1), 'upcoming workouts use the edit');
        assert.equal((await repo.listPlanShifts()).length, 1);
        await assertCalendarFollowsPushes(planId);
      });

      test('the daily top-up keeps the push and never duplicates a workout', async () => {
        await pushLatestMissed('push');
        const start = today;
        for (let n = 0; n <= 35; n++) {
          setToday(addDays(start, n));
          await assertCalendarFollowsPushes(planId);
        }
        const all = await allOf(planId);
        const keys = all.map((o) => `${o.planWorkoutId} ${original(o)}`);
        assert.equal(new Set(keys).size, keys.length, 'each workout once');
      });

      // Programs and cycles move for good, so a push can carry workouts past the 4 weeks ahead.
      test('a plan edit after a push keeps the workouts it moved beyond the 4 weeks ahead', async () => {
        await pushLatestMissed('push');
        const plan = (await repo.getPlan(planId))!;
        await repo.savePlan({ ...plan, name: 'Renamed' });
        const start = today;
        for (let n = 0; n <= 35; n++) {
          setToday(addDays(start, n));
          await assertCalendarFollowsPushes(planId);
        }
      });

      test('undo on a later day fills the calendar back in to 4 weeks ahead', async () => {
        // Today's banner only offers undo on the day of the push, but the repository allows it later.
        await pushLatestMissed('push');
        for (let n = 1; n <= 6; n++) {
          setToday(addDays(day(2), n));
          await repo.listOccurrences({ from: today, to: today }); // the day's top-up runs
        }
        await repo.undoPlanShift('push');
        await assertCalendarFollowsPushes(planId);
      });

      test('deleting the plan removes its pushes', async () => {
        await repo.savePlan(makePlan('other', weeklyDays([[1, ['o']]])));
        await pushLatestMissed('push');
        await repo.deletePlan(planId);
        assert.deepEqual(await repo.listPlanShifts(), []);
        assert.deepEqual(await allOf(planId), []);
      });
    });
  }
});

describe('push, edit, undo, edit: no workout ahead is dropped', () => {
  // The reviewers' case. After a push, the first edit stores workouts up to 29 days out; undo
  // moves the pushed ones back; the second edit must keep the far-out ones, or the next day's
  // top-up (which never brings back a deleted workout) leaves a hole in the calendar.
  const kinds = [
    { name: 'a Monday-to-Friday weekly plan', make: () => makePlan('weekdays', weeklyDays([[1, ['a']], [2, ['b']], [3, ['c']], [4, ['d']], [5, ['e']]])) },
    { name: 'an every-day weekly plan', make: () => makePlan('everyday', weeklyDays(([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d): [Weekday, string[]] => [d, ['w']]))) },
    { name: 'a daily cycle', make: () => makePlan('daily', cycle(['a'])) },
    { name: 'a daily cycle with two workouts a day', make: () => makePlan('daily2', cycle(['a', 'b'])) },
  ];
  const edits = {
    savePlan: async (planId: string) => {
      const plan = (await repo.getPlan(planId))!;
      await repo.savePlan({ ...plan, name: `${plan.name}, edited` });
    },
    updatePlanWorkout: async (planId: string) => {
      const [workout] = (await repo.getPlan(planId))!.workouts;
      await repo.updatePlanWorkout(planId, workout.id, planWorkout(workout.id, 8).blocks);
    },
  };

  for (const { name, make } of kinds) {
    for (const first of ['savePlan', 'updatePlanWorkout'] as const) {
      test(`${name}: push, ${first}, undo, savePlan, then the next day`, async () => {
        const plan = make();
        await plansSavedMonday([plan], day(2));
        const far = addDays(today, SCHEDULE_AHEAD_DAYS + 1);

        await pushLatestMissed('push');
        await edits[first](plan.id);
        await assertCalendarFollowsPushes(plan.id);
        if (plan.schedule.type === 'weekly') await assertUsualWeek(plan.id, day(7));
        assert.ok((await occurrences(far, far, plan.id)).length > 0, 'after the edit, a workout sits 29 days out (pushed or stored there)');

        await repo.undoPlanShift('push');
        await edits.savePlan(plan.id);
        await assertCalendarFollowsPushes(plan.id);

        setToday(day(3));
        await assertCalendarFollowsPushes(plan.id);
        assert.deepEqual(
          (await occurrences(far, far, plan.id)).map((o) => o.planWorkoutId),
          workoutsOn(plan.schedule, plan.startDate, far),
          'the workout 29 days out from the push is still there',
        );
      });
    }
  }
});

describe('a push never moves what was started or done when it was made, even once that is undone', () => {
  // pushPlanForward keeps (keptIds) the workouts in its range that had a session. Unskipping one
  // or deleting its workout later frees it on its own day; the push mustn't then carry it along.

  /** What the Today banner asks about, built the way the app builds it. */
  async function bannerAsks() {
    const state = missedBannerState({
      agenda: await agenda(),
      today,
      plans: await repo.listPlans(),
      shifts: await repo.listPlanShifts(),
      dismissed: new Set(),
      weekStartsOn: 1,
    });
    assert.equal(state?.kind, 'asking', 'the banner asks about a missed workout');
    return state as Extract<MissedBannerState, { kind: 'asking' }>;
  }

  test("weekly: Friday skipped, Monday's A pushed, Friday unskipped: C stays on Friday, then can be pushed from there", async () => {
    await plansSavedMonday([weekly()], day(0));
    const friday = await occurrenceOf('weekly', day(4));
    await repo.saveSession(skipped('skip', friday)); // Monday: Friday's C skipped from its card.

    setToday(day(1)); // Tuesday: Monday's A pushed a day.
    await pushLatestMissed('push1');
    assert.deepEqual((await repo.listPlanShifts()).map((s) => s.keptIds), [[friday.id]], 'the push keeps the skipped C');
    const thisWeek: [ISODate, string][] = [[day(1), 'a'], [day(3), 'b'], [day(4), 'c'], [day(6), 'd']];
    assert.deepEqual(await dated('weekly', day(0), day(6)), thisWeek);

    setToday(day(2)); // Wednesday: C unskipped ("Unskip workout" deletes the skip).
    await repo.deleteSession('skip');
    const unskipped = (await itemsOn(day(4))).find((i) => i.workout?.id === 'c');
    assert.equal(unskipped?.status, 'planned', 'C is to do again');
    assert.equal(unskipped?.occurrence?.shiftedFromDate, undefined, '...on its own Friday');
    await repo.savePlan({ ...(await repo.getPlan('weekly'))!, name: 'Renamed' });
    assert.deepEqual(await dated('weekly', day(0), day(6)), thisWeek, "the rename doesn't let the push carry C to Saturday");
    await assertCalendarFollowsPushes('weekly');
    await assertUsualWeek('weekly', day(7));

    setToday(day(5)); // Saturday: C was missed on Friday.
    const before = await positions('weekly');
    const asked = await bannerAsks();
    assert.deepEqual([asked.occurrenceId, asked.date, asked.days], [friday.id, day(4), 1], "the banner offers Friday's C");
    const pushed = await pushLatestMissed('push2');
    assert.equal(pushed.occurrence.id, friday.id);
    assert.deepEqual(
      (await occurrences(day(5), day(5), 'weekly')).map((o) => [o.id, o.shiftedFromDate]),
      [[friday.id, day(4)]],
      'C lands on Saturday, today',
    );
    assert.deepEqual(await dated('weekly', day(0), day(6)), [[day(1), 'a'], [day(3), 'b'], [day(5), 'c'], [day(6), 'd']]);
    await assertCalendarFollowsPushes('weekly');
    await assertUsualWeek('weekly', day(7));

    await repo.undoPlanShift('push2');
    assert.deepEqual(await positions('weekly'), before, 'undo puts C back on Friday');
    assert.equal((await itemsOn(day(4))).find((i) => i.workout?.id === 'c')?.status, 'missed');
  });

  // Monday's first workout is missed, and a later one was done early that Monday. On Tuesday the
  // missed one is pushed a day; on Wednesday the early workout is deleted.
  const doneEarly = [
    { name: 'weekly', make: () => weekly(), early: day(2) }, // Wednesday's B
    { name: 'fixed-length', make: longProgram, early: day(2) }, // Wednesday's Y
    { name: 'rotating', make: () => rotating(), early: day(1) }, // Tuesday's B
  ];
  for (const { name, make, early } of doneEarly) {
    test(`${name}: a workout done early, then deleted after a push, stays on its own day`, async () => {
      const planId = make().id;
      await plansSavedMonday([make()], day(0));
      const occ = await occurrenceOf(planId, early);
      await repo.saveSession(finished('early', day(0), occ));

      setToday(day(1));
      await pushLatestMissed('push');
      assert.deepEqual((await repo.listPlanShifts()).map((s) => s.keptIds), [[occ.id]], 'the push keeps the early workout');
      assert.equal((await positions(planId)).get(occ.id), early);

      setToday(day(2));
      await repo.deleteSession('early');
      const freed = (await allOf(planId)).find((o) => o.id === occ.id);
      assert.deepEqual([freed?.scheduledDate, freed?.shiftedFromDate, freed?.sessionId], [early, undefined, undefined], 'freed on its own day');
      await assertCalendarFollowsPushes(planId);

      await repo.savePlan({ ...(await repo.getPlan(planId))!, name: 'Renamed' });
      assert.equal((await positions(planId)).get(occ.id), early, "a plan edit doesn't move it");
      for (let n = 3; n <= 8; n++) {
        setToday(day(n));
        await assertCalendarFollowsPushes(planId);
        assert.equal((await positions(planId)).get(occ.id), early, `day ${n}: still on its own day`);
      }
      await repo.undoPlanShift('push');
      assert.equal((await positions(planId)).get(occ.id), early, 'nor does undoing the push');
    });
  }
});

describe("a weekly push of last week's miss, then a plan edit", () => {
  test('adding a Saturday workout brings no E from last Saturday into this week', async () => {
    // Last week A, B and D were done and Friday's C was missed. On Monday C is pushed 3 days, to
    // today, and a Saturday workout E is added. The push covers last Friday and this week only, so
    // last Saturday's E (which the rebuild scans, being within the push's reach) stays last week.
    fresh(day(-7));
    await repo.savePlan(weekly({ startDate: day(-7) }));
    for (const [w, n] of [['a', -7], ['b', -5], ['d', -1]] as const) await repo.saveSession(finished(`done_${w}`, day(n), await occurrenceOf('weekly', day(n))));
    setToday(day(0));
    const pushed = await pushLatestMissed('push');
    assert.deepEqual([pushed.workout?.id, pushed.date], ['c', day(-3)]);
    const [shift] = await repo.listPlanShifts();
    assert.deepEqual([shift.fromDate, shift.untilDate, shift.days, shift.keptIds], [day(-3), day(6), 3, undefined], "last Sunday's D isn't covered, so nothing is kept");

    const plan = (await repo.getPlan('weekly'))!;
    await repo.savePlan({
      ...plan,
      schedule: weeklyDays([[1, ['a']], [3, ['b']], [5, ['c']], [6, ['e']], [7, ['d']]]),
      workouts: [...plan.workouts, planWorkout('e')],
    });
    const lastSaturdayE = `occ_weekly_${day(-2)}_e`;
    const thisWeeksE = async () =>
      (await occurrences(day(0), day(6), 'weekly')).filter((o) => o.planWorkoutId === 'e').map((o) => [o.id, o.scheduledDate, o.shiftedFromDate]);
    assert.ok(!(await allOf('weekly')).some((o) => o.id === lastSaturdayE), 'no E from last Saturday, anywhere');
    assert.deepEqual(await thisWeeksE(), [[`occ_weekly_${day(5)}_e`, day(5), undefined]], 'exactly one E this week, on Saturday');
    assert.deepEqual(await dated('weekly', day(0), day(6)), [
      // Last Friday's C today; this week's A and B 3 days later. This week's C, E and D would cross the week's end, so they stay.
      [day(0), 'c'], [day(3), 'a'], [day(4), 'c'], [day(5), 'b'], [day(5), 'e'], [day(6), 'd'],
    ]);
    await assertUsualWeek('weekly', day(7));
    await assertCalendarFollowsPushes('weekly');
    // The pure schedule agrees.
    const edited = (await repo.getPlan('weekly'))!;
    assert.deepEqual(
      scheduleOccurrences(edited, day(0), day(6), await repo.listPlanShifts())
        .filter((o) => o.planWorkoutId === 'e')
        .map((o) => [o.id, o.scheduledDate, o.shiftedFromDate]),
      await thisWeeksE(),
    );

    // The next day's top-up adds no E either.
    setToday(day(1));
    await assertCalendarFollowsPushes('weekly');
    assert.deepEqual(await thisWeeksE(), [[`occ_weekly_${day(5)}_e`, day(5), undefined]]);
    await assertUsualWeek('weekly', day(7));

    // Undo: C goes back to last Friday, and this week is exactly as usual, E included.
    await repo.undoPlanShift('push');
    assert.equal((await occurrenceOf('weekly', day(-3))).scheduledDate, day(-3));
    await assertUsualWeek('weekly', day(0));
    assert.ok(!(await allOf('weekly')).some((o) => o.id === lastSaturdayE));
  });
});

describe("Today's banner through pushes, undos, unskips and plan edits", () => {
  // The final G3.7 review's cases. Undo is offered on the day of the push, and a push is stamped
  // with the clock, so here the clock moves along with today.
  const localTime = (date: ISODate, hour: number) => {
    const at = fromISODate(date);
    at.setHours(hour);
    return at.getTime();
  };
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: localTime(day(0), 9) }));
  afterEach(() => mock.timers.reset());

  /** It's `hour` o'clock on `date`: that's today, and the time a push made now is stamped with. */
  function clockAt(date: ISODate, hour = 9) {
    mock.timers.setTime(localTime(date, hour));
    setToday(date);
  }

  /** The Today banner, built the way the app builds it. `open` is the workout open right now. */
  async function banner(open?: ScheduledOccurrence) {
    return missedBannerState({
      agenda: await agenda(),
      today,
      plans: await repo.listPlans(),
      shifts: await repo.listPlanShifts(),
      dismissed: new Set(),
      activeOccurrenceId: open?.id,
      weekStartsOn: (await repo.getPreferences()).weekStartsOn,
    });
  }
  function asking(state: MissedBannerState | undefined) {
    assert.equal(state?.kind, 'asking', 'the banner asks about a missed workout');
    return state as Extract<MissedBannerState, { kind: 'asking' }>;
  }
  function pushed(state: MissedBannerState | undefined) {
    assert.equal(state?.kind, 'pushed', 'the banner offers Undo');
    return state as Extract<MissedBannerState, { kind: 'pushed' }>;
  }
  const keys = (state: { items: DayItem[] }) => state.items.map((i) => i.key).sort();

  test('weekly: C and D, both missed on Sunday, move together; the Undo names both, and nothing is asked again', async () => {
    // Wednesday: Monday's A is pushed 2 days, which puts Friday's C on Sunday beside D (Sunday
    // ends the week). A and B are done; C and D are both missed.
    fresh(day(0));
    await repo.savePlan(weekly());
    clockAt(day(2));
    await repo.pushPlanForward(asking(await banner()).occurrenceId, 'push1');
    assert.deepEqual(await dated('weekly', day(0), day(6)), [[day(2), 'a'], [day(4), 'b'], [day(6), 'c'], [day(6), 'd']]);
    await repo.saveSession(finished('done_a', day(2), await occurrenceOf('weekly', day(0))));
    clockAt(day(4), 18);
    await repo.saveSession(finished('done_b', day(4), await occurrenceOf('weekly', day(2))));

    // Next Monday: the banner asks about both.
    clockAt(day(7));
    const c = await occurrenceOf('weekly', day(4));
    const d = await occurrenceOf('weekly', day(6));
    const asked = asking(await banner());
    assert.deepEqual(keys(asked), [c.id, d.id]);
    assert.deepEqual([asked.occurrenceId, asked.date, asked.days, asked.later], [c.id, day(6), 1, 'some'], 'C, put down first, is the one pushed');
    assert.equal(askingTitle(asked), 'You missed Workout C and Workout D on Sunday');
    assert.equal(
      askingMessage(asked),
      "Move Workout C and Workout D to today and this week's later Plan weekly workouts 1 day later where they fit? Next week stays as planned. If you keep the schedule, you can still do them from Sunday.",
    );

    // One push moves both to today, and this week's workouts 1 day, not 2.
    const before = await positions('weekly');
    await repo.pushPlanForward(asked.occurrenceId, 'push2');
    assert.deepEqual((await repo.listPlanShifts()).find((s) => s.id === 'push2')?.alongIds, [d.id], 'the push records that D moves with C');
    const thisWeek: [ISODate, string][] = [
      // Sunday's own D would cross the week's end, so it stays.
      [day(7), 'c'], [day(7), 'd'], [day(8), 'a'], [day(10), 'b'], [day(12), 'c'], [day(13), 'd'],
    ];
    assert.deepEqual(await dated('weekly', day(6), day(13)), thisWeek);
    await assertUsualWeek('weekly', day(14));
    await assertCalendarFollowsPushes('weekly');

    const undo = pushed(await banner());
    assert.equal(undo.shift.id, 'push2');
    assert.deepEqual(keys(undo), [c.id, d.id]);
    assert.deepEqual([undo.returnsTo, undo.later], [day(6), 'some']);
    assert.equal(pushedMessage(undo), "Workout C and Workout D moved to today, and this week's later Plan weekly workouts moved 1 day where they fit. Next week is unchanged.");
    assert.equal(undoneMessage(undo), 'Push undone. Workout C and Workout D are back on Sunday.');

    await repo.undoPlanShift('push2');
    assert.deepEqual(await positions('weekly'), before, 'Undo puts C and D back on Sunday');
    assert.deepEqual((await itemsOn(day(6))).map((i) => [i.workout?.id, i.status]), [['c', 'missed'], ['d', 'missed']]);

    // Pushed again and C done: D moved with it, so there's nothing left to ask about.
    await repo.pushPlanForward(asking(await banner()).occurrenceId, 'push3');
    await repo.saveSession(finished('done_c', day(7), await occurrenceOf('weekly', day(4))));
    assert.equal(await banner(), undefined, 'no new prompt for D');
    assert.deepEqual(await dated('weekly', day(6), day(13)), thisWeek, 'this week stays 1 day later');
  });

  test('program: a workout skipped after a push, then the push undone, is back on its own day once unskipped, and an edit keeps it', async () => {
    // Monday's X is missed, and on Tuesday it's pushed a day, moving Wednesday's Y to Thursday. Y
    // is skipped there ahead of time, the push is undone (Undo is still up), and on Thursday Y is
    // unskipped.
    fresh(day(0));
    await repo.savePlan(longProgram());
    clockAt(day(1));
    await repo.pushPlanForward(asking(await banner()).occurrenceId, 'push');
    assert.deepEqual(await dated('long', day(0), day(6)), [[day(1), 'x'], [day(3), 'y'], [day(5), 'z']]);
    await repo.saveSession(skipped('skip', await occurrenceOf('long', day(2))));
    const undo = pushed(await banner());
    assert.equal(undo.shift.id, 'push');
    await repo.undoPlanShift(undo.shift.id);
    assert.deepEqual(await dated('long', day(0), day(6)), [[day(0), 'x'], [day(3), 'y'], [day(4), 'z']], 'the skipped Y stays where it was skipped');

    clockAt(day(3));
    await repo.deleteSession('skip');
    const own: [ISODate, string][] = [[day(0), 'x'], [day(2), 'y'], [day(4), 'z']];
    assert.deepEqual(await dated('long', day(0), day(6)), own, 'Y is back on Wednesday');
    assert.equal((await occurrenceOf('long', day(2))).shiftedFromDate, undefined);
    const plan = (await repo.getPlan('long'))!;
    const shifts = await repo.listPlanShifts();
    assert.deepEqual(
      scheduleOccurrences(plan, day(0), day(6), shifts).map((o): [ISODate, string] => [o.scheduledDate, o.planWorkoutId]),
      own,
      'where the plan puts it',
    );
    assert.deepEqual((await itemsOn(day(2))).map((i) => [i.workout?.id, i.status]), [['y', 'missed']]);
    assert.deepEqual(await itemsOn(day(3)), [], 'nothing today');
    assert.deepEqual(nextWorkout(plan, today, shifts), { date: day(4), name: 'Workout Z' }, 'the Plans tab agrees');

    await repo.updatePlanWorkout('long', 'z', planWorkout('z', 8).blocks);
    assert.deepEqual(await dated('long', day(0), day(6)), own, 'a plan edit keeps Y on Wednesday');
    await assertCalendarFollowsPushes('long');
  });

  test('weekly: a workout a push kept, then unskipped, moves with the next push, and the Undo banner names both', async () => {
    // Tuesday: Wednesday's B is skipped ahead of time. Wednesday: Monday's A is pushed to today,
    // and the push keeps the skipped B on its day; that evening B is unskipped. Neither is done.
    fresh(day(0));
    await repo.savePlan(makePlan('mwf', weeklyDays([[1, ['a']], [3, ['b']], [5, ['c']]])));
    const a = await occurrenceOf('mwf', day(0));
    const b = await occurrenceOf('mwf', day(2));
    clockAt(day(1));
    await repo.saveSession(skipped('skip', b));
    clockAt(day(2));
    await repo.pushPlanForward(asking(await banner()).occurrenceId, 'push1');
    assert.deepEqual((await repo.listPlanShifts()).map((s) => s.keptIds), [[b.id]]);
    clockAt(day(2), 19);
    await repo.deleteSession('skip');
    assert.deepEqual(await dated('mwf', day(0), day(6)), [[day(2), 'a'], [day(2), 'b'], [day(6), 'c']]);

    // Thursday: the banner asks about both, and the push moves both.
    clockAt(day(3));
    const asked = asking(await banner());
    assert.deepEqual(keys(asked), [a.id, b.id]);
    assert.deepEqual([asked.occurrenceId, asked.date, asked.days, asked.later], [a.id, day(2), 1, 'none']);
    assert.equal(askingTitle(asked), 'You missed Workout A and Workout B on Wednesday');
    assert.equal(askingMessage(asked), 'Move Workout A and Workout B to today? Your other Plan mwf workouts stay as planned. If you keep the schedule, you can still do them from Wednesday.');
    await repo.pushPlanForward(asked.occurrenceId, 'push2');
    assert.deepEqual(await dated('mwf', day(0), day(6)), [[day(3), 'a'], [day(3), 'b'], [day(6), 'c']]);

    const undo = pushed(await banner());
    assert.equal(undo.shift.id, 'push2');
    assert.deepEqual(keys(undo), [a.id, b.id]);
    assert.deepEqual([undo.returnsTo, undo.later], [day(2), 'none'], "C, on Sunday already, can't move");
    assert.equal(pushedMessage(undo), 'Workout A and Workout B moved to today.');
    assert.equal(undoneMessage(undo), 'Push undone. Workout A and Workout B are back on Wednesday.');

    // Undo goes once B is open or started, as it does for A.
    const movedB = await occurrenceOf('mwf', day(2));
    assert.equal(await banner(movedB), undefined, 'B open in the workout screen');
    await repo.saveSession(started('going', day(3), movedB));
    assert.equal(await banner(), undefined, 'B started');
  });

  test("weekly: a missed workout pushed after the schedule editor moved its weekday survives later edits, and keeps its Undo", async () => {
    // A on Mondays, B on Thursdays. Thursday's B is missed. Friday: B moves to Saturdays from now
    // on, then Thursday's B is pushed to today.
    fresh(day(0));
    await repo.savePlan(makePlan('w', weeklyDays([[1, ['a']], [4, ['b']]])));
    const thursday = await occurrenceOf('w', day(3));
    clockAt(day(4), 8);
    await repo.savePlan({ ...(await repo.getPlan('w'))!, schedule: weeklyDays([[1, ['a']], [6, ['b']]]) });
    const unpushed: [ISODate, string][] = [[day(0), 'a'], [day(3), 'b'], [day(5), 'b']];
    assert.deepEqual(await dated('w', day(0), day(6)), unpushed, "Thursday's missed B stays, and Saturday has the new one");
    const asked = asking(await banner());
    assert.deepEqual([asked.occurrenceId, asked.days, asked.later], [thursday.id, 1, 'all']);
    await repo.pushPlanForward(asked.occurrenceId, 'push');
    // Saturday's B is in the push's week, so it moves a day too.
    const pushedWeek: [ISODate, string][] = [[day(0), 'a'], [day(4), 'b'], [day(6), 'b']];
    assert.deepEqual(await dated('w', day(0), day(6)), pushedWeek);
    assert.equal(pushed(await banner()).shift.id, 'push');

    // Edits of any kind keep the pushed B on today, with its Undo.
    await repo.updatePlanWorkout('w', 'b', planWorkout('b', 8).blocks);
    await repo.savePlan({ ...(await repo.getPlan('w'))!, name: 'Renamed' });
    assert.deepEqual(await dated('w', day(0), day(6)), pushedWeek, 'the edits keep the pushed B');
    assert.equal((await itemsOn(day(4))).find((i) => i.occurrence?.id === thursday.id)?.status, 'planned');
    const undo = pushed(await banner());
    assert.deepEqual([undo.shift.id, keys(undo), undo.returnsTo], ['push', [thursday.id], day(3)]);

    await repo.undoPlanShift('push');
    assert.deepEqual(await dated('w', day(0), day(6)), unpushed, 'Undo puts B back on Thursday');
    assert.equal((await itemsOn(day(3))).find((i) => i.occurrence?.id === thursday.id)?.status, 'missed');
  });

  test('weekly: a missed workout pushed before the schedule editor moved its weekday survives that edit and later ones, and keeps its Undo', async () => {
    // A on Mondays, B on Thursdays. Monday's A is done, Thursday's B missed. Friday: B is pushed
    // to today, then moves to Saturdays from now on.
    fresh(day(0));
    await repo.savePlan(makePlan('w', weeklyDays([[1, ['a']], [4, ['b']]])));
    clockAt(day(0), 18);
    await repo.saveSession(finished('done_a', day(0), await occurrenceOf('w', day(0))));
    const thursday = await occurrenceOf('w', day(3));
    clockAt(day(4), 8);
    const asked = asking(await banner());
    assert.deepEqual([asked.occurrenceId, asked.later], [thursday.id, 'none']);
    await repo.pushPlanForward(asked.occurrenceId, 'push');
    assert.deepEqual(await dated('w', day(0), day(13)), [[day(0), 'a'], [day(4), 'b'], [day(7), 'a'], [day(10), 'b']]);

    await repo.savePlan({ ...(await repo.getPlan('w'))!, schedule: weeklyDays([[1, ['a']], [6, ['b']]]) });
    // The pushed B stays on today. Saturday's new B is in the push's week, so it moves a day too.
    const edited: [ISODate, string][] = [[day(0), 'a'], [day(4), 'b'], [day(6), 'b'], [day(7), 'a'], [day(12), 'b']];
    assert.deepEqual(await dated('w', day(0), day(13)), edited);
    const undo = pushed(await banner());
    assert.deepEqual([undo.shift.id, keys(undo), undo.returnsTo, undo.later], ['push', [thursday.id], day(3), 'all']);
    assert.equal(pushedMessage(undo), "Workout B moved to today, and the rest of this week's Plan w workouts moved 1 day later. Next week is unchanged.");

    await repo.updatePlanWorkout('w', 'b', planWorkout('b', 8).blocks);
    assert.deepEqual(await dated('w', day(0), day(13)), edited, 'a later edit keeps it too');
    assert.equal(pushed(await banner()).shift.id, 'push');

    await repo.undoPlanShift('push');
    assert.deepEqual(await dated('w', day(0), day(13)), [[day(0), 'a'], [day(3), 'b'], [day(5), 'b'], [day(7), 'a'], [day(12), 'b']], 'Undo puts B back on Thursday');
  });
});

describe('completion-date attribution', () => {
  beforeEach(async () => {
    await plansSavedMonday([weekly()], day(2));
    await repo.saveGoal(frequencyGoal(1));
  });

  test('a workout scheduled Monday and done Wednesday shows on both days', async () => {
    const monday = await occurrenceOf('weekly', day(0));
    await repo.saveSession(finished('late', day(2), monday));

    const [onMonday] = await itemsOn(day(0));
    assert.equal(onMonday.status, 'completed', 'Monday shows it done');
    assert.equal(onMonday.completedOn, day(2), '...on Wednesday');
    assert.equal(onMonday.session?.id, 'late');

    const late = (await itemsOn(day(2))).find((i) => i.extra);
    assert.equal(late?.extra, 'late');
    assert.equal(late?.scheduledFor, day(0));
    assert.equal(late?.session?.id, 'late');
    assert.equal(latestMissed(await agenda(), today), undefined, 'no longer missed');
  });

  test('history, records, and the streak count it on Wednesday', async () => {
    fresh(day(-7));
    await repo.savePlan(weekly({ startDate: day(-7) }));
    await repo.saveGoal(frequencyGoal(1));
    await repo.saveSession(finished('earlier', day(-7), await occurrenceOf('weekly', day(-7)))); // 100 kg baseline
    setToday(day(2));
    const monday = await occurrenceOf('weekly', day(0));
    await repo.saveSession(finished('late', day(2), monday, { sets: [doneSet('late_set', day(2), { loadKg: 110 })] }));

    assert.deepEqual((await repo.listSessions({ from: day(2), to: day(2) })).map((s) => s.id), ['late']);
    assert.deepEqual(await repo.listSessions({ from: day(0), to: day(1) }), []);
    const records = (await repo.listPersonalRecords()).filter((r) => r.sessionId === 'late');
    assert.ok(records.length > 0);
    assert.ok(records.every((r) => r.achievedDate === day(2)));
    assert.equal((await repo.listPersonalRecords({ since: day(1) })).length, records.length);
    const streak = await repo.getStreak();
    assert.equal(streak.thisWeekCompleted, 1);
    assert.equal(streak.currentWeeks, 2);
    assert.equal(streak.milestoneDates[1], day(2), 'the second week was met on Wednesday');
  });

  test('reopening keeps its date', async () => {
    const monday = await occurrenceOf('weekly', day(0));
    const done = finished('late', day(2), monday);
    await repo.saveSession(done);

    setToday(day(4)); // reopened on Friday
    const reopened = sessionForReopen((await repo.getSession('late'))!);
    await repo.saveSession(reopened);
    assert.deepEqual((await repo.listSessions({ from: day(2), to: day(2) })).map((s) => [s.id, s.status]), [['late', 'in_progress']], 'still filed under Wednesday');

    await repo.saveSession({ ...reopened, status: 'completed', completion: 'full' }); // what Finish does with a reopened workout
    assert.equal((await repo.getSession('late'))?.completedDate, day(2));
    assert.equal((await itemsOn(day(0)))[0].completedOn, day(2));
    assert.ok((await itemsOn(day(2))).some((i) => i.extra === 'late'));
    assert.ok(!(await itemsOn(day(4))).some((i) => i.extra), 'nothing on the reopen day');
    assert.equal((await repo.listSessions({ from: day(4), to: day(4) })).length, 0);
  });

  test('a late finish across the weekend counts in the week it was done', async () => {
    // Scheduled Saturday, done Sunday: with Sunday-start weeks, that's a different week.
    fresh(day(0));
    await repo.savePlan(makePlan('sat', weeklyDays([[6, ['s']]])));
    await repo.saveGoal(frequencyGoal(1));
    setToday(day(6));
    await repo.saveSession(finished('late', day(6), await occurrenceOf('sat', day(5))));
    for (const weekStartsOn of [1, 7] as const) {
      await weekStartingOn(weekStartsOn);
      const streak = await repo.getStreak();
      assert.equal(streak.thisWeekCompleted, 1, `weeks starting ${weekStartsOn === 1 ? 'Monday' : 'Sunday'}`);
      assert.equal(streak.currentWeeks, 1);
    }
  });

  test('a pushed workout done on its new day is on time', async () => {
    const pushed = await pushLatestMissed('push');
    const [item] = (await itemsOn(today)).filter((i) => i.occurrence?.id === pushed.occurrence.id);
    await repo.saveSession(finished('done', today, item.occurrence));
    const items = await itemsOn(today);
    assert.ok(!items.some((i) => i.extra), 'not late');
    const done = items.find((i) => i.occurrence?.id === pushed.occurrence.id);
    assert.equal(done?.status, 'completed');
    assert.equal(done?.completedOn, undefined);
    assert.deepEqual(await itemsOn(day(0)), [], 'nothing left on the original day');
  });

  test('a pushed workout done a day after its new day is late for the new day', async () => {
    const pushed = await pushLatestMissed('push');
    setToday(day(3));
    await repo.saveSession(finished('late', today, { ...pushed.occurrence, scheduledDate: day(2) }));
    assert.equal((await itemsOn(day(2))).find((i) => i.occurrence?.id === pushed.occurrence.id)?.completedOn, day(3));
    assert.equal((await itemsOn(day(3))).find((i) => i.extra)?.scheduledFor, day(2));
  });
});

describe('weekly streaks, including partial workouts', () => {
  beforeEach(async () => {
    fresh(day(2));
    await repo.saveGoal(frequencyGoal(1));
  });

  const partial = (id: string, date: ISODate, sets: LoggedSet[]) => finished(id, date, undefined, { sets, completion: 'partial', skippedExercise: true });

  test('a partial workout with a completed working set counts', async () => {
    await repo.saveSession(partial('p', day(1), [doneSet('w', day(1), { kind: 'warmup' }), doneSet('x', day(1)), { ...doneSet('y', day(1)), completedAt: undefined }]));
    const streak = await repo.getStreak();
    assert.equal(streak.thisWeekCompleted, 1);
    assert.equal(streak.currentWeeks, 1);
  });

  test("a partial with only warm-ups done doesn't count, and neither do skipped or unfinished workouts", async () => {
    await repo.saveSession(partial('warmups', day(0), [doneSet('w1', day(0), { kind: 'warmup' }), doneSet('w2', day(0), { kind: 'warmup' }), { ...doneSet('x', day(0)), completedAt: undefined }]));
    await repo.saveSession(partial('nothing', day(1), [{ ...doneSet('x', day(1)), completedAt: undefined }]));
    await repo.saveSession({ ...finished('skip', day(1)), status: 'skipped', completedDate: undefined, completedAt: undefined });
    await repo.saveSession({ ...finished('going', day(2)), status: 'in_progress', completedDate: undefined, completedAt: undefined });
    const streak = await repo.getStreak();
    assert.equal(streak.thisWeekCompleted, 0);
    assert.equal(streak.currentWeeks, 0);
  });

  test('partial weeks keep the streak going; a warm-ups-only week breaks it', async () => {
    await repo.saveGoal(frequencyGoal(2));
    // Three weeks back to this one; each earlier week has a full and a partial workout.
    for (const w of [-3, -2, -1]) {
      await repo.saveSession(finished(`full${w}`, day(7 * w)));
      await repo.saveSession(partial(`part${w}`, day(7 * w + 3), [doneSet(`set${w}`, day(7 * w + 3))]));
    }
    assert.equal((await repo.getStreak()).currentWeeks, 3);
    // Two weeks ago, the partial only had warm-ups done: that week falls short.
    await repo.saveSession(partial('part-2', day(-11), [doneSet('set-2', day(-11), { kind: 'warmup' })]));
    const streak = await repo.getStreak();
    assert.equal(streak.currentWeeks, 1);
    assert.equal(streak.longestWeeks, 1);
  });

  test('weeks start on Monday by default; switching to Sunday regroups them', async () => {
    // Workouts on Saturday day(-2) and Sunday day(-1); today is Wednesday day(2).
    await repo.saveSession(finished('sat', day(-2)));
    await repo.saveSession(finished('sun', day(-1)));
    const monday = await repo.getStreak();
    assert.deepEqual([monday.currentWeeks, monday.longestWeeks, monday.thisWeekCompleted], [1, 1, 0], 'one Monday-start week, then this one so far');

    await weekStartingOn(7);
    const sunday = await repo.getStreak();
    assert.deepEqual([sunday.currentWeeks, sunday.longestWeeks, sunday.thisWeekCompleted], [2, 2, 1], 'Saturday ends one Sunday-start week, Sunday begins this one');

    await weekStartingOn(1);
    assert.equal((await repo.getStreak()).currentWeeks, 1, 'and back');
  });

  test('with Sunday-start weeks, Sunday begins a new week', async () => {
    for (const n of [0, 1, 3, 5]) await repo.saveSession(finished(`w${n}`, day(n)));
    setToday(day(6)); // Sunday
    assert.equal((await repo.getStreak()).thisWeekCompleted, 4);
    await weekStartingOn(7);
    const streak = await repo.getStreak();
    assert.equal(streak.thisWeekCompleted, 0);
    assert.equal(streak.currentWeeks, 1, "last week counts, and this week hasn't broken it yet");
  });

  test('deriveStreak groups by Monday unless told otherwise', () => {
    const sessions = [finished('sat', day(-2)), finished('sun', day(-1))];
    assert.deepEqual(deriveStreak(sessions, day(2), 1), deriveStreak(sessions, day(2), 1, 1));
    assert.equal(deriveStreak(sessions, day(2), 1, 7).currentWeeks, 2);
    // A late Sunday workout opens the Sunday-start week it was done in.
    assert.equal(deriveStreak([finished('sun', day(6))], day(6), 1, 7).thisWeekCompleted, 1);
    assert.equal(deriveStreak([finished('sun', day(6))], day(7), 1, 1).thisWeekCompleted, 0);
  });
});

describe('push rules', () => {
  const occ = (scheduledDate: ISODate, extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({
    id: `occ_${scheduledDate}`,
    planId: 'weekly',
    planVersion: 1,
    planWorkoutId: 'a',
    scheduledDate,
    ...extra,
  });
  const shiftFor = (plan: Plan, occurrence: ScheduledOccurrence, on: ISODate, weekStartsOn: Weekday = 1) =>
    planShiftFor({ id: 'shift', plan, occurrence, today: on, weekStartsOn, now: STAMP });
  const shift = (fromDate: ISODate, days: number, untilDate?: ISODate, createdAt = STAMP): PlanShift => ({
    id: `shift_${fromDate}_${days}`,
    planId: 'weekly',
    occurrenceId: `occ_${fromDate}`,
    fromDate,
    untilDate,
    days,
    createdAt,
    updatedAt: createdAt,
  });

  test('only a past, unstarted workout of the plan can be pushed', () => {
    assert.equal(shiftFor(weekly(), occ(day(2)), day(2)), undefined, 'today');
    assert.equal(shiftFor(weekly(), occ(day(4)), day(2)), undefined, 'future');
    assert.equal(shiftFor(weekly(), occ(day(0), { sessionId: 's' }), day(2)), undefined, 'started');
    assert.equal(shiftFor(weekly(), occ(day(0), { planId: 'other' }), day(2)), undefined, 'another plan');
    assert.ok(shiftFor(weekly(), occ(day(0)), day(2)));
  });

  test("weekly pushes stop at the end of today's week; programs and cycles don't stop", () => {
    assert.equal(shiftFor(weekly(), occ(day(0)), day(2))?.untilDate, day(6));
    assert.equal(shiftFor(weekly(), occ(day(0)), day(2), 7)?.untilDate, day(5));
    assert.equal(shiftFor(weekly(), occ(day(-2)), day(-1), 7)?.untilDate, day(5), 'Sunday starts the week');
    assert.equal(shiftFor(weekly(), occ(day(-2)), day(-1), 1)?.untilDate, day(-1), 'Sunday ends the week');
    assert.equal(shiftFor(program(), occ(day(0), { planId: 'program' }), day(2))?.untilDate, undefined);
    assert.equal(shiftFor(rotating(), occ(day(0), { planId: 'rotating' }), day(2))?.untilDate, undefined);
  });

  test('pushing a pushed workout again counts from its original date', () => {
    const again = shiftFor(weekly(), occ(day(2), { id: `occ_${day(0)}`, shiftedFromDate: day(0) }), day(3));
    assert.deepEqual([again?.fromDate, again?.days, again?.occurrenceId], [day(0), 1, `occ_${day(0)}`]);
  });

  test('pushes add up within their dates, both ends included', () => {
    // Program or cycle pushes: each moves every original date from its own on.
    const forGood = [shift(day(0), 2, undefined, at(day(0))), shift(day(2), 1, undefined, at(day(1)))];
    assert.equal(shiftedDate(day(-1), forGood), day(-1));
    assert.equal(shiftedDate(day(0), forGood), day(2));
    assert.equal(shiftedDate(day(2), forGood), day(5));
    assert.equal(shiftedDate(day(30), forGood), day(33));
    // A weekly push covers its first day through its week's end.
    const thisWeek = [shift(day(0), 2, day(6))];
    assert.equal(shiftedDate(day(-1), thisWeek), day(-1), 'before it');
    assert.equal(shiftedDate(day(0), thisWeek), day(2), 'its first day');
    assert.equal(shiftedDate(day(4), thisWeek), day(6), 'onto the last day of the week');
    assert.equal(shiftedDate(day(7), thisWeek), day(7), 'after it');
  });

  test("a weekly push never carries a workout past its week's end: that workout stays on its day", () => {
    const thisWeek = [shift(day(0), 2, day(6))];
    assert.equal(shiftedDate(day(5), thisWeek), day(5));
    assert.equal(shiftedDate(day(6), thisWeek), day(6));
    // A week-old miss pushed 7 days: only the missed day moves. Last week's other days aren't
    // covered, and this week's would all cross into next week, so they stay.
    const weekOld = [shift(day(-7), 7, day(6))];
    assert.equal(shiftedDate(day(-8), weekOld), day(-8));
    assert.equal(shiftedDate(day(-7), weekOld), day(0));
    assert.equal(shiftedDate(day(-1), weekOld), day(-1));
    for (let n = 0; n <= 13; n++) assert.equal(shiftedDate(day(n), weekOld), day(n), `day ${n} stays`);
  });

  test('pushes apply in the order they were made, however they are listed', () => {
    // Wednesday: Monday's A pushed 2 days. Thursday: missed again, pushed 1 more.
    const first = shift(day(0), 2, day(6), at(day(2)));
    const second = shift(day(0), 1, day(6), at(day(3)));
    for (const listed of [[first, second], [second, first]]) {
      assert.equal(shiftedDate(day(0), listed), day(3), 'A: both pushes');
      assert.equal(shiftedDate(day(2), listed), day(5), 'B: both pushes');
      // C: the first push takes it to Sunday; the second would cross the week's end, so it stays.
      assert.equal(shiftedDate(day(4), listed), day(6), 'C: the first push only');
      assert.equal(shiftedDate(day(6), listed), day(6), 'D: neither');
    }
    // Made the other way round, the 1-day push fits first and the 2-day one then wouldn't.
    const swapped = [{ ...first, createdAt: second.createdAt }, { ...second, createdAt: first.createdAt }];
    assert.equal(shiftedDate(day(4), swapped), day(5));
  });

  test("a push brings earlier workouts into range under their original ids, and ignores other plans' pushes", () => {
    const plan = weekly();
    const shifts = [shift(day(0), 2, day(6)), { ...shift(day(0), 5), planId: 'other' }];
    const thisWeek = scheduleOccurrences(plan, day(2), day(6), shifts);
    assert.deepEqual(
      thisWeek.map((o) => [o.id, o.scheduledDate, o.shiftedFromDate]),
      [
        [`occ_weekly_${day(0)}_a`, day(2), day(0)],
        [`occ_weekly_${day(2)}_b`, day(4), day(2)],
        [`occ_weekly_${day(4)}_c`, day(6), day(4)],
        // Sunday's D would cross into next week, so it stays.
        [`occ_weekly_${day(6)}_d`, day(6), undefined],
      ],
    );
    assert.deepEqual(
      scheduleOccurrences(plan, day(7), day(13), shifts).map((o) => [o.id, o.scheduledDate, o.shiftedFromDate]),
      scheduleOccurrences(plan, day(7), day(13)).map((o) => [o.id, o.scheduledDate, o.shiftedFromDate]),
      'next week is exactly as usual',
    );
  });
});

describe('where a plan has got to after its pushes (originalDateFor)', () => {
  const shift = (fromDate: ISODate, days: number, createdAt = STAMP): PlanShift => ({
    id: `shift_${fromDate}_${days}`,
    planId: 'rotating',
    occurrenceId: `occ_${fromDate}`,
    fromDate,
    days,
    createdAt,
    updatedAt: createdAt,
  });

  test('with no pushes, the same date', () => {
    for (const n of [-3, 0, 2, 40]) assert.equal(originalDateFor(day(n), []), day(n));
  });

  test("after a cycle's push, today is the pushed workout's original date", () => {
    // B, missed Tuesday, pushed to Wednesday.
    const pushed = [shift(day(1), 1)];
    assert.equal(originalDateFor(day(0), pushed), day(0), 'before the push');
    assert.equal(originalDateFor(day(2), pushed), day(1));
    assert.equal(originalDateFor(day(10), pushed), day(9), 'and one day behind from then on');
    // Two pushes add up.
    assert.equal(originalDateFor(day(10), [...pushed, shift(day(3), 2, at(day(5)))]), day(7));
  });

  test('on a day the push emptied, the plan is still where it was before the push', () => {
    // Monday's A done; Tuesday's B missed and pushed 3 days, to Friday. Tuesday to Thursday
    // are empty now, so the cycle is still on Monday's step; Friday is Tuesday's.
    const pushed = [shift(day(1), 3)];
    for (const n of [1, 2, 3]) assert.equal(originalDateFor(day(n), pushed), day(0), `day ${n}`);
    assert.equal(originalDateFor(day(4), pushed), day(1));
  });

  test('a day whose workouts a push kept is passed over, even at the edge of its reach, and keeping every day still returns', () => {
    // A, B, rest: Monday's A missed, Tuesday's B done early, and on Tuesday A pushed a day, keeping
    // B on Tuesday. Wednesday, the day after A, is still on A's step, not the done B's.
    const pushed = [shift(day(0), 1)];
    assert.equal(originalDateFor(day(2), pushed), day(1), 'without a kept day');
    assert.equal(originalDateFor(day(2), pushed, (original) => original === day(1)), day(0), "Tuesday's kept B sits right at the push's reach");
    // A predicate that keeps every day mustn't loop forever.
    let asked = 0;
    const keepsEveryDay = () => {
      asked++;
      if (asked > 10_000) throw new Error('originalDateFor never stops passing over kept days');
      return true;
    };
    const reached = originalDateFor(day(2), pushed, keepsEveryDay);
    assert.ok(asked > 0, 'the predicate is asked');
    assert.ok(reached < day(1), 'every kept day it can pass over is passed over before it returns');
  });

  test("through the database: today runs the pushed workout's step, as Today shows", async () => {
    // A, B, rest: Monday's A and Tuesday's B missed. On Thursday B is pushed 2 days.
    await plansSavedMonday([rotating()], day(3));
    const pushed = await pushLatestMissed('push');
    assert.equal(pushed.date, day(1));
    const plan = (await repo.getPlan('rotating'))!;
    const shifts = await repo.listPlanShifts();
    assert.equal(originalDateFor(today, shifts), day(1));
    assert.deepEqual(workoutsOn(plan.schedule, plan.startDate, originalDateFor(today, shifts)), ['b']);
    assert.deepEqual((await itemsOn(today)).map((i) => i.workout?.id), ['b']);
    // Wednesday, emptied by the push, is still on Monday's step; Friday now runs the rest day.
    assert.equal(originalDateFor(day(2), shifts), day(0));
    assert.equal(originalDateFor(day(4), shifts), day(2));
    assert.deepEqual(workoutsOn(plan.schedule, plan.startDate, originalDateFor(day(4), shifts)), []);
    assert.deepEqual(await itemsOn(day(4)), []);
  });
});

describe('dates and time zones', () => {
  // Calendar dates are local; timestamps are UTC. Day math must hold through daylight-saving
  // changes, including zones that change at midnight (Santiago) or by half an hour (Lord Howe).
  const zones = ['America/Chicago', 'America/Santiago', 'Australia/Lord_Howe', 'Europe/London', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

  test('day math holds through daylight-saving changes in every zone', () => {
    for (const zone of zones) {
      inZone(zone, () => {
        for (let utc = Date.UTC(2026, 0, 1); utc < Date.UTC(2028, 0, 1); utc += 86_400_000) {
          const date = new Date(utc).toISOString().slice(0, 10);
          const next = new Date(utc + 86_400_000).toISOString().slice(0, 10);
          assert.equal(addDays(date, 1), next, `${zone}: the day after ${date}`);
          assert.equal(addDays(next, -1), date, `${zone}: the day before ${next}`);
          assert.equal(daysBetween(date, next), 1, `${zone}: ${date} to ${next}`);
          assert.equal(isoWeekday(date), ((new Date(utc).getUTCDay() + 6) % 7) + 1, `${zone}: weekday of ${date}`);
          for (const weekStartsOn of [1, 7] as const) {
            const start = startOfWeek(date, weekStartsOn);
            assert.equal(isoWeekday(start), weekStartsOn, `${zone}: week of ${date}`);
            assert.ok(daysBetween(start, date) >= 0 && daysBetween(start, date) < 7);
          }
        }
      });
    }
  });

  test('a daily plan has one workout each day through a daylight-saving change', () => {
    for (const zone of zones) {
      inZone(zone, () => {
        const plan = makePlan('daily', cycle(['a']), { startDate: '2026-03-01' });
        for (const [from, to] of [['2026-03-01', '2026-04-15'], ['2026-09-20', '2026-11-10']]) {
          const dates = scheduleOccurrences(plan, from, to).map((o) => o.scheduledDate);
          assert.equal(dates.length, daysBetween(from, to) + 1, `${zone}: ${from} to ${to}`);
          assert.equal(new Set(dates).size, dates.length);
        }
      });
    }
  });

  test('a workout finished late in the evening counts on the local date', () => {
    // 11:30 pm in Chicago is already the next day in UTC.
    assert.equal(inZone('America/Chicago', () => toISODate(new Date('2026-10-22T04:30:00.000Z'))), '2026-10-21');
    // 12:30 am in Tokyo is still the day before in UTC.
    assert.equal(inZone('Asia/Tokyo', () => toISODate(new Date('2026-10-21T15:30:00.000Z'))), '2026-10-22');
  });
});
