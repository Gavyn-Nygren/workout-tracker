// Weekly streak targets (spec 2.5; roadmap G3.10, "What's planned that week"): a weekly goal, else
// what the plans scheduled that week, else 1. Finished weeks keep the target they ended with, so
// later goal or plan edits, pushes, and plan deletes never rewrite a past streak.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { eraseAllData, loadSampleData } from '../src/data/db/sampleData';
import { migrate, SCHEMA_VERSION } from '../src/data/db/schema';
import { createSqliteRepository, regroupedPlanned, regroupedTarget, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { buildFakeDataset } from '../src/data/fake';
import { INVALIDATES } from '../src/data/invalidation';
import { defaultPreferences } from '../src/data/preferences';
import { deriveStreak } from '../src/data/progress';
import type { FrozenWeekTarget, Goal, ISODate, LoggedSet, Plan, PlanSchedule, ScheduledOccurrence, StreakWeek, Weekday, WorkoutSession } from '../src/data/types';
import { flatWeekTargets, liveWeekTargets, plannedPerWeek, targetFor, weekTarget, type WeekTargetLookup } from '../src/data/weekTargets';
import { sessionForReopen } from '../src/features/workout/buildSession';
import { openTestDatabase } from './support/nodeSqlite';

// ---------------------------------------------------------------------------
// Fixtures

/** Day `n` of the test calendar: day(0) is Monday 2026-10-19, day(8) Tuesday 2026-10-27. */
const day = (n: number): ISODate => addDays('2026-10-19', n);
const STAMP = '2026-10-01T08:00:00.000Z';

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
function finished(id: string, date: ISODate, occurrence?: ScheduledOccurrence, options: { sets?: LoggedSet[]; completion?: 'full' | 'partial' } = {}): WorkoutSession {
  return {
    id,
    name: 'Workout',
    occurrenceId: occurrence?.id,
    planId: occurrence?.planId,
    planWorkoutId: occurrence?.planWorkoutId,
    status: 'completed',
    completion: options.completion ?? 'full',
    scheduledDate: occurrence?.scheduledDate,
    startedAt: at(date, '14:00'),
    completedAt: at(date),
    completedDate: date,
    blocks: [{ id: `${id}_block`, type: 'single', exercises: [{ id: `${id}_entry`, exerciseId: 'ex_back_squat', skipped: false, sets: options.sets ?? [doneSet(`${id}_set`, date)] }] }],
    createdAt: at(date, '14:00'),
    updatedAt: at(date),
  };
}

function makePlan(id: string, schedule: PlanSchedule): Plan {
  const ids = schedule.type === 'rotating' ? schedule.sequence.filter((s) => s !== 'rest') : schedule.days.flatMap((d) => d.workoutIds);
  return {
    id,
    name: `Plan ${id}`,
    version: 1,
    status: 'active',
    startDate: day(0),
    schedule,
    workouts: [...new Set(ids)].map((w) => ({ id: w, name: w, blocks: [] })),
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}
/** A weekly plan with one workout on each of these weekdays. */
const weekly = (id: string, weekdays: Weekday[]) => makePlan(id, { type: 'weekly', days: weekdays.map((weekday) => ({ weekday, workoutIds: [`${id}${weekday}`] })) });
/** A one-week program: Monday, Wednesday, Friday, then nothing. */
const oneWeekProgram = (id: string) => makePlan(id, { type: 'fixed', weeks: 1, days: ([1, 3, 5] as Weekday[]).map((weekday) => ({ week: 1, weekday, workoutIds: [`${id}${weekday}`] })) });

const frequencyGoal = (workoutsPerWeek: number): Goal => ({ id: 'goal_weekly', type: 'frequency', title: 'Train every week', workoutsPerWeek, createdAt: STAMP, updatedAt: STAMP });

const occurrence = (scheduledDate: ISODate, extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({
  id: `occ_${scheduledDate}_${extra.planId ?? 'p'}`,
  planId: 'p',
  planVersion: 1,
  planWorkoutId: 'w',
  scheduledDate,
  ...extra,
});

/** The fields a test cares about, for one streak week. */
const brief = (w: StreakWeek | undefined) => w && { weekStart: w.weekStart, target: w.target, source: w.source, planned: w.planned, completed: w.completed, met: w.met, frozen: w.frozen };

let db: ReturnType<typeof openTestDatabase>;
let today: ISODate;
let repo: SqliteRepository;

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

/** Saves the plans on Monday, day(0), so their calendars start then. */
async function plansFromMonday(...plans: Plan[]) {
  fresh(day(0));
  for (const plan of plans) await repo.savePlan(plan);
}

const occurrencesIn = (from: ISODate, to: ISODate) => repo.listOccurrences({ from, to });
const occurrenceOn = async (planId: string, date: ISODate) => {
  const found = (await occurrencesIn(date, date)).find((o) => o.planId === planId);
  assert.ok(found, `${planId} has a workout on ${date}`);
  return found;
};
const weekOf = async (weekStart: ISODate) => brief((await repo.getStreak()).weeks.find((w) => w.weekStart === weekStart));
const frozenRows = () => db.getAllSync<{ week_start: string; week_starts_on: number }>('SELECT week_start, week_starts_on FROM streak_weeks ORDER BY week_starts_on, week_start', []);
const weekStartingOn = (weekStartsOn: Weekday) => repo.savePreferences({ ...defaultPreferences, weekStartsOn });

// ---------------------------------------------------------------------------
// The rules

describe('streak targets: the rules', () => {
  test('a weekly goal wins, then what the plans scheduled that week, then 1', () => {
    assert.deepEqual(targetFor(4, 3), { target: 4, source: 'goal', planned: 3 });
    assert.deepEqual(targetFor(2, 0), { target: 2, source: 'goal', planned: 0 });
    assert.deepEqual(targetFor(undefined, 3), { target: 3, source: 'plan', planned: 3 });
    assert.deepEqual(targetFor(undefined, 0), { target: 1, source: 'minimum', planned: 0 });
  });

  test('planned workouts are counted per week, from every plan, on their dates after pushes', () => {
    const occurrences = [
      ...[0, 2, 4].map((n) => occurrence(day(n), { planId: 'a' })),
      ...[1, 3].map((n) => occurrence(day(n), { planId: 'b' })),
      // Pushed from last Friday to Monday: it counts in its new week.
      occurrence(day(7), { planId: 'a', shiftedFromDate: day(4), id: 'pushed' }),
    ];
    assert.deepEqual([...plannedPerWeek(occurrences, 1)], [[day(0), 5], [day(7), 1]]);
    assert.deepEqual(weekTarget(undefined, occurrences, 1, day(0)), { target: 5, source: 'plan', planned: 5 });
    assert.deepEqual(weekTarget(undefined, occurrences, 1, day(14)), { target: 1, source: 'minimum', planned: 0 });
    assert.deepEqual(weekTarget(3, occurrences, 1, day(0)), { target: 3, source: 'goal', planned: 5 });
  });

  test('with Sunday weeks, Sunday begins the week', () => {
    // Sunday day(6) and Monday day(7) share a Sunday-start week.
    const occurrences = [0, 2, 4, 6, 7].map((n) => occurrence(day(n)));
    assert.deepEqual([...plannedPerWeek(occurrences, 7)], [[day(-1), 3], [day(6), 2]]);
    assert.deepEqual([...plannedPerWeek(occurrences, 1)], [[day(0), 4], [day(7), 1]]);
    assert.equal(weekTarget(undefined, occurrences, 7, day(6)).target, 2);
  });

  test('live targets are never frozen; a plain number is the same target every week', () => {
    const live = liveWeekTargets(undefined, [occurrence(day(0))], 1);
    assert.deepEqual(live(day(0)), { target: 1, source: 'plan', planned: 1, frozen: false });
    assert.deepEqual(live(day(7)), { target: 1, source: 'minimum', planned: 0, frozen: false });
    assert.deepEqual(flatWeekTargets(3)(day(0)), { target: 3, source: 'goal', planned: 0, frozen: false });
    assert.equal(flatWeekTargets(0)(day(0)).target, 1);
  });
});

describe('deriveStreak with a target per week', () => {
  /** Week 0 needs 2, week 1 needs 3, anything else 1 and live. */
  const targets: WeekTargetLookup = (week) =>
    week === day(0)
      ? { target: 2, source: 'plan', planned: 2, frozen: true }
      : week === day(7)
        ? { target: 3, source: 'goal', planned: 4, frozen: true }
        : { target: 1, source: 'minimum', planned: 0, frozen: false };

  test('each week is judged against its own target', () => {
    const sessions = [0, 2, 7, 9, 15].map((n) => finished(`w${n}`, day(n)));
    const streak = deriveStreak(sessions, day(16), targets);
    assert.deepEqual(streak.weeks.map(brief), [
      { weekStart: day(0), target: 2, source: 'plan', planned: 2, completed: 2, met: true, frozen: true },
      { weekStart: day(7), target: 3, source: 'goal', planned: 4, completed: 2, met: false, frozen: true },
      { weekStart: day(14), target: 1, source: 'minimum', planned: 0, completed: 1, met: true, frozen: false },
    ]);
    assert.deepEqual([streak.currentWeeks, streak.longestWeeks], [1, 1]);
    assert.deepEqual(streak.milestoneDates, [day(2)], 'week 0 was met by its second workout');
    assert.deepEqual([streak.thisWeekCompleted, streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned], [1, 1, 'minimum', 0]);
  });

  test('a week is met by the workout that reached its own target', () => {
    const sessions = [0, 1, 7, 8, 9, 10].map((n) => finished(`w${n}`, day(n)));
    assert.deepEqual(deriveStreak(sessions, day(10), targets).milestoneDates, [day(1), day(9)]);
  });

  test("this week doesn't break the streak until it ends, whatever its target", () => {
    const sessions = [0, 1, 7, 8, 9, 14].map((n) => finished(`w${n}`, day(n)));
    const bigWeek: WeekTargetLookup = (week) => (week === day(14) ? { target: 4, source: 'plan', planned: 4, frozen: false } : targets(week));
    const midweek = deriveStreak(sessions, day(16), bigWeek);
    assert.deepEqual([midweek.currentWeeks, midweek.thisWeekCompleted, midweek.thisWeekTarget], [2, 1, 4]);
    // Once it ends short, the next week starts from nothing.
    assert.equal(deriveStreak(sessions, day(21), bigWeek).currentWeeks, 0);
  });

  test('weeks run from the first counted workout through this week, empty weeks included', () => {
    const sessions = [finished('a', day(0)), finished('b', day(21))];
    const streak = deriveStreak(sessions, day(23), 1);
    assert.deepEqual(streak.weeks.map((w) => [w.weekStart, w.completed, w.met]), [[day(0), 1, true], [day(7), 0, false], [day(14), 0, false], [day(21), 1, true]]);
    assert.equal(streak.currentWeeks, 1);
  });

  test('before any workout there are no weeks, and this week still has its target', () => {
    const streak = deriveStreak([], day(8), () => ({ target: 3, source: 'plan', planned: 3, frozen: false }));
    assert.deepEqual(streak.weeks, []);
    assert.deepEqual([streak.thisWeekCompleted, streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned, streak.currentWeeks], [0, 3, 'plan', 3, 0]);
  });

  test("a partial workout with a completed working set counts toward a planned week; warm-ups only don't", () => {
    const three: WeekTargetLookup = () => ({ target: 3, source: 'plan', planned: 3, frozen: false });
    const partial = (sets: LoggedSet[]) => finished('p', day(4), undefined, { completion: 'partial', sets });
    const full = [finished('a', day(0)), finished('b', day(2))];
    const counted = partial([doneSet('x', day(4)), { ...doneSet('y', day(4)), completedAt: undefined }]);
    assert.equal(deriveStreak([...full, counted], day(5), three).weeks[0].met, true);
    const warmups = partial([doneSet('x', day(4), { kind: 'warmup' })]);
    assert.equal(deriveStreak([...full, warmups], day(5), three).weeks[0].met, false);
  });
});

// ---------------------------------------------------------------------------
// Through the repository

describe('the weekly target, through the repository', () => {
  test('with no plan and no weekly goal, each week needs 1', async () => {
    fresh(day(8));
    await repo.saveSession(finished('a', day(1)));
    await repo.saveSession(finished('b', day(8)));
    const streak = await repo.getStreak();
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned], [1, 'minimum', 0]);
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(0), target: 1, source: 'minimum', planned: 0, completed: 1, met: true, frozen: true });
    assert.equal(streak.weeks[1].frozen, false, 'this week is live');
    assert.equal(streak.currentWeeks, 2);
  });

  test("without a goal, a week needs every workout the plans scheduled that week, done, missed, or upcoming", async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]), weekly('b', [2, 4]));
    setToday(day(8));
    for (const n of [0, 1, 2, 3]) await repo.saveSession(finished(`w${n}`, day(n)));
    await repo.saveSession(finished('w7', day(7)));
    let streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(0), target: 5, source: 'plan', planned: 5, completed: 4, met: false, frozen: true });
    // This week: Monday done, today and the rest of the week still ahead.
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned, streak.thisWeekCompleted], [5, 'plan', 5, 1]);
    assert.equal(streak.currentWeeks, 0);

    // A fifth workout last week meets it; this week isn't done yet, so it doesn't break the run.
    await repo.saveSession(finished('w4', day(4)));
    streak = await repo.getStreak();
    assert.equal(streak.weeks[0].met, true);
    assert.equal(streak.currentWeeks, 1);
  });

  test('a weekly goal beats the plans; the planned count is still reported', async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]));
    setToday(day(9));
    await repo.saveGoal(frequencyGoal(2));
    const streak = await repo.getStreak();
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned], [2, 'goal', 3]);
  });

  test('after a program ends, with nothing else planned, a week needs 1', async () => {
    await plansFromMonday(oneWeekProgram('p'));
    setToday(day(8));
    for (const n of [0, 2, 4, 8]) await repo.saveSession(finished(`w${n}`, day(n)));
    const streak = await repo.getStreak();
    assert.deepEqual(streak.weeks.map((w) => [w.target, w.source]), [[3, 'plan'], [1, 'minimum']]);
    assert.equal(streak.currentWeeks, 2);
  });

  test('completing every planned workout this week extends the streak', async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]));
    for (const n of [0, 2, 4]) await repo.saveSession(finished(`w${n}`, day(n)));
    setToday(day(7));
    await repo.saveSession(finished('w7', day(7)));
    assert.equal((await repo.getStreak()).currentWeeks, 1);
    setToday(day(11));
    await repo.saveSession(finished('w9', day(9)));
    await repo.saveSession(finished('w11', day(11)));
    const streak = await repo.getStreak();
    assert.equal(streak.currentWeeks, 2);
    assert.equal(streak.milestoneDates[1], day(11));
  });
});

describe('finished weeks keep their target', () => {
  test('editing the weekly goal changes this week only', async () => {
    fresh(day(0));
    await repo.saveGoal(frequencyGoal(2));
    await repo.saveSession(finished('a', day(1)));
    await repo.saveSession(finished('b', day(3)));
    setToday(day(8));
    await repo.saveSession(finished('c', day(8)));
    assert.equal((await weekOf(day(0)))?.target, 2);

    await repo.saveGoal(frequencyGoal(3));
    const streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(0), target: 2, source: 'goal', planned: 0, completed: 2, met: true, frozen: true });
    assert.deepEqual([streak.thisWeekTarget, streak.currentWeeks], [3, 1]);

    await repo.deleteGoal('goal_weekly');
    assert.equal((await weekOf(day(0)))?.target, 2);
    assert.equal((await repo.getStreak()).thisWeekSource, 'minimum');
  });

  test("a goal edited before the streak is read again still can't reach a finished week", async () => {
    fresh(day(0));
    await repo.saveGoal(frequencyGoal(2));
    await repo.saveSession(finished('a', day(1)));
    await repo.saveSession(finished('b', day(3)));
    setToday(day(8)); // the week ended with nothing read since
    await repo.saveGoal(frequencyGoal(5));
    assert.deepEqual([(await weekOf(day(0)))?.target, (await weekOf(day(0)))?.met], [2, true]);
    assert.equal((await repo.getStreak()).thisWeekTarget, 5);
  });

  test('editing a plan changes this week only', async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]));
    for (const n of [0, 2, 4]) await repo.saveSession(finished(`w${n}`, day(n)));
    setToday(day(7));
    await repo.savePlan({ ...(await repo.getPlan('a'))!, schedule: weekly('a', [1]).schedule });
    const streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(0), target: 3, source: 'plan', planned: 3, completed: 3, met: true, frozen: true });
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekPlanned], [1, 1]);
    assert.equal(streak.currentWeeks, 1);
  });

  test("deleting a plan removes its missed workouts, but the week they were in keeps its target", async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]));
    await repo.saveSession(finished('w0', day(0), await occurrenceOn('a', day(0))));
    setToday(day(8));
    await repo.deletePlan('a');
    assert.equal((await occurrencesIn(day(0), day(6))).length, 1, 'only the workout that was done is left');
    const streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(0), target: 3, source: 'plan', planned: 3, completed: 1, met: false, frozen: true });
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned], [1, 'minimum', 0]);
  });

  test('a push moves a missed workout out of its finished week, which keeps its target; undo moves it back', async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]));
    for (const n of [0, 2]) await repo.saveSession(finished(`w${n}`, day(n)));
    setToday(day(7));
    await repo.pushPlanForward((await occurrenceOn('a', day(4))).id, 'push');
    assert.equal((await occurrencesIn(day(0), day(6))).length, 2, 'Friday left last week');
    const thisWeek = (await occurrencesIn(day(7), day(13))).length;
    assert.equal(thisWeek, 4, 'and joined this one');

    let streak = await repo.getStreak();
    assert.deepEqual([streak.weeks[0].target, streak.weeks[0].planned, streak.weeks[0].met], [3, 3, false]);
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekPlanned], [4, 4]);

    await repo.undoPlanShift('push');
    streak = await repo.getStreak();
    assert.equal(streak.weeks[0].target, 3);
    assert.equal(streak.thisWeekTarget, 3);
  });

  test('a later workout logged in a finished week still counts against its kept target', async () => {
    fresh(day(0));
    await repo.saveGoal(frequencyGoal(2));
    await repo.saveSession(finished('a', day(1)));
    setToday(day(8));
    await repo.saveGoal(frequencyGoal(1));
    assert.equal((await weekOf(day(0)))?.met, false);
    // A reopened workout keeps its date, and so does any workout saved for that day.
    await repo.saveSession(finished('b', day(3)));
    assert.deepEqual([(await weekOf(day(0)))?.target, (await weekOf(day(0)))?.met], [2, true]);
  });

  describe('a reopened workout counts as it was until it is finished or discarded (G3.10 review)', () => {
    // Mon/Wed/Fri plan. "1× a week for 4 weeks" (4 workouts) is reached Thursday day(3) and moves to
    // Completed goals a week later, so the week of day(7) needs the plan's 3. One workout is done in it.
    async function setUp() {
      await plansFromMonday(weekly('a', [1, 3, 5]));
      await repo.saveGoal({ id: 'g', type: 'frequency', title: 'Train 1× per week', workoutsPerWeek: 1, deadline: day(27), createdAt: at(day(0), '07:00'), updatedAt: at(day(0), '07:00') });
      for (const n of [0, 1, 2, 3]) {
        setToday(day(n));
        await repo.saveSession(finished(`s${n}`, day(n)));
      }
      setToday(day(7));
      await repo.saveSession(finished('s7', day(7)));
      setToday(day(13));
      const sunday = await repo.getStreak();
      assert.deepEqual([sunday.thisWeekTarget, sunday.thisWeekSource], [3, 'plan']);
    }
    const ended = { weekStart: day(7), target: 3, source: 'plan', planned: 3, completed: 1, met: false, frozen: true };

    test('reopened the next morning, Home read while it is open, then discarded', async () => {
      await setUp();
      setToday(day(14));
      const original = (await repo.getSession('s1'))!;
      await repo.saveSession(sessionForReopen(original)); // the reopen's autosave
      await repo.getStreak(); // Home, while it's open
      await repo.saveSession(original); // Discard puts it back
      assert.deepEqual(await weekOf(day(7)), ended);
    });

    test('reopened on Sunday and left open overnight, whichever is read first on Monday', async () => {
      for (const homeFirst of [true, false]) {
        await setUp();
        const original = (await repo.getSession('s1'))!;
        await repo.saveSession(sessionForReopen(original));
        setToday(day(14));
        if (homeFirst) await repo.getStreak();
        await repo.saveSession(original);
        assert.deepEqual(await weekOf(day(7)), ended, homeFirst ? 'Home first' : 'Discard first');
      }
    });
  });
});

describe('the week-start setting', () => {
  // A, B, rest, repeating from Monday day(0): Monday weeks hold 5 workouts each; the Sunday week
  // ending Saturday day(5) holds 4, the next one 5.
  const rotating = () => makePlan('r', { type: 'rotating', sequence: ['a', 'b', 'rest'] });

  test("after a switch, a week keeps the stored target of the old week it shares most days with; switching back finds the old rows", async () => {
    await plansFromMonday(rotating());
    setToday(day(8));
    for (const n of [1, 3]) await repo.saveSession(finished(`w${n}`, day(n)));
    assert.deepEqual(await weekOf(day(0)), { weekStart: day(0), target: 5, source: 'plan', planned: 5, completed: 2, met: false, frozen: true });

    // A goal set now doesn't reach the Monday week that ended, and switching to Sunday weeks can't
    // either: the Sunday week shares 6 days with it and keeps its target. Its planned count is its
    // own: 4 of the Monday week's 5 fall in it. This week is live.
    await repo.saveGoal(frequencyGoal(2));
    await weekStartingOn(7);
    let streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(-1), target: 5, source: 'plan', planned: 4, completed: 2, met: false, frozen: true });
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekPlanned], [2, 5]);

    await weekStartingOn(1);
    streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks[0]), { weekStart: day(0), target: 5, source: 'plan', planned: 5, completed: 2, met: false, frozen: true });
    assert.deepEqual(
      frozenRows().map((r) => [r.week_starts_on, r.week_start]),
      [
        [1, day(0)],
        [7, day(-1)],
      ],
    );
  });

  test('a goal edited before a switch reaches neither the old weeks nor the regrouped ones (G3.10 review)', async () => {
    fresh(day(-28));
    await repo.saveGoal({ ...frequencyGoal(3), createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' });
    // Four weeks of Monday, Wednesday, Friday: each meets 3.
    for (let w = 0; w < 4; w++) for (const d of [0, 2, 4]) await repo.saveSession(finished(`s${w}_${d}`, day(-28 + w * 7 + d)));
    setToday(day(0));
    assert.equal((await repo.getStreak()).currentWeeks, 4);
    const earned = () => repo.listBadges().then((badges) => badges.find((b) => b.badgeKey === 'streak_4_weeks')?.earnedDate);
    const fourWeeks = await earned();
    assert.ok(fourWeeks);

    await repo.saveGoal({ ...frequencyGoal(5), createdAt: '2026-09-01T08:00:00.000Z' });
    await weekStartingOn(7);
    const streak = await repo.getStreak();
    assert.equal(streak.currentWeeks, 4);
    assert.ok(streak.weeks.slice(0, -1).every((w) => w.target === 3 && w.met));
    assert.equal(await earned(), fourWeeks);
    await weekStartingOn(1);
    assert.equal(await earned(), fourWeeks);
  });

  test('a regrouped week with no old week sharing most of its days gets the rules as they stand', async () => {
    await plansFromMonday(rotating());
    for (const n of [1, 3]) await repo.saveSession(finished(`w${n}`, day(n)));
    // Sunday: the Monday week is still this week, so nothing is stored for it.
    setToday(day(6));
    await weekStartingOn(7);
    assert.deepEqual(await weekOf(day(-1)), { weekStart: day(-1), target: 4, source: 'plan', planned: 4, completed: 2, met: false, frozen: true });
  });

  test('switching to Monday weeks on a Sunday: the Monday week under way gets its own target when it ends (G3.10 review)', async () => {
    // Every other day from Monday day(0). Sunday weeks hold 3, then 4; the Monday week day(7)-day(13) holds 3.
    fresh(day(-1));
    await weekStartingOn(7);
    await repo.savePlan(makePlan('eod', { type: 'rotating', sequence: ['a', 'rest'] }));
    for (const n of [0, 2, 4, 6, 8, 10, 12]) {
      setToday(day(n));
      await repo.saveSession(finished(`w${n}`, day(n)));
    }
    setToday(day(13)); // Sunday
    assert.equal((await repo.getStreak()).currentWeeks, 2);
    await weekStartingOn(1);
    let streak = await repo.getStreak();
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekCompleted, streak.currentWeeks], [3, 3, 2]);

    setToday(day(14));
    streak = await repo.getStreak();
    assert.deepEqual(brief(streak.weeks.find((w) => w.weekStart === day(7))), { weekStart: day(7), target: 3, source: 'plan', planned: 3, completed: 3, met: true, frozen: true });
    assert.equal(streak.currentWeeks, 2);
  });

  test('a switch keeps whether each past week was met, though its workouts are regrouped (G3.10 review)', async () => {
    // Every other day from Monday day(0): Monday weeks plan 4, 3, 4; Sunday weeks 3, 4, 3.
    await plansFromMonday(makePlan('eod', { type: 'rotating', sequence: ['a', 'rest'] }));
    for (const n of [0, 2, 4, 6, 8, 10, 12, 14]) {
      setToday(day(n));
      await repo.saveSession(finished(`w${n}`, day(n)));
    }
    setToday(day(15));
    let streak = await repo.getStreak();
    assert.deepEqual(streak.weeks.map((w) => [w.target, w.completed, w.met]), [[4, 4, true], [3, 3, true], [4, 1, false]]);
    assert.equal(streak.currentWeeks, 2);

    // The first Sunday week holds 3 of the first Monday week's 4 workouts: it stays met.
    await weekStartingOn(7);
    streak = await repo.getStreak();
    assert.deepEqual(streak.weeks.map((w) => [w.weekStart, w.target, w.completed, w.met]), [[day(-1), 3, 3, true], [day(6), 3, 4, true], [day(13), 3, 1, false]]);
    assert.equal(streak.currentWeeks, 2);
  });

  test('regroupedTarget keeps a met week met and an unmet week unmet', () => {
    assert.equal(regroupedTarget(4, 4, 3), 3);
    assert.equal(regroupedTarget(3, 3, 4), 3);
    assert.equal(regroupedTarget(4, 3, 4), 5);
    assert.equal(regroupedTarget(4, 3, 2), 4);
    assert.equal(regroupedTarget(1, 1, 0), 1, 'a met week with none of its workouts left in the regrouped week cannot stay met');
  });

  test('switching the setting freezes the weeks that ended under the old one first, then carries them over at once', async () => {
    await plansFromMonday(rotating());
    await repo.saveSession(finished('w1', day(1)));
    setToday(day(8)); // nothing read since last week ended
    await weekStartingOn(7);
    assert.deepEqual(
      frozenRows().map((r) => [r.week_starts_on, r.week_start]),
      [
        [1, day(0)],
        [7, day(-1)],
      ],
    );
    assert.deepEqual(await weekOf(day(-1)), { weekStart: day(-1), target: 5, source: 'plan', planned: 4, completed: 1, met: false, frozen: true });
  });

  test("a regrouped week's planned count is its own days, as the old weeks stored them (G3.10 review 3)", () => {
    const row = (weekStart: ISODate, plannedDates: ISODate[] | undefined, frozenAt: string, withIds = true): FrozenWeekTarget => ({
      weekStart,
      weekStartsOn: 1,
      target: 3,
      source: 'plan',
      planned: plannedDates?.length ?? 3,
      ...(plannedDates ? { plannedDates } : {}),
      ...(plannedDates && withIds ? { plannedIds: plannedDates.map((d) => `occ_${d}`) } : {}),
      frozenAt,
    });
    const slot = (d: ISODate) => ({ date: d, id: `occ_${d}` });
    // The Sunday week day(-1)-day(5), regrouped from Monday weeks. The Monday week day(0) had Monday,
    // Wednesday and Friday when it was stored; Friday has since been deleted. Sunday day(-1) is in a
    // Monday week with nothing stored, so it counts what's stored now.
    const mondayWeek = row(day(0), [day(0), day(2), day(4)], '2026-10-26T08:00:00.000Z');
    assert.deepEqual(regroupedPlanned(day(-1), [mondayWeek], [slot(day(-1)), slot(day(0)), slot(day(2))]), [day(-1), day(0), day(2), day(4)].map(slot));
    // Two settings cover the same days: the earliest stored wins. A row stored without dates covers nothing.
    const later = row(day(0), [day(0)], '2026-10-27T08:00:00.000Z');
    assert.deepEqual(regroupedPlanned(day(-1), [later, mondayWeek], []), [day(0), day(2), day(4)].map(slot));
    assert.deepEqual(regroupedPlanned(day(-1), [row(day(0), undefined, STAMP)], [slot(day(0)), slot(day(2))]), [slot(day(0)), slot(day(2))]);
    // A row stored with dates but no ids (before review 3b) gives its days' dates without ids.
    assert.deepEqual(regroupedPlanned(day(-1), [row(day(0), [day(0), day(2)], STAMP, false)], [slot(day(-1))]), [slot(day(-1)), { date: day(0) }, { date: day(2) }]);
    // A workout pushed from Sunday day(-1) (stored in the Monday week day(-7)) to Wednesday day(2)
    // (stored in the Monday week day(0)) is one workout, where it was stored last.
    const pushed = { date: day(2), id: `occ_${day(-1)}` };
    const lastWeek = { ...row(day(-7), [day(-1)], '2026-10-19T08:00:00.000Z'), plannedIds: [pushed.id] };
    const thisWeek = { ...row(day(0), [day(0), day(2)], '2026-10-26T08:00:00.000Z'), plannedIds: [`occ_${day(0)}`, pushed.id] };
    assert.deepEqual(regroupedPlanned(day(-1), [lastWeek, thisWeek], []), [slot(day(0)), pushed]);
    // Pushed into a day nothing stored covers: where it is now.
    assert.deepEqual(regroupedPlanned(day(-1), [lastWeek], [{ date: day(1), id: pushed.id }]), [{ date: day(1), id: pushed.id }]);
  });
});

describe('storing frozen weeks', () => {
  test('migration 4 adds the table', () => {
    const db = openTestDatabase();
    migrate(db, 3);
    const tables = () => db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'", []).map((t) => t.name);
    assert.ok(!tables().includes('streak_weeks'));
    migrate(db);
    assert.ok(tables().includes('streak_weeks'));
    assert.equal(SCHEMA_VERSION, 4);
  });

  test('weeks that ended before there was anything stored are frozen on the first read, once', async () => {
    await plansFromMonday(weekly('a', [1, 3, 5]));
    for (const n of [0, 9]) await repo.saveSession(finished(`w${n}`, day(n)));
    setToday(day(22));
    assert.deepEqual(frozenRows(), [], 'nothing is stored until read');
    await repo.getStreak();
    assert.deepEqual(frozenRows().map((r) => r.week_start), [day(0), day(7), day(14)]);
    const queued = db.getAllSync<{ entity: string }>("SELECT entity FROM outbox WHERE entity = 'streak_week'", []);
    assert.equal(queued.length, 3, 'queued to sync like other user data');
    await repo.getStreak();
    assert.equal(db.getAllSync("SELECT entity FROM outbox WHERE entity = 'streak_week'", []).length, 3, 'reading again stores nothing');
  });

  test('erasing everything clears them; sample data starts with none and freezes its own on read', async () => {
    fresh(day(8));
    await repo.saveSession(finished('a', day(1)));
    await repo.getStreak();
    assert.equal(frozenRows().length, 1);
    eraseAllData(db);
    assert.equal(frozenRows().length, 0);

    loadSampleData(db, today);
    repo.forgetCache();
    assert.equal(frozenRows().length, 0);
    const streak = await repo.getStreak();
    assert.ok(frozenRows().length > 4);
    const ended = streak.weeks.slice(0, -1);
    assert.ok(ended.every((w) => w.frozen));
    // The sample weekly goal (5 a week) was set 3 weeks ago: weeks that ended before then needed what
    // the plans scheduled. The database freezes the same targets the sample dataset shows.
    assert.ok(ended.some((w) => w.source === 'plan' && w.target === 7));
    assert.ok(ended.some((w) => w.source === 'goal' && w.target === 5));
    const shape = (w: StreakWeek) => [w.weekStart, w.target, w.source, w.completed, w.met];
    assert.deepEqual(streak.weeks.map(shape), buildFakeDataset(today).streak.weeks.map(shape));
  });

  test('the streak is worked out once until the next write or day; badges reuse it', async () => {
    fresh(day(8));
    await repo.saveSession(finished('a', day(1)));
    const first = await repo.getStreak();
    assert.equal(await repo.getStreak(), first);
    await repo.getBadges();
    assert.equal(await repo.getStreak(), first);
    today = day(15); // midnight passing, with nothing written
    const nextWeek = await repo.getStreak();
    assert.notEqual(nextWeek, first);
    assert.equal(nextWeek.weeks.find((w) => w.weekStart === day(7))?.frozen, true);
    await repo.saveSession(finished('b', day(15)));
    assert.equal((await repo.getStreak()).thisWeekCompleted, 1);
  });

  test('plan writes and pushes refresh the streak and badges', () => {
    for (const mutation of ['savePlan', 'deletePlan', 'updatePlanWorkout', 'pushPlanForward', 'undoPlanShift'] as const) {
      assert.ok(INVALIDATES[mutation].includes('streak'), `${mutation} refreshes the streak`);
      assert.ok(INVALIDATES[mutation].includes('badges'), `${mutation} refreshes badges`);
    }
  });
});
