// Calculation rules from spec 2.7, unit-tested in tests/calculations.test.ts (roadmap G3.6).
import type { Exercise, LoggedSet, WorkoutSession } from './types';
import { epley1RM } from './units';

const PARTIAL_MODIFIERS = new Set<LoggedSet['modifiers'][number]>(['shortened_partials', 'lengthened_partials']);

export function isPartialRepSet(set: LoggedSet): boolean {
  return set.modifiers.some((m) => PARTIAL_MODIFIERS.has(m));
}

/**
 * Whether a set is read as a bodyweight set: by what was recorded with it, so changing an
 * exercise's "Counts bodyweight" setting later never rewrites its history. A set with no weight
 * logged at all is a bodyweight set, since every other set needs a weight to be completed.
 */
export function usesBodyweight(set: LoggedSet, _exercise?: Pick<Exercise, 'isBodyweight'>): boolean {
  if (set.bodyweightSnapshotKg !== undefined || set.addedLoadKg !== undefined || set.assistanceKg !== undefined) return true;
  return set.loadKg === undefined;
}

/**
 * What a bodyweight set adds to bodyweight: added load, or minus the assistance for an assisted set.
 * Only the field the set's kind shows counts, so a value left over from switching kinds is ignored.
 */
export function signedAddedKg(set: LoggedSet): number {
  return set.kind === 'assisted' ? -(set.assistanceKg ?? 0) : (set.addedLoadKg ?? 0);
}

/**
 * Load used for volume and e1RM (spec 2.6). Bodyweight sets use the bodyweight snapshot saved with
 * the set, plus added load or minus assistance, unless the user overrode the counted load. Without
 * a snapshot (or an override) the set has no effective load; it is never back-filled. Never negative.
 */
export function effectiveLoadKg(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>): number | undefined {
  if (!usesBodyweight(set, exercise)) return set.loadKg === undefined ? undefined : Math.max(0, set.loadKg);
  if (set.effectiveLoadOverrideKg !== undefined) return Math.max(0, set.effectiveLoadOverrideKg);
  if (set.bodyweightSnapshotKg === undefined) return undefined;
  return Math.max(0, set.bodyweightSnapshotKg + signedAddedKg(set));
}

/** Anything but a warm-up: normal, drop, assisted, and timed-hold sets are the work of a workout. */
export function isWorkingSet(set: LoggedSet): boolean {
  return set.kind !== 'warmup';
}

/** Working sets count toward volume; warm-ups and timed holds do not. Only completed sets count. */
export function countsForVolume(set: LoggedSet): boolean {
  return set.kind !== 'warmup' && set.kind !== 'timed_hold' && set.completedAt !== undefined;
}

/** PRs and e1RM additionally exclude partial-rep sets. */
export function countsForPRs(set: LoggedSet): boolean {
  return countsForVolume(set) && !isPartialRepSet(set);
}

export function setVolumeKg(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>): number {
  if (!countsForVolume(set) || !set.reps) return 0;
  return (effectiveLoadKg(set, exercise) ?? 0) * set.reps;
}

export function setE1RM(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>): number | undefined {
  if (!countsForPRs(set) || !set.reps) return undefined;
  const load = effectiveLoadKg(set, exercise);
  return load === undefined ? undefined : epley1RM(load, set.reps);
}

/**
 * The load a set is compared by for "heaviest weight" and "most reps at a given weight". Bodyweight
 * lifts compare what was added (or how little assistance was used), so a weigh-in alone never makes
 * a record; other lifts compare their effective load.
 */
export function recordLoadKg(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>): { kg: number; added: boolean } | undefined {
  if (usesBodyweight(set, exercise)) return { kg: signedAddedKg(set), added: true };
  const kg = effectiveLoadKg(set, exercise);
  return kg === undefined ? undefined : { kg, added: false };
}

/**
 * The sets of a session that were actually done. Skipping an exercise skips what's left of it:
 * sets already completed still count (G3.6 decision).
 */
export function completedSets(session: WorkoutSession): LoggedSet[] {
  return session.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets.filter((s) => s.completedAt !== undefined)));
}

/**
 * Whether a finished workout counts as a workout for streaks and workout counts: it needs at least
 * one completed working set (spec 2.5), so a "partial" with only warm-ups done doesn't count.
 */
export function countsAsWorkout(session: WorkoutSession): boolean {
  return session.status === 'completed' && Boolean(session.completedDate) && completedSets(session).some(isWorkingSet);
}
