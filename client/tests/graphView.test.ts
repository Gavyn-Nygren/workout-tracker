import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { lbToKg } from '../src/data/units';
import { chartLabel, chipLabel, graphEmpty, graphMetric, graphReadout, metricNote, metricSubtitle, readsAdded, sessionRows, spokenPoint } from '../src/features/progress/graphView';
import { metricAvailability, type MetricAvailability } from '../src/features/progress/metrics';
import { changeSince, exerciseLogs, exerciseSeries, loggedSpan, metricPoints, toDisplay, type Metric, type Point } from '../src/features/progress/series';
import { bodyweight, entry, exercisesById, hold, lift, session } from './support/progressFixtures';

const today = '2026-10-29';
const ex = (id: string) => exercisesById.get(id)!;
const info = (patch: Partial<MetricAvailability> & { metric: Metric }): MetricAvailability => ({ label: 'Label', short: 'Short', fits: true, hasData: true, ...patch });

describe('which metric a graph opens on', () => {
  const bench = [session('2026-10-01', [entry('ex_bench_press', [lift(100, 5)])])];
  const plank = [session('2026-10-01', [entry('ex_plank', [hold(60)])])];

  test('the metric asked for when it fits the exercise', () => {
    assert.equal(graphMetric('volume', metricAvailability(ex('ex_bench_press'), bench)), 'volume');
    assert.equal(graphMetric('longest_hold', metricAvailability(ex('ex_plank'), plank)), 'longest_hold');
  });

  test('a metric that doesn’t fit, or an unknown one, falls back to the first useful one', () => {
    assert.equal(graphMetric('e1rm', metricAvailability(ex('ex_plank'), plank)), 'longest_hold');
    assert.equal(graphMetric('longest_hold', metricAvailability(ex('ex_bench_press'), bench)), 'e1rm');
    assert.equal(graphMetric('hold_time', metricAvailability(ex('ex_bench_press'), bench)), 'e1rm');
    assert.equal(graphMetric(undefined, metricAvailability(ex('ex_plank'), plank)), 'longest_hold');
    assert.equal(graphMetric(['volume'], metricAvailability(ex('ex_bench_press'), bench)), 'e1rm');
  });

  test('before the exercise is known: the metric asked for if it is one, else e1RM', () => {
    assert.equal(graphMetric('reps'), 'reps');
    assert.equal(graphMetric('nonsense'), 'e1rm');
  });

  test('pull-ups with no weigh-in open on Top set, read as added weight; e1RM still fits (it needs a weigh-in)', () => {
    const sessions = [session('2026-10-01', [entry('ex_pull_up', [bodyweight(8, { addedLoadKg: 10 })])])];
    const availability = metricAvailability(ex('ex_pull_up'), sessions);
    assert.equal(graphMetric(undefined, availability), 'top_set');
    assert.equal(graphMetric('e1rm', availability), 'e1rm');
    assert.equal(readsAdded('top_set', availability), true);
    assert.equal(readsAdded('reps', availability), false);
    assert.equal(readsAdded('top_set', metricAvailability(ex('ex_bench_press'), bench)), false);
    assert.equal(metricSubtitle('top_set', true), 'Top set weight · added to bodyweight');
    assert.equal(metricSubtitle('e1rm', false), 'Estimated 1RM');
  });
});

describe('the readout', () => {
  const point = (date: string, value: number, patch: Partial<Point> = {}): Point => ({ date, value, sessionId: `s_${date}`, ...patch });

  test('latest, with the change over about 4 weeks', () => {
    const history = [point('2026-09-20', 100), point('2026-10-25', 105)];
    const r = graphReadout({ shown: history[1], selected: false, change: changeSince(history, today), metric: 'e1rm', units: 'metric', today, name: 'Push Day' })!;
    assert.equal(r.value, '105 kg');
    assert.equal(r.spokenValue, '105 kilograms');
    assert.equal(r.line, 'Latest · Sun, Oct 25 · Push Day');
    assert.equal(r.spokenLine, 'Latest, Sunday, October 25, Push Day');
    assert.deepEqual(r.change, { text: '+5 kg since Sep 20', spoken: 'Up 5 kilograms since Sunday, September 20', direction: 'up', isChange: true });
  });

  test('a change that rounds to zero reads as no change', () => {
    const history = [point('2026-09-20', 100), point('2026-10-25', 100.3)];
    const r = graphReadout({ shown: history[1], selected: false, change: changeSince(history, today), metric: 'e1rm', units: 'metric', today })!;
    assert.equal(r.change?.text, 'No change since Sep 20');
    assert.equal(r.change?.direction, 'none');
  });

  test('last logged more than 4 weeks ago: says so instead of a change', () => {
    const history = [point('2025-06-01', 90), point('2025-08-20', 100)];
    const r = graphReadout({ shown: history[1], selected: false, change: changeSince(history, today), metric: 'e1rm', units: 'metric', today, name: 'Legs' })!;
    assert.equal(r.line, 'Last logged Aug 20, 2025 · Legs');
    assert.equal(r.spokenLine, 'Last logged Wednesday, August 20, 2025, Legs');
    assert.equal(r.change, undefined);
  });

  test('the lift is recent but the metric isn’t: “Last e1RM” on the date line, never a false “Last logged”', () => {
    // Squats on Sep 1 (5 reps) and Oct 26 (15 reps: no e1RM).
    const sessions = [session('2026-09-01', [entry('ex_back_squat', [lift(100, 5)])], { name: 'Workout' }), session('2026-10-26', [entry('ex_back_squat', [lift(60, 15)])], { name: 'Legs' })];
    const logs = exerciseLogs(sessions).get('ex_back_squat')!;
    const history = metricPoints(logs, ex('ex_back_squat'), 'e1rm');
    const r = graphReadout({ shown: history[0], selected: false, change: changeSince(history, today, loggedSpan(logs)), metric: 'e1rm', units: 'metric', today, name: 'Workout' })!;
    assert.equal(r.line, 'Last e1RM Sep 1 · Workout');
    assert.equal(r.spokenLine, 'Last estimated one-rep max on Tuesday, September 1, Workout');
    assert.equal(r.change, undefined);
  });

  test('the lift last logged long after the shown value: the value keeps its date, “Last logged” says when the lift was', () => {
    const history = [point('2026-08-01', 100)];
    const r = graphReadout({ shown: history[0], selected: false, change: changeSince(history, today, { first: '2026-08-01', last: '2026-09-15' }), metric: 'e1rm', units: 'metric', today, name: 'Legs' })!;
    assert.equal(r.line, 'Latest · Sat, Aug 1 · Legs');
    assert.deepEqual(r.change && { text: r.change.text, isChange: r.change.isChange }, { text: 'Last logged Sep 15', isChange: false });
  });

  test('nothing 4 weeks older yet: first logged, plain', () => {
    const history = [point('2026-10-10', 90), point('2026-10-25', 100)];
    const r = graphReadout({ shown: history[1], selected: false, change: changeSince(history, today), metric: 'e1rm', units: 'metric', today })!;
    assert.deepEqual(r.change && { text: r.change.text, isChange: r.change.isChange }, { text: 'First logged Oct 10', isChange: false });
  });

  test('while scrubbing: the session’s date (with its year) and no change', () => {
    const history = [point('2025-12-30', 100), point('2026-10-25', 105)];
    const r = graphReadout({ shown: history[0], selected: true, change: changeSince(history, today), metric: 'e1rm', units: 'metric', today, name: 'Push Day' })!;
    assert.equal(r.line, 'Tue, Dec 30, 2025 · Push Day');
    assert.equal(r.spokenLine, 'Tuesday, December 30, 2025, Push Day');
    assert.equal(r.change, undefined);
  });

  test('top set as logged, and added weight for a bodyweight lift', () => {
    const topSet = point('2026-10-25', 102.5);
    assert.equal(graphReadout({ shown: topSet, selected: true, change: { kind: 'none' }, metric: 'top_set', units: 'metric', today })!.value, '102.5 kg');
    const added = point('2026-10-25', toDisplay(lbToKg(20), 'top_set', 'imperial'), { added: true });
    const r = graphReadout({ shown: added, selected: true, change: { kind: 'none' }, metric: 'top_set', units: 'imperial', today })!;
    assert.equal(r.value, '+20 lb');
    assert.equal(r.spokenValue, 'bodyweight plus 20 pounds');
    assert.equal(graphReadout({ shown: point('2026-10-25', 0, { added: true }), selected: true, change: { kind: 'none' }, metric: 'top_set', units: 'imperial', today })!.value, 'Bodyweight');
    assert.equal(graphReadout({ shown: point('2026-10-25', -20, { added: true }), selected: true, change: { kind: 'none' }, metric: 'top_set', units: 'imperial', today })!.value, '−20 lb');
  });

  test('holds and counts read in their own units', () => {
    assert.equal(graphReadout({ shown: point('2026-10-25', 75), selected: true, change: { kind: 'none' }, metric: 'longest_hold', units: 'metric', today })!.value, '75 s');
    assert.equal(graphReadout({ shown: point('2026-10-25', 75), selected: true, change: { kind: 'none' }, metric: 'longest_hold', units: 'metric', today })!.spokenValue, '1 minute 15 seconds');
    assert.equal(graphReadout({ shown: point('2026-10-25', 1), selected: true, change: { kind: 'none' }, metric: 'sets', units: 'metric', today })!.value, '1 set');
  });

  test('nothing logged: no readout', () => {
    assert.equal(graphReadout({ selected: false, change: { kind: 'none' }, metric: 'e1rm', units: 'metric', today }), undefined);
  });
});

describe('empty chart', () => {
  test('points in range: nothing to explain', () => {
    assert.equal(graphEmpty(info({ metric: 'e1rm' }), 3), undefined);
  });

  test('data, but none in the range: try a longer range', () => {
    assert.deepEqual(graphEmpty(info({ metric: 'e1rm' }), 0), { title: 'Nothing in this range', message: 'Try a longer range.', action: 'show_all' });
  });

  test('fits but no data: the reason, and Log weight when a weigh-in would help', () => {
    const noWeighIn = info({ metric: 'e1rm', short: 'e1RM', hasData: false, reason: 'Logged without a weigh-in' });
    assert.deepEqual(graphEmpty(noWeighIn, 0), {
      title: 'No e1RM yet',
      message: 'Logged without a weigh-in. Sets you log after a weigh-in count.',
      action: 'log_weight',
    });
    // A weigh-in doesn't change sets already logged (never back-filled): no button that seems to do nothing.
    assert.deepEqual(graphEmpty(noWeighIn, 0, true), {
      title: 'No e1RM yet',
      message: 'Logged without a weigh-in. Sets you log after a weigh-in count.',
      action: undefined,
    });
    assert.equal(graphEmpty(noWeighIn, 0, false)?.action, 'log_weight');
    assert.deepEqual(graphEmpty(info({ metric: 'e1rm', short: 'e1RM', hasData: false, reason: 'Only sets of 12 reps or fewer' }), 0), {
      title: 'No e1RM yet',
      message: 'Only sets of 12 reps or fewer.',
    });
    assert.deepEqual(graphEmpty(info({ metric: 'reps', hasData: false, reason: 'Not logged yet' }), 0), { title: 'Not logged yet', message: 'Log it in a workout and it shows up here.' });
  });

  test('titles name the metric in lowercase mid-sentence (e1RM as written)', () => {
    assert.equal(graphEmpty(info({ metric: 'volume', short: 'Volume', hasData: false, reason: 'Logged without a weigh-in' }), 0)?.title, 'No volume yet');
    assert.equal(graphEmpty(info({ metric: 'top_set', short: 'Top set', hasData: false, reason: 'Partial-rep sets don’t count' }), 0)?.title, 'No top set yet');
  });

  test('a saved graph whose metric doesn’t fit says why', () => {
    assert.equal(graphEmpty(info({ metric: 'e1rm', short: 'e1RM', fits: false, hasData: false }), 0)?.message, 'It’s logged as timed holds.');
    assert.equal(graphEmpty(info({ metric: 'longest_hold', short: 'Longest hold', fits: false, hasData: false }), 0)?.title, 'No longest hold for this exercise');
  });

  test('the builder’s note and the chips’ spoken labels', () => {
    assert.equal(metricNote(info({ metric: 'e1rm', hasData: false, reason: 'Logged without a weigh-in' })), 'No data yet: logged without a weigh-in.');
    assert.equal(metricNote(info({ metric: 'e1rm', hasData: false, reason: 'Only sets of 12 reps or fewer' })), 'No data yet: only sets of 12 reps or fewer.');
    assert.equal(metricNote(info({ metric: 'e1rm' })), undefined);
    assert.equal(chipLabel(info({ metric: 'e1rm', label: 'Estimated 1RM', hasData: false })), 'Estimated 1RM, no data yet');
    assert.equal(chipLabel(info({ metric: 'e1rm', label: 'Estimated 1RM' })), 'Estimated 1RM');
  });
});

describe('session table', () => {
  test('one row per workout, newest first, same-day workouts each their own', () => {
    const sessions = [
      session('2025-12-30', [entry('ex_bench_press', [lift(100, 5)])], { name: 'Push' }),
      session('2026-10-20', [entry('ex_bench_press', [lift(102.5, 3)])], { name: 'Morning' }, '07:00:00'),
      session('2026-10-20', [entry('ex_bench_press', [lift(105, 1)])], { name: 'Evening' }, '19:00:00'),
    ];
    const names = new Map(sessions.map((s) => [s.id, s.name]));
    const points = exerciseSeries({ exerciseId: 'ex_bench_press', metric: 'top_set', sessions, exercisesById });
    const rows = sessionRows(points, 'top_set', 'metric', today, (id) => (id ? names.get(id) : undefined));
    assert.deepEqual(
      rows.map((r) => [r.title, r.value]),
      [
        ['Tue, Oct 20 · Evening', '105 kg'],
        ['Tue, Oct 20 · Morning', '102.5 kg'],
        ['Tue, Dec 30, 2025 · Push', '100 kg'],
      ],
    );
    assert.equal(rows[2].spoken, 'Tuesday, December 30, 2025, Push: 100 kilograms');
    assert.equal(rows[0].sessionId, sessions[2].id);
    assert.equal(new Set(rows.map((r) => r.key)).size, 3);
    assert.equal(spokenPoint(points[0], 'top_set', 'metric', today), 'Tuesday, December 30, 2025: 100 kilograms');
  });

  test('the chart’s VoiceOver label names the exercise, metric and trend', () => {
    const points: Point[] = [
      { date: '2026-10-01', value: 100 },
      { date: '2026-10-20', value: 110 },
    ];
    assert.equal(chartLabel('Bench Press', 'e1rm', points, 'metric'), 'Bench Press, Estimated 1RM, rising from 100 kilograms to 110 kilograms over 2 sessions. Values are listed below.');
    const added: Point[] = [
      { date: '2026-10-01', value: 0, added: true },
      { date: '2026-10-20', value: 10, added: true },
    ];
    assert.match(chartLabel('Pull-Up', 'top_set', added, 'imperial'), /from bodyweight to bodyweight plus 10 pounds/);
  });
});
