import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUILTIN_EXERCISES } from '../src/data/content/exercises';
import { starterTemplates } from '../src/data/content';
import { buildFakeDataset } from '../src/data/fake';
import { fakePlans } from '../src/data/fake/plans';
import type { Exercise, Plan, StarterTemplate } from '../src/data/types';
import { exerciseMatches } from '../src/features/exercises/search';

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
const find = (name: string) => {
  const e = BUILTIN_EXERCISES.find((x) => x.name === name);
  assert.ok(e, `missing ${name}`);
  return e;
};

/** Spec 2.8: the variations with verified form analysis in V1. Sumo is deliberately excluded. */
const VERIFIED_FORM = new Set([
  'ex_back_squat', 'ex_front_squat', 'ex_goblet_squat', 'ex_goblet_squat_kb',
  'ex_reverse_lunge', 'ex_reverse_lunge_bb', 'ex_reverse_lunge_bw', 'ex_forward_lunge', 'ex_forward_lunge_bb',
  'ex_split_squat', 'ex_split_squat_bw', 'ex_bulgarian_split_squat', 'ex_bulgarian_split_squat_bb',
  'ex_deadlift', 'ex_trap_bar_deadlift', 'ex_rdl', 'ex_db_rdl', 'ex_stiff_leg_deadlift',
  'ex_standing_calf_raise', 'ex_seated_calf_raise', 'ex_calf_raise_bw', 'ex_single_leg_calf_raise', 'ex_smith_calf_raise',
]);

const exerciseIdsIn = (plan: Plan | StarterTemplate) => plan.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)));

describe('built-in exercise library', () => {
  test('has about 250 exercises (user’s pick: everything)', () => {
    assert.ok(BUILTIN_EXERCISES.length >= 240 && BUILTIN_EXERCISES.length <= 290, `${BUILTIN_EXERCISES.length}`);
  });

  test('ids are unique and well formed; names are unique', () => {
    assert.equal(byId.size, BUILTIN_EXERCISES.length, 'duplicate id');
    for (const e of BUILTIN_EXERCISES) assert.match(e.id, /^ex_[a-z0-9_]+$/, e.id);
    const names = new Set(BUILTIN_EXERCISES.map((e) => e.name.toLowerCase()));
    assert.equal(names.size, BUILTIN_EXERCISES.length, 'duplicate name');
  });

  test('names read "Movement (Equipment)": any parentheses come last', () => {
    for (const e of BUILTIN_EXERCISES) {
      const open = e.name.indexOf('(');
      if (open >= 0) assert.ok(e.name.endsWith(')') && e.name.indexOf('(', open + 1) < 0, e.name);
    }
  });

  test('every exercise is built-in with at least one primary muscle', () => {
    for (const e of BUILTIN_EXERCISES) {
      assert.equal(e.source, 'builtin', e.id);
      assert.ok(e.primaryMuscles.length > 0, e.id);
      for (const m of e.secondaryMuscles ?? []) assert.ok(!e.primaryMuscles.includes(m), `${e.id} lists ${m} twice`);
    }
  });

  test('family links point one level up to a family main movement', () => {
    for (const e of BUILTIN_EXERCISES) {
      if (!e.baseMovementId) continue;
      const base = byId.get(e.baseMovementId);
      assert.ok(base, `${e.id} links to missing ${e.baseMovementId}`);
      assert.notEqual(base.id, e.id);
      assert.equal(base.baseMovementId, undefined, `${e.id} → ${base.id} is a chain`);
    }
  });

  test('form analysis is flagged on exactly the verified variations', () => {
    const flagged = new Set(BUILTIN_EXERCISES.filter((e) => e.formAnalysis).map((e) => e.id));
    assert.deepEqual([...flagged].sort(), [...VERIFIED_FORM].sort());
    assert.equal(byId.get('ex_sumo_deadlift')?.formAnalysis, undefined);
  });

  test('bodyweight-equipment exercises count bodyweight in their load', () => {
    for (const e of BUILTIN_EXERCISES) if (e.equipment === 'bodyweight') assert.ok(e.isBodyweight, e.id);
    assert.ok(byId.get('ex_assisted_pull_up')?.isBodyweight);
  });

  test('every exercise used by plans, templates, and sample history exists', () => {
    const ids = new Set([...fakePlans.flatMap(exerciseIdsIn), ...starterTemplates.flatMap(exerciseIdsIn)]);
    for (const id of ids) assert.ok(byId.has(id), `plan or template uses missing ${id}`);
    const data = buildFakeDataset('2026-10-21');
    const known = new Map(data.exercises.map((e: Exercise) => [e.id, e]));
    for (const s of data.sessions) for (const b of s.blocks) for (const e of b.exercises) assert.ok(known.has(e.exerciseId), `history uses missing ${e.exerciseId}`);
  });
});

describe('exercise search', () => {
  const search = (q: string) => BUILTIN_EXERCISES.filter((e) => exerciseMatches(e, q)).map((e) => e.name);

  test('words match in any order, across name, equipment, and nicknames', () => {
    assert.ok(search('dumbbell bench').includes('Bench Press (Dumbbell)'));
    assert.ok(search('bench dumbbell').includes('Bench Press (Dumbbell)'));
    assert.ok(search('rdl').includes('Romanian Deadlift (Barbell)'));
    assert.ok(search('hex bar').includes('Deadlift (Trap Bar)'));
  });

  test('gym shorthand and missing hyphens still match', () => {
    assert.ok(search('db row').includes('One-Arm Row (Dumbbell)'));
    assert.ok(search('ohp').includes('Overhead Press (Barbell)'));
    assert.ok(search('pullup').includes('Pull-Up'));
    assert.ok(search('pull up').includes('Pull-Up'));
  });

  test('an empty search shows everything; nonsense shows nothing', () => {
    assert.equal(search('  ').length, BUILTIN_EXERCISES.length);
    assert.equal(search('zzqx').length, 0);
  });

  test('a muscle name finds its exercises', () => {
    assert.ok(search('triceps').includes(find('Triceps Pushdown (Cable)').name));
  });
});
