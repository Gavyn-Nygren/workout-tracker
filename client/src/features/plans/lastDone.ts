import { asBeforeReopen, isFinishedSession } from '@/data/reopen';
import type { ID, SessionExercise, WorkoutSession } from '@/data/types';

/**
 * The latest finished workout with a completed set of this exercise, for its "Last done" row. A
 * reopened workout still counts, as it was before the reopen (reopen.ts).
 */
export function lastDone(sessions: readonly WorkoutSession[], exerciseId: ID): { session: WorkoutSession; entry: SessionExercise } | undefined {
  const done = sessions.filter(isFinishedSession).map(asBeforeReopen).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  for (const session of done) {
    const entry = session.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.completedAt));
    if (entry) return { session, entry };
  }
  return undefined;
}
