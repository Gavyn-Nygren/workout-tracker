// Goals, badges, and the streak target through the real repository (roadmap G3.10 integration):
// the streak's weekly goal is the newest one that isn't archived, and badges read every input they
// need (weigh-ins, plans and their calendar, units) from what's stored.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays, fromISODate } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { INVALIDATES } from '../src/data/invalidation';
import { defaultPreferences } from '../src/data/preferences';
import type { Goal, ISODate, LoggedSet, Plan, ScheduledOccurrence, Weekday, WorkoutSession } from '../src/data/types';
import { openTestDatabase } from './support/nodeSqlite';

/** Day `n` of the test calendar: day(0) is Monday 2026-10-05; weeks start on Monday. */
const day = (n: number): ISODate => addDays('2026-10-05', n);

/** 8 am local on a day, as a timestamp. */
const morning = (date: ISODate) => {
  const d = fromISODate(date);
  d.setHours(8);
  return d.toISOString();
};
const at = (date: ISODate) => {
  const d = fromISODate(date);
  d.setHours(18);
  return d.toISOString();
};

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

/** A workout finished on `date`: bench sets (100 kg × 5 unless a set says otherwise). */
function finished(id: string, date: ISODate, options: { occurrence?: ScheduledOccurrence; sets?: Partial<LoggedSet>[] } = {}): WorkoutSession {
  const { occurrence } = options;
  return {
    id,
    name: 'Workout',
    occurrenceId: occurrence?.id,
    planId: occurrence?.planId,
    planWorkoutId: occurrence?.planWorkoutId,
    status: 'completed',
    completion: 'full',
    scheduledDate: occurrence?.scheduledDate,
    startedAt: at(date),
    completedAt: at(date),
    completedDate: date,
    blocks: [
      {
        id: `${id}_block`,
        type: 'single',
        exercises: [
          {
            id: `${id}_entry`,
            exerciseId: 'ex_bench_press',
            skipped: false,
            sets: (options.sets ?? [{}]).map((patch, i) => ({ id: `${id}_set${i}`, kind: 'normal', modifiers: [], reps: 5, loadKg: 100, completedAt: at(date), ...patch })),
          },
        ],
      },
    ],
    createdAt: at(date),
    updatedAt: at(date),
  };
}

const weeklyGoal = (id: string, workoutsPerWeek: number, options: { deadline?: ISODate; updatedAt: string }): Goal => ({
  id,
  type: 'frequency',
  title: `Train ${workoutsPerWeek}× per week`,
  workoutsPerWeek,
  deadline: options.deadline,
  createdAt: morning(day(0)),
  updatedAt: options.updatedAt,
});

/** A one-week program: Monday, Wednesday, Friday from day(0), then nothing. */
const program: Plan = {
  id: 'prog',
  name: 'One Week',
  version: 1,
  status: 'active',
  startDate: day(0),
  schedule: { type: 'fixed', weeks: 1, days: ([1, 3, 5] as Weekday[]).map((weekday) => ({ week: 1, weekday, workoutIds: [`w${weekday}`] })) },
  workouts: [1, 3, 5].map((w) => ({ id: `w${w}`, name: `Day ${w}`, blocks: [] })),
  createdAt: morning(day(0)),
  updatedAt: morning(day(0)),
};

const earned = async (key: string) => (await repo.listBadges()).find((b) => b.badgeKey === key)?.earnedDate;

describe('the streak target follows the active weekly goal', () => {
  // An older goal without a deadline (3 a week), and a newer one: 2 workouts by day(6). It's
  // reached on day(3), so it's archived from day(10) on.
  const older = weeklyGoal('goal_older', 3, { updatedAt: morning(day(0)) });
  const newer = weeklyGoal('goal_newer', 2, { deadline: day(6), updatedAt: morning(day(1)) });

  test('the newest weekly goal sets it until it is archived, then the next one does', async () => {
    fresh(day(0));
    await repo.saveGoal(older);
    await repo.saveGoal(newer);
    await repo.saveSession(finished('a', day(1)));
    await repo.saveSession(finished('b', day(3)));

    setToday(day(8));
    let streak = await repo.getStreak();
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource], [2, 'goal'], 'reached on day(3), still on Home');
    assert.deepEqual([streak.weeks[0].target, streak.weeks[0].met, streak.weeks[0].frozen], [2, true, true]);

    setToday(day(10));
    streak = await repo.getStreak();
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource], [3, 'goal'], 'archived: the older goal sets it now');
    assert.equal(streak.weeks[0].target, 2, 'the finished week keeps its target');

    await repo.deleteGoal(older.id);
    assert.deepEqual([(await repo.getStreak()).thisWeekTarget, (await repo.getStreak()).thisWeekSource], [1, 'minimum']);
  });

  test('an active weekly goal without a deadline is never archived', async () => {
    fresh(day(0));
    await repo.saveGoal(older);
    await repo.saveSession(finished('a', day(1)));
    setToday(day(40));
    assert.deepEqual([(await repo.getStreak()).thisWeekTarget, (await repo.getStreak()).thisWeekSource], [3, 'goal']);
  });

  test("a week that ends unread is frozen with the goal as it stood when the week ended", async () => {
    fresh(day(0));
    await repo.saveGoal(newer);
    await repo.saveSession(finished('a', day(1)));
    await repo.saveSession(finished('b', day(3)));
    await repo.saveSession(finished('c', day(8)));
    // Nothing read until the week after next: by day(13), the end of week 2, the goal was archived.
    setToday(day(15));
    const streak = await repo.getStreak();
    assert.deepEqual(
      streak.weeks.map((w) => [w.weekStart, w.target, w.source, w.met]),
      [
        [day(0), 2, 'goal', true],
        [day(7), 1, 'minimum', true],
        [day(14), 1, 'minimum', false],
      ],
    );
    assert.equal(streak.currentWeeks, 2);
  });
});

describe('badges from the stored history', () => {
  test('a bodyweight-ratio badge uses the weigh-in before the set when the set has no snapshot', async () => {
    fresh(day(1));
    await repo.saveSession(finished('a', day(1)));
    assert.equal(await earned('bench_bodyweight_1x'), undefined, 'no bodyweight, so it can’t be earned');
    assert.ok(!(await repo.getBadges()).nextUp.some((b) => b.badgeKey === 'bench_bodyweight_1x'), 'and Next up leaves it out');

    await repo.saveBodyweight({ id: 'bw1', date: day(0), weightKg: 95, createdAt: morning(day(0)), updatedAt: morning(day(0)) });
    assert.equal(await earned('bench_bodyweight_1x'), day(1));

    // A heavier weigh-in that day replaces it: the 100 kg bench is now under bodyweight.
    await repo.saveBodyweight({ id: 'bw2', date: day(0), weightKg: 105, createdAt: morning(day(0)), updatedAt: morning(day(0)) });
    assert.equal(await earned('bench_bodyweight_1x'), undefined);
    const next = (await repo.getBadges()).progress.find((b) => b.badgeKey === 'bench_bodyweight_1x');
    assert.equal(next?.progressLabel, '0.9× / 1× bodyweight');

    for (const write of ['saveBodyweight', 'deleteBodyweight'] as const) assert.ok(INVALIDATES[write].includes('badges'), `${write} refreshes badges`);
  });

  test('a perfect week and a finished program come from the plan and its calendar', async () => {
    fresh(day(0));
    await repo.savePlan(program);
    const occurrences = await repo.listOccurrences({ from: day(0), to: day(6) });
    assert.equal(occurrences.length, 3);
    for (const [i, occurrence] of occurrences.slice(0, 2).entries()) await repo.saveSession(finished(`s${i}`, occurrence.scheduledDate, { occurrence }));
    let badges = await repo.getBadges();
    assert.ok(!badges.earned.some((b) => b.badgeKey === 'perfect_week' || b.badgeKey === 'program_finished'));
    assert.equal(badges.progress.find((b) => b.badgeKey === 'perfect_week')?.progressLabel, '2 / 3 workouts this week');

    setToday(day(4));
    await repo.saveSession(finished('s2', day(4), { occurrence: occurrences[2] }));
    assert.equal(await earned('perfect_week'), day(4));
    assert.equal(await earned('program_finished'), day(4));

    // A deleted program still resolves from its saved versions; its done workouts stay.
    await repo.deletePlan(program.id);
    badges = await repo.getBadges();
    assert.deepEqual(
      badges.earned.filter((b) => b.badgeKey === 'perfect_week' || b.badgeKey === 'program_finished').map((b) => b.earnedDate),
      [day(4), day(4)],
    );
  });

  test("deleting a half-done program earns neither Program Complete nor Perfect Week (G3.10 review)", async () => {
    const twoWeeks: Plan = {
      ...program,
      id: 'prog2',
      schedule: { type: 'fixed', weeks: 2, days: [1, 2].flatMap((week) => ([1, 3, 5] as Weekday[]).map((weekday) => ({ week, weekday, workoutIds: [`w${weekday}`] }))) },
    };
    fresh(day(0));
    await repo.savePlan(twoWeeks);
    const occurrences = await repo.listOccurrences({ from: day(0), to: day(13) });
    assert.equal(occurrences.length, 6);
    // 4 of 6: week 1 Monday and Wednesday (Friday missed), week 2 Wednesday and Friday (Monday missed).
    for (const i of [0, 1, 4, 5]) {
      setToday(occurrences[i].scheduledDate);
      await repo.saveSession(finished(`p${i}`, occurrences[i].scheduledDate, { occurrence: occurrences[i] }));
    }
    setToday(day(14));
    assert.equal(await earned('program_finished'), undefined, '4 of 6 is under 3 in 4');
    assert.equal(await earned('perfect_week'), undefined);

    // Tidying up removes the missed workouts, but not what was planned.
    await repo.deletePlan(twoWeeks.id);
    assert.equal((await repo.listOccurrences({ from: day(0), to: day(13) })).length, 4);
    assert.equal(await earned('program_finished'), undefined);
    assert.equal(await earned('perfect_week'), undefined);
  });

  test("pushing a missed workout out of a finished week doesn't make the week perfect (G3.10 review)", async () => {
    const weekly: Plan = { ...program, id: 'mwf', schedule: { type: 'weekly', days: ([1, 3, 5] as Weekday[]).map((weekday) => ({ weekday, workoutIds: [`w${weekday}`] })) } };
    fresh(day(0));
    await repo.savePlan(weekly);
    const occurrences = await repo.listOccurrences({ from: day(0), to: day(6) });
    for (const occurrence of occurrences.slice(0, 2)) {
      setToday(occurrence.scheduledDate);
      await repo.saveSession(finished(occurrence.id, occurrence.scheduledDate, { occurrence }));
    }
    setToday(day(7));
    await repo.pushPlanForward(occurrences[2].id, 'push');
    assert.equal((await repo.listOccurrences({ from: day(0), to: day(6) })).length, 2, 'Friday left the week');
    assert.equal(await earned('perfect_week'), undefined);
    const week = (await repo.getStreak()).weeks[0];
    assert.deepEqual([week.planned, week.met], [3, false], 'the streak agrees');
  });

  test("a missed week isn't made perfect by a plan delete when its late workout was the first ever (G3.10 review)", async () => {
    const weekly: Plan = { ...program, id: 'mwf', schedule: { type: 'weekly', days: ([1, 3, 5] as Weekday[]).map((weekday) => ({ weekday, workoutIds: [`w${weekday}`] })) } };
    fresh(day(0));
    await repo.savePlan(weekly);
    // The first week goes by with nothing done. Next Monday, Friday's missed workout is done from the calendar.
    setToday(day(7));
    const friday = (await repo.listOccurrences({ from: day(4), to: day(4) }))[0];
    await repo.saveSession(finished('late', day(7), { occurrence: friday }));
    assert.equal(await earned('perfect_week'), undefined);
    setToday(day(9));
    await repo.deletePlan(weekly.id);
    assert.deepEqual((await repo.listOccurrences({ from: day(0), to: day(6) })).map((o) => o.scheduledDate), [day(4)]);
    assert.equal(await earned('perfect_week'), undefined, 'Monday and Wednesday were missed');
  });

  test("pushing a program's missed workouts out of a week before anything was done doesn't make it perfect later (G3.10 review)", async () => {
    const twoWeeks: Plan = {
      ...program,
      id: 'prog2',
      schedule: { type: 'fixed', weeks: 2, days: [1, 2].flatMap((week) => ([1, 3, 5] as Weekday[]).map((weekday) => ({ week, weekday, workoutIds: [`w${weekday}`] }))) },
    };
    fresh(day(0));
    await repo.savePlan(twoWeeks);
    // Nothing done in the first week. Next Monday, Wednesday's missed workout is pushed: it and the rest move later.
    setToday(day(7));
    const wednesday = (await repo.listOccurrences({ from: day(2), to: day(2) }))[0];
    await repo.pushPlanForward(wednesday.id, 'push');
    const left = await repo.listOccurrences({ from: day(0), to: day(6) });
    assert.deepEqual(left.map((o) => o.scheduledDate), [day(0)], 'only Monday is left in that week');
    // Then Monday's missed workout is done late.
    await repo.saveSession(finished('late', day(7), { occurrence: left[0] }));
    assert.equal(await earned('perfect_week'), undefined, 'the week had 3 planned when it ended');
  });

  describe('Perfect Week after a week-start switch (G3.10 review 3)', () => {
    const everyOtherDay: Plan = { ...program, id: 'eod', schedule: { type: 'rotating', steps: [{ workoutIds: ['a'] }, { workoutIds: [] }] }, workouts: [{ id: 'a', name: 'A', blocks: [] }] };
    const mwf: Plan = { ...program, id: 'mwf', schedule: { type: 'weekly', days: ([1, 3, 5] as Weekday[]).map((weekday) => ({ weekday, workoutIds: [`w${weekday}`] })) } };
    const doneOn = async (date: ISODate) => {
      setToday(date);
      const occurrence = (await repo.listOccurrences({ from: date, to: date }))[0];
      await repo.saveSession(finished(`s_${date}`, date, { occurrence }));
      await repo.getStreak();
    };
    const weekStartingOn = async (weekStartsOn: Weekday) => repo.savePreferences({ ...(await repo.getPreferences()), weekStartsOn });

    test("switching, then deleting the plan, doesn't make a missed week perfect; the streak is unchanged", async () => {
      // Every other day from Monday day(0): the Sunday week day(-1)-day(5) plans 3, the Monday week day(0)-day(6) plans 4.
      fresh(day(-1));
      await weekStartingOn(7);
      await repo.savePlan(everyOtherDay);
      // Done Monday, Wednesday and Sunday day(6); Friday day(4) missed.
      for (const n of [0, 2, 6]) await doneOn(day(n));
      setToday(day(8));
      const before = await repo.getStreak();
      await weekStartingOn(1);
      const after = await repo.getStreak();
      const week = after.weeks.find((w) => w.weekStart === day(0))!;
      assert.deepEqual([week.planned, week.completed, week.met], [4, 3, false], "the Monday week's own 4, not the Sunday week's 3");
      assert.deepEqual([after.currentWeeks, after.longestWeeks], [before.currentWeeks, before.longestWeeks]);

      setToday(day(9));
      await repo.deletePlan(everyOtherDay.id);
      assert.deepEqual((await repo.listOccurrences({ from: day(0), to: day(6) })).map((o) => o.scheduledDate), [day(0), day(2), day(6)]);
      assert.equal(await earned('perfect_week'), undefined, 'Friday was missed');
    });

    test('a missed workout deleted after its week ended, then a switch: the regrouped week still counts it', async () => {
      // Monday weeks; Monday, Wednesday, Friday from day(0). Friday day(4) is missed.
      fresh(day(0));
      await repo.savePlan(mwf);
      for (const n of [0, 2]) await doneOn(day(n));
      setToday(day(7));
      await repo.getStreak();
      setToday(day(8));
      await repo.deletePlan(mwf.id);
      assert.equal((await repo.listOccurrences({ from: day(-1), to: day(5) })).length, 2, "Friday's missed workout is gone");
      await weekStartingOn(7);
      const week = (await repo.getStreak()).weeks.find((w) => w.weekStart === day(-1))!;
      assert.deepEqual([week.planned, week.completed], [3, 2], 'Friday was planned when the Monday week ended');
      assert.equal(await earned('perfect_week'), undefined);
    });

    const weeklyOn = (id: string, days: [Weekday, string][]): Plan => ({
      ...program,
      id,
      schedule: { type: 'weekly', days: days.map(([weekday, workoutId]) => ({ weekday, workoutIds: [workoutId] })) },
      workouts: days.map(([, workoutId]) => ({ id: workoutId, name: workoutId, blocks: [] })),
    });
    const on = async (date: ISODate, planId: string) => (await repo.listOccurrences({ from: date, to: date })).find((o) => o.planId === planId)!;
    const undoLastPush = async () => repo.undoPlanShift((await repo.listPlanShifts()).at(-1)!.id);

    test("push, switch, undo, a late log, then a plan delete: the undone workout doesn't stand in for a missed one (G3.10 review 3b)", async () => {
      // Sunday weeks; Thursday and Sunday from Monday day(0). Thursday day(3) and Sunday day(6) are both missed.
      fresh(day(0));
      await weekStartingOn(7);
      const plan = weeklyOn('thusun', [
        [4, 'thu'],
        [7, 'sun'],
      ]);
      await repo.savePlan(plan);
      // Tuesday day(8), in the Sunday week day(6)-day(12): Sunday's workout is pushed to today, then
      // the switch to Monday weeks stores the Monday week day(0)-day(6) with its Sunday empty.
      setToday(day(8));
      await repo.getStreak();
      await repo.pushPlanForward((await on(day(6), plan.id)).id, 'push');
      await weekStartingOn(1);
      // The push is undone, so the workout is back on Sunday day(6), and it's logged late.
      await undoLastPush();
      const sunday = await on(day(6), plan.id);
      await repo.saveSession(finished('late', day(8), { occurrence: sunday }));
      const before = await repo.getStreak();
      assert.equal(await earned('perfect_week'), undefined);
      // A week later the plan is deleted: Thursday's missed workout goes, Sunday's done one stays.
      setToday(day(15));
      await repo.deletePlan(plan.id);
      assert.deepEqual((await repo.listOccurrences({ from: day(0), to: day(6) })).map((o) => o.scheduledDate), [day(6)]);
      assert.equal(await earned('perfect_week'), undefined, 'Thursday day(3) was never done');
      const after = await repo.getStreak();
      assert.deepEqual(
        after.weeks.filter((w) => w.weekStart <= day(0)).map((w) => [w.weekStart, w.target, w.met]),
        before.weeks.filter((w) => w.weekStart <= day(0)).map((w) => [w.weekStart, w.target, w.met]),
        'the streak is unchanged',
      );
    });

    test('two plans on the same day: an undone push of one doesn\'t stand in for the other (G3.10 review 3b)', async () => {
      // Sunday weeks; plans A and B both on Sundays. Both of Sunday day(6)'s workouts are missed.
      fresh(day(0));
      await weekStartingOn(7);
      const a = weeklyOn('a', [[7, 'a']]);
      const b = weeklyOn('b', [[7, 'b']]);
      await repo.savePlan(a);
      await repo.savePlan(b);
      // Tuesday day(8): B's is pushed to today, the switch stores the Monday week day(0)-day(6) with
      // A's workout only, the push is undone and B's is logged late.
      setToday(day(8));
      await repo.pushPlanForward((await on(day(6), b.id)).id, 'push');
      await weekStartingOn(1);
      await undoLastPush();
      await repo.saveSession(finished('late', day(8), { occurrence: await on(day(6), b.id) }));
      // Deleting A takes its missed workout away; day(6) still has one workout, done.
      setToday(day(15));
      await repo.deletePlan(a.id);
      assert.deepEqual((await repo.listOccurrences({ from: day(0), to: day(6) })).map((o) => o.planId), [b.id]);
      assert.equal(await earned('perfect_week'), undefined, "A's Sunday workout was never done");
    });

    test("a workout pushed from one old week into the next counts once in the regrouped week (G3.10 review 3b)", async () => {
      // Monday weeks; Sundays from day(0). Sunday day(6) is missed; the Monday week day(0)-day(6) is
      // stored with it there. On Tuesday day(8) it's pushed to today and done.
      fresh(day(0));
      const plan = weeklyOn('sun', [[7, 'sun']]);
      await repo.savePlan(plan);
      setToday(day(8));
      await repo.getStreak();
      await repo.pushPlanForward((await on(day(6), plan.id)).id, 'push');
      const pushed = await on(day(8), plan.id);
      await repo.saveSession(finished('pushed', day(8), { occurrence: pushed }));
      // Sunday day(13) is missed. After both Monday weeks are stored, the switch to Sunday weeks
      // regroups day(6)-day(12): day(6) from the first Monday week, the rest from the second.
      setToday(day(15));
      await repo.getStreak();
      assert.equal(await earned('perfect_week'), undefined, 'neither Monday week was perfect');
      await weekStartingOn(7);
      const week = (await repo.getStreak()).weeks.find((w) => w.weekStart === day(6))!;
      assert.deepEqual([week.planned, week.completed], [1, 1], 'one workout, not counted twice');
      assert.equal(await earned('perfect_week'), day(8), 'the one workout that week had was done');
    });

    test('a workout an undone push moves within its finished week still counts when logged late (G3.10 review 3b)', async () => {
      // Monday weeks; Thursdays from day(0). Thursday day(3) is missed and pushed to Saturday day(5),
      // still missed when the week ends. Next Tuesday the push is undone and the workout logged late.
      fresh(day(0));
      const plan = weeklyOn('thu', [[4, 'thu']]);
      await repo.savePlan(plan);
      setToday(day(5));
      await repo.pushPlanForward((await on(day(3), plan.id)).id, 'push');
      setToday(day(7));
      await repo.getStreak();
      setToday(day(8));
      await undoLastPush();
      const thursday = await on(day(3), plan.id);
      assert.ok(thursday, 'back on Thursday');
      await repo.saveSession(finished('late', day(8), { occurrence: thursday }));
      assert.equal(await earned('perfect_week'), day(8), 'the one workout planned that week was done');
    });

    test("a switch made on a Sunday still counts the week's missed Sunday after a push (G3.10 review 3c)", async () => {
      // Monday weeks; Wednesday and Sunday from Monday day(0). Wednesday day(2) and Sunday day(6) are
      // missed, and the Monday week day(0)-day(6) is stored with both. Wednesday day(9) is done.
      fresh(day(0));
      const plan = weeklyOn('wedsun', [
        [3, 'wed'],
        [7, 'sun'],
      ]);
      await repo.savePlan(plan);
      setToday(day(7));
      await repo.getStreak();
      setToday(day(9));
      await repo.saveSession(finished('wed', day(9), { occurrence: await on(day(9), plan.id) }));
      // Sunday day(13): Sunday day(6)'s workout is pushed to today, then the switch to Sunday weeks
      // stores the Sunday week day(6)-day(12), which has no stored week to carry its target from.
      setToday(day(13));
      await repo.pushPlanForward((await on(day(6), plan.id)).id, 'push');
      await weekStartingOn(7);
      const week = (await repo.getStreak()).weeks.find((w) => w.weekStart === day(6))!;
      assert.equal(week.completed, 1);
      assert.equal(await earned('perfect_week'), undefined, 'Sunday day(6) was missed');
    });
  });

  test('weeks away with the app closed still count toward a program (G3.10 review)', async () => {
    // 20 weeks of Mon/Wed/Fri. The calendar fills 4 weeks ahead; weeks 9-16 pass with the app closed.
    const long: Plan = {
      ...program,
      id: 'long',
      schedule: { type: 'fixed', weeks: 20, days: Array.from({ length: 20 }, (_, w) => ([1, 3, 5] as Weekday[]).map((weekday) => ({ week: w + 1, weekday, workoutIds: [`w${weekday}`] }))).flat() },
    };
    fresh(day(0));
    await repo.savePlan(long);
    const doWeek = async (week: number) => {
      for (const offset of [0, 2, 4]) {
        setToday(day((week - 1) * 7 + offset));
        const occurrence = (await repo.listOccurrences({ from: today, to: today }))[0];
        await repo.saveSession(finished(`s${today}`, today, { occurrence }));
      }
    };
    for (let week = 1; week <= 8; week++) await doWeek(week);
    for (let week = 17; week <= 20; week++) await doWeek(week);
    assert.equal((await repo.listOccurrences({ from: day(0), to: day(139) })).length, 48, 'weeks 13-16 were never stored');
    const badges = await repo.getBadges();
    assert.ok(!badges.earned.some((b) => b.badgeKey === 'program_finished'), '36 of 60 is short of 3 in 4');
    assert.equal(badges.progress.find((b) => b.badgeKey === 'program_finished')?.progressLabel, '36 / 60 program workouts');
  });

  test('load thresholds follow the units setting', async () => {
    fresh(day(1));
    await repo.saveSession(finished('a', day(1)));
    // 100 kg is 220.5 lb: one plate in pounds, two in kilograms.
    assert.equal(await earned('bench_1_plate'), day(1));
    assert.equal(await earned('bench_2_plate'), undefined);
    const next = (await repo.getBadges()).nextUp.find((b) => b.badgeKey === 'bench_2_plate');
    assert.equal(next?.progressLabel, '220.4 / 225 lb');

    await repo.savePreferences({ ...defaultPreferences, units: 'metric' });
    assert.equal(await earned('bench_2_plate'), day(1));
    const badge = (await repo.getBadges()).earned.find((b) => b.badgeKey === 'bench_2_plate');
    assert.equal(badge?.description, 'Bench 100 kg for a working set.');
  });

  test("Next up is each ladder's lowest unearned step with some progress, nearest first", async () => {
    fresh(day(1));
    await repo.saveSession(finished('a', day(1)));
    const { earned: got, nextUp } = await repo.getBadges();
    const have = new Set(got.map((b) => b.badgeKey));
    assert.ok(nextUp.length >= 3);
    assert.ok(nextUp.every((b) => !have.has(b.badgeKey) && b.current > 0 && b.current < b.target));
    assert.equal(new Set(nextUp.map((b) => b.ladder)).size, nextUp.length, 'one per ladder');
    const ratios = nextUp.map((b) => b.current / b.target);
    assert.deepEqual(ratios, [...ratios].sort((a, b) => b - a));
    assert.ok(!nextUp.some((b) => b.badgeKey.startsWith('deadlift')), 'never logged, so not shown');
    // listBadges is the same earned list.
    assert.deepEqual((await repo.listBadges()).map((b) => b.badgeKey), got.map((b) => b.badgeKey));
  });
});
