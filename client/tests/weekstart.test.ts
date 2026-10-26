import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays, daysBetween, isoWeekday } from '../src/data/dates';
import { deriveStreak } from '../src/data/progress';
import type { ISODate, Weekday, WorkoutSession } from '../src/data/types';
import { workoutDays } from '../src/features/plans/describe';
import { newPlan, nextWeekStart } from '../src/features/plans/planEdits';
import { sortWeekdays, WEEKDAY_LETTER, weekDates, weekdayOrder } from '../src/lib/format';

// 2026-10-25 and 2026-11-01 are Sundays; 2026-10-26 is a Monday.
const SUN = '2026-10-25';
const MON = '2026-10-26';
const WED = '2026-10-28';
const SAT = '2026-10-31';
const NEXT_SUN = '2026-11-01';
const NEXT_MON = '2026-11-02';
const NEXT_TUE = '2026-11-03';

/** A finished workout with one completed working set, so it counts toward the streak. */
const workout = (day: ISODate): WorkoutSession => ({
  id: `sess_${day}`,
  name: day,
  status: 'completed',
  completion: 'full',
  completedDate: day,
  completedAt: `${day}T10:00:00Z`,
  blocks: [
    {
      id: 'b',
      type: 'single',
      exercises: [{ id: 'e', exerciseId: 'ex_back_squat', skipped: false, sets: [{ id: `set_${day}`, kind: 'normal', modifiers: [], loadKg: 100, reps: 5, completedAt: `${day}T10:00:00Z` }] }],
    },
  ],
  createdAt: `${day}T09:00:00Z`,
  updatedAt: `${day}T10:00:00Z`,
});

describe('day order follows the week start', () => {
  test('Monday weeks run M–S, Sunday weeks S–S', () => {
    assert.deepEqual(weekdayOrder(1), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(weekdayOrder(7), [7, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(weekdayOrder(), weekdayOrder(1), 'Monday is the default');
    assert.equal(weekdayOrder(1).map((d) => WEEKDAY_LETTER[d]).join(''), 'MTWTFSS');
    assert.equal(weekdayOrder(7).map((d) => WEEKDAY_LETTER[d]).join(''), 'SMTWTFS');
  });

  test('sorting weekdays puts the week start first', () => {
    assert.deepEqual(sortWeekdays([7, 3, 1]), [1, 3, 7]);
    assert.deepEqual(sortWeekdays([7, 3, 1], 7), [7, 1, 3]);
    assert.deepEqual(sortWeekdays([6, 7], 7), [7, 6]);
  });
});

describe('week grouping', () => {
  test('a midweek day belongs to the week starting on the week start', () => {
    assert.deepEqual(weekDates(WED, 1), [MON, '2026-10-27', WED, '2026-10-29', '2026-10-30', SAT, NEXT_SUN]);
    assert.deepEqual(weekDates(WED, 7), [SUN, MON, '2026-10-27', WED, '2026-10-29', '2026-10-30', SAT]);
  });

  test('a Sunday starts a Sunday week but ends a Monday week', () => {
    assert.equal(weekDates(NEXT_SUN, 7)[0], NEXT_SUN);
    assert.equal(weekDates(NEXT_SUN, 1)[0], MON);
    assert.equal(weekDates(NEXT_SUN, 1)[6], NEXT_SUN);
  });

  test('every week is seven straight days from its first day', () => {
    for (const weekStartsOn of [1, 7] as Weekday[]) {
      for (let i = 0; i < 14; i++) {
        const date = addDays(SUN, i);
        const week = weekDates(date, weekStartsOn);
        assert.equal(isoWeekday(week[0]), weekStartsOn);
        assert.ok(week.includes(date));
        week.forEach((d, j) => assert.equal(daysBetween(week[0], d), j));
      }
    }
  });
});

describe('next week start, for "today or next Monday" (spec 2.5)', () => {
  test('Monday weeks: the next Monday, a week later on a Monday', () => {
    assert.equal(nextWeekStart(MON), NEXT_MON, 'Monday is the default, and never today');
    assert.equal(nextWeekStart(WED, 1), NEXT_MON);
    assert.equal(nextWeekStart(NEXT_SUN, 1), NEXT_MON, 'Sunday: tomorrow');
  });

  test('Sunday weeks: the next Sunday', () => {
    assert.equal(nextWeekStart(SUN, 7), NEXT_SUN, 'a week later on a Sunday');
    assert.equal(nextWeekStart(MON, 7), NEXT_SUN);
    assert.equal(nextWeekStart(WED, 7), NEXT_SUN);
    assert.equal(nextWeekStart(SAT, 7), NEXT_SUN, 'Saturday: tomorrow');
  });

  test('always on the week start, 1–7 days ahead', () => {
    for (const weekStartsOn of [1, 7] as Weekday[]) {
      for (let i = 0; i < 14; i++) {
        const from = addDays(SUN, i);
        const next = nextWeekStart(from, weekStartsOn);
        assert.equal(isoWeekday(next), weekStartsOn);
        assert.ok(daysBetween(from, next) >= 1 && daysBetween(from, next) <= 7);
      }
    }
  });
});

describe('plans show days in week-start order but store ISO weekdays', () => {
  const setup = { name: 'Test', startDate: MON, type: 'weekly' as const, weekdays: [3, 7, 1] as Weekday[], weeks: 4, cycle: [] };

  test('a new plan lists its day workouts from the week start', () => {
    assert.deepEqual(newPlan(setup).workouts.map((w) => w.name), ['Monday', 'Wednesday', 'Sunday']);
    const sunday = newPlan({ ...setup, weekStartsOn: 7 });
    assert.deepEqual(sunday.workouts.map((w) => w.name), ['Sunday', 'Monday', 'Wednesday']);
    assert.ok(sunday.schedule.type === 'weekly');
    assert.deepEqual(sunday.schedule.days.map((d) => d.weekday), [1, 3, 7], 'stored data keeps ISO weekdays');
    // Each workout is still on its own day.
    const byName = new Map(sunday.workouts.map((w) => [w.id, w.name]));
    assert.deepEqual(sunday.schedule.days.map((d) => [d.weekday, byName.get(d.workoutIds[0])]), [[1, 'Monday'], [3, 'Wednesday'], [7, 'Sunday']]);
  });

  test("a workout's days read from the week start", () => {
    const base = newPlan(setup);
    const plan = { ...base, schedule: { type: 'weekly' as const, days: [{ weekday: 1 as Weekday, workoutIds: ['a'] }, { weekday: 7 as Weekday, workoutIds: ['a'] }] } };
    assert.equal(workoutDays(plan, 'a'), 'Mon, Sun');
    assert.equal(workoutDays(plan, 'a', true, 7), 'Sunday, Monday');
  });
});

describe('weekly streak with Sunday weeks (spec 2.5)', () => {
  test('a Sunday workout counts for the week it starts, not the week before', () => {
    const sessions = [workout(NEXT_SUN)];
    assert.equal(deriveStreak(sessions, NEXT_TUE, 1, 7).thisWeekCompleted, 1);
    assert.equal(deriveStreak(sessions, NEXT_TUE, 1, 1).thisWeekCompleted, 0, 'Monday weeks: it closed last week');
  });

  test('Saturday then Sunday is two weeks with Sunday weeks, one with Monday weeks', () => {
    const sessions = [workout(SAT), workout(NEXT_SUN)];
    const sunday = deriveStreak(sessions, NEXT_SUN, 1, 7);
    assert.equal(sunday.currentWeeks, 2);
    assert.equal(sunday.thisWeekCompleted, 1);
    const monday = deriveStreak(sessions, NEXT_SUN, 1, 1);
    assert.equal(monday.currentWeeks, 1);
    assert.equal(monday.thisWeekCompleted, 2);
  });

  test("Home's week is the streak's week", () => {
    for (const weekStartsOn of [1, 7] as Weekday[]) {
      for (const today of [SUN, MON, WED, SAT, NEXT_SUN]) {
        const week = weekDates(today, weekStartsOn);
        const inside = deriveStreak(week.map(workout), today, 7, weekStartsOn);
        assert.equal(inside.thisWeekCompleted, 7, `${today}, week starting ${weekStartsOn}: every day of Home's week counts`);
        const outside = deriveStreak([workout(addDays(week[0], -1)), workout(addDays(week[6], 1))], today, 1, weekStartsOn);
        assert.equal(outside.thisWeekCompleted, 0, `${today}, week starting ${weekStartsOn}: the days around it don't`);
      }
    }
  });
});
