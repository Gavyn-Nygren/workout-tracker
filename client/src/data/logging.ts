// Logging rules from spec 2.6 (roadmap G3.5). Pure, so they're unit-tested.
import { defaultRounding } from './preferences';
import type { Equipment, Exercise, LoggedSet, Preferences, SetKind, SetPrescription } from './types';

/**
 * The increment suggested weights round to. Equipment without its own setting (bodyweight added
 * load, bands, other implements) uses the barbell increment, since that's what plates come in.
 */
export function roundingIncrementFor(equipment: Equipment | undefined, preferences: Pick<Preferences, 'units' | 'roundingIncrements'>): number {
  const own = equipment ? preferences.roundingIncrements[equipment] : undefined;
  if (own && own > 0) return own;
  const barbell = preferences.roundingIncrements.barbell;
  return barbell && barbell > 0 ? barbell : (defaultRounding[preferences.units].barbell ?? 5);
}

/** Which field a set's weight is logged in: plain load, load added to bodyweight, or assistance subtracted from it. */
export type LoadField = 'loadKg' | 'addedLoadKg' | 'assistanceKg';

export function loadField(exercise: Pick<Exercise, 'isBodyweight'> | undefined, kind: SetKind): LoadField {
  if (!exercise?.isBodyweight) return 'loadKg';
  return kind === 'assisted' ? 'assistanceKg' : 'addedLoadKg';
}

/** A planned set's kind at workout time: assisted exercises log assistance by default. */
export function kindForExercise(kind: SetKind, exercise: Pick<Exercise, 'isAssisted'> | undefined): SetKind {
  return kind === 'normal' && exercise?.isAssisted ? 'assisted' : kind;
}

/**
 * The field a planned exercise's working sets log their weight in, from its first normal or
 * assisted set at workout time: a pull-up planned as Assisted logs assistance, though the exercise
 * itself is plain bodyweight. Progression rules (G3.9) read and suggest this field.
 */
export function plannedWorkingField(sets: readonly Pick<SetPrescription, 'kind'>[], exercise: Pick<Exercise, 'isBodyweight' | 'isAssisted'> | undefined): LoadField {
  const kinds = sets.map((s) => kindForExercise(s.kind, exercise));
  return loadField(exercise, kinds.find((k) => k === 'normal' || k === 'assisted') ?? kindForExercise('normal', exercise));
}

/**
 * What a set still needs before it can be checked off (spec 2.6: every set needs weight and reps;
 * a timed hold needs its duration). Bodyweight sets only need reps: added weight and assistance
 * default to none.
 */
export function missingForCompletion(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'> | undefined): 'duration' | 'load' | 'reps' | null {
  if (set.kind === 'timed_hold') return set.durationSec ? null : 'duration';
  if (!exercise?.isBodyweight && set.loadKg === undefined) return 'load';
  return set.reps ? null : 'reps';
}

/** Effort is stored once, as reps in reserve (RIR = 10 − RPE), and shown on the user's scale. */
export function effortLabel(rir: number, scale: Preferences['effortScale']): string {
  return scale === 'rpe' ? `RPE ${10 - rir}` : `RIR ${rir}`;
}

const TEMPO_PART = /^(\d|X)$/;

/**
 * Tempo is four parts, eccentric-pause-concentric-pause, in seconds, with X for explosive
 * (spec 2.6). Accepts "3110", "3 1 1 0", or "3-1-1-0" and returns "3-1-1-0". Empty clears it.
 */
export function parseTempo(text: string): { ok: true; tempo: string | undefined } | { ok: false } {
  const compact = text.toUpperCase().replace(/[^0-9X]/g, '');
  const separated = text.toUpperCase().split(/[^0-9X]+/).filter(Boolean);
  if (!compact) return { ok: true, tempo: undefined };
  const parts = separated.length === 4 ? separated : compact.length === 4 ? compact.split('') : null;
  if (!parts || !parts.every((p) => TEMPO_PART.test(p))) return { ok: false };
  return { ok: true, tempo: parts.join('-') };
}
