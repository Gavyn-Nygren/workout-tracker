import { isWorkingSet } from '@/data/calculations';
import { derivePersonalRecords, newRecords } from '@/data/records';
import type { BodyweightEntry, Exercise, ID, LoggedSet, PersonalRecord, SessionExercise, WorkoutSession } from '@/data/types';
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

/** Whether a working set of the entry was done (warm-ups alone don't count as doing it). */
const didWork = (entry: SessionExercise) => entry.sets.some((s) => s.completedAt && isWorkingSet(s));

/**
 * The exercise's entry from the most recent session where a working set of it was done, even if
 * it was skipped partway. Warm-ups alone don't count as doing it.
 */
export function lastEntryFor(exerciseId: string, newestFirst: WorkoutSession[]): SessionExercise | undefined {
  for (const session of newestFirst) {
    for (const block of session.blocks) {
      for (const entry of block.exercises) {
        if (entry.exerciseId === exerciseId && didWork(entry)) return entry;
      }
    }
  }
  return undefined;
}

/**
 * One earlier time an exercise was done: the entry, and the workout it was in (for its date).
 * `anywhere` marks the fallback to the exercise anywhere: not this plan slot's own last time, so
 * its sets were done against targets of their own (progression.ts judges misses by those).
 */
export type LastTime = { session: WorkoutSession; entry: SessionExercise; anywhere?: true };

/**
 * Where a planned exercise sits: its plan workout, its id, and which of that workout's entries
 * for the same exercise it is (0 for the first), for when the exercise appears more than once.
 * `plannedIds` are the plan workout's planned exercise ids now: an earlier entry with another of
 * them belongs to that other planned exercise, never to this one.
 */
export type Slot = {
  exerciseId: ID;
  planId?: ID;
  planWorkoutId?: ID;
  plannedExerciseId?: ID;
  nth?: number;
  plannedIds?: readonly ID[];
};

/** Whether an earlier entry belongs to another planned exercise of the slot's plan workout now. */
const ownedByOther = (entry: SessionExercise, slot: Slot) =>
  slot.plannedExerciseId !== undefined &&
  entry.plannedExerciseId !== undefined &&
  entry.plannedExerciseId !== slot.plannedExerciseId &&
  (slot.plannedIds?.includes(entry.plannedExerciseId) ?? false);

/** The slot's entry in an earlier workout of the same plan workout, if it was done there. */
function slotEntryIn(session: WorkoutSession, slot: Slot): SessionExercise | undefined {
  const same = session.blocks.flatMap((b) => b.exercises).filter((e) => e.exerciseId === slot.exerciseId);
  // Its own entry, by planned exercise; if it was skipped that time, that workout doesn't count.
  const own = same.find((e) => e.plannedExerciseId === slot.plannedExerciseId);
  if (own) return didWork(own) ? own : undefined;
  // Otherwise by position, among entries no other planned exercise owns: ones saved without the
  // plan's ids, or from a planned exercise since removed. If its entry was swapped or removed that
  // time, there's none, and that workout doesn't count for it.
  const free = same.filter((e) => !ownedByOther(e, slot));
  const entry = free[slot.nth ?? 0] ?? free[0];
  return entry && didWork(entry) ? entry : undefined;
}

/**
 * A planned exercise's earlier times, newest first (G3.9 decision C, "same plan workout"): the
 * workouts of the same plan workout where it was done, so bench in Upper A builds on the last
 * Upper A and heavy and light days progress apart. Plan workout ids stay the same through plan
 * edits; a plan copied from a template gets its own. When the slot has never been done (or the
 * entry isn't from a plan), it's every workout where the exercise was done, anywhere, taking the
 * first entry of it in each (as `lastEntryFor` does) that isn't another planned exercise's of the
 * same plan workout. `limit` stops early.
 */
export function slotHistory(newestFirst: readonly WorkoutSession[], slot: Slot, limit = Infinity): LastTime[] {
  const found: LastTime[] = [];
  if (slot.planWorkoutId && slot.plannedExerciseId) {
    for (const session of newestFirst) {
      if (found.length >= limit) break;
      if (session.planWorkoutId !== slot.planWorkoutId) continue;
      if (slot.planId && session.planId && session.planId !== slot.planId) continue;
      const entry = slotEntryIn(session, slot);
      if (entry) found.push({ session, entry });
    }
    if (found.length) return found;
  }
  for (const session of newestFirst) {
    if (found.length >= limit) break;
    const entry = session.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === slot.exerciseId && !ownedByOther(e, slot) && didWork(e));
    if (entry) found.push({ session, entry, anywhere: true });
  }
  return found;
}

/**
 * Last time for each entry of a workout, for the PREVIOUS column: its plan slot's last time
 * (the same history its pre-fill and progression use), or the exercise's last time anywhere.
 * `planIds` are the plan workout's planned exercise ids now, the ones the pre-fill matched
 * against (buildSession), so a planned exercise removed from this workout partway still owns its
 * earlier entries and never shows up as another's last time. Keyed by entry id.
 */
export function lastTimes(
  session: Pick<WorkoutSession, 'planId' | 'planWorkoutId' | 'blocks'>,
  newestFirst: readonly WorkoutSession[],
  planIds: readonly ID[] = [],
): Map<ID, SessionExercise | undefined> {
  const seen = new Map<ID, number>();
  const map = new Map<ID, SessionExercise | undefined>();
  const entries = session.blocks.flatMap((b) => b.exercises);
  // The plan workout's planned exercises, and any of this workout's from an older version of it.
  const plannedIds = [...new Set([...planIds, ...entries.flatMap((e) => (e.plannedExerciseId ? [e.plannedExerciseId] : []))])];
  for (const entry of entries) {
    const nth = seen.get(entry.exerciseId) ?? 0;
    seen.set(entry.exerciseId, nth + 1);
    const slot: Slot = { exerciseId: entry.exerciseId, planId: session.planId, planWorkoutId: session.planWorkoutId, plannedExerciseId: entry.plannedExerciseId, nth, plannedIds };
    map.set(entry.id, slotHistory(newestFirst, slot, 1)[0]?.entry);
  }
  return map;
}

/** A write the active workout made to a saved session: Finish or a restore saves it, Discard deletes it. */
export type SessionWrite = { kind: 'save'; session: WorkoutSession } | { kind: 'delete'; sessionId: ID };

/**
 * The saved sessions with a write applied, so a workout started right after Discard or Finish
 * counts it before the sessions query has caught up (the G3.6 "Discard it and start" carry-over).
 */
export function withSessionWrite(sessions: readonly WorkoutSession[], write: SessionWrite): WorkoutSession[] {
  const id = write.kind === 'save' ? write.session.id : write.sessionId;
  const others = sessions.filter((s) => s.id !== id);
  return write.kind === 'save' ? [...others, write.session] : others;
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
