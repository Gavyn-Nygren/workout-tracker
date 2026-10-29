// Logged exercises and their linked variations (G3.11), pure and unit-tested
// (tests/keyExercises.test.ts). Numbers are never merged across exercises (a safety-bar squat's e1RM
// isn't a back squat's): an exercise's history lists the other logged exercises of its family, each
// opening its own history. A family is a base movement, its built-in variations, and custom
// exercises linked to any of them (content/exercises.ts `base`, Exercise.baseMovementId).
import type { Exercise, ISODate, WorkoutSession } from '@/data/types';
import { exerciseLogs, hasWorkingSet } from './series';

/** An exercise with at least one completed working set in a finished workout. */
export type LoggedExercise = {
  exerciseId: string;
  /** Workouts it has a working set in. */
  sessions: number;
  lastDate: ISODate;
  /** When the last of them was finished (orders same-day workouts). */
  lastAt: string;
};

const loggedCache = new WeakMap<readonly WorkoutSession[], LoggedExercise[]>();

/**
 * Every logged exercise, last logged first (all time; reopened workouts as they were). A workout
 * with only warm-ups of an exercise doesn't count. For "All exercises" and the variations list.
 */
export function loggedExercises(sessions: WorkoutSession[]): LoggedExercise[] {
  const cached = loggedCache.get(sessions);
  if (cached) return cached;
  const out: LoggedExercise[] = [];
  for (const [exerciseId, logs] of exerciseLogs(sessions)) {
    const working = logs.filter(hasWorkingSet);
    const last = working[working.length - 1];
    if (last) out.push({ exerciseId, sessions: working.length, lastDate: last.date, lastAt: last.at ?? last.date });
  }
  out.sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.exerciseId.localeCompare(b.exerciseId));
  loggedCache.set(sessions, out);
  return out;
}

/**
 * The base movement at the top of an exercise's family: follows `baseMovementId` (a custom exercise
 * can link to a variation, which links to its base), stopping at a loop or a missing link.
 */
export function familyRootId(exerciseId: string, exercisesById: Map<string, Exercise>): string {
  const seen = new Set<string>([exerciseId]);
  let id = exerciseId;
  for (;;) {
    const base = exercisesById.get(id)?.baseMovementId;
    if (!base || seen.has(base)) return id;
    seen.add(base);
    id = base;
  }
}

export type Variation = LoggedExercise & {
  exercise: Exercise;
  /** It's the family's base movement (e.g. Back Squat, seen from a safety-bar squat). */
  isBase: boolean;
};

/**
 * The other logged exercises that share an exercise's base movement: the base itself, its built-in
 * variations, and custom exercises linked to any of them. Last logged first. Exercises that no
 * longer exist are left out.
 */
export function loggedVariations(exerciseId: string, exercisesById: Map<string, Exercise>, sessions: WorkoutSession[]): Variation[] {
  const root = familyRootId(exerciseId, exercisesById);
  const out: Variation[] = [];
  for (const logged of loggedExercises(sessions)) {
    if (logged.exerciseId === exerciseId) continue;
    const exercise = exercisesById.get(logged.exerciseId);
    if (!exercise || familyRootId(logged.exerciseId, exercisesById) !== root) continue;
    out.push({ ...logged, exercise, isBase: logged.exerciseId === root });
  }
  return out;
}
