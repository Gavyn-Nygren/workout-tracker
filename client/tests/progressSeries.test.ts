import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { asBeforeReopen, beforeReopens, isFinishedSession, isReopened } from '../src/data/reopen';
import { deriveRecordBests, exerciseBests } from '../src/data/records';
import type { WorkoutSession } from '../src/data/types';
import {
  changeSince,
  exerciseLogs,
  exerciseSeries,
  isMetric,
  loggedSpan,
  metricLabel,
  metricPhrase,
  metricShort,
  niceTicks,
  parseMetric,
  pointTime,
  splitAtGaps,
  timeAxisTicks,
  type Metric,
  type Point,
} from '../src/features/progress/series';
import { bodyweight, entry, exercisesById, hold, lift, session } from './support/progressFixtures';

const series = (exerciseId: string, metric: Metric, sessions: WorkoutSession[], from?: string) => exerciseSeries({ exerciseId, metric, sessions, exercisesById, from });
const values = (points: Point[]) => points.map((p) => Math.round(p.value * 1000) / 1000);
const pt = (date: string, value: number): Point => ({ date, value });

describe('which sets count per metric (spec 2.7)', () => {
  const mixed = session('2026-10-01', [
    entry('ex_back_squat', [
      lift(60, 5, { kind: 'warmup' }),
      lift(100, 5),
      lift(140, 3, { modifiers: ['lengthened_partials'] }),
      lift(80, 15),
      lift(90, 8, { kind: 'drop' }),
      lift(200, 1, { completedAt: undefined }),
      hold(30, { loadKg: 100 }),
    ]),
  ]);

  test('e1RM: working sets of 12 reps or fewer, no partials, warm-ups, holds or unfinished sets', () => {
    // 100×5 → 116.7; 90×8 → 114; partial 140×3 and 80×15 don't count.
    assert.deepEqual(values(series('ex_back_squat', 'e1rm', [mixed])), [116.667]);
  });

  test('a single is its own 1RM', () => {
    assert.deepEqual(values(series('ex_back_squat', 'e1rm', [session('2026-10-01', [entry('ex_back_squat', [lift(150, 1)])])])), [150]);
  });

  test('top set: the heaviest working set that isn’t a partial, like the heaviest-weight record', () => {
    const points = series('ex_back_squat', 'top_set', [mixed]);
    assert.deepEqual(values(points), [100]);
    assert.equal(points[0].added, undefined);
    const bests = exerciseBests(deriveRecordBests([mixed], exercisesById), exercisesById.get('ex_back_squat')!);
    assert.equal(bests.heaviest_weight?.value, 100);
  });

  test('volume: every working set but holds, partial-rep sets included', () => {
    assert.deepEqual(values(series('ex_back_squat', 'volume', [mixed])), [500 + 420 + 1200 + 720]);
  });

  test('reps: the same sets’ reps; sets: working sets, holds included', () => {
    assert.deepEqual(values(series('ex_back_squat', 'reps', [mixed])), [5 + 3 + 15 + 8]);
    assert.deepEqual(values(series('ex_back_squat', 'sets', [mixed])), [5]);
  });

  test('longest hold: the longest timed hold of the workout', () => {
    const plank = session('2026-10-01', [entry('ex_plank', [hold(45), hold(75), hold(60), hold(90, { kind: 'warmup' })])]);
    assert.deepEqual(values(series('ex_plank', 'longest_hold', [plank])), [75]);
    for (const metric of ['e1rm', 'top_set', 'volume', 'reps'] as Metric[]) assert.deepEqual(series('ex_plank', metric, [plank]), [], metric);
    assert.deepEqual(values(series('ex_plank', 'sets', [plank])), [3]);
    assert.deepEqual(series('ex_back_squat', 'longest_hold', [session('2026-10-01', [entry('ex_back_squat', [lift(100, 5)])])]), []);
  });

  test('an exercise in two blocks of one workout is one point: best e1RM, summed volume', () => {
    const workout = session('2026-10-01', []);
    workout.blocks = [
      { id: 'a', type: 'superset', exercises: [entry('ex_bench_press', [lift(80, 5)])] },
      { id: 'b', type: 'single', exercises: [entry('ex_bench_press', [lift(90, 3)])] },
    ];
    assert.deepEqual(values(series('ex_bench_press', 'e1rm', [workout])), [99]);
    assert.deepEqual(values(series('ex_bench_press', 'volume', [workout])), [670]);
    assert.deepEqual(values(series('ex_bench_press', 'sets', [workout])), [2]);
  });

  test('sets done before an exercise was skipped count', () => {
    const workout = session('2026-10-01', [entry('ex_bench_press', [lift(80, 5), lift(80, 5, { completedAt: undefined })], true)], { completion: 'partial' });
    assert.deepEqual(values(series('ex_bench_press', 'sets', [workout])), [1]);
  });

  test('warm-ups alone make no e1RM, top set, volume, reps or sets point', () => {
    const workout = session('2026-10-01', [entry('ex_power_clean', [lift(40, 5, { kind: 'warmup' })])]);
    for (const metric of ['e1rm', 'top_set', 'volume', 'reps', 'sets', 'longest_hold'] as Metric[]) assert.deepEqual(series('ex_power_clean', metric, [workout]), [], metric);
  });
});

describe('bodyweight and assisted lifts', () => {
  const pullUps = [
    session('2026-09-01', [entry('ex_pull_up', [bodyweight(8, { addedLoadKg: 10, bodyweightSnapshotKg: 80 })])]),
    session('2026-09-08', [entry('ex_pull_up', [bodyweight(8, { addedLoadKg: 10, bodyweightSnapshotKg: 84 })])]),
    session('2026-09-15', [entry('ex_pull_up', [bodyweight(10, { bodyweightSnapshotKg: 82 })])]),
  ];

  test('top set reads added weight, so a weigh-in never moves it', () => {
    const points = series('ex_pull_up', 'top_set', pullUps);
    assert.deepEqual(values(points), [10, 10, 0]);
    assert.ok(points.every((p) => p.added));
    const bests = exerciseBests(deriveRecordBests(pullUps, exercisesById), exercisesById.get('ex_pull_up')!);
    assert.equal(Math.max(...points.map((p) => p.value)), bests.heaviest_weight?.value);
  });

  test('e1RM and volume use effective load (bodyweight + added)', () => {
    assert.deepEqual(values(series('ex_pull_up', 'e1rm', pullUps)), [90 * (1 + 8 / 30), 94 * (1 + 8 / 30), 82 * (1 + 10 / 30)].map((v) => Math.round(v * 1000) / 1000));
    assert.deepEqual(values(series('ex_pull_up', 'volume', pullUps)), [720, 752, 820]);
  });

  test('assisted sets read as negative added weight; less assistance is higher', () => {
    const assisted = [
      session('2026-09-01', [entry('ex_assisted_pull_up', [bodyweight(8, { kind: 'assisted', assistanceKg: 30, addedLoadKg: undefined, bodyweightSnapshotKg: 85 })])]),
      session('2026-09-08', [entry('ex_assisted_pull_up', [bodyweight(8, { kind: 'assisted', assistanceKg: 25, addedLoadKg: undefined, bodyweightSnapshotKg: 78 })])]),
    ];
    assert.deepEqual(values(series('ex_assisted_pull_up', 'top_set', assisted)), [-30, -25]);
    assert.deepEqual(values(series('ex_assisted_pull_up', 'volume', assisted)), [440, 424]);
  });

  test('without a weigh-in: top set (added) and reps still plot, e1RM and volume don’t', () => {
    const noWeighIn = [session('2026-09-01', [entry('ex_pull_up', [bodyweight(8, { addedLoadKg: 10 }), bodyweight(6)])])];
    assert.deepEqual(values(series('ex_pull_up', 'top_set', noWeighIn)), [10]);
    assert.deepEqual(series('ex_pull_up', 'e1rm', noWeighIn), []);
    assert.deepEqual(series('ex_pull_up', 'volume', noWeighIn), []);
    assert.deepEqual(values(series('ex_pull_up', 'reps', noWeighIn)), [14]);
  });

  test('a custom exercise switched to “counts bodyweight” keeps reading its loaded history as loads', () => {
    const custom = { ...exercisesById.get('ex_custom_ssb')!, isBodyweight: true };
    const byId = new Map(exercisesById).set(custom.id, custom);
    const loaded = [session('2026-09-01', [entry(custom.id, [lift(100, 5)])])];
    const points = exerciseSeries({ exerciseId: custom.id, metric: 'top_set', sessions: loaded, exercisesById: byId });
    assert.deepEqual(values(points), [100]);
    assert.equal(points[0].added, undefined);
  });
});

describe('sessions and order', () => {
  test('one point per workout, in finish order, even on the same day', () => {
    // Midday UTC, so both are on Sep 1 in any US or European time zone the tests run in.
    const pm = session('2026-09-01', [entry('ex_bench_press', [lift(60, 5)])], {}, '15:00:00');
    const am = session('2026-09-01', [entry('ex_bench_press', [lift(100, 5)])], {}, '12:00:00');
    const points = series('ex_bench_press', 'top_set', [pm, am]);
    assert.deepEqual(points.map((p) => [p.sessionId, p.value]), [[am.id, 100], [pm.id, 60]]);
    assert.ok(pointTime(points[0]) < pointTime(points[1]));
    // Both stay inside their day on the time axis.
    const day = new Date(2026, 8, 1).getTime();
    assert.ok(points.every((p) => pointTime(p) >= day && pointTime(p) < day + 86_400_000));
    assert.equal(pointTime({ date: '2026-09-01' }), day);
  });

  test('skipped and unfinished workouts never plot; a reopened one counts as it was', () => {
    const done = session('2026-09-01', [entry('ex_bench_press', [lift(100, 5)])]);
    const reopened = session('2026-09-08', [entry('ex_bench_press', [lift(110, 5)])], { status: 'in_progress', completion: undefined });
    const open = session('2026-09-15', [entry('ex_bench_press', [lift(120, 5)])], { status: 'in_progress', completedAt: undefined, completedDate: undefined });
    const skipped = session('2026-09-16', [entry('ex_bench_press', [lift(130, 5)])], { status: 'skipped' });
    assert.deepEqual(values(series('ex_bench_press', 'top_set', [done, reopened, open, skipped])), [100, 110]);
  });

  test('from leaves out earlier workouts', () => {
    const sessions = [session('2026-08-01', [entry('ex_bench_press', [lift(90, 5)])]), session('2026-10-01', [entry('ex_bench_press', [lift(100, 5)])])];
    assert.deepEqual(values(series('ex_bench_press', 'top_set', sessions, '2026-09-01')), [100]);
    assert.deepEqual(series('ex_unknown', 'top_set', sessions), []);
  });

  test('the logs are built once per sessions array', () => {
    const sessions = [session('2026-10-01', [entry('ex_bench_press', [lift(100, 5)])])];
    assert.equal(exerciseLogs(sessions), exerciseLogs(sessions));
    assert.notEqual(exerciseLogs(sessions), exerciseLogs([...sessions]));
  });
});

describe('reopened workouts (data/reopen.ts)', () => {
  const done = session('2026-09-01', []);
  const reopened = session('2026-09-08', [], { status: 'in_progress' });
  const fresh = session('2026-09-09', [], { status: 'in_progress', completedAt: undefined, completedDate: undefined });

  test('a reopened workout reads as finished; a new one in progress doesn’t', () => {
    assert.equal(isReopened(reopened), true);
    assert.equal(isReopened(fresh), false);
    assert.equal(asBeforeReopen(reopened).status, 'completed');
    assert.equal(asBeforeReopen(fresh), fresh);
    assert.deepEqual([done, reopened, fresh].map(isFinishedSession), [true, true, false]);
  });

  test('beforeReopens keeps the array when nothing is reopened, and maps each list once', () => {
    const plain = [done, fresh];
    assert.equal(beforeReopens(plain), plain);
    const list = [done, reopened];
    const mapped = beforeReopens(list);
    assert.deepEqual(mapped.map((s) => s.status), ['completed', 'completed']);
    assert.equal(beforeReopens(list), mapped);
  });
});

describe('change over about 4 weeks', () => {
  const today = '2026-10-29';

  test('nothing logged', () => {
    assert.deepEqual(changeSince([], today), { kind: 'none' });
  });

  test('compares the latest session with the most recent one at least 28 days before it', () => {
    const points = [pt('2026-08-01', 90), pt('2026-09-20', 100), pt('2026-09-28', 102), pt('2026-10-10', 104), pt('2026-10-26', 110)];
    const change = changeSince(points, today);
    assert.equal(change.kind, 'change');
    assert.ok(change.kind === 'change');
    assert.equal(change.since, '2026-09-28');
    assert.equal(change.delta, 8);
  });

  test('exactly 28 days back counts', () => {
    const change = changeSince([pt('2026-09-28', 100), pt('2026-10-26', 105)], today);
    assert.ok(change.kind === 'change' && change.since === '2026-09-28' && change.delta === 5);
  });

  test('without a session 28 days before the latest: first logged, never a short-span change', () => {
    assert.deepEqual(changeSince([pt('2026-10-20', 100), pt('2026-10-23', 105)], today), { kind: 'first_logged', date: '2026-10-20', latest: pt('2026-10-23', 105) });
    assert.equal(changeSince([pt('2026-10-28', 100)], today).kind, 'first_logged');
  });

  test('a lift last logged more than 28 days ago shows when, not a change', () => {
    const points = [pt('2026-06-01', 200), pt('2026-08-20', 220)];
    assert.deepEqual(changeSince(points, today), { kind: 'last_logged', date: '2026-08-20', latest: pt('2026-08-20', 220) });
    assert.equal(changeSince([pt('2026-09-01', 1), pt('2026-10-01', 2)], today).kind, 'change');
  });

  test('with the lift’s own sessions: “Last logged” is the lift’s last session, not the metric’s last value', () => {
    // e1RM only 70 and 40 days ago; the lift was logged since, with sets over 12 reps.
    const points = [pt('2026-08-20', 120), pt('2026-09-19', 128)];
    assert.deepEqual(changeSince(points, today, { first: '2026-08-20', last: '2026-10-26' }), { kind: 'metric_last', date: '2026-09-19', latest: pt('2026-09-19', 128) });
    // The lift itself is old too: the lift's last session.
    assert.deepEqual(changeSince(points, today, { first: '2026-08-20', last: '2026-09-25' }), { kind: 'last_logged', date: '2026-09-25', latest: pt('2026-09-19', 128) });
  });

  test('with the lift’s own sessions: “First logged” only when the metric starts with the lift', () => {
    // Pull-ups logged since Aug 20 without a weigh-in; the first e1RM is yesterday.
    assert.deepEqual(changeSince([pt('2026-10-28', 101)], today, { first: '2026-08-20', last: '2026-10-28' }), { kind: 'metric_first', date: '2026-10-28', latest: pt('2026-10-28', 101) });
    assert.deepEqual(changeSince([pt('2026-10-20', 100), pt('2026-10-23', 105)], today, { first: '2026-10-20', last: '2026-10-23' }), {
      kind: 'first_logged',
      date: '2026-10-20',
      latest: pt('2026-10-23', 105),
    });
  });

  test('when every session has a value, the lift’s sessions change nothing', () => {
    const points = [pt('2026-08-01', 90), pt('2026-09-20', 100), pt('2026-09-28', 102), pt('2026-10-10', 104), pt('2026-10-26', 110)];
    assert.deepEqual(changeSince(points, today, { first: '2026-08-01', last: '2026-10-26' }), changeSince(points, today));
    const old = [pt('2026-06-01', 200), pt('2026-08-20', 220)];
    assert.deepEqual(changeSince(old, today, { first: '2026-06-01', last: '2026-08-20' }), changeSince(old, today));
  });

  test('loggedSpan: the first and last sessions with a working set (warm-ups alone don’t count)', () => {
    const sessions = [
      session('2026-08-01', [entry('ex_back_squat', [lift(100, 5)])]),
      session('2026-09-01', [entry('ex_back_squat', [lift(60, 20)])]),
      session('2026-10-01', [entry('ex_back_squat', [lift(60, 5, { kind: 'warmup' })])]),
    ];
    assert.deepEqual(loggedSpan(exerciseLogs(sessions).get('ex_back_squat')!), { first: '2026-08-01', last: '2026-09-01' });
    assert.equal(loggedSpan([]), undefined);
  });

  test('the same history gives the same change whatever the range (it reads the full history)', () => {
    const sessions = [35, 20, 0].map((daysAgo, i) => session(new Date(Date.UTC(2026, 9, 29 - daysAgo)).toISOString().slice(0, 10), [entry('ex_bench_press', [lift(100 + i * 5, 5)])]));
    const full = series('ex_bench_press', 'e1rm', sessions);
    const change = changeSince(full, today);
    assert.ok(change.kind === 'change');
    assert.equal(change.since, '2026-09-24');
  });
});

describe('line gaps', () => {
  test('a gap longer than 28 days becomes its own dashed segment', () => {
    const points = [pt('2026-01-01', 1), pt('2026-01-08', 2), pt('2026-03-01', 3), pt('2026-03-29', 4), pt('2026-06-01', 5)];
    const segments = splitAtGaps(points);
    assert.deepEqual(
      segments.map((s) => [s.gap, s.points.map((p) => p.value)]),
      [
        [false, [1, 2]],
        [true, [2, 3]],
        [false, [3, 4]],
        [true, [4, 5]],
        [false, [5]],
      ],
    );
  });

  test('no gaps: one segment; a custom limit (bodyweight trend: 7 days)', () => {
    assert.deepEqual(splitAtGaps([pt('2026-01-01', 1), pt('2026-01-29', 2)]), [{ gap: false, points: [pt('2026-01-01', 1), pt('2026-01-29', 2)] }]);
    assert.equal(splitAtGaps([pt('2026-01-01', 1), pt('2026-01-09', 2)], 7).filter((s) => s.gap).length, 1);
    assert.deepEqual(splitAtGaps([]), []);
  });
});

describe('axis ticks', () => {
  test('a flat range of whole numbers gets distinct whole ticks', () => {
    assert.deepEqual(niceTicks(3, 3, 4, 0), [2, 3, 4]);
  });

  test('ticks cover the data with steps the labels can show', () => {
    for (const [min, max, decimals] of [
      [10, 12, 0],
      [100, 101, 0],
      [100, 110, 1],
      [-20, 20, 1],
      [0.3, 0.6, 1],
      [12000, 16500, 0],
    ] as const) {
      const ticks = niceTicks(min, max, 4, decimals);
      assert.ok(ticks[0] <= min && ticks[ticks.length - 1] >= max, `${min}..${max}: ${ticks}`);
      const steps = ticks.slice(1).map((t, i) => Math.round((t - ticks[i]) * 1000) / 1000);
      assert.ok(steps.every((s) => s === steps[0] && s >= 10 ** -decimals), `${min}..${max}: ${ticks}`);
      assert.ok(ticks.every((t) => Math.abs(Math.round(t * 10 ** decimals) - t * 10 ** decimals) < 1e-6), `${ticks}`);
      assert.ok(ticks.length >= 2 && ticks.length <= 8, `${ticks}`);
    }
  });

  test('no −0 tick', () => {
    assert.ok(niceTicks(-5, 5, 4, 1).every((t) => !Object.is(t, -0)));
  });

  test('without decimals it still spans the data', () => {
    const ticks = niceTicks(97.3, 133.9);
    assert.ok(ticks[0] <= 97.3 && ticks[ticks.length - 1] >= 133.9);
  });
});

describe('time axis ticks (1Y and All)', () => {
  test('a year of data: a tick every 3 months, January read as its year', () => {
    assert.deepEqual(timeAxisTicks('2025-10-29', '2026-10-29'), [
      { date: '2026-01-01', label: '2026' },
      { date: '2026-04-01', label: 'Apr' },
      { date: '2026-07-01', label: 'Jul' },
      { date: '2026-10-01', label: 'Oct' },
    ]);
  });

  test('a few months: monthly', () => {
    assert.deepEqual(
      timeAxisTicks('2026-07-15', '2026-10-29').map((t) => t.label),
      ['Aug', 'Sep', 'Oct'],
    );
  });

  test('several years: yearly', () => {
    assert.deepEqual(
      timeAxisTicks('2022-03-10', '2026-10-29').map((t) => t.label),
      ['2023', '2024', '2025', '2026'],
    );
  });

  test('no month start in the span: none', () => {
    assert.deepEqual(timeAxisTicks('2026-10-02', '2026-10-29'), []);
    assert.deepEqual(timeAxisTicks('2026-10-29', '2026-10-29'), []);
    assert.deepEqual(timeAxisTicks('2026-10-01', '2026-10-29'), [{ date: '2026-10-01', label: 'Oct' }]);
  });

  test('never more than asked for', () => {
    for (const first of ['2010-01-01', '2019-06-15', '2025-11-30']) assert.ok(timeAxisTicks(first, '2026-10-29', 5).length <= 5);
  });
});

describe('metric names', () => {
  test('unknown metrics fall back safely', () => {
    assert.equal(isMetric('longest_hold'), true);
    assert.equal(isMetric('top_weight'), false);
    assert.equal(isMetric(undefined), false);
    assert.equal(parseMetric('volume'), 'volume');
    assert.equal(parseMetric('bogus'), 'e1rm');
    assert.equal(parseMetric(['volume'], 'sets'), 'sets');
    assert.equal(metricLabel('bogus' as Metric), 'Estimated 1RM');
    assert.equal(metricShort('longest_hold'), 'Longest hold');
    assert.equal(metricPhrase('longest_hold'), 'longest hold');
    assert.equal(metricPhrase('e1rm'), 'e1RM');
  });
});
