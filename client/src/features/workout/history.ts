import { countsForPRs, effectiveLoadKg, setE1RM } from '@/data/calculations';
import type { Exercise, LoggedSet, SessionExercise, WorkoutSession } from '@/data/types';

/** Completed sessions, newest first. */
export function completedNewestFirst(sessions: WorkoutSession[], excludeSessionId?: string): WorkoutSession[] {
  return sessions
    .filter((s) => s.status === 'completed' && s.completedDate && s.id !== excludeSessionId)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

/** The exercise's entry from the most recent session where it was actually logged. */
export function lastEntryFor(exerciseId: string, newestFirst: WorkoutSession[]): SessionExercise | undefined {
  for (const session of newestFirst) {
    for (const block of session.blocks) {
      for (const entry of block.exercises) {
        if (entry.exerciseId === exerciseId && !entry.skipped && entry.sets.some((s) => s.completedAt)) return entry;
      }
    }
  }
  return undefined;
}

/**
 * Last time's set for each set in `entry`, matched by position within warm-ups and within
 * working sets separately, so adding a warm-up doesn't shift every comparison.
 */
export function previousSets(entry: SessionExercise, last: SessionExercise | undefined): (LoggedSet | undefined)[] {
  if (!last) return entry.sets.map(() => undefined);
  const lastWarmups = last.sets.filter((s) => s.kind === 'warmup' && s.completedAt);
  const lastWorking = last.sets.filter((s) => s.kind !== 'warmup' && s.completedAt);
  let warmupIndex = 0;
  let workingIndex = 0;
  return entry.sets.map((set) => (set.kind === 'warmup' ? lastWarmups[warmupIndex++] : lastWorking[workingIndex++]));
}

export type Best = { heaviestKg: number; e1rmKg: number };

/** Best heaviest weight and e1RM per exercise from history, for spotting PRs as sets are completed. */
export function computeBests(newestFirst: WorkoutSession[], exercisesById: Map<string, Exercise>): Map<string, Best> {
  const bests = new Map<string, Best>();
  for (const session of newestFirst) {
    for (const block of session.blocks) {
      for (const entry of block.exercises) {
        const exercise = exercisesById.get(entry.exerciseId);
        if (!exercise) continue;
        for (const set of entry.sets) {
          if (!countsForPRs(set) || !set.reps) continue;
          const load = effectiveLoadKg(set, exercise);
          const e1rm = setE1RM(set, exercise);
          const best = bests.get(exercise.id) ?? { heaviestKg: 0, e1rmKg: 0 };
          bests.set(exercise.id, {
            heaviestKg: Math.max(best.heaviestKg, load ?? 0),
            e1rmKg: Math.max(best.e1rmKg, e1rm ?? 0),
          });
        }
      }
    }
  }
  return bests;
}

/** Whether a just-completed set beats the exercise's previous best weight or e1RM. */
export function isNewRecord(set: LoggedSet, exercise: Exercise, best: Best | undefined): boolean {
  if (!best || !countsForPRs(set) || !set.reps) return false;
  const load = effectiveLoadKg(set, exercise) ?? 0;
  const e1rm = setE1RM(set, exercise) ?? 0;
  return load > best.heaviestKg + 1e-6 || e1rm > best.e1rmKg + 1e-6;
}
