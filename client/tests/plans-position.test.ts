// Where a plan "is" on the Plans tab after a missed workout is pushed forward (spec 2.5): its next
// workout, a program's week and a rotating cycle's step all follow the moved workouts, like Today.
// Also when a pushed workout's card still says "Moved from …".
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays, fromISODate } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { occurrenceIdFor, planShiftFor, programWeek, scheduleOccurrences, shiftCovers, workoutsOn } from '../src/data/schedule';
import type { ISODate, Plan, PlanSchedule, PlanShift, ScheduledOccurrence, Weekday, WorkoutSession } from '../src/data/types';
import { currentProgramWeek, currentRotatingStep, movedFromDate, nextWorkout, shiftsOf } from '../src/features/plans/position';
import { openTestDatabase } from './support/nodeSqlite';

// ---------------------------------------------------------------------------
// Fixtures

/** Day `n` of the test calendar: day(0) is Monday 2026-10-19, day(7) the next Monday. */
const day = (n: number): ISODate => addDays('2026-10-19', n);
const STAMP = '2026-10-19T08:00:00.000Z';

function makePlan(id: string, schedule: PlanSchedule, extra: Partial<Plan> = {}): Plan {
  const ids = schedule.type === 'rotating' ? schedule.sequence.filter((s) => s !== 'rest') : schedule.days.flatMap((d) => d.workoutIds);
  return {
    id,
    name: `Plan ${id}`,
    version: 1,
    status: 'active',
    startDate: day(0),
    schedule,
    workouts: [...new Set(ids)].map((w) => ({ id: w, name: `Workout ${w.toUpperCase()}`, blocks: [] })),
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

/** Weekly: A on Monday, B Wednesday, C Friday, D Sunday. */
const weekly = (extra: Partial<Plan> = {}) =>
  makePlan(
    'weekly',
    {
      type: 'weekly',
      days: [
        { weekday: 1, workoutIds: ['a'] },
        { weekday: 3, workoutIds: ['b'] },
        { weekday: 5, workoutIds: ['c'] },
        { weekday: 7, workoutIds: ['d'] },
      ],
    },
    extra,
  );

/** A 2-week program: H1-H3 on Monday, Wednesday, Friday of week 1, then L1-L3 in week 2. */
const program = () =>
  makePlan('program', {
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
  });

/** Rotating: A, B, rest, repeating whatever the weekday. */
const rotating = () => makePlan('rotating', { type: 'rotating', sequence: ['a', 'b', 'rest'] });

/**
 * The plan's pushes after the user, on `on`, pushes the workout the plan first put on `original`
 * (through the real planShiftFor, after any earlier pushes, each made later than the last).
 */
function push(plan: Plan, original: ISODate, on: ISODate, earlier: PlanShift[] = [], weekStartsOn: Weekday = 1): PlanShift[] {
  const occurrence = scheduleOccurrences(plan, original, on, earlier).find((o) => (o.shiftedFromDate ?? o.scheduledDate) === original);
  assert.ok(occurrence, `a workout originally on ${original}`);
  const now = new Date(Date.parse(STAMP) + (earlier.length + 1) * 3_600_000).toISOString();
  const shift = planShiftFor({ id: `shift_${earlier.length + 1}`, plan, occurrence, today: on, weekStartsOn, now });
  assert.ok(shift, `a push for ${original} on ${on}`);
  return [...earlier, shift];
}

/**
 * Like push, when the workouts the plan first put on `done` were already started or done: the push
 * keeps the ones it covers (its keptIds), as the repository's pushPlanForward records them.
 */
function pushAfterDone(plan: Plan, original: ISODate, on: ISODate, done: ISODate[], earlier: PlanShift[] = []): PlanShift[] {
  const shift = push(plan, original, on, earlier).at(-1)!;
  const keptIds = done.filter((d) => shiftCovers(shift, d)).flatMap((d) => workoutsOn(plan.schedule, plan.startDate, d).map((w) => occurrenceIdFor(plan.id, d, w)));
  return [...earlier, keptIds.length ? { ...shift, keptIds } : shift];
}

// ---------------------------------------------------------------------------

describe('weekly plans after a push', () => {
  test('Next follows the moved workouts through the week, and next week is as usual', () => {
    const plan = weekly();
    const shifts = push(plan, day(0), day(1)); // Monday's A, pushed on Tuesday.

    assert.deepEqual(nextWorkout(plan, day(1), shifts), { date: day(1), name: 'Workout A' });
    assert.deepEqual(nextWorkout(plan, day(1)), { date: day(2), name: 'Workout B' }, 'the raw pattern disagrees');
    assert.deepEqual(nextWorkout(plan, day(2), shifts), { date: day(3), name: 'Workout B' }, 'B moved to Thursday');
    assert.deepEqual(nextWorkout(plan, day(4), shifts), { date: day(5), name: 'Workout C' }, 'C moved to Saturday');
    assert.deepEqual(nextWorkout(plan, day(6), shifts), { date: day(6), name: 'Workout D' }, "Sunday's D would cross the week's end, so it stays");
    assert.deepEqual(nextWorkout(plan, day(7), shifts), { date: day(7), name: 'Workout A' }, 'next Monday as usual');
    assert.equal(currentProgramWeek(plan, day(1), shifts), undefined);
    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(1), shifts), undefined);
  });

  test('a week-old miss pushed to today leaves the rest of the week alone', () => {
    const plan = weekly();
    const shifts = push(plan, day(0), day(7)); // Last Monday's A, pushed this Monday.

    assert.equal(scheduleOccurrences(plan, day(7), day(7), shifts).length, 2, 'today holds both As');
    assert.deepEqual(nextWorkout(plan, day(7), shifts), { date: day(7), name: 'Workout A' });
    assert.deepEqual(nextWorkout(plan, day(8), shifts), { date: day(9), name: 'Workout B' }, 'Wednesday as usual');
  });

  test('the week start decides where a weekly push stops', () => {
    // Monday's A, pushed 2 days on Wednesday. Friday's C would land on Sunday.
    const plan = weekly();
    const mondayStart = push(plan, day(0), day(2));
    const sundayStart = push(plan, day(0), day(2), [], 7);

    assert.deepEqual(nextWorkout(plan, day(5), mondayStart), { date: day(6), name: 'Workout C' }, 'Sunday ends the week, so C moves there');
    assert.deepEqual(nextWorkout(plan, day(5), sundayStart), { date: day(6), name: 'Workout D' }, 'Sunday starts a new week, so C stays on Friday');
    assert.deepEqual(
      scheduleOccurrences(plan, day(4), day(4), sundayStart).map((o) => o.planWorkoutId),
      ['b', 'c'],
      'B moved onto Friday, next to C',
    );
  });
});

describe('rotating cycles after a push', () => {
  test("today's step and Next follow the push", () => {
    const plan = rotating();
    const shifts = push(plan, day(1), day(2)); // Day 1's B, pushed a day.

    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(2), shifts), 1, 'B today');
    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(2)), 2, 'the raw pattern says rest');
    assert.deepEqual(nextWorkout(plan, day(2), shifts), { date: day(2), name: 'Workout B' });
    assert.deepEqual(nextWorkout(plan, day(2)), { date: day(3), name: 'Workout A' }, 'the raw pattern disagrees');

    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(3), shifts), 2, 'rest');
    assert.deepEqual(nextWorkout(plan, day(3), shifts), { date: day(4), name: 'Workout A' });
    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(4), shifts), 0, 'the cycle starts again');
  });

  test('pushes add up', () => {
    const plan = rotating();
    const first = push(plan, day(1), day(2)); // B: day 1 → day 2. A from day 3 lands on day 4.
    const shifts = push(plan, day(3), day(6), first); // That A missed too, pushed to day 6.

    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(6), shifts), 0, 'A today');
    assert.deepEqual(nextWorkout(plan, day(5), shifts), { date: day(6), name: 'Workout A' });
    assert.equal(currentRotatingStep(plan.schedule, plan.startDate, day(7), shifts), 1, 'then B');
  });

  test('no step before the plan starts', () => {
    const plan = rotating();
    assert.equal(currentRotatingStep(plan.schedule, day(3), day(0)), undefined, 'a whole cycle early');
    assert.equal(currentRotatingStep(plan.schedule, day(1), day(0)), undefined);
    assert.equal(currentRotatingStep({ type: 'rotating', sequence: [] }, day(0), day(2)), undefined, 'empty cycle');
  });
});

describe('fixed-length programs after a push', () => {
  // Week 1's Friday H3 (day 4), pushed on week 2's Monday: everything after moves 3 days.
  const plan = program();
  const shifts = push(plan, day(4), day(7));

  test('the week and Next follow the push', () => {
    assert.equal(currentProgramWeek(plan, day(7), shifts), 1, 'still finishing week 1');
    assert.equal(programWeek(plan, day(7)), 2, 'the raw pattern says week 2');
    assert.deepEqual(nextWorkout(plan, day(7), shifts), { date: day(7), name: 'Workout H3' });
    assert.equal(currentProgramWeek(plan, day(9), shifts), 1, "week 1's last days, now rest");
    assert.equal(currentProgramWeek(plan, day(10), shifts), 2);
    assert.deepEqual(nextWorkout(plan, day(10), shifts), { date: day(10), name: 'Workout L1' });
  });

  test('a program pushed past its original end keeps its last week and its next workout', () => {
    // The program first ended on day 13; L3 now lands on day 14.
    assert.deepEqual(nextWorkout(plan, day(13), shifts), { date: day(14), name: 'Workout L3' });
    assert.equal(nextWorkout(plan, day(13)), undefined, 'the raw pattern has nothing left');
    assert.equal(currentProgramWeek(plan, day(14), shifts), 2, 'Week 2 of 2');
    assert.equal(programWeek(plan, day(14)), undefined, 'the raw pattern says the program is over');
    assert.deepEqual(nextWorkout(plan, day(14), shifts), { date: day(14), name: 'Workout L3' });
    assert.equal(currentProgramWeek(plan, day(16), shifts), 2, "the pushed week's last rest day");
    assert.equal(nextWorkout(plan, day(16), shifts), undefined);
    assert.equal(currentProgramWeek(plan, day(17), shifts), undefined, 'then it is over');
  });

  test("other plans' pushes are ignored", () => {
    const others = shifts.map((s) => ({ ...s, planId: 'other' }));
    assert.deepEqual(shiftsOf(plan.id, [...shifts, ...others]), shifts);
    assert.equal(currentProgramWeek(plan, day(7), others), 2);
    assert.deepEqual(nextWorkout(plan, day(7), others), { date: day(7), name: 'Workout L1' });
  });
});

describe('after a workout was done before the push', () => {
  // A push keeps the workouts that were done when it was made (keptIds) and never moves them. Without
  // that, the Plans tab would offer a done workout as Next, on the day the push would have moved it to.

  test("weekly: B done early on Tuesday, then Monday's A pushed on Wednesday: Thursday's Next isn't B on Friday", () => {
    const plan = weekly();
    const shifts = pushAfterDone(plan, day(0), day(2), [day(2)]);
    assert.deepEqual(shifts.map((s) => s.keptIds), [[`occ_weekly_${day(2)}_b`]]);

    assert.deepEqual(nextWorkout(plan, day(2), shifts), { date: day(2), name: 'Workout A' }, 'the pushed A today');
    assert.notDeepEqual(nextWorkout(plan, day(3), shifts), { date: day(4), name: 'Workout B' });
    assert.deepEqual(nextWorkout(plan, day(3), shifts), { date: day(6), name: 'Workout C' }, 'C, pushed to Sunday');
    assert.deepEqual(nextWorkout(plan, day(7), shifts), { date: day(7), name: 'Workout A' }, 'next week as usual');
    // Without what the push kept, the done B would be pushed to Friday as if it were still to do.
    assert.deepEqual(nextWorkout(plan, day(3), push(plan, day(0), day(2))), { date: day(4), name: 'Workout B' });
  });

  test('rotating [A, B, rest]: A missed, B done, then A pushed: Next never names the done B', () => {
    const plan = rotating();
    const shifts = pushAfterDone(plan, day(0), day(2), [day(1)]); // Monday's A, pushed 2 days on Wednesday.
    assert.deepEqual(shifts.map((s) => s.keptIds), [[`occ_rotating_${day(1)}_b`]]);
    const step = (on: ISODate) => currentRotatingStep(plan.schedule, plan.startDate, on, shifts);

    assert.deepEqual(nextWorkout(plan, day(2), shifts), { date: day(2), name: 'Workout A' });
    assert.equal(step(day(2)), 0, 'A today');
    // The cycle carries on after A: its rest moved to Friday, then A and B.
    assert.deepEqual(nextWorkout(plan, day(3), shifts), { date: day(5), name: 'Workout A' }, 'not the done B');
    assert.equal(step(day(4)), 2, 'rest');
    assert.equal(step(day(5)), 0);
    assert.deepEqual(nextWorkout(plan, day(5), shifts), { date: day(5), name: 'Workout A' });
    assert.equal(step(day(6)), 1);
    assert.deepEqual(nextWorkout(plan, day(6), shifts), { date: day(6), name: 'Workout B' }, 'the next B, still to do');
    // Without what the push kept, the done B would be Next, on Thursday.
    assert.deepEqual(nextWorkout(plan, day(3), push(plan, day(0), day(2))), { date: day(3), name: 'Workout B' });
  });

  test("rotating [A, B, rest]: A missed, B done, then A pushed: the day after A, the cycle's step isn't the done B", () => {
    // BUG: originalDateFor ignores keptIds. It treats Tuesday's B, kept on Tuesday, as if the push
    // had moved it to Thursday, so on Thursday (a day the push emptied) the grid marks the done B
    // as today's step. Like any day a push empties, Thursday should stay on the last step that
    // landed: Wednesday's pushed A. Fix: originalDateFor skips original dates whose workouts the
    // plan's pushes all kept.
    const plan = rotating();
    const shifts = pushAfterDone(plan, day(0), day(2), [day(1)]);
    const step = currentRotatingStep(plan.schedule, plan.startDate, day(3), shifts);
    assert.notEqual(step, 1, 'not the done B');
    assert.equal(step, 0, "still on Wednesday's A");
  });

  test("program: H2 done on its Wednesday, then Monday's H1 pushed on Thursday: Next is the real next workout", () => {
    const plan = program();
    const shifts = pushAfterDone(plan, day(0), day(3), [day(2)]);
    assert.deepEqual(shifts.map((s) => s.keptIds), [[`occ_program_${day(2)}_h2`]]);

    assert.deepEqual(nextWorkout(plan, day(3), shifts), { date: day(3), name: 'Workout H1' }, 'the pushed H1 today');
    assert.deepEqual(nextWorkout(plan, day(4), shifts), { date: day(7), name: 'Workout H3' }, 'H3, pushed to Monday');
    assert.equal(currentProgramWeek(plan, day(4), shifts), 1);
    assert.equal(currentProgramWeek(plan, day(7), shifts), 1, 'still finishing week 1');
    assert.deepEqual(nextWorkout(plan, day(8), shifts), { date: day(10), name: 'Workout L1' });
    assert.equal(currentProgramWeek(plan, day(10), shifts), 2);
    // Without what the push kept, the done H2 would be Next, on Saturday.
    assert.deepEqual(nextWorkout(plan, day(4), push(plan, day(0), day(3))), { date: day(5), name: 'Workout H2' });
  });
});

describe('through the repository, the pushes the Plans tab reads keep what was done', () => {
  // The Plans tab reads pushes with listPlanShifts. The cases above, run for real: the repository
  // records the same keptIds, and Next falls on the calendar's next workout day.
  const doneSession = (id: string, occurrence: ScheduledOccurrence, date: ISODate): WorkoutSession => ({
    id,
    name: 'Done',
    occurrenceId: occurrence.id,
    planId: occurrence.planId,
    planWorkoutId: occurrence.planWorkoutId,
    status: 'completed',
    completion: 'full',
    scheduledDate: occurrence.scheduledDate,
    startedAt: `${date}T14:00:00.000Z`,
    completedAt: `${date}T15:00:00.000Z`,
    completedDate: date,
    blocks: [],
    createdAt: `${date}T14:00:00.000Z`,
    updatedAt: `${date}T15:00:00.000Z`,
  });
  const cases = [
    { plan: weekly(), done: day(2), doneOn: day(1), missed: day(0), pushOn: day(2), checks: [day(2), day(3), day(4), day(7)] },
    { plan: rotating(), done: day(1), doneOn: day(1), missed: day(0), pushOn: day(2), checks: [day(2), day(3), day(5), day(6)] },
    { plan: program(), done: day(2), doneOn: day(2), missed: day(0), pushOn: day(3), checks: [day(3), day(4), day(8), day(10)] },
  ];

  for (const c of cases) {
    test(`${c.plan.id}: the workout of ${c.done} done on ${c.doneOn}, then the miss of ${c.missed} pushed on ${c.pushOn}`, async () => {
      const db = openTestDatabase();
      migrate(db);
      eraseAllData(db);
      let today = day(0);
      const repo = createSqliteRepository(db, { today: () => today });
      const moveTo = (on: ISODate) => {
        today = on;
        repo.forgetCache();
      };
      const originallyOn = async (original: ISODate) => {
        const found = (await repo.listOccurrences({ from: day(-7), to: day(40) })).find((o) => (o.shiftedFromDate ?? o.scheduledDate) === original);
        assert.ok(found, `a workout originally on ${original}`);
        return found;
      };

      await repo.savePlan(c.plan);
      moveTo(c.doneOn);
      await repo.saveSession(doneSession('done', await originallyOn(c.done), c.doneOn));
      moveTo(c.pushOn);
      await repo.pushPlanForward((await originallyOn(c.missed)).id, 'shift_1');
      const shifts = shiftsOf(c.plan.id, await repo.listPlanShifts());
      assert.deepEqual(
        shifts.map((s) => s.keptIds),
        pushAfterDone(c.plan, c.missed, c.pushOn, [c.done]).map((s) => s.keptIds),
        'kept as the tests above build it',
      );

      for (const on of c.checks) {
        moveTo(on);
        const [first] = await repo.listOccurrences({ from: on, to: addDays(on, 13) });
        assert.equal(nextWorkout(c.plan, on, shifts)?.date, first?.scheduledDate, `${on}: Next is on the calendar's next workout day`);
      }
    });
  }
});

describe('Next without pushes keeps its rules', () => {
  test("today's workout counts, the window is two weeks, and paused plans have none", () => {
    assert.deepEqual(nextWorkout(weekly(), day(0)), { date: day(0), name: 'Workout A' });
    assert.deepEqual(nextWorkout(weekly({ startDate: day(13) }), day(0)), { date: day(13), name: 'Workout D' }, 'the 14th day counts');
    assert.equal(nextWorkout(weekly({ startDate: day(14) }), day(0)), undefined, 'the 15th day is too far');
    assert.equal(nextWorkout(weekly({ status: 'paused' }), day(0)), undefined);
    assert.equal(nextWorkout(weekly({ status: 'archived' }), day(0)), undefined);
  });
});

describe('"Moved from" on a pushed workout', () => {
  const plan = rotating();
  /** A cycle push made at local noon on `made`, moving everything from day 2 on by one day. */
  const pushMadeOn = (made: ISODate, extra: Partial<PlanShift> = {}): PlanShift => {
    const at = new Date(fromISODate(made).getTime() + 12 * 3_600_000).toISOString();
    return { id: 's1', planId: plan.id, occurrenceId: 'occ_pushed', fromDate: day(2), days: 1, createdAt: at, updatedAt: at, ...extra };
  };
  const moved: ScheduledOccurrence = { id: 'occ_later', planId: plan.id, planVersion: 1, planWorkoutId: 'a', scheduledDate: day(31), shiftedFromDate: day(30) };

  test('shows for a week after the push, not for good', () => {
    const shifts = [pushMadeOn(day(3))];
    assert.equal(movedFromDate(moved, shifts, day(3)), day(30), 'the day of the push');
    assert.equal(movedFromDate(moved, shifts, day(10)), day(30), 'a week later');
    assert.equal(movedFromDate(moved, shifts, day(11)), undefined, 'eight days later: old news');
    assert.equal(movedFromDate(moved, shifts, day(31)), undefined, 'weeks later, when the workout comes up');
  });

  test('only for a workout that push actually moved', () => {
    const shifts = [pushMadeOn(day(3))];
    assert.equal(movedFromDate({ ...moved, shiftedFromDate: undefined }, shifts, day(3)), undefined, 'not moved');
    assert.equal(movedFromDate(moved, [pushMadeOn(day(3), { keptIds: [moved.id] })], day(3)), undefined, 'kept by the push');
    assert.equal(movedFromDate(moved, [pushMadeOn(day(3), { planId: 'other' })], day(3)), undefined, "another plan's push");
    assert.equal(movedFromDate(moved, [], day(3)), undefined, 'no push at all');
  });
});
