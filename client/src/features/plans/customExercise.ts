import type { Equipment, Exercise, ID, MuscleGroup } from '@/data/types';
import { newId } from '@/lib/id';

/** What the custom exercise form holds. */
export type CustomExerciseFields = {
  name: string;
  baseId?: ID;
  equipment?: Equipment;
  muscles: MuscleGroup[];
  category: Exercise['category'];
  isBodyweight: boolean;
  instructions: string;
  mediaUrl: string;
};

/**
 * The custom exercise the form saves (spec 2.6), new or replacing `existing`. The linked built-in
 * `base` fills in muscles left blank and passes on form analysis, and an assisted machine's sets
 * start as assisted while the exercise counts bodyweight.
 */
export function customExercise(fields: CustomExerciseFields, base: Exercise | undefined, existing: Exercise | undefined, now: string): Exercise {
  return {
    id: existing?.id ?? newId('ex'),
    name: fields.name.trim(),
    source: 'custom',
    baseMovementId: fields.baseId,
    equipment: fields.equipment,
    primaryMuscles: fields.muscles.length ? fields.muscles : (base?.primaryMuscles ?? []),
    category: fields.category,
    isBodyweight: fields.isBodyweight,
    isAssisted: (fields.isBodyweight && base?.isAssisted) || undefined,
    // Inherits form analysis from the linked built-in movement.
    formAnalysis: base?.formAnalysis,
    instructions: fields.instructions.trim() || undefined,
    mediaUrl: fields.mediaUrl.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
