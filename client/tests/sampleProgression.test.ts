import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { buildFakeDataset } from '../src/data/fake';
import type { ISODate } from '../src/data/types';
import { buildAgenda, type Agenda, type DayItem } from '../src/features/today/agenda';
import { sessionFromPlan } from '../src/features/workout/buildSession';
import { completedNewestFirst } from '../src/features/workout/history';
import { suggestionLine } from '../src/features/workout/progression';

/** Planned workouts from today on, in order: Today's cards, then Coming up. */
function nextWorkouts(agenda: Agenda, today: ISODate): DayItem[] {
  return [...agenda.entries()]
    .filter(([date]) => date >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, items]) => items.filter((i) => i.status === 'planned'));
}

/** The reason lines a workout starts with, as the app builds it from the sample data. */
function linesFor(today: ISODate, item: DayItem, data: ReturnType<typeof buildFakeDataset>) {
  const session = sessionFromPlan({
    item,
    history: completedNewestFirst(data.sessions),
    exercisesById: new Map(data.exercises.map((e) => [e.id, e])),
    preferences: data.preferences,
    today,
  });
  return session.blocks
    .flatMap((b) => b.exercises)
    .flatMap((entry) => {
      const line = suggestionLine(entry, data.preferences.units);
      return line && entry.suggestion ? [{ workout: item.name, plannedId: entry.plannedExerciseId, kind: entry.suggestion.kind, ...line }] : [];
    });
}

// A whole week (every weekday as "today"), plus a month and a year boundary.
const DATES: ISODate[] = [...Array.from({ length: 7 }, (_, i) => addDays('2026-10-26', i)), '2026-12-01', '2027-01-01'];

describe('sample data shows the progression reason lines (G3.9)', () => {
  for (const today of DATES) {
    test(`the next two Upper / Lower workouts from ${today} show an increase, a same weight and a deload`, () => {
      const data = buildFakeDataset(today);
      const agenda = buildAgenda({ occurrences: data.occurrences, sessions: data.sessions, plans: data.plans, today });
      const upperLower = nextWorkouts(agenda, today).filter((i) => i.plan?.id === 'plan_upper_lower');
      const lines = upperLower.slice(0, 2).flatMap((item) => linesFor(today, item, data));

      const byKind = (kind: string) => lines.filter((l) => l.kind === kind);
      const [increase] = byKind('increase');
      const [same] = byKind('hold_after_miss');
      const [deload] = byKind('deload');
      assert.ok(increase && same && deload, JSON.stringify(lines));
      assert.equal(new Set([increase.plannedId, same.plannedId, deload.plannedId]).size, 3, 'each on its own exercise');

      assert.match(increase.text, /^\+(5|10) lb · every set hit (8|10) last time$/);
      assert.equal(increase.direction, 'up');
      assert.match(same.text, /^Same weight · [12] of 3 misses before a deload$/);
      assert.equal(same.direction, 'same');
      assert.match(deload.text, /^−10% · 3 misses in a row at \d+$/);
      assert.equal(deload.direction, 'down');
      // Tapping an increase or a deload offers "Use last time's weight"; a same weight has nothing to undo.
      assert.ok(increase.undoable && deload.undoable);
      assert.equal(same.undoable, false);
    });
  }

  test('every Upper / Lower workout has a line, and Calves & Core (no rules) has none', () => {
    const today = '2026-10-27';
    const data = buildFakeDataset(today);
    const agenda = buildAgenda({ occurrences: data.occurrences, sessions: data.sessions, plans: data.plans, today });
    const week = nextWorkouts(agenda, today).filter((i) => i.date < addDays(today, 7));
    const kinds = week.map((item) => [item.date, item.name, linesFor(today, item, data).map((l) => `${l.plannedId}:${l.kind}`)]);
    assert.deepEqual(kinds, [
      ['2026-10-27', 'Lower A', ['pe_la_squat:deload', 'pe_la_rdl:increase']],
      ['2026-10-29', 'Upper B', ['pe_ub_incline:hold_after_miss']],
      ['2026-10-29', 'Calves & Core', []],
      ['2026-10-30', 'Lower B', ['pe_lb_deadlift:deload', 'pe_lb_frontsquat:increase']],
      ['2026-10-31', 'Calves & Core', []],
      ['2026-11-02', 'Upper A', ['pe_ua_bench:increase', 'pe_ua_row:hold_after_miss']],
      ['2026-11-02', 'Calves & Core', []],
    ]);
  });
});
