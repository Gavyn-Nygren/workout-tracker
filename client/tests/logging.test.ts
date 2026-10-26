import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { effectiveLoadKg, setE1RM, setVolumeKg } from '../src/data/calculations';
import { builtinExercises } from '../src/data/content';
import { effortLabel, kindForExercise, loadField, missingForCompletion, needsBodyweightPrompt, parseTempo, roundingIncrementFor } from '../src/data/logging';
import { defaultPreferences, defaultRounding } from '../src/data/preferences';
import type { LoggedSet, PlannedExercise, WorkoutSession } from '../src/data/types';
import { kgToLb, lbToKg } from '../src/data/units';
import type { DayItem } from '../src/features/today/agenda';
import { sessionFromPlan } from '../src/features/workout/buildSession';
import { workoutReducer, type ActiveWorkout } from '../src/features/workout/workoutReducer';

const ex = (id: string) => builtinExercises.find((e) => e.id === id)!;
const SQUAT = ex('ex_back_squat');
const PULL_UP = ex('ex_pull_up');
const ASSISTED = ex('ex_assisted_pull_up');
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: 's', kind: 'normal', modifiers: [], ...patch });

describe('set kinds, modifiers, and effective load', () => {
  test('bodyweight movements add their snapshot; assisted sets subtract assistance; an override wins', () => {
    assert.equal(effectiveLoadKg(set({ bodyweightSnapshotKg: 80, addedLoadKg: 10 }), PULL_UP), 90);
    assert.equal(effectiveLoadKg(set({ kind: 'assisted', bodyweightSnapshotKg: 80, assistanceKg: 25 }), ASSISTED), 55);
    assert.equal(effectiveLoadKg(set({ bodyweightSnapshotKg: 80, addedLoadKg: 10, effectiveLoadOverrideKg: 60 }), PULL_UP), 60);
    assert.equal(effectiveLoadKg(set({ loadKg: 100 }), SQUAT), 100);
  });

  test('without a bodyweight snapshot a bodyweight set has no load, so it stays out of volume and e1RM', () => {
    const noSnapshot = set({ addedLoadKg: 10, reps: 8, completedAt: 'x' });
    assert.equal(effectiveLoadKg(noSnapshot, PULL_UP), undefined);
    assert.equal(setVolumeKg(noSnapshot, PULL_UP), 0);
    assert.equal(setE1RM(noSnapshot, PULL_UP), undefined);
  });

  test('partial-rep modifiers count for volume but not records; warm-ups count for neither', () => {
    const partial = set({ loadKg: 100, reps: 5, completedAt: 'x', modifiers: ['lengthened_partials'] });
    assert.equal(setVolumeKg(partial, SQUAT), 500);
    assert.equal(setE1RM(partial, SQUAT), undefined);
    const warmup = set({ kind: 'warmup', loadKg: 60, reps: 5, completedAt: 'x' });
    assert.equal(setVolumeKg(warmup, SQUAT), 0);
  });

  test('a set logs its weight in the right field for its exercise and kind', () => {
    assert.equal(loadField(SQUAT, 'normal'), 'loadKg');
    assert.equal(loadField(PULL_UP, 'normal'), 'addedLoadKg');
    assert.equal(loadField(PULL_UP, 'assisted'), 'assistanceKg');
    assert.equal(loadField(ASSISTED, 'warmup'), 'addedLoadKg');
    assert.equal(kindForExercise('normal', ASSISTED), 'assisted');
    assert.equal(kindForExercise('warmup', ASSISTED), 'warmup');
    assert.equal(kindForExercise('normal', PULL_UP), 'normal');
  });

  test('a set needs weight and reps to be completed; bodyweight sets need reps; holds need a time', () => {
    assert.equal(missingForCompletion(set({ reps: 5 }), SQUAT), 'load');
    assert.equal(missingForCompletion(set({ loadKg: 100 }), SQUAT), 'reps');
    assert.equal(missingForCompletion(set({ loadKg: 100, reps: 5 }), SQUAT), null);
    assert.equal(missingForCompletion(set({ loadKg: 0, reps: 5 }), SQUAT), null, 'an empty bar or zero load is still a weight');
    assert.equal(missingForCompletion(set({ reps: 8 }), PULL_UP), null);
    assert.equal(missingForCompletion(set({}), PULL_UP), 'reps');
    assert.equal(missingForCompletion(set({ kind: 'timed_hold' }), ex('ex_plank')), 'duration');
    assert.equal(missingForCompletion(set({ kind: 'timed_hold', durationSec: 45 }), ex('ex_plank')), null);
  });
});

describe('effort', () => {
  test('stored once as reps in reserve, shown as RPE or RIR', () => {
    assert.equal(effortLabel(2, 'rpe'), 'RPE 8');
    assert.equal(effortLabel(2, 'rir'), 'RIR 2');
    assert.equal(effortLabel(1.5, 'rpe'), 'RPE 8.5');
    assert.equal(effortLabel(0, 'rpe'), 'RPE 10');
  });
});

describe('tempo', () => {
  test('accepts four parts with or without separators, and X for explosive', () => {
    assert.deepEqual(parseTempo('3110'), { ok: true, tempo: '3-1-1-0' });
    assert.deepEqual(parseTempo('3-1-1-0'), { ok: true, tempo: '3-1-1-0' });
    assert.deepEqual(parseTempo('2 0 x 0'), { ok: true, tempo: '2-0-X-0' });
    assert.deepEqual(parseTempo('  '), { ok: true, tempo: undefined });
  });

  test('rejects anything that isn’t four single digits or X', () => {
    for (const bad of ['31', '3-1-1', '3-1-1-0-2', '10-0-1-0', '3-a-1-0']) assert.equal(parseTempo(bad).ok, false, bad);
  });
});

describe('rounding', () => {
  test('each equipment type rounds to its own increment, custom ones included', () => {
    assert.equal(roundingIncrementFor('dumbbell', { units: 'metric', roundingIncrements: defaultRounding.metric }), 2);
    assert.equal(roundingIncrementFor('barbell', { units: 'imperial', roundingIncrements: { ...defaultRounding.imperial, barbell: 2.5 } }), 2.5);
  });

  test('equipment without its own increment uses the barbell one, never a hard-coded 5', () => {
    assert.equal(roundingIncrementFor('bodyweight', { units: 'metric', roundingIncrements: defaultRounding.metric }), 2.5);
    assert.equal(roundingIncrementFor(undefined, { units: 'metric', roundingIncrements: {} }), 2.5);
    assert.equal(roundingIncrementFor('other', { units: 'imperial', roundingIncrements: {} }), 5);
  });

  test('new accounts get every default increment, kettlebells included', () => {
    assert.deepEqual(defaultPreferences.roundingIncrements, defaultRounding.imperial);
  });
});

describe('pre-fill', () => {
  const planned = (exerciseId: string, sets: PlannedExercise['sets']): PlannedExercise => ({ id: 'pe', exerciseId, sets });
  const item = (pe: PlannedExercise): DayItem =>
    ({ key: 'k', date: '2026-10-21', name: 'Day', status: 'planned', workout: { id: 'w', name: 'Day', blocks: [{ id: 'b', type: 'single', exercises: [pe] }] } }) as DayItem;
  const history = (exerciseId: string, sets: Partial<LoggedSet>[]): WorkoutSession[] => [
    {
      id: 'last',
      name: 'Last',
      status: 'completed',
      completedDate: '2026-10-14',
      blocks: [{ id: 'b', type: 'single', exercises: [{ id: 'e', exerciseId, skipped: false, sets: sets.map((s, i) => ({ id: `l${i}`, kind: 'normal', modifiers: [], completedAt: 'x', ...s })) }] }],
      createdAt: 'x',
      updatedAt: 'x',
    },
  ];
  const build = (pe: PlannedExercise, past: WorkoutSession[], units: 'imperial' | 'metric' = 'imperial') =>
    sessionFromPlan({ item: item(pe), history: past, exercisesById: new Map(builtinExercises.map((e) => [e.id, e])), preferences: { units, roundingIncrements: defaultRounding[units] } }).blocks[0].exercises[0].sets;
  const work = (n: number, reps: { min: number; max: number } | number) => Array.from({ length: n }, () => ({ kind: 'normal' as const, modifiers: [], targetReps: reps }));

  test('a plan target weight wins', () => {
    const sets = build(planned('ex_back_squat', [{ kind: 'normal', modifiers: [], targetReps: 5, targetLoadKg: 120 }]), history('ex_back_squat', [{ loadKg: 100, reps: 5 }]));
    assert.equal(sets[0].loadKg, 120);
  });

  test('otherwise it starts from last time’s top weight, rounded to the equipment increment', () => {
    const lb = build(planned('ex_back_squat', work(2, 5)), history('ex_back_squat', [{ loadKg: lbToKg(227), reps: 5 }, { loadKg: lbToKg(222), reps: 5 }]));
    assert.equal(Math.round(kgToLb(lb[0].loadKg!)), 225);
    const kg = build(planned('ex_back_squat', work(1, 5)), history('ex_back_squat', [{ loadKg: 101.1, reps: 5 }]), 'metric');
    assert.equal(kg[0].loadKg, 100);
  });

  test('reps start from last time, kept inside the target range', () => {
    const sets = build(planned('ex_back_squat', work(3, { min: 6, max: 10 })), history('ex_back_squat', [{ loadKg: 100, reps: 12 }, { loadKg: 100, reps: 8 }, { loadKg: 100, reps: 4 }]));
    assert.deepEqual(sets.map((s) => s.reps), [10, 8, 6]);
  });

  test('bodyweight movements pre-fill added weight, and their warm-ups start without any', () => {
    const sets = build(planned('ex_pull_up', [{ kind: 'warmup', modifiers: [], targetReps: 5 }, ...work(1, 8)]), history('ex_pull_up', [{ addedLoadKg: lbToKg(25), reps: 8, bodyweightSnapshotKg: 80 }]));
    assert.equal(sets[0].kind, 'warmup');
    assert.equal(sets[0].addedLoadKg, undefined);
    assert.equal(sets[0].loadKg, undefined);
    assert.equal(Math.round(kgToLb(sets[1].addedLoadKg!)), 25);
    assert.equal(sets[1].loadKg, undefined);
  });

  test('assisted exercises log assistance, starting from last time’s', () => {
    const sets = build(planned('ex_assisted_pull_up', work(2, 8)), history('ex_assisted_pull_up', [{ kind: 'assisted', assistanceKg: lbToKg(40), reps: 8 }]));
    assert.ok(sets.every((s) => s.kind === 'assisted'));
    assert.equal(Math.round(kgToLb(sets[0].assistanceKg!)), 40);
    assert.equal(sets[0].addedLoadKg, undefined);
  });

  test('no history and no target leaves the weight empty for the lifter to enter', () => {
    const sets = build(planned('ex_back_squat', work(1, 5)), []);
    assert.equal(sets[0].loadKg, undefined);
    assert.equal(sets[0].reps, 5);
  });

});

describe('bodyweight snapshot', () => {
  const start: ActiveWorkout = {
    mode: 'new',
    session: { id: 'w', name: 'W', status: 'in_progress', blocks: [{ id: 'b', type: 'single', exercises: [{ id: 'e', exerciseId: 'ex_pull_up', skipped: false, sets: [set({ id: 's1', reps: 8 })] }] }], createdAt: 'x', updatedAt: 'x' },
  };
  const firstSet = (w: ActiveWorkout | null) => w!.session.blocks[0].exercises[0].sets[0];

  test('completing a set saves the bodyweight used', () => {
    const done = workoutReducer(start, { type: 'completeSet', entryId: 'e', setId: 's1', completedAt: 'now', bodyweightKg: 80 });
    assert.equal(firstSet(done).bodyweightSnapshotKg, 80);
  });

  test('with no bodyweight known the set has none, and nothing fills it in later', () => {
    const done = workoutReducer(start, { type: 'completeSet', entryId: 'e', setId: 's1', completedAt: 'now' });
    assert.equal(firstSet(done).bodyweightSnapshotKg, undefined);
    const edited = workoutReducer(done, { type: 'updateSet', entryId: 'e', setId: 's1', patch: { reps: 9 } });
    assert.equal(firstSet(edited).bodyweightSnapshotKg, undefined);
  });

  test('the prompt asks once, only for bodyweight movements with no weigh-in yet', () => {
    assert.equal(needsBodyweightPrompt(PULL_UP, undefined, false), true);
    assert.equal(needsBodyweightPrompt(PULL_UP, undefined, true), false, 'already asked');
    assert.equal(needsBodyweightPrompt(PULL_UP, 80, false), false, 'a weigh-in exists');
    assert.equal(needsBodyweightPrompt(SQUAT, undefined, false), false, 'not a bodyweight movement');
  });
});
