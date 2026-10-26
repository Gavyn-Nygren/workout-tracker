import type { Exercise, LoggedSet, PlannedExercise, PlanWorkout, Preferences, RepTarget, WorkoutSession } from '@/data/types';
import { kindForExercise, loadField, roundingIncrementFor } from '@/data/logging';
import { roundLoadKg } from '@/data/units';
import { newId } from '@/lib/id';
import type { DayItem } from '../today/agenda';
import { lastEntryFor } from './history';

type BuildInput = {
  item: DayItem;
  /** Completed sessions, newest first. */
  history: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  preferences: Pick<Preferences, 'units' | 'roundingIncrements'>;
  repeatOf?: WorkoutSession;
};

function range(target: RepTarget | undefined): { min: number; max: number } | undefined {
  if (target === undefined) return undefined;
  return typeof target === 'number' ? { min: target, max: target } : target;
}

/**
 * Pre-fills each planned set (spec 2.6): the plan's target load, or else last time's top load,
 * plus the progression rule's increment when every working set hit the top of the rep range.
 * Reps start from last time's reps for that set, kept inside the target range.
 */
function prefillSets(planned: PlannedExercise, exercise: Exercise | undefined, input: BuildInput): LoggedSet[] {
  const { units } = input.preferences;
  const increment = roundingIncrementFor(exercise?.equipment, input.preferences);
  const round = (kg: number) => roundLoadKg(kg, units, increment);

  const last = lastEntryFor(planned.exerciseId, input.history);
  const lastWorking = (last?.sets ?? []).filter((s) => s.completedAt && (s.kind === 'normal' || s.kind === 'assisted'));
  const lastDrop = last?.sets.find((s) => s.kind === 'drop' && s.completedAt);
  // Each set's weight lives in its own field: load, load added to bodyweight, or assistance.
  const loadOf = (s: LoggedSet) => s[loadField(exercise, s.kind)] ?? 0;

  let baseKg = lastWorking.length ? Math.max(...lastWorking.map(loadOf)) : 0;
  const rule = planned.progression;
  if (rule?.type === 'rep_range' && !last?.skipped && lastWorking.length && lastWorking.every((s) => (s.reps ?? 0) >= (range(s.target?.targetReps)?.max ?? Infinity))) {
    baseKg += rule.incrementKg;
  }
  baseKg = round(baseKg);

  let workingIndex = 0;
  return planned.sets.map((target) => {
    const kind = kindForExercise(target.kind, exercise);
    const set: LoggedSet = { id: newId('set'), kind, modifiers: [...target.modifiers], target, tempo: target.tempo };
    const reps = range(target.targetReps);
    const field = loadField(exercise, kind);
    const withLoad = (kg: number | undefined): LoggedSet => ({ ...set, [field]: kg !== undefined && kg > 0 ? kg : undefined });

    if (kind === 'timed_hold') return { ...set, durationSec: target.targetDurationSec };
    // Bodyweight warm-ups start with no added weight; others at about half the working weight.
    if (kind === 'warmup') return { ...withLoad(field === 'loadKg' ? (target.targetLoadKg ?? round(baseKg * 0.5)) : undefined), reps: reps?.max };
    if (kind === 'drop') return { ...withLoad(lastDrop?.[field] ?? round(baseKg * 0.7)), reps: reps?.max };

    const lastReps = lastWorking[workingIndex++]?.reps;
    const prefilledReps = reps ? Math.min(reps.max, Math.max(reps.min, lastReps ?? reps.min)) : lastReps;
    return { ...withLoad(target.targetLoadKg ?? baseKg), reps: prefilledReps };
  });
}

export function sessionFromPlan(input: BuildInput): WorkoutSession {
  const { item, exercisesById, repeatOf } = input;
  const workout: PlanWorkout | undefined = item.workout;
  const now = new Date().toISOString();
  const blocks = (workout?.blocks ?? []).map((block) => ({
    id: newId('block'),
    type: block.type,
    roundRestSec: block.roundRestSec,
    transitionRestSec: block.transitionRestSec,
    exercises: block.exercises.map((planned) => ({
      id: newId('entry'),
      exerciseId: planned.exerciseId,
      plannedExerciseId: planned.id,
      skipped: false,
      notes: planned.notes,
      sets: prefillSets(planned, exercisesById.get(planned.exerciseId), input),
    })),
  }));

  return {
    id: newId('sess'),
    name: item.name,
    occurrenceId: repeatOf ? undefined : item.occurrence?.id,
    planId: item.plan?.id,
    planWorkoutId: workout?.id,
    status: 'in_progress',
    scheduledDate: repeatOf ? undefined : item.occurrence?.scheduledDate,
    startedAt: now,
    repeatedFromSessionId: repeatOf?.id,
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

/** Reopen edits the same session (spec 2.5); stats recalculate when it's finished again. */
export function sessionForReopen(session: WorkoutSession): WorkoutSession {
  return { ...session, status: 'in_progress', completion: undefined, updatedAt: new Date().toISOString() };
}
