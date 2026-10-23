import type { Exercise, PlannedBlock, PlannedExercise, PlanWorkout, SetPrescription, WorkoutSession } from '@/data/types';
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
