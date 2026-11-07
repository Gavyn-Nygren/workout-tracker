// Reopened workouts (spec 2.5, 2.10): a finished workout that's reopened is in progress again, with
// its completion time and date kept, and a copy of itself as it was (sessionForReopen). Until it's
// finished again or discarded, it counts as that copy, so browsing Progress or History mid-edit
// never shows the edits or makes a finished workout disappear.
import type { WorkoutSession } from './types';

/** A finished workout that's been reopened and is open now (in progress, completion time kept). */
export function isReopened(session: Pick<WorkoutSession, 'status' | 'completedAt'>): boolean {
  return session.status === 'in_progress' && Boolean(session.completedAt);
}

/**
 * A reopened workout as it was before the reopen (finished); any other session as it is. One
 * reopened before the copy was kept counts with its edits.
 */
export function asBeforeReopen(session: WorkoutSession): WorkoutSession {
  if (!isReopened(session)) return session;
  const { beforeReopen, ...open } = session;
  return { ...(beforeReopen ?? open), status: 'completed' };
}

const mapped = new WeakMap<readonly WorkoutSession[], WorkoutSession[]>();

/**
 * The same list with reopened workouts as they were before. Returns the same array when there are
 * none, and the same mapped array for the same input, so it's safe to call on every render.
 */
export function beforeReopens(sessions: WorkoutSession[]): WorkoutSession[] {
  if (!sessions.some(isReopened)) return sessions;
  let out = mapped.get(sessions);
  if (!out) {
    out = sessions.map(asBeforeReopen);
    mapped.set(sessions, out);
  }
  return out;
}

/**
 * Whether a session counts as a finished workout for history and graphs: finished, or reopened
 * (counted as it was), with a completion date.
 */
export function isFinishedSession(session: Pick<WorkoutSession, 'status' | 'completedAt' | 'completedDate'>): boolean {
  return Boolean(session.completedDate) && (session.status === 'completed' || isReopened(session));
}
