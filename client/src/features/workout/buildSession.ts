import type { Exercise, LoggedSet, PlannedExercise, PlanWorkout, Preferences, RepTarget, WorkoutSession } from '@/data/types';
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
  const { units, roundingIncrements } = input.preferences;
  const increment = (exercise?.equipment && roundingIncrements[exercise.equipment]) || 5;
  const round = (kg: number) => roundLoadKg(kg, units, increment);
  const isBodyweight = exercise?.isBodyweight ?? false;

  const last = lastEntryFor(planned.exerciseId, input.history);
  const lastWorking = (last?.sets ?? []).filter((s) => s.completedAt && (s.kind === 'normal' || s.kind === 'assisted'));
  const lastDrop = last?.sets.find((s) => s.kind === 'drop' && s.completedAt);
  const loadOf = (s: LoggedSet) => (isBodyweight ? (s.addedLoadKg ?? 0) : (s.loadKg ?? 0));

  let baseKg = lastWorking.length ? Math.max(...lastWorking.map(loadOf)) : 0;
  const rule = planned.progression;
  if (rule?.type === 'rep_range' && lastWorking.length && lastWorking.every((s) => (s.reps ?? 0) >= (range(s.target?.targetReps)?.max ?? Infinity))) {
    baseKg += rule.incrementKg;
  }
  baseKg = round(baseKg);

  let workingIndex = 0;
  return planned.sets.map((target) => {
    const set: LoggedSet = { id: newId('set'), kind: target.kind, modifiers: [...target.modifiers], target, tempo: target.tempo };
    const reps = range(target.targetReps);

    if (target.kind === 'warmup') return { ...set, loadKg: target.targetLoadKg ?? round(baseKg * 0.5), reps: reps?.max };
    if (target.kind === 'timed_hold') return { ...set, durationSec: target.targetDurationSec };
    if (target.kind === 'drop') {
      return { ...set, loadKg: lastDrop?.loadKg ?? round(baseKg * 0.7), reps: reps?.max };
    }

    const lastReps = lastWorking[workingIndex++]?.reps;
    const prefilledReps = reps ? Math.min(reps.max, Math.max(reps.min, lastReps ?? reps.min)) : lastReps;
    const loadKg = target.targetLoadKg ?? baseKg;
    return isBodyweight
      ? { ...set, addedLoadKg: loadKg > 0 ? loadKg : undefined, reps: prefilledReps }
      : { ...set, loadKg: loadKg > 0 ? loadKg : undefined, reps: prefilledReps };
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
