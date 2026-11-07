import type { Exercise, Plan, PlannedBlock, PlannedExercise, PlanWorkout, ScheduledOccurrence, SetPrescription, WorkoutSession } from '@/data/types';
import { newId } from '@/lib/id';

export type PlanDiff = {
  /** Human-readable changes, e.g. "Added Face Pull". Empty when the workout matched the plan. */
  changes: string[];
  /** The plan workout rebuilt from this session's structure, ready to save back to the plan. */
  blocks: PlannedBlock[];
};

/**
 * Compares a finished session with its plan workout (spec 2.6: offer to save mid-workout changes
 * back to the plan). Skipping an exercise isn't a change; adding, swapping, removing, changing the
 * set count, and reordering are.
 */
export function diffAgainstPlan(session: WorkoutSession, workout: PlanWorkout, exercisesById: Map<string, Exercise>): PlanDiff {
  const name = (id: string) => exercisesById.get(id)?.name ?? 'Exercise';
  const planned = workout.blocks.flatMap((b) => b.exercises);
  const plannedById = new Map(planned.map((p) => [p.id, p]));
  const entries = session.blocks.flatMap((b) => b.exercises);
  const changes: string[] = [];

  for (const entry of entries) {
    const plan = entry.plannedExerciseId ? plannedById.get(entry.plannedExerciseId) : undefined;
    if (!plan) {
      changes.push(`Added ${name(entry.exerciseId)}`);
      continue;
    }
    if (plan.exerciseId !== entry.exerciseId) changes.push(`Swapped ${name(plan.exerciseId)} for ${name(entry.exerciseId)}`);
    if (plan.sets.length !== entry.sets.length) changes.push(`${name(entry.exerciseId)}: ${plan.sets.length} → ${entry.sets.length} sets`);
  }
  const kept = new Set(entries.map((e) => e.plannedExerciseId).filter(Boolean));
  for (const plan of planned) if (!kept.has(plan.id)) changes.push(`Removed ${name(plan.exerciseId)}`);

  const planOrder = planned.map((p) => p.id).filter((id) => kept.has(id));
  const sessionOrder = entries.map((e) => e.plannedExerciseId).filter((id): id is string => Boolean(id && plannedById.has(id)));
  if (planOrder.join() !== sessionOrder.join()) changes.push('Reordered exercises');

  const blocks: PlannedBlock[] = session.blocks.map((block) => ({
    id: newId('pb'),
    type: block.type,
    roundRestSec: block.roundRestSec,
    transitionRestSec: block.transitionRestSec,
    exercises: block.exercises.map((entry): PlannedExercise => {
      const plan = entry.plannedExerciseId ? plannedById.get(entry.plannedExerciseId) : undefined;
      if (plan) {
        // Keep the plan's prescriptions; extend with copies of the last one, or trim.
        const sets: SetPrescription[] = entry.sets.map((_, i) => plan.sets[i] ?? plan.sets[plan.sets.length - 1] ?? { kind: 'normal', modifiers: [] });
        return { ...plan, exerciseId: entry.exerciseId, sets };
      }
      // New exercise: prescribe what was done.
      return {
        id: newId('pe'),
        exerciseId: entry.exerciseId,
        notes: entry.notes,
        sets: entry.sets.map((s) => ({ kind: s.kind, modifiers: [...s.modifiers], targetReps: s.reps, targetDurationSec: s.durationSec, tempo: s.tempo })),
      };
    }),
  }));

  return { changes, blocks };
}

/** The "Update your plan?" prompt: the changes, and the plan workout they'd be saved to. */
export type PlanPrompt = PlanDiff & { plan: Plan; workout: PlanWorkout };

/**
 * What the summary offers to save back to the plan, or undefined when there's nothing to offer.
 * A workout is built from the plan version it was scheduled with (spec 2.5), so a missed one done
 * later, or one in progress while the plan was edited, can be older than the plan. The changes are
 * then the edit's, not the workout's, and saving would undo the edit, so it only asks while the
 * plan's workout still matches that version. The version is the one stamped on the session, else
 * its scheduled workout's; without either (a repeat), it's the plan as it is. `occurrences` should
 * include the session's scheduled workout.
 */
export function planPromptFor(
  session: WorkoutSession,
  input: { plans: readonly Plan[]; planVersions: readonly Plan[]; occurrences: readonly ScheduledOccurrence[] },
  exercisesById: Map<string, Exercise>,
): PlanPrompt | undefined {
  const plan = input.plans.find((p) => p.id === session.planId);
  const workout = plan?.workouts.find((w) => w.id === session.planWorkoutId);
  if (!plan || !workout) return undefined;
  const occurrence = session.occurrenceId ? input.occurrences.find((o) => o.id === session.occurrenceId) : undefined;
  const version = session.planVersion ?? occurrence?.planVersion;
  // As the calendar does: a version that wasn't kept means the workout was built from the plan as it is.
  const built = version === undefined || version === plan.version ? plan : (input.planVersions.find((p) => p.id === plan.id && p.version === version) ?? plan);
  const builtWorkout = built.workouts.find((w) => w.id === workout.id);
  if (!builtWorkout || !sameValue(builtWorkout.blocks, workout.blocks)) return undefined;
  const diff = diffAgainstPlan(session, workout, exercisesById);
  return diff.changes.length ? { ...diff, plan, workout } : undefined;
}

/** Deep equality for stored JSON: key order doesn't matter, and an undefined key is a missing one. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => sameValue(x[k], y[k]));
}
