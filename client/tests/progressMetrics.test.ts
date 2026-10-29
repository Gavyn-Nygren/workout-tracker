import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { WorkoutSession } from '../src/data/types';
import { defaultMetric, isHoldExercise, metricAvailability, metricFits } from '../src/features/progress/metrics';
import type { Metric } from '../src/features/progress/series';
import { bodyweight, entry, exercisesById, hold, lift, session } from './support/progressFixtures';

const ex = (id: string) => exercisesById.get(id)!;
const offered = (id: string, sessions: WorkoutSession[]) => metricAvailability(ex(id), sessions).offered.map((m) => m.metric);
const reasons = (id: string, sessions: WorkoutSession[]) =>
  Object.fromEntries(metricAvailability(ex(id), sessions).offered.filter((m) => !m.hasData).map((m) => [m.metric, m.reason])) as Partial<Record<Metric, string>>;
const REP_METRICS: Metric[] = ['e1rm', 'top_set', 'volume', 'reps', 'sets'];

describe('metrics that fit an exercise', () => {
  test('a lift logged with weight: the rep metrics, e1RM by default', () => {
    const sessions = [session('2026-10-01', [entry('ex_bench_press', [lift(100, 5)])])];
    assert.deepEqual(offered('ex_bench_press', sessions), REP_METRICS);
    assert.deepEqual(reasons('ex_bench_press', sessions), {});
    assert.equal(defaultMetric(ex('ex_bench_press'), sessions), 'e1rm');
  });

  test('timed holds: Longest hold and Sets, Longest hold by default', () => {
    const sessions = [session('2026-10-01', [entry('ex_plank', [hold(60), hold(75)])])];
    assert.deepEqual(offered('ex_plank', sessions), ['sets', 'longest_hold']);
    assert.equal(defaultMetric(ex('ex_plank'), sessions), 'longest_hold');
  });

  test('not logged yet: by what the exercise is', () => {
    assert.deepEqual(offered('ex_plank', []), ['sets', 'longest_hold']);
    assert.equal(defaultMetric(ex('ex_plank'), []), 'longest_hold');
    assert.deepEqual(offered('ex_bench_press', []), REP_METRICS);
    assert.equal(defaultMetric(ex('ex_bench_press'), []), 'e1rm');
    assert.deepEqual(reasons('ex_bench_press', []), { e1rm: 'Not logged yet', top_set: 'Not logged yet', volume: 'Not logged yet', reps: 'Not logged yet', sets: 'Not logged yet' });
    assert.equal(isHoldExercise(ex('ex_side_plank')), true);
    assert.equal(isHoldExercise({ id: 'ex_custom', baseMovementId: 'ex_plank', source: 'custom' }), true);
    assert.equal(isHoldExercise(ex('ex_pull_up')), false);
  });

  test('built-in Plank variations done for reps aren’t holds before they’re logged (custom ones linked to Plank are)', () => {
    for (const id of ['ex_dead_bug', 'ex_bird_dog']) {
      assert.equal(isHoldExercise(ex(id)), false, id);
      assert.deepEqual(offered(id, []), REP_METRICS, id);
    }
    assert.equal(isHoldExercise(ex('ex_hollow_hold')), true);
    assert.equal(isHoldExercise({ id: 'ex_dead_bug_copy', baseMovementId: 'ex_plank', source: 'builtin' }), false);
  });

  test('logged both ways (a carry as holds and for reps): every metric', () => {
    const sessions = [session('2026-10-01', [entry('ex_farmers_carry', [hold(40, { loadKg: 40 }), lift(40, 10)])])];
    assert.deepEqual(offered('ex_farmers_carry', sessions), ['e1rm', 'top_set', 'volume', 'reps', 'sets', 'longest_hold']);
  });

  test('pull-ups without a weigh-in: e1RM and volume need one; top set reads added weight', () => {
    const sessions = [session('2026-10-01', [entry('ex_pull_up', [bodyweight(8, { addedLoadKg: 10 })])])];
    const info = metricAvailability(ex('ex_pull_up'), sessions);
    // Worded so it stays true once a weigh-in is logged: those sets keep no bodyweight (never back-filled).
    assert.deepEqual(reasons('ex_pull_up', sessions), { e1rm: 'Logged without a weigh-in', volume: 'Logged without a weigh-in' });
    assert.equal(info.all.find((m) => m.metric === 'top_set')?.added, true);
    assert.equal(info.defaultMetric, 'top_set');
  });

  test('sets over 12 reps only: e1RM says so; top set by default', () => {
    const sessions = [session('2026-10-01', [entry('ex_lateral_raise', [lift(8, 15), lift(8, 20)])])];
    assert.deepEqual(reasons('ex_lateral_raise', sessions), { e1rm: 'Only sets of 12 reps or fewer' });
    assert.equal(defaultMetric(ex('ex_lateral_raise'), sessions), 'top_set');
  });

  test('high reps without a weigh-in: the rep limit, since a weigh-in wouldn’t help', () => {
    const sessions = [session('2026-10-01', [entry('ex_push_up', [bodyweight(20)])])];
    assert.equal(reasons('ex_push_up', sessions).e1rm, 'Only sets of 12 reps or fewer');
  });

  test('partial-rep sets only: e1RM and top set say why; volume by default', () => {
    const sessions = [session('2026-10-01', [entry('ex_rack_pull', [lift(180, 5, { modifiers: ['shortened_partials'] })])])];
    assert.deepEqual(reasons('ex_rack_pull', sessions), { e1rm: 'Partial-rep sets don’t count', top_set: 'Partial-rep sets don’t count' });
    assert.equal(defaultMetric(ex('ex_rack_pull'), sessions), 'volume');
  });

  test('warm-ups only: nothing counts yet', () => {
    const sessions = [session('2026-10-01', [entry('ex_power_clean', [lift(40, 5, { kind: 'warmup' })])])];
    assert.deepEqual(new Set(Object.values(reasons('ex_power_clean', sessions))), new Set(['Warm-ups don’t count']));
    assert.equal(defaultMetric(ex('ex_power_clean'), sessions), 'e1rm');
  });

  test('a saved graph or link can be checked', () => {
    const sessions = [session('2026-10-01', [entry('ex_plank', [hold(60)])])];
    assert.equal(metricFits('longest_hold', ex('ex_plank'), sessions), true);
    assert.equal(metricFits('e1rm', ex('ex_plank'), sessions), false);
  });
});
