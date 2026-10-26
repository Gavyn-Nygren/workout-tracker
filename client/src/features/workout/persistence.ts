import type { WorkoutSession } from '@/data/types';
import type { ActiveWorkout } from './workoutReducer';

/** Rest countdown, kept as wall-clock times so it stays right across app restarts. */
export type RestTimer = {
  /** When the countdown reaches zero (ms epoch); ignored while paused. */
  endsAtMs: number;
  durationSec: number;
  /** Set while paused. */
  pausedRemainingMs?: number;
  label: string;
};

/**
 * What the app needs, beyond the session row itself, to pick an unfinished workout back up after
 * it's closed (spec 2.5: active workouts auto-save and resume). Kept on the phone only.
 */
export type ActiveWorkoutMeta = {
  sessionId: string;
  mode: ActiveWorkout['mode'];
  position?: ActiveWorkout['position'];
  rest: RestTimer | null;
  prSetIds: string[];
  /** For a reopened workout: the finished version, restored if the reopen is discarded. */
  original?: WorkoutSession;
};

/** The rest timer to restore on resume: kept while it's paused or still running, dropped once it's over. */
export function restoredRest(rest: RestTimer | null, nowMs: number): RestTimer | null {
  if (!rest) return null;
  if (rest.pausedRemainingMs !== undefined) return rest;
  return rest.endsAtMs > nowMs ? rest : null;
}

/**
 * What discarding an unfinished workout does: a new workout is deleted outright; a reopened one goes
 * back to exactly how it was before it was reopened.
 */
export function discardPlan(meta: Pick<ActiveWorkoutMeta, 'mode' | 'original'>, sessionId: string): { kind: 'delete'; sessionId: string } | { kind: 'restore'; session: WorkoutSession } {
  return meta.mode === 'reopen' && meta.original ? { kind: 'restore', session: meta.original } : { kind: 'delete', sessionId };
}

/**
 * Which unfinished workout to resume when the app opens: the one the phone remembers, or, if that
 * note was lost, the most recently started session still in progress.
 */
export function sessionToResume(meta: ActiveWorkoutMeta | null, sessions: WorkoutSession[]): { session: WorkoutSession; meta: ActiveWorkoutMeta } | null {
  const inProgress = sessions.filter((s) => s.status === 'in_progress');
  if (meta) {
    const remembered = inProgress.find((s) => s.id === meta.sessionId);
    if (remembered) return { session: remembered, meta };
  }
  const latest = inProgress.sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))[0];
  return latest ? { session: latest, meta: { sessionId: latest.id, mode: 'new', rest: null, prSetIds: [] } } : null;
}
