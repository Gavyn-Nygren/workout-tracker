import type { Exercise, ISODate, LoggedSet, PlannedBlock, PlannedExercise, PlanShift, PlanWorkout, ProgressionSuggestion, SessionExercise, SetPrescription, SuggestedSet, WorkoutSession } from '@/data/types';
import { completionStamp, todayISO } from '@/data/dates';
import { kindForExercise, loadField, roundingIncrementFor, type LoadField } from '@/data/logging';
import { roundLoadKg } from '@/data/units';
import { newId } from '@/lib/id';
import { diffAgainstPlan } from '../summary/planDiff';
import type { DayItem } from '../today/agenda';
import { slotHistory, type LastTime } from './history';
import { isProgressionKind, progressionFor, repRange, topWorkingKg, type ProgressionPreferences } from './progression';
import { completionOf } from './workoutReducer';

type BuildInput = {
  item: DayItem;
  /** Completed sessions, newest first. */
  history: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  /** Units and rounding for the weights; the week start for weekly-% rules (Monday if left out). */
  preferences: ProgressionPreferences;
  repeatOf?: WorkoutSession;
  /** The day the workout is done, for weekly-% rules. Today if left out. */
  today?: ISODate;
  /** Pushes forward, which move a program's weeks. */
  shifts?: readonly PlanShift[];
};

/**
 * Pre-fills each planned set (spec 2.6): the plan's target load, or else the progression rule's
 * suggestion (progression.ts), which without a rule is last time's top load. Last time is this
 * plan workout's last time, or the exercise's anywhere if it's never been done here (history.ts
 * slotHistory). Reps start from last time's reps for that set, kept inside the target range, or
 * at the bottom of the range after the rule changed the weight. When the rule changed anything,
 * the entry keeps the suggestion, with each changed set's values without it, for the reason line
 * and "Use last time's weight".
 */
function prefillEntry(planned: PlannedExercise, exercise: Exercise | undefined, past: readonly LastTime[], input: BuildInput): Pick<SessionExercise, 'sets' | 'suggestion'> {
  const { units } = input.preferences;
  const increment = roundingIncrementFor(exercise?.equipment, input.preferences);
  const round = (kg: number) => roundLoadKg(kg, units, increment);
  const progression = progressionFor({
    planned,
    exercise,
    history: past,
    preferences: input.preferences,
    plan: input.item.plan,
    // A repeat isn't the calendar workout, so it's in the week the program is in today.
    occurrence: input.repeatOf ? undefined : input.item.occurrence,
    shifts: input.shifts,
    today: input.today ?? todayISO(),
  });

  const last = past[0]?.entry;
  const lastWorking = (last?.sets ?? []).filter((s) => s.completedAt && isProgressionKind(s.kind));
  const lastDrop = last?.sets.find((s) => s.kind === 'drop' && s.completedAt);
  // A working set planned in another field than the first one (an Assisted set among plain
  // pull-ups, say) starts from last time's top in its own field, without the rule.
  const workingKg = (field: LoadField, baseKg: number) => (field === progression.field ? baseKg : round((last && topWorkingKg(last, exercise, field)) ?? 0));

  /** One planned set's starting weight and reps, from a working weight. */
  const fill = (target: SetPrescription, set: LoggedSet, workingIndex: number, baseKg: number, resetReps: boolean): Pick<LoggedSet, 'reps' | 'durationSec'> & { kg?: number } => {
    const reps = repRange(target.targetReps);
    const field = loadField(exercise, set.kind);
    const positive = (kg: number | undefined) => (kg !== undefined && kg > 0 ? kg : undefined);
    if (set.kind === 'timed_hold') return { durationSec: target.targetDurationSec };
    // Bodyweight warm-ups start with no added weight; others at about half the working weight.
    if (set.kind === 'warmup') return { kg: positive(field === 'loadKg' ? (target.targetLoadKg ?? round(baseKg * 0.5)) : undefined), reps: reps?.max };
    // Drop sets repeat last time's drop, or start at about 70% of the working weight.
    if (set.kind === 'drop') return { kg: positive(lastDrop?.[field] ?? (field === progression.field ? round(baseKg * 0.7) : undefined)), reps: reps?.max };
    const lastReps = lastWorking[workingIndex]?.reps;
    const kept = reps ? Math.min(reps.max, Math.max(reps.min, lastReps ?? reps.min)) : lastReps;
    // Reps start over only where the rule moved the weight, not on a set in another field.
    const restart = resetReps && field === progression.field && reps;
    return { kg: positive(target.targetLoadKg ?? workingKg(field, baseKg)), reps: restart ? reps.min : kept };
  };

  const changed: SuggestedSet[] = [];
  let workingIndex = 0;
  const sets = planned.sets.map((target) => {
    const kind = kindForExercise(target.kind, exercise);
    const set: LoggedSet = { id: newId('set'), kind, modifiers: [...target.modifiers], target, tempo: target.tempo };
    const index = isProgressionKind(kind) ? workingIndex++ : -1;
    const suggested = fill(target, set, index, progression.suggestedKg, progression.repsReset);
    const without = fill(target, set, index, progression.baseKg, false);
    if (suggested.kg !== without.kg || suggested.reps !== without.reps) {
      // Only the values there are, so it reads back the same from storage.
      const values = { kg: suggested.kg, reps: suggested.reps, lastKg: without.kg, lastReps: without.reps };
      changed.push({ setId: set.id, kind, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) });
    }
    const { kg, ...rest } = suggested;
    return kind === 'timed_hold' ? { ...set, ...rest } : { ...set, ...rest, [loadField(exercise, kind)]: kg };
  });

  const suggestion: ProgressionSuggestion | undefined = progression.suggestion && { ...progression.suggestion, sets: changed };
  return suggestion ? { sets, suggestion } : { sets };
}

/**
 * What a repeat does (spec 2.5: the same exercises): the source workout's, in its order, with its
 * swaps and the ones added during it. One done from the plan keeps the plan's prescription and
 * rule; one added during it is prescribed what was done (planDiff.ts).
 */
function repeatedBlocks(source: WorkoutSession, workout: PlanWorkout | undefined, exercisesById: Map<string, Exercise>): PlannedBlock[] {
  return diffAgainstPlan(source, workout ?? { id: '', name: source.name, blocks: [] }, exercisesById).blocks;
}

export function sessionFromPlan(input: BuildInput): WorkoutSession {
  const { item, exercisesById, repeatOf } = input;
  const workout: PlanWorkout | undefined = item.workout;
  const now = new Date().toISOString();
  const planId = repeatOf ? repeatOf.planId : item.plan?.id;
  const planWorkoutId = repeatOf ? repeatOf.planWorkoutId : workout?.id;
  // Which of the workout's entries for the same exercise each planned exercise is.
  const seen = new Map<string, number>();
  const plannedIds = (workout?.blocks ?? []).flatMap((b) => b.exercises.map((p) => p.id));
  const fromPlan = new Set(plannedIds);
  const blocks = (repeatOf ? repeatedBlocks(repeatOf, workout, exercisesById) : (workout?.blocks ?? [])).map((block) => ({
    id: newId('block'),
    type: block.type,
    roundRestSec: block.roundRestSec,
    transitionRestSec: block.transitionRestSec,
    exercises: block.exercises.map((planned): SessionExercise => {
      const nth = seen.get(planned.exerciseId) ?? 0;
      seen.set(planned.exerciseId, nth + 1);
      // A repeat's exercise added during the source workout isn't one of the plan's.
      const plannedExerciseId = fromPlan.has(planned.id) ? planned.id : undefined;
      const past = slotHistory(input.history, { exerciseId: planned.exerciseId, planId, planWorkoutId, plannedExerciseId, nth, plannedIds });
      return {
        id: newId('entry'),
        exerciseId: planned.exerciseId,
        plannedExerciseId,
        skipped: false,
        notes: planned.notes,
        ...prefillEntry(planned, exercisesById.get(planned.exerciseId), past, input),
      };
    }),
  }));

  return {
    id: newId('sess'),
    name: repeatOf?.name ?? item.name,
    occurrenceId: repeatOf ? undefined : item.occurrence?.id,
    planId,
    planWorkoutId,
    status: 'in_progress',
    scheduledDate: repeatOf ? undefined : item.occurrence?.scheduledDate,
    startedAt: now,
    repeatedFromSessionId: repeatOf?.id,
    planVersion: item.plan?.version,
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Reopen edits the same session (spec 2.5); stats recalculate when it's finished again. Until then
 * it keeps a copy of itself as it was, which everything else reads (reopen.ts).
 */
export function sessionForReopen(session: WorkoutSession): WorkoutSession {
  const { beforeReopen: _, ...before } = session;
  return { ...before, status: 'in_progress', completion: undefined, beforeReopen: before, updatedAt: new Date().toISOString() };
}

/**
 * What Finish saves: completed, full or partial, on the local date at Finish. A reopened workout
 * keeps its original moment and day (spec 2.5) and drops its copy from before the reopen.
 */
export function sessionForFinish(session: WorkoutSession, reopened: boolean, now: Date): WorkoutSession {
  const { beforeReopen: _, ...finished } = session;
  return {
    ...finished,
    status: 'completed',
    completion: completionOf(session),
    ...completionStamp(now, reopened ? session : undefined),
    updatedAt: now.toISOString(),
  };
}
