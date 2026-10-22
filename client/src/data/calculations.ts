// Calculation rules from spec section 2.7. G3.6 hardens these with unit tests.
import type { Exercise, LoggedSet } from './types';
import { epley1RM } from './units';

const PARTIAL_MODIFIERS = new Set<LoggedSet['modifiers'][number]>(['shortened_partials', 'lengthened_partials']);

export function isPartialRepSet(set: LoggedSet): boolean {
  return set.modifiers.some((m) => PARTIAL_MODIFIERS.has(m));
}

/**
 * Load used for volume/PRs. Bodyweight movements use the bodyweight snapshot saved with
 * the set; without one, the set has no effective load (it is never back-filled).
 */
export function effectiveLoadKg(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>): number | undefined {
  if (set.effectiveLoadOverrideKg !== undefined) return set.effectiveLoadOverrideKg;
  if (!exercise.isBodyweight) return set.loadKg;
  if (set.bodyweightSnapshotKg === undefined) return undefined;
  return set.bodyweightSnapshotKg + (set.addedLoadKg ?? 0) - (set.assistanceKg ?? 0);
}

/** Working sets count toward volume; warm-ups and timed holds do not. */
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
