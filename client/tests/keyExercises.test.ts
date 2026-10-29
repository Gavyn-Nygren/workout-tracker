import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import type { LoggedSet, WorkoutSession } from '../src/data/types';
import { keyExercises, KEY_LIMIT, type KeyCard, type KeyPin } from '../src/features/progress/keyExercises';
import { familyRootId, loggedExercises, loggedVariations } from '../src/features/progress/variations';
import { bodyweight, customSsb, entry, exercisesById, hold, lift, session } from './support/progressFixtures';

const today = '2026-10-29';
const defaults: KeyPin[] = ['ex_back_squat', 'ex_bench_press', 'ex_deadlift'].map((exerciseId) => ({ exerciseId, isDefault: true }));
const userPins = (...ids: string[]): KeyPin[] => ids.map((exerciseId) => ({ exerciseId }));
const ago = (days: number) => addDays(today, -days);

/** `weeks` weekly workouts of each exercise, the last one `lastDaysAgo` before today. */
function weekly(exerciseId: string, weeks: number, sets: () => LoggedSet[], lastDaysAgo = 0): WorkoutSession[] {
  return Array.from({ length: weeks }, (_, i) => session(ago(lastDaysAgo + (weeks - 1 - i) * 7), [entry(exerciseId, sets())]));
}

/** `from`: the range start (3M by default); null for All. */
const cards = (sessions: WorkoutSession[], pins: KeyPin[] = defaults, from: string | null = ago(91)) => keyExercises({ sessions, exercisesById, pins, today, from: from ?? undefined });
const ids = (list: KeyCard[]) => list.map((c) => c.exerciseId);

describe('pins', () => {
  test('a new account has nothing to chart: default pins wait until their lift is logged', () => {
    assert.deepEqual(cards([]), []);
  });

  test('a default pin appears once its lift is logged, and ranks first', () => {
    const sessions = [...weekly('ex_bench_press', 4, () => [lift(80, 5)]), ...weekly('ex_overhead_press', 6, () => [lift(50, 5)])];
    const list = cards(sessions);
    assert.deepEqual(ids(list), ['ex_bench_press', 'ex_overhead_press']);
    assert.deepEqual(list.map((c) => c.source), ['default_pin', 'auto']);
    assert.equal(list[0].pinned, true);
    assert.equal(list[0].state, 'data');
  });

  test('a pin the user added always shows, “Not logged yet” until it is', () => {
    const [card] = cards([], userPins('ex_front_squat'));
    assert.equal(card.exerciseId, 'ex_front_squat');
    assert.equal(card.source, 'user_pin');
    assert.equal(card.state, 'not_logged');
    assert.equal(card.metric, 'e1rm');
    assert.deepEqual(card.points, []);
    assert.equal(card.latest, undefined);
    assert.deepEqual(card.change, { kind: 'none' });
  });

  test('a lift with only warm-ups logged isn’t logged yet', () => {
    const sessions = [session(ago(1), [entry('ex_back_squat', [lift(60, 5, { kind: 'warmup' })])])];
    assert.deepEqual(cards(sessions), []);
    assert.equal(cards(sessions, userPins('ex_back_squat'))[0].state, 'not_logged');
  });

  test('default pins rank before the user’s; the user’s own pin of a default lift always shows', () => {
    const pins: KeyPin[] = [...userPins('ex_front_squat'), ...defaults, ...userPins('ex_bench_press')];
    const list = cards([], pins);
    assert.deepEqual(ids(list), ['ex_front_squat', 'ex_bench_press']);
    assert.ok(list.every((c) => c.source === 'user_pin'));
    const logged = cards(weekly('ex_deadlift', 1, () => [lift(140, 5)]), pins);
    assert.deepEqual(ids(logged), ['ex_deadlift', 'ex_front_squat', 'ex_bench_press']);
  });

  test('every pin shows, past 6; automatic picks only fill what’s left up to 6', () => {
    const seven = userPins('ex_front_squat', 'ex_rdl', 'ex_hip_thrust', 'ex_pull_up', 'ex_dips', 'ex_lateral_raise', 'ex_db_curl');
    const sessions = weekly('ex_overhead_press', 4, () => [lift(50, 5)]);
    assert.deepEqual(ids(cards(sessions, seven)), seven.map((p) => p.exerciseId));
    const four = cards(
      [...sessions, ...weekly('ex_barbell_row', 4, () => [lift(70, 8)]), ...weekly('ex_low_bar_squat', 4, () => [lift(120, 5)])],
      seven.slice(0, 4),
    );
    assert.equal(four.length, KEY_LIMIT);
    // Three lifts tie on count and date; the two picked come by name.
    assert.deepEqual(ids(four).slice(4), ['ex_barbell_row', 'ex_low_bar_squat']);
    assert.deepEqual(four.map((c) => c.source), ['user_pin', 'user_pin', 'user_pin', 'user_pin', 'auto', 'auto']);
  });

  test('a pin whose exercise no longer exists is left out', () => {
    const list = cards(weekly('ex_bench_press', 2, () => [lift(80, 5)]), [...defaults, ...userPins('ex_custom_gone')]);
    assert.deepEqual(ids(list), ['ex_bench_press']);
  });
});

describe('automatic picks', () => {
  test('only lifts with e1RM data in the last 8 weeks', () => {
    const sessions = [
      ...weekly('ex_farmers_carry', 8, () => [hold(40, { loadKg: 40 })]),
      ...weekly('ex_hack_squat', 8, () => [lift(100, 15)]),
      ...weekly('ex_rack_pull', 8, () => [lift(180, 5, { modifiers: ['shortened_partials'] })]),
      ...weekly('ex_power_clean', 8, () => [lift(40, 5, { kind: 'warmup' })]),
      ...weekly('ex_pull_up', 8, () => [bodyweight(8, { addedLoadKg: 10 })]), // no weigh-in: no e1RM
      ...weekly('ex_dips', 4, () => [bodyweight(8, { addedLoadKg: 20, bodyweightSnapshotKg: 80 })]),
      ...weekly('ex_barbell_row', 2, () => [lift(70, 8)]),
      ...weekly('ex_front_squat', 3, () => [lift(100, 5)], 70), // logged, but not in the last 8 weeks
    ];
    assert.deepEqual(ids(cards(sessions, [])), ['ex_dips', 'ex_barbell_row']);
  });

  test('compound lifts first, then isolation lifts, then by how often', () => {
    const sessions = [
      ...weekly('ex_lateral_raise', 8, () => [lift(10, 12)]),
      ...weekly('ex_db_curl', 3, () => [lift(14, 10)]),
      ...weekly('ex_rdl', 2, () => [lift(100, 8)]),
      ...weekly('ex_overhead_press', 5, () => [lift(50, 5)]),
    ];
    assert.deepEqual(ids(cards(sessions, [])), ['ex_overhead_press', 'ex_rdl', 'ex_lateral_raise', 'ex_db_curl']);
  });

  test('ties go to the lift logged most recently', () => {
    const sessions = [
      ...weekly('ex_overhead_press', 2, () => [lift(50, 5)], 42),
      ...weekly('ex_rdl', 2, () => [lift(100, 8)], 40),
      ...weekly('ex_barbell_row', 2, () => [lift(70, 8)], 2),
      ...weekly('ex_hip_thrust', 2, () => [lift(120, 8)], 5),
    ];
    assert.deepEqual(ids(cards(sessions, [])), ['ex_barbell_row', 'ex_hip_thrust', 'ex_rdl', 'ex_overhead_press']);
  });

  test('a pick with no point in the selected range is left out (counted over 8 weeks all the same)', () => {
    const sessions = [...weekly('ex_overhead_press', 3, () => [lift(50, 5)], 36), ...weekly('ex_barbell_row', 1, () => [lift(70, 8)])];
    assert.deepEqual(ids(cards(sessions, [], ago(30))), ['ex_barbell_row']);
    assert.deepEqual(ids(cards(sessions, [], ago(91))), ['ex_overhead_press', 'ex_barbell_row']);
    assert.deepEqual(ids(cards(sessions, [], null)), ['ex_overhead_press', 'ex_barbell_row']);
  });

  test('at most 6 cards in all', () => {
    const lifts = ['ex_overhead_press', 'ex_barbell_row', 'ex_rdl', 'ex_hip_thrust', 'ex_front_squat', 'ex_low_bar_squat', 'ex_lateral_raise', 'ex_db_curl'];
    const sessions = lifts.flatMap((id) => weekly(id, 3, () => [lift(50, 8)]));
    const list = cards(sessions, []);
    assert.equal(list.length, 6);
    assert.ok(list.every((c) => c.exercise.category === 'compound'));
  });

  test('a pinned lift isn’t picked again', () => {
    const sessions = weekly('ex_overhead_press', 3, () => [lift(50, 5)]);
    assert.deepEqual(ids(cards(sessions, userPins('ex_overhead_press'))), ['ex_overhead_press']);
  });
});

describe('what a card shows', () => {
  test('e1RM points in the range, the latest of all time, and the change from the full history', () => {
    const sessions = [session(ago(100), [entry('ex_bench_press', [lift(80, 5)])]), session(ago(35), [entry('ex_bench_press', [lift(90, 5)])]), session(ago(2), [entry('ex_bench_press', [lift(100, 5)])])];
    const [narrow] = cards(sessions, defaults, ago(30));
    const [wide] = cards(sessions, defaults, null);
    assert.equal(narrow.metric, 'e1rm');
    assert.equal(narrow.fallback, false);
    assert.equal(narrow.points.length, 1);
    assert.equal(wide.points.length, 3);
    assert.deepEqual(narrow.change, wide.change);
    assert.ok(narrow.change.kind === 'change' && narrow.change.since === ago(35));
    assert.equal(narrow.latest?.value, wide.latest?.value);
  });

  test('a pinned lift without e1RM data shows its own best metric', () => {
    const sessions = [
      ...weekly('ex_pull_up', 3, () => [bodyweight(8, { addedLoadKg: 10 })]),
      ...weekly('ex_plank', 3, () => [hold(60)]),
      ...weekly('ex_lateral_raise', 3, () => [lift(10, 15)]),
    ];
    const list = cards(sessions, userPins('ex_pull_up', 'ex_plank', 'ex_lateral_raise', 'ex_side_plank'));
    assert.deepEqual(
      list.map((c) => [c.exerciseId, c.metric, c.fallback, c.state]),
      [
        ['ex_pull_up', 'top_set', true, 'data'],
        ['ex_plank', 'longest_hold', true, 'data'],
        ['ex_lateral_raise', 'top_set', true, 'data'],
        ['ex_side_plank', 'longest_hold', true, 'not_logged'],
      ],
    );
    assert.ok(list[0].points.every((p) => p.added && p.value === 10));
  });

  test('pull-ups with a weigh-in have an e1RM', () => {
    const [card] = cards(weekly('ex_pull_up', 2, () => [bodyweight(8, { addedLoadKg: 10, bodyweightSnapshotKg: 80 })]), userPins('ex_pull_up'));
    assert.equal(card.metric, 'e1rm');
  });

  test('a pin logged only before the range reads as out of range, with its last value', () => {
    const [card] = cards([session(ago(200), [entry('ex_bench_press', [lift(100, 5)])])], defaults, ago(91));
    assert.equal(card.state, 'out_of_range');
    assert.deepEqual(card.points, []);
    assert.equal(card.latest?.date, ago(200));
    assert.equal(card.change.kind, 'last_logged');
  });

  test('recent sessions with no e1RM (over 12 reps): “Last e1RM”, never a false “Last logged”', () => {
    const sessions = [70, 40].map((d) => session(ago(d), [entry('ex_back_squat', [lift(100 + (70 - d) / 3, 5)])]));
    sessions.push(...[20, 10, 3].map((d) => session(ago(d), [entry('ex_back_squat', [lift(60, 15)])])));
    const [card] = cards(sessions);
    assert.equal(card.metric, 'e1rm');
    assert.deepEqual(card.change, { kind: 'metric_last', date: ago(40), latest: card.latest });
  });

  test('a pinned pull-up logged for weeks before its first weigh-in: “First e1RM”, not “First logged”', () => {
    const sessions = [70, 56, 42, 28, 14].map((d) => session(ago(d), [entry('ex_pull_up', [bodyweight(8)])]));
    sessions.push(session(ago(1), [entry('ex_pull_up', [bodyweight(8, { bodyweightSnapshotKg: 80 })])]));
    const [card] = cards(sessions, userPins('ex_pull_up'));
    assert.equal(card.metric, 'e1rm');
    assert.deepEqual(card.change, { kind: 'metric_first', date: ago(1), latest: card.latest });
  });

  test('a reopened workout counts as it was before the reopen', () => {
    const sessions = [session(ago(3), [entry('ex_bench_press', [lift(100, 5)])], { status: 'in_progress' })];
    assert.deepEqual(ids(cards(sessions)), ['ex_bench_press']);
  });
});

describe('linked variations', () => {
  test('a family is the base movement, its variations, and custom exercises linked to any of them', () => {
    assert.equal(familyRootId('ex_custom_ssb', exercisesById), 'ex_back_squat');
    assert.equal(familyRootId('ex_front_squat', exercisesById), 'ex_back_squat');
    assert.equal(familyRootId('ex_back_squat', exercisesById), 'ex_back_squat');
    assert.equal(familyRootId('ex_unknown', exercisesById), 'ex_unknown');
    const loop = new Map(exercisesById);
    loop.set('a', { ...customSsb, id: 'a', baseMovementId: 'b' });
    loop.set('b', { ...customSsb, id: 'b', baseMovementId: 'a' });
    assert.ok(['a', 'b'].includes(familyRootId('a', loop)));
  });

  const sessions = [
    session(ago(30), [entry('ex_front_squat', [lift(90, 5)])]),
    session(ago(20), [entry('ex_custom_ssb', [lift(110, 5)])]),
    session(ago(10), [entry('ex_back_squat', [lift(120, 5)]), entry('ex_bench_press', [lift(80, 5)])]),
    session(ago(5), [entry('ex_low_bar_squat', [lift(60, 5, { kind: 'warmup' })])]),
  ];

  test('an exercise’s history lists the other logged exercises of its family, last logged first', () => {
    const fromBase = loggedVariations('ex_back_squat', exercisesById, sessions);
    assert.deepEqual(
      fromBase.map((v) => [v.exerciseId, v.isBase, v.sessions, v.lastDate]),
      [
        ['ex_custom_ssb', false, 1, ago(20)],
        ['ex_front_squat', false, 1, ago(30)],
      ],
    );
    assert.deepEqual(
      loggedVariations('ex_custom_ssb', exercisesById, sessions).map((v) => [v.exerciseId, v.isBase]),
      [
        ['ex_back_squat', true],
        ['ex_front_squat', false],
      ],
    );
    assert.deepEqual(loggedVariations('ex_bench_press', exercisesById, sessions), []);
  });

  test('exercises that no longer exist are left out', () => {
    const withoutCustom = new Map(exercisesById);
    withoutCustom.delete('ex_custom_ssb');
    assert.deepEqual(
      loggedVariations('ex_back_squat', withoutCustom, sessions).map((v) => v.exerciseId),
      ['ex_front_squat'],
    );
  });

  test('every logged exercise, last logged first; warm-ups alone don’t count', () => {
    const logged = loggedExercises(sessions);
    assert.deepEqual(
      logged.map((l) => l.exerciseId),
      ['ex_back_squat', 'ex_bench_press', 'ex_custom_ssb', 'ex_front_squat'],
    );
    assert.equal(loggedExercises(sessions), logged);
  });
});
