import { isWorkingSet } from '@/data/calculations';
import type { Exercise, PlanWorkout, SessionExercise, UnitSystem } from '@/data/types';
import { bestSet } from '@/features/summary/summarize';
import { formatAddedLoad, formatLoad, formatRepTarget, plural, spokenAddedLoad, spokenLoad } from '@/lib/format';

/** One exercise line on a Today workout card. */
export type CardLine = {
  key: string;
  name: string;
  /** "Superset, Bench Press" for the visible "SS · Bench Press". */
  spokenName: string;
  detail: string;
  /** VoiceOver version of `detail`, when it differs. */
  spokenDetail?: string;
  muted?: boolean;
};

/** A planned workout's lines: working sets × target reps (or hold time). */
export function planLines(workout: PlanWorkout | undefined, exercisesById: Map<string, Exercise>): CardLine[] {
  if (!workout) return [];
  return workout.blocks.flatMap((block) =>
    block.exercises.map((pe) => {
      const working = pe.sets.filter((s) => s.kind !== 'warmup');
      const first = working[0];
      const detail = first?.kind === 'timed_hold' ? `${working.length} × ${first.targetDurationSec ?? 0} s` : `${working.length} × ${formatRepTarget(first?.targetReps)}`;
      const prefix = block.type === 'superset' ? 'SS · ' : block.type === 'circuit' ? 'Circuit · ' : '';
      const spokenPrefix = block.type === 'superset' ? 'Superset, ' : block.type === 'circuit' ? 'Circuit, ' : '';
      const name = exercisesById.get(pe.exerciseId)?.name ?? 'Exercise';
      return { key: pe.id, name: `${prefix}${name}`, spokenName: `${spokenPrefix}${name}`, detail };
    }),
  );
}

/**
 * A finished workout's lines: completed working sets and the top set, the same best set the
 * summary shows. Sets never completed (pre-filled targets) and warm-ups are left out. An exercise
 * skipped part-way still shows the sets done before it was skipped.
 */
export function sessionLines(exercises: SessionExercise[], exercisesById: Map<string, Exercise>, units: UnitSystem): CardLine[] {
  return exercises.map((se) => {
    const exercise = exercisesById.get(se.exerciseId);
    const name = exercise?.name ?? 'Exercise';
    const done = se.sets.filter((s) => s.completedAt && isWorkingSet(s));
    if (!done.length) return { key: se.id, name, spokenName: name, detail: se.skipped ? 'Skipped' : 'Not logged', muted: true };

    const holds = done.filter((s) => s.kind === 'timed_hold');
    const best = bestSet(se, exercise);
    const lead = se.skipped ? 'Skipped · ' : '';
    const line = (detail: string, spokenDetail?: string): CardLine => ({
      key: se.id,
      name,
      spokenName: name,
      detail: lead + detail,
      spokenDetail: spokenDetail && se.skipped ? `skipped, ${spokenDetail}` : spokenDetail,
      muted: se.skipped,
    });
    if (best?.kind === 'hold') return line(`${holds.length} × ${best.seconds} s`);

    const sets = plural(done.length, 'set');
    // Bodyweight lifts show what the lifter added (or how much assistance), not bodyweight plus load.
    if (best?.kind === 'bodyweight') {
      return line(`${sets} · ${formatAddedLoad(best.addedKg, units, 'bodyweight')} × ${best.reps}`, `${sets}, best ${spokenAddedLoad(best.addedKg, units)} for ${plural(best.reps, 'rep')}`);
    }
    if (best?.kind === 'load') return line(`${sets} · ${formatLoad(best.loadKg, units)} × ${best.reps}`, `${sets}, best ${spokenLoad(best.loadKg, units)} for ${plural(best.reps, 'rep')}`);
    return line(sets);
  });
}
