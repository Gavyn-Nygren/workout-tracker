// When the weekly summary goes out and which week it covers (spec 2.11, G3.12): the week table
// for both week starts and both summary days, ISO weekdays, quiet hours applied before the
// "still ahead" check, the latest summary, and Settings' caption.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fromISODate, isoWeekday } from '../src/data/dates';
import { defaultPreferences } from '../src/data/preferences';
import type { Weekday } from '../src/data/types';
import { localInstantMs } from '../src/features/notifications/localTime';
import { notificationPlan } from '../src/features/notifications/notificationPlan';
import { latestSummaryFire, latestSummaryWeek, summaryCoverageCaption, summaryFires, summaryWeekFor } from '../src/features/notifications/summaryTiming';
import type { PlanInput, QuietHours } from '../src/features/notifications/types';

const SATURDAY = '2026-10-31';
const SUNDAY = '2026-11-01';
const MONDAY = '2026-11-02';
const at = (date: string, time: string) => localInstantMs({ date, time });
const sundayEvening = { weekday: 7 as Weekday, time: '19:00' };

describe('which week a summary covers', () => {
  // [summary date, week starts on, covered week's first day]
  const table: [string, Weekday, string][] = [
    // Monday weeks: Sunday is the last day, so Sunday covers this week so far; Monday covers the week just ended.
    [SUNDAY, 1, '2026-10-26'],
    [MONDAY, 1, '2026-10-26'],
    // Sunday weeks: Sunday starts a week, so both days cover the week before (Sun Oct 25 – Sat Oct 31).
    [SUNDAY, 7, '2026-10-25'],
    [MONDAY, 7, '2026-10-25'],
    // A Saturday summary is the last day of a Sunday week.
    [SATURDAY, 7, '2026-10-25'],
    [SATURDAY, 1, '2026-10-19'],
  ];
  for (const [date, weekStartsOn, covered] of table) {
    test(`${date} (ISO ${isoWeekday(date)}) with weeks starting on ${weekStartsOn} covers ${covered}`, () => {
      assert.equal(summaryWeekFor(date, weekStartsOn), covered);
    });
  }

  test('captions for Settings', () => {
    assert.equal(summaryCoverageCaption(7, 1), 'Covers Mon–Sun, this week so far');
    assert.equal(summaryCoverageCaption(1, 1), 'Covers last week (Mon–Sun)');
    assert.equal(summaryCoverageCaption(7, 7), 'Covers last week (Sun–Sat)');
    assert.equal(summaryCoverageCaption(1, 7), 'Covers last week (Sun–Sat)');
    assert.equal(summaryCoverageCaption(6, 7), 'Covers Sun–Sat, this week so far');
  });
});

describe('the next summaries', () => {
  test('ISO weekday 7 is Sunday and 1 is Monday', () => {
    const now = at(MONDAY, '10:00');
    const sundays = summaryFires({ nowMs: now, at: sundayEvening, weekStartsOn: 1, count: 3 });
    assert.deepEqual(
      sundays.map((f) => f.configured.date),
      ['2026-11-08', '2026-11-15', '2026-11-22'],
    );
    for (const f of sundays) assert.equal(fromISODate(f.configured.date).getDay(), 0); // JS: 0 = Sunday
    const mondays = summaryFires({ nowMs: now, at: { weekday: 1, time: '19:00' }, weekStartsOn: 1, count: 2 });
    assert.deepEqual(
      mondays.map((f) => f.configured.date),
      [MONDAY, '2026-11-09'],
    );
    for (const f of mondays) assert.equal(fromISODate(f.configured.date).getDay(), 1);
  });

  test('each send carries its time, the week it covers, and the instant', () => {
    const [first, second] = summaryFires({ nowMs: at(SUNDAY, '18:59'), at: sundayEvening, weekStartsOn: 1, count: 2 });
    assert.deepEqual(first, { configured: { date: SUNDAY, time: '19:00' }, held: { date: SUNDAY, time: '19:00' }, fireAtMs: at(SUNDAY, '19:00'), weekStart: '2026-10-26' });
    assert.equal(second.weekStart, MONDAY);
    // At 19:00 itself it has gone out: the next one is the following Sunday.
    assert.deepEqual(
      summaryFires({ nowMs: at(SUNDAY, '19:00'), at: sundayEvening, weekStartsOn: 1, count: 1 }).map((f) => f.configured.date),
      ['2026-11-08'],
    );
  });

  test('a replan during the quiet-hours hold keeps the held summary (Sunday 21:00, quiet 18:00–08:00)', () => {
    const quietHours: QuietHours = { start: '18:00', end: '08:00' };
    const fires = summaryFires({ nowMs: at(SUNDAY, '21:00'), at: sundayEvening, quietHours, weekStartsOn: 1, count: 2 });
    assert.deepEqual(
      fires.map((f) => [f.configured.date, f.held.date, f.held.time, f.weekStart]),
      [
        [SUNDAY, MONDAY, '08:00', '2026-10-26'],
        ['2026-11-08', '2026-11-09', '08:00', MONDAY],
      ],
    );
    assert.equal(fires[0].fireAtMs, at(MONDAY, '08:00'));
    assert.equal(summaryFires({ nowMs: at(MONDAY, '07:59'), at: sundayEvening, quietHours, weekStartsOn: 1, count: 1 })[0].configured.date, SUNDAY);
    assert.equal(summaryFires({ nowMs: at(MONDAY, '08:00'), at: sundayEvening, quietHours, weekStartsOn: 1, count: 1 })[0].configured.date, '2026-11-08');
  });

  test('through the planner too: the held summary stays planned', () => {
    const input: PlanInput = {
      nowMs: at(SUNDAY, '21:00'),
      today: SUNDAY,
      owner: 'install_1',
      permission: 'granted',
      signedIn: true,
      onboarded: true,
      notifications: { ...defaultPreferences.notifications, weeklySummary: true, quietHours: { start: '18:00', end: '08:00' } },
      weekStartsOn: 1,
      occurrences: [],
      plans: [],
      planVersions: [],
      keptMissedIds: new Set(),
      summaryText: (fire) => ({ title: `Week of ${fire.weekStart}`, body: 'numbers' }),
    };
    const items = notificationPlan(input);
    assert.deepEqual(
      items.map((i) => [i.nid, i.at.date, i.at.time]),
      [
        ['et.summary.2026-10-26', MONDAY, '08:00'],
        ['et.summary.2026-11-02', '2026-11-09', '08:00'],
      ],
    );
  });

  test('a toInstant can be passed in, and bad settings give nothing', () => {
    const shifted = summaryFires({ nowMs: at(MONDAY, '10:00'), at: sundayEvening, weekStartsOn: 1, count: 1, toInstant: (t) => localInstantMs(t) + 1 });
    assert.equal(shifted[0].fireAtMs, at('2026-11-08', '19:00') + 1);
    assert.deepEqual(summaryFires({ nowMs: at(MONDAY, '10:00'), at: sundayEvening, weekStartsOn: 1, count: 0 }), []);
    assert.deepEqual(summaryFires({ nowMs: at(MONDAY, '10:00'), at: { weekday: 7, time: '7pm' }, weekStartsOn: 1, count: 2 }), []);
    assert.deepEqual(summaryFires({ nowMs: at(MONDAY, '10:00'), at: { weekday: 0 as Weekday, time: '19:00' }, weekStartsOn: 1, count: 2 }), []);
  });
});

describe('the latest summary', () => {
  test('the week of the most recent send at or before now', () => {
    assert.equal(latestSummaryWeek({ nowMs: at(MONDAY, '10:00'), at: sundayEvening, weekStartsOn: 1 }), '2026-10-26');
    assert.equal(latestSummaryWeek({ nowMs: at(SUNDAY, '19:00'), at: sundayEvening, weekStartsOn: 1 }), '2026-10-26');
    // Sunday morning: today's hasn't gone out, so the latest is last Sunday's.
    assert.equal(latestSummaryWeek({ nowMs: at(SUNDAY, '18:00'), at: sundayEvening, weekStartsOn: 1 }), '2026-10-19');
    // Sunday weeks, Monday 09:00 summaries.
    assert.equal(latestSummaryWeek({ nowMs: at(MONDAY, '10:00'), at: { weekday: 1, time: '09:00' }, weekStartsOn: 7 }), '2026-10-25');
  });

  test('by its held time', () => {
    const quietHours: QuietHours = { start: '18:00', end: '08:00' };
    assert.equal(latestSummaryWeek({ nowMs: at(SUNDAY, '21:00'), at: sundayEvening, quietHours, weekStartsOn: 1 }), '2026-10-19');
    assert.equal(latestSummaryWeek({ nowMs: at(MONDAY, '08:00'), at: sundayEvening, quietHours, weekStartsOn: 1 }), '2026-10-26');
    assert.deepEqual(latestSummaryFire({ nowMs: at(MONDAY, '08:00'), at: sundayEvening, quietHours, weekStartsOn: 1 })?.held, { date: MONDAY, time: '08:00' });
  });

  test('an unreadable setting still gives a week', () => {
    assert.equal(latestSummaryFire({ nowMs: at(MONDAY, '10:00'), at: { weekday: 7, time: 'later' }, weekStartsOn: 1 }), null);
    assert.equal(latestSummaryWeek({ nowMs: at(MONDAY, '10:00'), at: { weekday: 7, time: 'later' }, weekStartsOn: 1 }), '2026-10-26');
  });
});
