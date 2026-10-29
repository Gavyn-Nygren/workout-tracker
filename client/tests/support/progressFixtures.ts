// Workouts for the Progress engine tests (progressSeries, progressMetrics, keyExercises).
import { builtinExercises } from '../../src/data/content';
import type { Exercise, LoggedSet, SessionExercise, WorkoutSession } from '../../src/data/types';

export const customSsb: Exercise = {
  id: 'ex_custom_ssb',
  name: 'My SSB Squat',
  source: 'custom',
  baseMovementId: 'ex_ssb_squat',
  category: 'compound',
  primaryMuscles: ['quads'],
  isBodyweight: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export const exercisesById = new Map<string, Exercise>([...builtinExercises, customSsb].map((e) => [e.id, e]));

let nextId = 0;
export const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], completedAt: '2026-10-01T10:00:00Z', ...patch });
export const entry = (exerciseId: string, sets: LoggedSet[], skipped = false): SessionExercise => ({ id: `entry${nextId++}`, exerciseId, skipped, sets });

/** A finished workout on `day`, finished at `time` (UTC) that day. */
export const session = (day: string, exercises: SessionExercise[], patch: Partial<WorkoutSession> = {}, time = '10:00:00'): WorkoutSession => ({
  id: `sess_${day}_${nextId++}`,
  name: 'Workout',
  status: 'completed',
  completion: 'full',
  completedDate: day,
  startedAt: `${day}T09:00:00Z`,
  completedAt: `${day}T${time}Z`,
  blocks: [{ id: `block${nextId++}`, type: 'single', exercises }],
  createdAt: `${day}T09:00:00Z`,
  updatedAt: `${day}T${time}Z`,
  ...patch,
});

/** Shorthands for common sets. */
export const lift = (loadKg: number, reps: number, patch: Partial<LoggedSet> = {}) => set({ loadKg, reps, ...patch });
export const bodyweight = (reps: number, patch: Partial<LoggedSet> = {}) => set({ reps, addedLoadKg: 0, ...patch });
export const hold = (durationSec: number, patch: Partial<LoggedSet> = {}) => set({ kind: 'timed_hold', durationSec, ...patch });
