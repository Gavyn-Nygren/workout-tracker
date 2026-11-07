import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Agenda, DayItem, DayItemStatus } from '../src/features/today/agenda';
import { upcoming } from '../src/features/today/upcoming';

const SUNDAY = '2026-10-18';
const MONDAY = '2026-10-19';
const TODAY = '2026-10-22'; // a Thursday
const FRIDAY = '2026-10-23';
const SATURDAY = '2026-10-24';

const item = (date: string, name: string, status: DayItemStatus = 'planned'): DayItem => ({ key: `${date}_${name}`, date, name, status });

/** Legs today, Upper on Friday and Saturday, and a missed workout on Monday. */
const agenda = (): Agenda =>
  new Map([
    [MONDAY, [item(MONDAY, 'Push', 'missed')]],
    [SATURDAY, [item(SATURDAY, 'Upper')]],
    [TODAY, [item(TODAY, 'Legs')]],
    [FRIDAY, [item(FRIDAY, 'Upper'), item(FRIDAY, 'Cardio', 'skipped')]],
  ]);

const names = (items: DayItem[]) => items.map((i) => `${i.name} ${i.date}`);

describe('Coming up', () => {
  test('from today: the planned workouts after today, in date order', () => {
    assert.deepEqual(names(upcoming(agenda(), TODAY, TODAY, 3)), [`Upper ${FRIDAY}`, `Upper ${SATURDAY}`]);
  });

  test('from a past day: today’s planned workout comes first', () => {
    // A rest day last Sunday: its "Next up" is today's Legs, not Friday's.
    assert.deepEqual(names(upcoming(agenda(), SUNDAY, TODAY, 3)), [`Legs ${TODAY}`, `Upper ${FRIDAY}`, `Upper ${SATURDAY}`]);
    // A past day with a workout of its own: the missed one in between isn't "coming up".
    assert.deepEqual(names(upcoming(agenda(), MONDAY, TODAY, 1)), [`Legs ${TODAY}`]);
  });

  test('from a future day: only what comes after it', () => {
    assert.deepEqual(names(upcoming(agenda(), FRIDAY, TODAY, 3)), [`Upper ${SATURDAY}`]);
  });
});
