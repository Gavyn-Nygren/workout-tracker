import type { WorkoutSession } from '@/data/types';
import type { ActiveWorkout } from './workoutReducer';

/** What the workout clock reads from: an `ActiveWorkout` fits. */
export type WorkoutClock = {
  mode: ActiveWorkout['mode'];
  session: Pick<WorkoutSession, 'startedAt' | 'completedAt'>;
};

/**
 * Seconds shown on the workout clock (header and mini bar). A reopened workout shows how long it
 * took, frozen, not the days since it started.
 */
export function elapsedSeconds({ mode, session }: WorkoutClock, now: number): number {
  if (!session.startedAt) return 0;
  const end = mode === 'reopen' && session.completedAt ? Date.parse(session.completedAt) : now;
  return (end - Date.parse(session.startedAt)) / 1000;
}
