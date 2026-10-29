// Runs in New York time, a negative-offset zone with daylight saving: on 2026-03-08 the clocks skip
// 2:00-3:00, and on 2026-11-01 they repeat 1:00-2:00. Set before anything creates a Date. Node's
// test runner gives each test file its own process, so this doesn't reach the other files.
/* eslint-disable import/first -- the time zone must be set before the imports below run */
process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { deriveBadges, type BadgeInput } from '../src/data/badges';
import {
  addDays,
  completionStamp,
  daysBetween,
  endOfWeek,
  fromISODate,
  isISODate,
  isoWeekday,
  localDateOf,
  startOfWeek,
  toISODate,
  todayISO,
  weekdayIndex,
} from '../src/data/dates';
import { deriveStreak } from '../src/data/progress';
import type { FormReport, ISODate, LoggedSet, Plan, ScheduledOccurrence, WorkoutSession } from '../src/data/types';
import { buildWins } from '../src/features/home/wins';
import { buildAgenda } from '../src/features/today/agenda';

const ZONE = 'America/New_York';

/** Runs `fn` with the phone in another time zone, then puts New York back. */
function inZone<T>(zone: string, fn: () => T): T {
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    process.env.TZ = ZONE;
  }
}

/** Every date from `from` through `to`. */
function datesThrough(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

describe('the test time zone', () => {
  test('TZ takes effect on this platform: New York, with daylight saving', () => {
    assert.equal(new Date(2026, 0, 15, 12).getTimezoneOffset(), 300); // EST, UTC-5
    assert.equal(new Date(2026, 2, 8, 12).getTimezoneOffset(), 240); // EDT from Mar 8
    assert.equal(new Date(2026, 2, 7, 12).getTimezoneOffset(), 300);
    assert.equal(new Date(2026, 10, 1, 12).getTimezoneOffset(), 300); // EST again from Nov 1
  });
});

describe('day math across daylight saving changes', () => {
  test('addDays steps one calendar day over the spring-forward and fall-back days', () => {
    assert.equal(addDays('2026-03-07', 1), '2026-03-08');
    assert.equal(addDays('2026-03-08', 1), '2026-03-09');
    assert.equal(addDays('2026-03-07', 2), '2026-03-09');
    assert.equal(addDays('2026-03-09', -2), '2026-03-07');
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-11-01', 1), '2026-11-02');
    assert.equal(addDays('2026-11-02', -2), '2026-10-31');
  });

  test('addDays handles month, year and leap-day boundaries', () => {
    assert.equal(addDays('2026-10-26', 0), '2026-10-26');
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2028-02-29', 1), '2028-03-01');
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
    assert.equal(addDays('2026-01-01', 365), '2027-01-01');
  });

  test('daysBetween counts whole calendar days, never 23- or 25-hour fractions', () => {
    assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
    assert.equal(daysBetween('2026-03-08', '2026-03-09'), 1);
    assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
    assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1);
    assert.equal(daysBetween('2026-11-02', '2026-10-31'), -2);
    assert.equal(daysBetween('2026-01-01', '2027-01-01'), 365);
    assert.equal(daysBetween('2028-01-01', '2029-01-01'), 366);
    assert.equal(daysBetween('2026-10-26', '2026-10-26'), 0);
  });

  test('a whole year of single steps agrees with daysBetween and the weekday cycle', () => {
    const days = datesThrough('2026-01-01', '2026-12-31');
    assert.equal(days.length, 365);
    assert.equal(new Set(days).size, 365);
    days.forEach((d, i) => {
      assert.equal(daysBetween('2026-01-01', d), i, d);
      assert.ok(Number.isInteger(daysBetween(d, '2026-07-04')), d);
      // 2026-01-01 is a Thursday.
      assert.equal(isoWeekday(d), (((3 + i) % 7) + 1) as number, d);
      assert.equal(toISODate(fromISODate(d)), d, d);
    });
  });

  test('isoWeekday on and around the change days', () => {
    assert.equal(isoWeekday('2026-03-08'), 7);
    assert.equal(isoWeekday('2026-03-09'), 1);
    assert.equal(isoWeekday('2026-11-01'), 7);
    assert.equal(isoWeekday('2026-10-26'), 1);
  });

  test('startOfWeek finds the same week start across a change, Monday or Sunday first', () => {
    // Spring forward is on a Sunday: the last day of a Monday week, the first of a Sunday week.
    assert.equal(startOfWeek('2026-03-08', 1), '2026-03-02');
    assert.equal(startOfWeek('2026-03-08', 7), '2026-03-08');
    assert.equal(startOfWeek('2026-03-09', 1), '2026-03-09');
    assert.equal(startOfWeek('2026-03-14', 7), '2026-03-08');
    assert.equal(startOfWeek('2026-11-01', 1), '2026-10-26');
    assert.equal(startOfWeek('2026-11-01', 7), '2026-11-01');
    assert.equal(startOfWeek('2026-11-07', 7), '2026-11-01');
    assert.equal(startOfWeek('2026-11-04'), '2026-11-02'); // Monday by default
    for (const d of datesThrough('2026-02-23', '2026-03-22')) {
      for (const ws of [1, 7] as const) {
        const start = startOfWeek(d, ws);
        assert.equal(isoWeekday(start), ws, `${d} (${ws})`);
        assert.ok(daysBetween(start, d) >= 0 && daysBetween(start, d) <= 6, `${d} (${ws})`);
      }
    }
  });

  test('fromISODate gives the start of that local day, with an EST or EDT offset to match', () => {
    assert.equal(fromISODate('2026-03-08').getHours(), 0);
    assert.equal(fromISODate('2026-03-08').getTimezoneOffset(), 300);
    assert.equal(fromISODate('2026-03-09').getTimezoneOffset(), 240);
    assert.equal(fromISODate('2026-11-01').getTimezoneOffset(), 240);
  });
});

describe('day math in other time zones', () => {
  const zones = [
    'America/Santiago', // skips midnight on 2026-09-06
    'Asia/Beirut', // skips midnight on 2026-03-29
    'America/Havana', // skips midnight on 2026-03-08
    'Australia/Lord_Howe', // half-hour daylight saving
    'Europe/London',
    'Asia/Kolkata',
    'Pacific/Kiritimati', // UTC+14
    'Pacific/Pago_Pago', // UTC-11
  ];
  for (const zone of zones) {
    test(`${zone}: dates step, count and round-trip the same as anywhere`, () => {
      inZone(zone, () => {
        const days = datesThrough('2026-01-01', '2026-12-31');
        assert.equal(days.length, 365);
        days.forEach((d, i) => {
          assert.equal(daysBetween('2026-01-01', d), i, d);
          assert.equal(toISODate(fromISODate(d)), d, d);
        });
        assert.equal(startOfWeek('2026-09-06', 1), '2026-08-31');
        assert.equal(startOfWeek('2026-03-29', 7), '2026-03-29');
      });
    });
  }

  test('a day the local calendar skipped still counts as a calendar day (Samoa, December 2011)', () => {
    inZone('Pacific/Apia', () => {
      // Samoa jumped from Dec 29 to Dec 31, 2011. Day math is about the calendar, not the clock.
      assert.equal(new Date(2011, 11, 30, 12).getDate(), 31);
      assert.equal(addDays('2011-12-29', 1), '2011-12-30');
      assert.equal(addDays('2011-12-29', 2), '2011-12-31');
      assert.equal(daysBetween('2011-12-29', '2011-12-31'), 2);
      assert.equal(isoWeekday('2011-12-30'), 5);
    });
  });
});

describe('weeks', () => {
  test('weekdayIndex is the position in the week', () => {
    assert.equal(weekdayIndex('2026-10-26', 1), 0); // Monday
    assert.equal(weekdayIndex('2026-11-01', 1), 6); // Sunday
    assert.equal(weekdayIndex('2026-11-01', 7), 0);
    assert.equal(weekdayIndex('2026-10-31', 7), 6); // Saturday
    assert.equal(weekdayIndex('2026-10-28'), 2);
  });

  test('endOfWeek, including across the clock changes', () => {
    assert.equal(endOfWeek('2026-10-28', 1), '2026-11-01');
    assert.equal(endOfWeek('2026-10-28', 7), '2026-10-31');
    assert.equal(endOfWeek('2026-03-08', 7), '2026-03-14');
    assert.equal(endOfWeek('2026-03-08', 1), '2026-03-08');
    assert.equal(endOfWeek('2026-11-01', 7), '2026-11-07');
    for (const d of datesThrough('2026-10-19', '2026-11-15')) {
      for (const ws of [1, 7] as const) assert.equal(daysBetween(startOfWeek(d, ws), endOfWeek(d, ws)), 6, `${d} (${ws})`);
    }
  });
});

describe('localDateOf: the local calendar date of a UTC timestamp', () => {
  test('a late-evening workout keeps its own date, not the UTC date', () => {
    // 8:30 pm EDT on Monday Oct 26 is already Oct 27 in UTC.
    const finished = '2026-10-27T00:30:00.000Z';
    assert.equal(localDateOf(finished), '2026-10-26');
    assert.notEqual(finished.slice(0, 10), localDateOf(finished)); // the bug this replaces
    assert.equal(localDateOf('2026-10-27T03:59:59.999Z'), '2026-10-26'); // 11:59:59 pm
    assert.equal(localDateOf('2026-10-27T04:00:00.000Z'), '2026-10-27'); // midnight
  });

  test('early-morning timestamps', () => {
    assert.equal(localDateOf('2026-10-26T10:15:00.000Z'), '2026-10-26'); // 6:15 am EDT
    assert.equal(localDateOf('2026-10-26T04:30:00.000Z'), '2026-10-26'); // 12:30 am EDT
    assert.equal(localDateOf('2026-12-01T05:30:00.000Z'), '2026-12-01'); // 12:30 am EST
    assert.equal(localDateOf('2026-12-01T04:30:00.000Z'), '2026-11-30'); // 11:30 pm EST, an hour off in winter
  });

  test('on the change days', () => {
    assert.equal(localDateOf('2026-03-08T04:59:00.000Z'), '2026-03-07'); // 11:59 pm EST
    assert.equal(localDateOf('2026-03-08T06:59:00.000Z'), '2026-03-08'); // 1:59 am EST, just before the jump
    assert.equal(localDateOf('2026-03-08T07:00:00.000Z'), '2026-03-08'); // 3:00 am EDT
    assert.equal(localDateOf('2026-11-01T05:30:00.000Z'), '2026-11-01'); // the first 1:30 am (EDT)
    assert.equal(localDateOf('2026-11-01T06:30:00.000Z'), '2026-11-01'); // the second 1:30 am (EST)
    assert.equal(localDateOf('2026-11-02T04:59:00.000Z'), '2026-11-01'); // 11:59 pm EST
  });

  test('round-trips every hour of the change days', () => {
    for (const [y, m, d] of [
      [2026, 2, 8],
      [2026, 10, 1],
    ]) {
      for (let h = 0; h < 24; h++) {
        const local = new Date(y, m, d, h, 30);
        assert.equal(localDateOf(local.toISOString()), toISODate(local), local.toString());
      }
    }
  });

  test('timestamps with an offset, a bare date, and bad input', () => {
    assert.equal(localDateOf('2026-10-26T20:30:00-04:00'), '2026-10-26');
    assert.equal(localDateOf('2026-10-27T09:30:00+09:00'), '2026-10-26'); // 8:30 pm in New York
    // A date has no moment to convert; new Date('2026-10-26') would read it as UTC midnight.
    assert.equal(localDateOf('2026-10-26'), '2026-10-26');
    assert.equal(toISODate(new Date('2026-10-26')), '2026-10-25');
    assert.throws(() => localDateOf('not a date'), RangeError);
    assert.throws(() => localDateOf(''), RangeError);
  });

  test('follows the phone: the same moment is a different date after a trip', () => {
    const moment = '2026-10-27T02:00:00.000Z';
    assert.equal(localDateOf(moment), '2026-10-26'); // 10 pm in New York
    assert.equal(
      inZone('Asia/Tokyo', () => localDateOf(moment)),
      '2026-10-27',
    ); // 11 am in Tokyo
    assert.equal(
      inZone('America/Los_Angeles', () => localDateOf(moment)),
      '2026-10-26',
    );
  });
});

describe('isISODate and todayISO', () => {
  test('accepts only real dates with no time', () => {
    assert.ok(isISODate('2026-10-26'));
    assert.ok(isISODate('2028-02-29'));
    assert.ok(!isISODate('2027-02-29'));
    assert.ok(!isISODate('2026-02-30'));
    assert.ok(!isISODate('2026-13-01'));
    assert.ok(!isISODate('2026-10-26T00:00:00.000Z'));
    assert.ok(!isISODate('20261026'));
    assert.ok(!isISODate(20261026));
    assert.ok(!isISODate(undefined));
  });

  test('todayISO is the local date, not the UTC one', () => {
    assert.equal(todayISO(new Date(2026, 9, 26, 22, 0)), '2026-10-26'); // 10 pm, already Oct 27 in UTC
    assert.equal(todayISO(new Date(2026, 9, 27, 0, 5)), '2026-10-27');
  });
});

// ---------------------------------------------------------------------------
// Completion-date attribution (spec 2.5): the local date when Finish is tapped.

const STAMP = '2026-10-01T12:00:00.000Z';

const set = (id: string, completedAt?: string): LoggedSet => ({ id, kind: 'normal', modifiers: [], reps: 5, loadKg: 100, completedAt });

function session(id: string, fields: Partial<WorkoutSession>): WorkoutSession {
  return {
    id,
    name: 'Upper A',
    status: 'completed',
    completion: 'full',
    blocks: [{ id: `b_${id}`, type: 'single', exercises: [{ id: `e_${id}`, exerciseId: 'ex_bench_press', skipped: false, sets: [set(`s_${id}`, fields.completedAt ?? STAMP)] }] }],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...fields,
  };
}

/** Finishes a session the way the workout screen does. */
function finish(s: WorkoutSession, now: Date, reopened = false): WorkoutSession {
  return { ...s, status: 'completed', ...completionStamp(now, reopened ? s : undefined) };
}

describe('completion date at Finish', () => {
  test('is the local date when Finish is tapped, with the UTC moment beside it', () => {
    const stamp = completionStamp(new Date(2026, 9, 26, 20, 30)); // 8:30 pm Mon
    assert.deepEqual(stamp, { completedAt: '2026-10-27T00:30:00.000Z', completedDate: '2026-10-26' });
  });

  test('a workout that runs past midnight counts on the day it finished', () => {
    const started = new Date(2026, 9, 26, 23, 30).toISOString();
    const stamp = completionStamp(new Date(2026, 9, 27, 0, 20));
    assert.equal(localDateOf(started), '2026-10-26');
    assert.equal(stamp.completedDate, '2026-10-27');
  });

  test('a midnight-crossing workout finished on the fall-back night still gets that day', () => {
    // Finished at the second 1:10 am on Nov 1 (EST).
    const now = new Date('2026-11-01T06:10:00.000Z');
    assert.equal(completionStamp(now).completedDate, '2026-11-01');
  });

  test('reopening keeps the original moment and date, days later or after a trip', () => {
    const first = completionStamp(new Date(2026, 9, 26, 20, 30));
    const again = inZone('Asia/Tokyo', () => completionStamp(new Date(2026, 9, 30, 9, 0), first));
    assert.deepEqual(again, first);
  });

  test('a reopened workout saved without a date takes the local date of its moment', () => {
    const again = completionStamp(new Date(2026, 9, 30), { completedAt: '2026-10-27T00:30:00.000Z' });
    assert.deepEqual(again, { completedAt: '2026-10-27T00:30:00.000Z', completedDate: '2026-10-26' });
  });

  test('the date is stored, so a trip never moves a finished workout', () => {
    // Finished at 7:30 am on Oct 27 in Tokyo; back home in New York that moment reads as Oct 26.
    const finishedInTokyo = inZone('Asia/Tokyo', () => completionStamp(new Date(2026, 9, 27, 7, 30)));
    assert.deepEqual(finishedInTokyo, { completedAt: '2026-10-26T22:30:00.000Z', completedDate: '2026-10-27' });
    assert.equal(localDateOf(finishedInTokyo.completedAt), '2026-10-26');
    // Reading it back (or reopening it) in New York keeps Oct 27.
    assert.equal(completionStamp(new Date(2026, 10, 2), finishedInTokyo).completedDate, '2026-10-27');
  });
});

describe('completion date on Today and in streaks', () => {
  const plan: Plan = {
    id: 'p',
    name: 'Plan',
    version: 1,
    status: 'active',
    startDate: '2026-10-19',
    schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['w'] }] },
    workouts: [{ id: 'w', name: 'Upper A', blocks: [] }],
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  const occurrence = (date: ISODate, sessionId?: string): ScheduledOccurrence => ({
    id: `occ_p_${date}_w`,
    planId: 'p',
    planVersion: 1,
    planWorkoutId: 'w',
    scheduledDate: date,
    ...(sessionId ? { sessionId } : {}),
  });

  test('a late-night workout finished after midnight shows done on its day and as extra on the next', () => {
    const started = session('late', {
      status: 'in_progress',
      completion: undefined,
      occurrenceId: occurrence('2026-10-26').id,
      planId: 'p',
      planWorkoutId: 'w',
      scheduledDate: '2026-10-26',
      startedAt: new Date(2026, 9, 26, 23, 30).toISOString(),
    });
    const done = finish(started, new Date(2026, 9, 27, 0, 20));
    const agenda = buildAgenda({ occurrences: [occurrence('2026-10-26', done.id)], sessions: [done], plans: [plan], today: '2026-10-27' });

    const scheduled = agenda.get('2026-10-26') ?? [];
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].status, 'completed');
    assert.equal(scheduled[0].completedOn, '2026-10-27');

    const extra = agenda.get('2026-10-27') ?? [];
    assert.equal(extra.length, 1);
    assert.equal(extra[0].extra, 'late');
    assert.equal(extra[0].scheduledFor, '2026-10-26');
  });

  test('an evening workout finished on its day appears once, on that day', () => {
    const done = finish(
      session('evening', { occurrenceId: occurrence('2026-10-26').id, planId: 'p', planWorkoutId: 'w', scheduledDate: '2026-10-26' }),
      new Date(2026, 9, 26, 21, 45), // already Oct 27 in UTC
    );
    const agenda = buildAgenda({ occurrences: [occurrence('2026-10-26', done.id)], sessions: [done], plans: [plan], today: '2026-10-27' });
    assert.equal(agenda.get('2026-10-26')?.length, 1);
    assert.equal(agenda.get('2026-10-26')?.[0].completedOn, undefined);
    assert.equal(agenda.get('2026-10-27'), undefined);
  });

  test('streak weeks group completion dates by the chosen week start', () => {
    // Monday Oct 26 at 8 pm, and Sunday Nov 1 at 9 pm (both already the next day in UTC).
    const monday = finish(session('mon', {}), new Date(2026, 9, 26, 20, 0));
    const sunday = finish(session('sun', {}), new Date(2026, 10, 1, 21, 0));
    assert.equal(monday.completedDate, '2026-10-26');
    assert.equal(sunday.completedDate, '2026-11-01');

    const mondayWeeks = deriveStreak([monday, sunday], '2026-11-01', 2, 1);
    assert.equal(mondayWeeks.thisWeekCompleted, 2);
    assert.equal(mondayWeeks.currentWeeks, 1);

    const sundayWeeks = deriveStreak([monday, sunday], '2026-11-01', 2, 7);
    assert.equal(sundayWeeks.thisWeekCompleted, 1);
  });

  test('a Sunday-night workout finished after midnight counts in the new Monday week', () => {
    const done = finish(session('sunnight', { startedAt: new Date(2026, 10, 1, 23, 15).toISOString() }), new Date(2026, 10, 2, 0, 30));
    assert.equal(done.completedDate, '2026-11-02');
    assert.equal(deriveStreak([done], '2026-11-02', 1, 1).thisWeekCompleted, 1);
    assert.equal(deriveStreak([done], '2026-11-01', 1, 1).thisWeekCompleted, 0);
  });
});

describe('form recordings are dated by the local day they were made', () => {
  /** A ready squat analysis made at `at` (local time), with this knee depth. */
  const report = (id: string, at: Date, kneeDeg: number): FormReport => ({
    id,
    recordingId: `rec_${id}`,
    sessionId: 'sess',
    setId: `set_${id}`,
    exerciseId: 'ex_back_squat',
    family: 'squat',
    status: 'ready',
    modelVersion: 'test',
    ruleVersion: 'test',
    primaryJoint: 'knee',
    quality: { framing: 'good', warnings: [] },
    detectedReps: 1,
    reps: [{ index: 0, durationSec: 2, confidence: 'high', angles: { knee: { minDeg: kneeDeg, maxDeg: 170 } }, romDeg: 170 - kneeDeg, partial: false }],
    observations: [],
    hasReplay: false,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  });
  const wins = (reports: FormReport[], today: ISODate) =>
    buildWins({ records: [], formReports: reports, badges: [], exercisesById: new Map(), units: 'imperial', today, days: 21 }).filter((w) => w.kind === 'form');

  test('a form win recorded on an evening keeps that evening\'s date', () => {
    // Monday Oct 26 at 9:30 pm, already Tuesday in UTC.
    const evening = report('later', new Date(2026, 9, 26, 21, 30), 80);
    assert.equal(evening.createdAt.slice(0, 10), '2026-10-27', 'the UTC date is a day late');
    const [win] = wins([report('first', new Date(2026, 9, 19, 18, 0), 95), evening], '2026-10-30');
    assert.equal(win?.date, '2026-10-26');
  });

  test("the wins window starts on a local day, so the day before it doesn't sneak in", () => {
    // 21 days back from Nov 16 is Oct 26. Oct 25 at 9 pm is Oct 26 in UTC, but not here.
    const before = [report('first', new Date(2026, 9, 18, 18, 0), 95)];
    assert.deepEqual(wins([...before, report('sun', new Date(2026, 9, 25, 21, 0), 80)], '2026-11-16'), []);
    assert.equal(wins([...before, report('mon', new Date(2026, 9, 26, 21, 0), 80)], '2026-11-16').length, 1);
  });

  test('the Camera Ready badge is dated by the local day of the first analysis', () => {
    const input: BadgeInput = {
      sessions: [],
      exercisesById: new Map(),
      formReports: [report('first', new Date(2026, 9, 26, 21, 30), 90)],
      records: [],
      streak: deriveStreak([], '2026-10-30', 3),
      occurrences: [],
      plans: [],
      bodyweight: [],
      units: 'imperial',
      weekStartsOn: 1,
      today: '2026-10-30',
    };
    const badge = deriveBadges(input).find((b) => b.badgeKey === 'first_analysis');
    assert.equal(badge?.earnedDate, '2026-10-26');
  });
});
