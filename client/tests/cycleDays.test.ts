// Cycle days that hold several workouts (owner's pick: "Push + Cardio, Legs, Rest"): the calendar
// engine, the edits the cycle editor makes, new plans and template copies, and the plan card's
// label. The startup upgrade of cycles stored the old way is in upgradeCycleSteps.test.ts.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { defaultPreferences } from '../src/data/preferences';
import { cycleSteps, scheduledWorkoutIds, scheduleOccurrences, stepsFromSequence, trainingDays, workoutsOn } from '../src/data/schedule';
import type { Plan, PlanSchedule, PlanWorkout, StarterTemplate, Weekday } from '../src/data/types';
import { describeSchedule } from '../src/features/plans/describe';
import { addCycleDay, deleteCycleDay, moveCycleDay, newPlan, planFromTemplate, removeWorkout, setCycleSteps, toggleCycleWorkout, toggleWeekday } from '../src/features/plans/planEdits';
import { currentRotatingStep } from '../src/features/plans/position';
import { everythingJson } from '../src/features/settings/exportData';
import { cycle } from './support/cycles';

const MONDAY = '2026-10-19';
const day = (n: number) => addDays(MONDAY, n);
const STAMP = `${MONDAY}T08:00:00.000Z`;

const workout = (id: string, name = id): PlanWorkout => ({ id, name, blocks: [] });
const plan = (schedule: PlanSchedule, ids = ['push', 'cardio', 'legs']): Plan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule,
  workouts: ids.map((id) => workout(id)),
  createdAt: STAMP,
  updatedAt: STAMP,
});
/** Push + Cardio, Legs, Rest. */
const pushCardio = () => plan(cycle(['push', 'cardio'], ['legs'], []));
/** A rotating plan's days, as lists of workout ids. */
const daysOf = (p: Plan) => (p.schedule.type === 'rotating' ? p.schedule.steps.map((s) => s.workoutIds) : assert.fail('not rotating'));
/** A cycle as plans stored it before a day could hold several workouts. */
const legacy = (sequence: unknown) => ({ type: 'rotating', sequence }) as unknown as Extract<PlanSchedule, { type: 'rotating' }>;

describe('the calendar on a cycle day with several workouts', () => {
  test('every workout on the day is scheduled, each with its own occurrence', () => {
    const p = pushCardio();
    assert.deepEqual(workoutsOn(p.schedule, MONDAY, day(0)), ['push', 'cardio']);
    assert.deepEqual(workoutsOn(p.schedule, MONDAY, day(1)), ['legs']);
    assert.deepEqual(workoutsOn(p.schedule, MONDAY, day(2)), []);
    assert.deepEqual(workoutsOn(p.schedule, MONDAY, day(3)), ['push', 'cardio'], 'then it repeats');
    const occurrences = scheduleOccurrences(p, day(0), day(5));
    assert.deepEqual(occurrences.map((o) => [o.scheduledDate, o.planWorkoutId]), [
      [day(0), 'push'], [day(0), 'cardio'], [day(1), 'legs'],
      [day(3), 'push'], [day(3), 'cardio'], [day(4), 'legs'],
    ]);
    assert.deepEqual(occurrences.slice(0, 2).map((o) => o.id), [`occ_p_${day(0)}_push`, `occ_p_${day(0)}_cardio`]);
  });

  test('a workout listed twice on one day is scheduled once, in every plan type', () => {
    // Both copies would get the same occurrence id, so the second would be lost anyway.
    assert.deepEqual(workoutsOn(cycle(['push', 'push', 'cardio']), MONDAY, day(0)), ['push', 'cardio']);
    assert.deepEqual(workoutsOn({ type: 'weekly', days: [{ weekday: 1, workoutIds: ['push', 'push'] }] }, MONDAY, day(0)), ['push']);
    assert.deepEqual(workoutsOn({ type: 'fixed', weeks: 1, days: [{ week: 1, weekday: 1, workoutIds: ['legs', 'legs'] }] }, MONDAY, day(0)), ['legs']);
    const ids = scheduleOccurrences(plan(cycle(['push', 'push'], ['legs'])), day(0), day(5)).map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('an empty cycle schedules nothing', () => {
    assert.deepEqual(workoutsOn(cycle(), MONDAY, day(0)), []);
    assert.deepEqual(scheduleOccurrences(plan(cycle()), day(0), day(10)), []);
    assert.equal(currentRotatingStep(cycle(), MONDAY, day(0)), undefined);
  });

  test('a cycle stored the old way still schedules as it did', () => {
    const old = legacy(['push', 'rest', 'legs']);
    assert.deepEqual(cycleSteps(old), [{ workoutIds: ['push'] }, { workoutIds: [] }, { workoutIds: ['legs'] }]);
    assert.deepEqual([0, 1, 2, 3].map((n) => workoutsOn(old, MONDAY, day(n))), [['push'], [], ['legs'], ['push']]);
    assert.deepEqual([...scheduledWorkoutIds(old)], ['push', 'legs']);
    assert.equal(currentRotatingStep(old, MONDAY, day(4)), 1);
    assert.deepEqual(trainingDays(old), { count: 2, per: 'cycle', cycleLength: 3, workouts: 2 });
    assert.deepEqual(cycleSteps(legacy(undefined)), [], 'no sequence at all: an empty cycle');
  });

  test('stepsFromSequence keeps order and length: rest, or anything that is not an id, is a rest day', () => {
    assert.deepEqual(stepsFromSequence(['a', 'rest', 7, null, 'b']), [{ workoutIds: ['a'] }, { workoutIds: [] }, { workoutIds: [] }, { workoutIds: [] }, { workoutIds: ['b'] }]);
    assert.deepEqual(stepsFromSequence([]), []);
    for (const notAList of [undefined, null, 'a', { 0: 'a' }]) assert.deepEqual(stepsFromSequence(notAList), [], String(notAList));
  });

  test('scheduledWorkoutIds lists every workout a schedule uses, once, in order', () => {
    assert.deepEqual([...scheduledWorkoutIds(cycle(['push', 'cardio'], [], ['legs', 'push']))], ['push', 'cardio', 'legs']);
    assert.deepEqual([...scheduledWorkoutIds({ type: 'weekly', days: [{ weekday: 1, workoutIds: ['a', 'b'] }, { weekday: 3, workoutIds: ['a'] }] })], ['a', 'b']);
    assert.deepEqual([...scheduledWorkoutIds(cycle([], []))], []);
  });
});

describe("the plan card's label", () => {
  test('a cycle counts its workouts and its training days separately', () => {
    assert.deepEqual(trainingDays(pushCardio().schedule), { count: 2, per: 'cycle', cycleLength: 3, workouts: 3 });
    assert.deepEqual(trainingDays(cycle(['push', 'push'], [])), { count: 1, per: 'cycle', cycleLength: 2, workouts: 1 }, 'a repeat counts once');
    assert.deepEqual(trainingDays(cycle([], [])), { count: 0, per: 'cycle', cycleLength: 2, workouts: 0 });
  });

  test('"N workouts in a D-day cycle" counts every workout on every day', () => {
    assert.equal(describeSchedule(pushCardio().schedule), 'Rotating · 3 workouts in a 3-day cycle');
    // One workout a day reads as it always has.
    assert.equal(describeSchedule(cycle(['a'], ['b'], [])), 'Rotating · 2 workouts in a 3-day cycle');
    assert.equal(describeSchedule(cycle(['a'], [])), 'Rotating · 1 workout in a 2-day cycle');
    assert.equal(describeSchedule(cycle([], [])), 'Rotating · 0 workouts in a 2-day cycle');
  });

  test('weekly and fixed plans read as before', () => {
    const week: PlanSchedule = { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a', 'b'] }, { weekday: 4, workoutIds: ['c'] }] };
    assert.equal(describeSchedule(week), 'Weekly · 2 days a week');
    assert.equal(describeSchedule({ type: 'fixed', weeks: 12, days: ([1, 3, 5] as Weekday[]).map((weekday) => ({ week: 1, weekday, workoutIds: ['a'] })) }), '12 weeks · 3 days a week');
  });
});

describe('cycle edits', () => {
  test('setCycleSteps copies each day, without repeats or workouts the plan lacks', () => {
    const p = pushCardio();
    const steps = [{ workoutIds: ['legs', 'legs', 'push'] }, { workoutIds: ['gone'] }, { workoutIds: [] }];
    const next = setCycleSteps(p, steps);
    assert.deepEqual(daysOf(next), [['legs', 'push'], [], []]);
    steps[0].workoutIds.push('cardio');
    assert.deepEqual(daysOf(next), [['legs', 'push'], [], []], 'shares no arrays with its input');
    assert.deepEqual(daysOf(p), [['push', 'cardio'], ['legs'], []], 'the plan given is unchanged');
    const weekly = plan({ type: 'weekly', days: [{ weekday: 1, workoutIds: ['push'] }] });
    assert.equal(setCycleSteps(weekly, steps), weekly, 'other plan types come back as they were');
  });

  test('toggleCycleWorkout adds a workout to the end of a day, or takes it off', () => {
    const withLegs = toggleCycleWorkout(pushCardio(), 0, 'legs');
    assert.deepEqual(daysOf(withLegs), [['push', 'cardio', 'legs'], ['legs'], []]);
    assert.deepEqual(daysOf(toggleCycleWorkout(withLegs, 0, 'legs')), [['push', 'cardio'], ['legs'], []]);
    // On a rest day it makes a workout day.
    assert.deepEqual(daysOf(toggleCycleWorkout(pushCardio(), 2, 'cardio')), [['push', 'cardio'], ['legs'], ['cardio']]);
  });

  test("taking a day's last workout off leaves a rest day, and the cycle keeps its length", () => {
    const p = toggleCycleWorkout(pushCardio(), 1, 'legs');
    assert.deepEqual(daysOf(p), [['push', 'cardio'], [], []]);
    assert.deepEqual(workoutsOn(p.schedule, MONDAY, day(3)), ['push', 'cardio'], 'later dates keep their day');
  });

  test('toggleCycleWorkout never lists a workout twice, and ignores a day or workout that does not exist', () => {
    const p = pushCardio();
    assert.deepEqual(daysOf(toggleCycleWorkout(p, 0, 'push')), [['cardio'], ['legs'], []], 'already there: taken off, not added again');
    assert.equal(toggleCycleWorkout(p, 3, 'push'), p);
    assert.equal(toggleCycleWorkout(p, -1, 'push'), p);
    assert.deepEqual(daysOf(toggleCycleWorkout(p, 1, 'gone')), daysOf(p));
  });

  test('addCycleDay adds a workout day or a rest day at the end', () => {
    assert.deepEqual(daysOf(addCycleDay(pushCardio(), ['legs'])), [['push', 'cardio'], ['legs'], [], ['legs']]);
    assert.deepEqual(daysOf(addCycleDay(pushCardio(), [])), [['push', 'cardio'], ['legs'], [], []]);
    assert.deepEqual(daysOf(addCycleDay(pushCardio(), ['cardio', 'cardio', 'gone'])), [['push', 'cardio'], ['legs'], [], ['cardio']]);
  });

  test('deleteCycleDay deletes any day, from anywhere in the cycle', () => {
    const p = pushCardio();
    assert.deepEqual(daysOf(deleteCycleDay(p, 0)), [['legs'], []]);
    assert.deepEqual(daysOf(deleteCycleDay(p, 1)), [['push', 'cardio'], []]);
    assert.deepEqual(daysOf(deleteCycleDay(p, 2)), [['push', 'cardio'], ['legs']]);
    assert.equal(deleteCycleDay(p, 3), p);
    assert.equal(deleteCycleDay(p, -1), p);
  });

  test('moveCycleDay moves a day, workouts and all', () => {
    const p = pushCardio();
    assert.deepEqual(daysOf(moveCycleDay(p, 0, 2)), [['legs'], [], ['push', 'cardio']]);
    assert.deepEqual(daysOf(moveCycleDay(p, 2, 0)), [[], ['push', 'cardio'], ['legs']]);
    assert.deepEqual(daysOf(moveCycleDay(p, 0, 9)), [['legs'], [], ['push', 'cardio']], 'past the end: last');
    assert.equal(moveCycleDay(p, 5, 0), p);
  });

  test('the cycle edits leave weekly and fixed plans alone', () => {
    const weekly = plan({ type: 'weekly', days: [{ weekday: 1, workoutIds: ['push'] }] });
    for (const edit of [(q: Plan) => toggleCycleWorkout(q, 0, 'legs'), (q: Plan) => addCycleDay(q, ['legs']), (q: Plan) => deleteCycleDay(q, 0), (q: Plan) => moveCycleDay(q, 0, 1)]) {
      assert.equal(edit(weekly), weekly);
    }
    // And the weekday edit leaves cycles alone.
    const p = pushCardio();
    assert.equal(toggleWeekday(p, 1, 'legs'), p);
  });

  test('deleting a workout from the plan takes it off every cycle day; a day left empty is a rest day', () => {
    const p = plan(cycle(['push', 'cardio'], ['legs'], ['cardio'], []));
    const next = removeWorkout(p, 'cardio');
    assert.deepEqual(daysOf(next), [['push'], ['legs'], [], []], 'never drops a day');
    assert.deepEqual(next.workouts.map((w) => w.id), ['push', 'legs']);
    // So every date keeps its day.
    for (let n = 0; n < 8; n++) assert.deepEqual(workoutsOn(next.schedule, MONDAY, day(n)), workoutsOn(p.schedule, MONDAY, day(n)).filter((w) => w !== 'cardio'), day(n));
  });
});

describe('new cycle plans and template copies', () => {
  test("newPlan makes one blank workout per workout day of the wizard's cycle", () => {
    const p = newPlan({ name: 'Cycle', startDate: MONDAY, type: 'rotating', weekdays: [], weeks: 4, cycle: ['workout', 'rest', 'workout', 'workout', 'rest'] });
    assert.deepEqual(p.workouts.map((w) => w.name), ['Workout A', 'Workout B', 'Workout C']);
    const [a, b, c] = p.workouts.map((w) => w.id);
    assert.deepEqual(daysOf(p), [[a], [], [b], [c], []]);
    assert.equal(new Set([a, b, c]).size, 3);
  });

  const template = (): StarterTemplate => ({
    id: 'tpl_cycle',
    name: 'Cycle',
    category: 'gym',
    level: 'beginner',
    levels: ['beginner'],
    goals: ['general'],
    daysPerWeek: 3,
    description: 'A cycle with a double day.',
    equipment: ['bodyweight'],
    schedule: cycle(['tw_push', 'tw_cardio'], [], ['tw_legs']),
    workouts: [workout('tw_push', 'Push'), workout('tw_cardio', 'Cardio'), workout('tw_legs', 'Legs'), workout('tw_unused', 'Unused')],
  });

  test('planFromTemplate copies a cycle onto the plan’s own workouts, day for day', () => {
    const p = planFromTemplate(template(), MONDAY);
    const idOf = new Map(p.workouts.map((w) => [w.name, w.id]));
    assert.deepEqual(p.workouts.map((w) => w.name), ['Push', 'Cardio', 'Legs'], 'only the workouts the cycle uses');
    assert.deepEqual(daysOf(p), [[idOf.get('Push'), idOf.get('Cardio')], [], [idOf.get('Legs')]]);
    assert.ok(p.workouts.every((w) => !w.id.startsWith('tw_')), 'fresh ids');
  });

  test("the copy's cycle shares nothing with the template", () => {
    const t = template();
    const before = JSON.stringify(t);
    const p = planFromTemplate(t, MONDAY);
    assert.ok(p.schedule.type === 'rotating' && t.schedule.type === 'rotating');
    const [copied, own] = [p.schedule.steps, t.schedule.steps];
    assert.notEqual(copied, own);
    copied.forEach((s, i) => assert.notEqual(s.workoutIds, own[i].workoutIds));
    copied[0].workoutIds.push('pw_other');
    copied.push({ workoutIds: [] });
    assert.equal(JSON.stringify(t), before);
  });
});

describe('the JSON export', () => {
  test('is version 2, since a rotating plan now exports its days as steps', () => {
    const exported = JSON.parse(everythingJson({ preferences: defaultPreferences, exercises: [], plans: [pushCardio()], sessions: [], bodyweight: [], goals: [], formReports: [] })) as {
      format: string;
      version: number;
      plans: Plan[];
    };
    assert.deepEqual([exported.format, exported.version], ['exercise-tracker-export', 2]);
    assert.deepEqual(exported.plans[0].schedule, { type: 'rotating', steps: [{ workoutIds: ['push', 'cardio'] }, { workoutIds: ['legs'] }, { workoutIds: [] }] });
  });
});
