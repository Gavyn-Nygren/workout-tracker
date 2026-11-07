import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUILTIN_EXERCISES } from '../src/data/content/exercises';
import { kindForExercise } from '../src/data/logging';
import type { Exercise } from '../src/data/types';
import { customExercise, type CustomExerciseFields } from '../src/features/plans/customExercise';

const NOW = '2026-10-22T08:00:00.000Z';
const builtin = (id: string): Exercise => {
  const found = BUILTIN_EXERCISES.find((e) => e.id === id);
  assert.ok(found, id);
  return found;
};

/** The form after picking `base`: it copies the base's equipment, type and bodyweight setting. */
const linkedTo = (base: Exercise, extra: Partial<CustomExerciseFields> = {}): CustomExerciseFields => ({
  name: ' Gym assisted pull-up ',
  baseId: base.id,
  equipment: base.equipment,
  muscles: [],
  category: base.category,
  isBodyweight: base.isBodyweight,
  instructions: '',
  mediaUrl: '',
  ...extra,
});

describe('custom exercise form', () => {
  test('linked to an assisted machine, its sets start as assisted (spec 2.6)', () => {
    const base = builtin('ex_assisted_pull_up');
    const exercise = customExercise(linkedTo(base), base, undefined, NOW);
    assert.equal(exercise.isAssisted, true);
    assert.equal(kindForExercise('normal', exercise), 'assisted');
    assert.equal(exercise.name, 'Gym assisted pull-up');
    assert.equal(exercise.baseMovementId, 'ex_assisted_pull_up');
    assert.deepEqual(exercise.primaryMuscles, base.primaryMuscles);
  });

  test('unlinking, or turning off Counts bodyweight, clears it', () => {
    const base = builtin('ex_assisted_pull_up');
    const saved = customExercise(linkedTo(base), base, undefined, NOW);
    const unlinked = customExercise(linkedTo(base, { baseId: undefined }), undefined, saved, NOW);
    assert.equal(unlinked.isAssisted, undefined);
    assert.equal(unlinked.id, saved.id);
    assert.equal(kindForExercise('normal', unlinked), 'normal');
    assert.equal(customExercise(linkedTo(base, { isBodyweight: false }), base, saved, NOW).isAssisted, undefined);
  });

  test('linked to a movement that is not assisted, sets log added weight', () => {
    const base = builtin('ex_pull_up');
    const exercise = customExercise(linkedTo(base, { name: 'Weighted pull-up' }), base, undefined, NOW);
    assert.equal(exercise.isAssisted, undefined);
    assert.equal(exercise.isBodyweight, true);
  });

  test('editing keeps the id and creation time, and passes on form analysis', () => {
    const base = builtin('ex_back_squat');
    const first = customExercise(linkedTo(base, { name: 'Pause Squat', muscles: ['quads'] }), base, undefined, '2026-10-01T08:00:00.000Z');
    const edited = customExercise(linkedTo(base, { name: 'Pause Squat', muscles: ['quads'], instructions: ' 2 s pause ' }), base, first, NOW);
    assert.equal(edited.id, first.id);
    assert.equal(edited.createdAt, '2026-10-01T08:00:00.000Z');
    assert.equal(edited.updatedAt, NOW);
    assert.equal(edited.formAnalysis, base.formAnalysis);
    assert.deepEqual(edited.primaryMuscles, ['quads']);
    assert.equal(edited.instructions, '2 s pause');
    assert.equal(edited.source, 'custom');
  });
});
