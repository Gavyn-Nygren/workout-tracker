import { isWorkingSet } from '@/data/calculations';
import { derivePersonalRecords, newRecords } from '@/data/records';
import type { BodyweightEntry, Exercise, LoggedSet, PersonalRecord, SessionExercise, WorkoutSession } from '@/data/types';
import type { ActiveWorkout } from './workoutReducer';

/**
 * The bodyweight saved with a set as it's completed (spec 2.6): the latest weigh-in. In a reopened
 * workout, a set logged the first time keeps what it was logged with, even none (never back-filled),
 * and a set first done now uses the weigh-in from the workout's day or before, so an old workout
 * never takes today's weight. `weighIns` must be sorted by date.
 */
export function bodyweightForSet(active: ActiveWorkout, original: WorkoutSession | undefined, setId: string, weighIns: BodyweightEntry[]): number | undefined {
  if (active.mode !== 'reopen') return weighIns[weighIns.length - 1]?.weightKg;
  const exerciseOf = (session: WorkoutSession | undefined) => session?.blocks.flatMap((b) => b.exercises).find((e) => e.sets.some((s) => s.id === setId));
  const before = exerciseOf(original);
  // Logged the first time as this same exercise (a swap keeps set ids but not what they were).
  const loggedBefore = before?.exerciseId === exerciseOf(active.session)?.exerciseId && before?.sets.some((s) => s.id === setId && s.completedAt);
  if (loggedBefore) return undefined;
  const day = active.session.completedDate;
  return day ? weighIns.filter((w) => w.date <= day).at(-1)?.weightKg : undefined;
}

/** Completed sessions, newest first. */
export function completedNewestFirst(sessions: WorkoutSession[], excludeSessionId?: string): WorkoutSession[] {
  return sessions
    .filter((s) => s.status === 'completed' && s.completedDate && s.id !== excludeSessionId)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

/**
 * The exercise's entry from the most recent session where a working set of it was done, even if
 * it was skipped partway. Warm-ups alone don't count as doing it.
 */
export function lastEntryFor(exerciseId: string, newestFirst: WorkoutSession[]): SessionExercise | undefined {
  for (const session of newestFirst) {
    for (const block of session.blocks) {
      for (const entry of block.exercises) {
        if (entry.exerciseId === exerciseId && entry.sets.some((s) => s.completedAt && isWorkingSet(s))) return entry;
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

/** Same exercise, type, and (for reps at a weight) load, in the 0.05 kg steps records use. */
const sameRecordKey = (a: PersonalRecord, b: PersonalRecord) =>
  a.exerciseId === b.exerciseId && a.type === b.type && Math.round((a.atLoadKg ?? 0) * 20) === Math.round((b.atLoadKg ?? 0) * 20);

/**
 * Records a reopened workout holds that it didn't hold before it was reopened, so finishing it
 * celebrates only what the edits added (G3.6). `original` is the version from before the reopen
 * and `finished` the one being saved; every other session is taken from `sessions` as it is.
 * Only this workout's own records count, and a record an edit lowered (still a record, but less
 * than before) isn't new, so correcting a typo downward never celebrates.
 */
export function recordsAddedByReopen(
  sessions: WorkoutSession[],
  original: WorkoutSession | undefined,
  finished: WorkoutSession,
  exercisesById: Map<string, Exercise>,
): PersonalRecord[] {
  const others = sessions.filter((s) => s.id !== finished.id);
  const ownRecords = (version: WorkoutSession | undefined) =>
    derivePersonalRecords(version ? [...others, version] : others, exercisesById).filter((r) => r.sessionId === finished.id);
  const before = ownRecords(original);
  return newRecords(before, ownRecords(finished)).filter((r) => !before.some((b) => sameRecordKey(b, r) && b.value >= r.value));
}
