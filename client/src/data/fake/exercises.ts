import { BUILTIN_EXERCISES } from '../content/exercises';
import type { Exercise } from '../types';

const STAMP = '2026-08-01T12:00:00.000Z';

/** A sample custom exercise linked to a built-in base movement (spec 2.6). */
const sampleCustom: Exercise = {
  id: 'ex_custom_ssb_squat',
  name: 'My Cambered Bar Squat',
  source: 'custom',
  baseMovementId: 'ex_back_squat',
  equipment: 'barbell',
  category: 'compound',
  primaryMuscles: ['quads', 'glutes'],
  isBodyweight: false,
  formAnalysis: 'squat',
  createdAt: STAMP,
  updatedAt: STAMP,
};

/** The built-in library plus the sample custom exercise. */
export const fakeExercises: Exercise[] = [...BUILTIN_EXERCISES, sampleCustom];
