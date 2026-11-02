// Quiet hours and wall-clock times for notifications (G3.12, spec 2.11 and 6): wrapping past
// midnight, start == end, holding vs dropping, Settings' hint, and local times becoming instants
// across daylight-saving changes (America/New_York and Europe/London, through process.env.TZ).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { defaultPreferences } from '../src/data/preferences';
import type { Plan, Preferences, ScheduledOccurrence } from '../src/data/types';
import { holdForQuietHours, inQuietHours, localInstantMs, parseTime, reminderQuietEffect } from '../src/features/notifications/localTime';
import { notificationPlan } from '../src/features/notifications/notificationPlan';
import { summaryFires } from '../src/features/notifications/summaryTiming';
import type { PlanInput, QuietHours } from '../src/features/notifications/types';

const OVERNIGHT: QuietHours = { start: '22:00', end: '07:00' };
const AFTERNOON: QuietHours = { start: '13:00', end: '15:00' };

/** Runs `task` with the process in another time zone, as tests/calendar.test.ts does. */
const systemZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
function inZone<T>(zone: string, task: () => T): T {
  process.env.TZ = zone;
  try {
    return task();
  } finally {
    process.env.TZ = systemZone;
  }
}

describe('times', () => {
  test('parseTime reads 24-hour HH:MM only', () => {
    assert.deepEqual(parseTime('07:30'), { h: 7, m: 30 });
    assert.deepEqual(parseTime('00:00'), { h: 0, m: 0 });
    assert.deepEqual(parseTime('23:59'), { h: 23, m: 59 });
    for (const bad of ['7:30', '24:00', '12:60', '12:5', '12:30:00', ' 12:30', '', 'noon', true, 1730, null, undefined, {}]) {
      assert.equal(parseTime(bad), null, String(bad));
    }
  });

  test('localInstantMs is new Date(y, m-1, d, h, mi); NaN when unreadable', () => {
    assert.equal(localInstantMs({ date: '2026-11-02', time: '17:05' }), new Date(2026, 10, 2, 17, 5).getTime());
    assert.ok(Number.isNaN(localInstantMs({ date: '2026-11-02', time: 'soon' })));
    assert.ok(Number.isNaN(localInstantMs({ date: '2026-02-30', time: '17:00' })));
  });
});

describe('quiet hours', () => {
  test('overnight hours wrap past midnight; the end time itself is outside', () => {
    for (const t of ['22:00', '23:30', '00:00', '03:15', '06:59']) assert.equal(inQuietHours(t, OVERNIGHT), true, t);
    for (const t of ['07:00', '12:00', '17:00', '21:59']) assert.equal(inQuietHours(t, OVERNIGHT), false, t);
  });

  test('daytime hours do not wrap', () => {
    for (const t of ['13:00', '14:59']) assert.equal(inQuietHours(t, AFTERNOON), true, t);
    for (const t of ['12:59', '15:00', '23:00', '02:00']) assert.equal(inQuietHours(t, AFTERNOON), false, t);
  });

  test('start == end, none set, or unreadable times mean no quiet hours', () => {
    for (const t of ['00:00', '22:00', '12:00']) {
      assert.equal(inQuietHours(t, { start: '22:00', end: '22:00' }), false);
      assert.equal(inQuietHours(t, undefined), false);
      assert.equal(inQuietHours(t, { start: 'late', end: '07:00' }), false);
    }
    assert.equal(inQuietHours('nope', OVERNIGHT), false);
  });

  test('holding moves a time to the end, onto the next date from the evening part', () => {
    const outside = { date: '2026-11-02', time: '17:00' };
    assert.equal(holdForQuietHours(outside, OVERNIGHT), outside);
    assert.deepEqual(holdForQuietHours({ date: '2026-11-02', time: '23:00' }, OVERNIGHT), { date: '2026-11-03', time: '07:00' });
    assert.deepEqual(holdForQuietHours({ date: '2026-11-02', time: '06:00' }, OVERNIGHT), { date: '2026-11-02', time: '07:00' });
    assert.deepEqual(holdForQuietHours({ date: '2026-11-02', time: '14:00' }, AFTERNOON), { date: '2026-11-02', time: '15:00' });
    assert.deepEqual(holdForQuietHours({ date: '2026-12-31', time: '22:30' }, OVERNIGHT), { date: '2027-01-01', time: '07:00' });
    assert.deepEqual(holdForQuietHours({ date: '2026-11-02', time: '23:00' }, { start: '07:00', end: '07:00' }), { date: '2026-11-02', time: '23:00' });
  });

  test("Settings' hint: none, held until the end the same day, or dropped", () => {
    assert.deepEqual(reminderQuietEffect('17:00', OVERNIGHT), { kind: 'none' });
    assert.deepEqual(reminderQuietEffect('06:30', OVERNIGHT), { kind: 'held', until: '07:00' });
    assert.deepEqual(reminderQuietEffect('23:00', OVERNIGHT), { kind: 'dropped' });
    assert.deepEqual(reminderQuietEffect('14:00', AFTERNOON), { kind: 'held', until: '15:00' });
    assert.deepEqual(reminderQuietEffect('23:00', undefined), { kind: 'none' });
    assert.deepEqual(reminderQuietEffect('23:00', { start: '22:00', end: '22:00' }), { kind: 'none' });
  });
});

// ---------------------------------------------------------------------------
// Through the planner

const TODAY = '2026-11-02'; // a Monday
const STAMP = '2026-10-01T08:00:00.000Z';
const plan: Plan = {
  id: 'p1',
  name: 'Upper / Lower',
  version: 1,
  status: 'active',
  startDate: '2026-10-05',
  schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }] },
  workouts: [{ id: 'a', name: 'Lower A', blocks: [], estimatedMinutes: 60 }],
  createdAt: STAMP,
  updatedAt: STAMP,
};
const occ = (date: string, extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({ id: `occ_p1_${date}_a`, planId: 'p1', planVersion: 1, planWorkoutId: 'a', scheduledDate: date, ...extra });

function planFor(now: { date: string; time: string }, patch: Partial<Preferences['notifications']>, extra: Partial<PlanInput> = {}) {
  return notificationPlan({
    nowMs: localInstantMs(now),
    today: now.date,
    owner: 'install_1',
    permission: 'granted',
    signedIn: true,
    onboarded: true,
    notifications: { ...defaultPreferences.notifications, ...patch },
    weekStartsOn: 1,
    occurrences: [occ('2026-11-01'), occ(TODAY), occ('2026-11-03')],
    plans: [plan],
    planVersions: [],
    keptMissedIds: new Set(),
    summaryText: (fire) => ({ title: `Week of ${fire.weekStart}`, body: 'numbers' }),
    ...extra,
  });
}

describe('quiet hours in the plan', () => {
  const now = { date: TODAY, time: '05:00' };

  test('a reminder held to the end of quiet hours the same day', () => {
    const items = planFor(now, { workoutReminders: true, reminderTime: '06:30', quietHours: OVERNIGHT });
    assert.deepEqual(
      items.map((i) => [i.nid, i.at.date, i.at.time]),
      [
        [`et.reminder.${TODAY}`, TODAY, '07:00'],
        ['et.reminder.2026-11-03', '2026-11-03', '07:00'],
      ],
    );
  });

  test('a reminder that would be held into the next day is dropped', () => {
    assert.deepEqual(planFor(now, { workoutReminders: true, reminderTime: '23:00', quietHours: OVERNIGHT }), []);
    // Outside quiet hours it goes at its time.
    assert.deepEqual(
      planFor(now, { workoutReminders: true, reminderTime: '21:55', quietHours: OVERNIGHT }).map((i) => i.at.time),
      ['21:55', '21:55'],
    );
  });

  test('the missed prompt is held', () => {
    const [item] = planFor(now, { missedWorkout: true, quietHours: { start: '21:00', end: '10:00' } });
    assert.deepEqual([item.nid, item.at.date, item.at.time], ['et.missed.2026-11-01', TODAY, '10:00']);
  });

  test('the summary is held, even into the next day, and still covers its own week', () => {
    const items = planFor({ date: '2026-11-01', time: '12:00' }, { weeklySummary: true, quietHours: { start: '18:30', end: '08:00' } }, { occurrences: [] });
    assert.deepEqual(
      items.map((i) => [i.nid, i.at.date, i.at.time, i.title]),
      [
        ['et.summary.2026-10-26', TODAY, '08:00', 'Week of 2026-10-26'],
        ['et.summary.2026-11-02', '2026-11-09', '08:00', 'Week of 2026-11-02'],
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// Daylight saving

const HOUR = 3_600_000;

describe('daylight saving (America/New_York)', () => {
  test('fall back, 2026-11-01: wall-clock times stay put, the day is 25 hours long', () => {
    inZone('America/New_York', () => {
      assert.equal(new Date(localInstantMs({ date: '2026-11-01', time: '00:30' })).toISOString(), '2026-11-01T04:30:00.000Z');
      // 01:30 happens twice; the first (still daylight time) is used.
      assert.equal(new Date(localInstantMs({ date: '2026-11-01', time: '01:30' })).toISOString(), '2026-11-01T05:30:00.000Z');
      assert.equal(new Date(localInstantMs({ date: '2026-11-01', time: '09:00' })).toISOString(), '2026-11-01T14:00:00.000Z');
      const saturday = localInstantMs({ date: '2026-10-31', time: '17:00' });
      const sunday = localInstantMs({ date: '2026-11-01', time: '17:00' });
      assert.equal(sunday - saturday, 25 * HOUR);
    });
  });

  test("fall back: the Sunday 19:00 summary goes at 7 PM local, and Monday's reminder at 17:00", () => {
    inZone('America/New_York', () => {
      const [fire] = summaryFires({ nowMs: localInstantMs({ date: '2026-11-01', time: '00:30' }), at: { weekday: 7, time: '19:00' }, weekStartsOn: 1, count: 1 });
      assert.equal(new Date(fire.fireAtMs).toISOString(), '2026-11-02T00:00:00.000Z');
      assert.equal(new Date(fire.fireAtMs).getHours(), 19);
      const items = planFor({ date: '2026-10-31', time: '20:00' }, { workoutReminders: true }, { today: '2026-10-31' });
      assert.deepEqual(
        items.map((i) => [i.at.date, new Date(i.fireAtMs).toISOString(), new Date(i.fireAtMs).getHours()]),
        [
          ['2026-11-01', '2026-11-01T22:00:00.000Z', 17],
          [TODAY, '2026-11-02T22:00:00.000Z', 17],
          ['2026-11-03', '2026-11-03T22:00:00.000Z', 17],
        ],
      );
    });
  });

  test('spring forward, 2026-03-08: 02:30 does not exist and lands at 03:30', () => {
    inZone('America/New_York', () => {
      const skipped = localInstantMs({ date: '2026-03-08', time: '02:30' });
      assert.equal(new Date(skipped).toISOString(), '2026-03-08T07:30:00.000Z');
      assert.equal(skipped, localInstantMs({ date: '2026-03-08', time: '03:30' }));
      assert.equal(new Date(localInstantMs({ date: '2026-03-08', time: '01:30' })).toISOString(), '2026-03-08T06:30:00.000Z');
      assert.equal(new Date(localInstantMs({ date: '2026-03-08', time: '09:00' })).toISOString(), '2026-03-08T13:00:00.000Z');
      const saturday = localInstantMs({ date: '2026-03-07', time: '17:00' });
      const sunday = localInstantMs({ date: '2026-03-08', time: '17:00' });
      assert.equal(sunday - saturday, 23 * HOUR);
    });
  });

  test('spring forward: a reminder held to 02:30, a time the clocks skip, goes at 03:30', () => {
    inZone('America/New_York', () => {
      const [item] = planFor({ date: '2026-03-07', time: '12:00' }, { workoutReminders: true, reminderTime: '01:00', quietHours: { start: '00:00', end: '02:30' } }, { today: '2026-03-07', occurrences: [occ('2026-03-08')] });
      assert.deepEqual([item.nid, item.at.date, item.at.time], ['et.reminder.2026-03-08', '2026-03-08', '02:30']);
      assert.equal(new Date(item.fireAtMs).toISOString(), '2026-03-08T07:30:00.000Z');
    });
  });

  test('spring forward: the missed prompt keeps its morning wall time', () => {
    inZone('America/New_York', () => {
      const day = { date: '2026-03-07', time: '12:00' };
      const occurrences = [occ('2026-03-07')];
      const [item] = planFor(day, { missedWorkout: true, quietHours: { start: '08:30', end: '09:30' } }, { today: day.date, occurrences });
      assert.deepEqual(item.at, { date: '2026-03-08', time: '09:30' });
      assert.equal(new Date(item.fireAtMs).toISOString(), '2026-03-08T13:30:00.000Z');
      // Overnight quiet hours that start before 09:00 would hold it a second day, where "yesterday" is wrong: dropped.
      assert.deepEqual(planFor(day, { missedWorkout: true, quietHours: { start: '08:00', end: '02:30' } }, { today: day.date, occurrences }), []);
    });
  });
});

describe('daylight saving (Europe/London)', () => {
  test('spring forward, 2026-03-29: 01:30 lands at 02:30 BST', () => {
    inZone('Europe/London', () => {
      assert.equal(new Date(localInstantMs({ date: '2026-03-29', time: '01:30' })).toISOString(), '2026-03-29T01:30:00.000Z');
      assert.equal(new Date(localInstantMs({ date: '2026-03-29', time: '09:00' })).toISOString(), '2026-03-29T08:00:00.000Z');
      assert.equal(new Date(localInstantMs({ date: '2026-03-28', time: '09:00' })).toISOString(), '2026-03-28T09:00:00.000Z');
    });
  });

  test('fall back, 2026-10-25: 01:30 is the first one (BST); the summary keeps its wall time', () => {
    inZone('Europe/London', () => {
      assert.equal(new Date(localInstantMs({ date: '2026-10-25', time: '01:30' })).toISOString(), '2026-10-25T00:30:00.000Z');
      assert.equal(new Date(localInstantMs({ date: '2026-10-25', time: '09:00' })).toISOString(), '2026-10-25T09:00:00.000Z');
      const fires = summaryFires({ nowMs: localInstantMs({ date: '2026-10-24', time: '12:00' }), at: { weekday: 7, time: '19:00' }, weekStartsOn: 1, count: 2 });
      assert.deepEqual(
        fires.map((f) => new Date(f.fireAtMs).toISOString()),
        ['2026-10-25T19:00:00.000Z', '2026-11-01T19:00:00.000Z'],
      );
      assert.deepEqual(
        fires.map((f) => f.weekStart),
        ['2026-10-19', '2026-10-26'],
      );
    });
  });
});
