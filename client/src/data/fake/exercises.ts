import type { Equipment, Exercise, FormMovementFamily, MuscleGroup } from '../types';

const STAMP = '2026-08-01T12:00:00.000Z';

function ex(
  id: string,
  name: string,
  equipment: Equipment,
  category: Exercise['category'],
  primaryMuscles: MuscleGroup[],
  extra: Partial<Pick<Exercise, 'secondaryMuscles' | 'isBodyweight' | 'aliases' | 'baseMovementId' | 'source'>> & {
    form?: FormMovementFamily;
  } = {},
): Exercise {
  return {
    id,
    name,
    source: extra.source ?? 'builtin',
    baseMovementId: extra.baseMovementId,
    equipment,
    category,
    primaryMuscles,
    secondaryMuscles: extra.secondaryMuscles,
    isBodyweight: extra.isBodyweight ?? false,
    formAnalysis: extra.form,
    aliases: extra.aliases,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

export const fakeExercises: Exercise[] = [
  // Squats
  ex('ex_back_squat', 'Back Squat', 'barbell', 'compound', ['quads', 'glutes'], { secondaryMuscles: ['adductors', 'core'], form: 'squat', aliases: ['Squat'] }),
  ex('ex_front_squat', 'Front Squat', 'barbell', 'compound', ['quads'], { secondaryMuscles: ['glutes', 'core'], form: 'squat' }),
  ex('ex_goblet_squat', 'Goblet Squat', 'dumbbell', 'compound', ['quads', 'glutes'], { form: 'squat' }),
  // Lunges
  ex('ex_bulgarian_split_squat', 'Bulgarian Split Squat', 'dumbbell', 'compound', ['quads', 'glutes'], { form: 'lunge', aliases: ['BSS', 'Rear-Foot Elevated Split Squat'] }),
  ex('ex_reverse_lunge', 'Reverse Lunge', 'dumbbell', 'compound', ['quads', 'glutes'], { form: 'lunge' }),
  // Hinges
  ex('ex_deadlift', 'Deadlift', 'barbell', 'compound', ['hamstrings', 'glutes', 'back'], { secondaryMuscles: ['traps', 'forearms'], form: 'deadlift', aliases: ['Conventional Deadlift'] }),
  ex('ex_rdl', 'Romanian Deadlift', 'barbell', 'compound', ['hamstrings', 'glutes'], { form: 'deadlift', aliases: ['RDL'] }),
  ex('ex_trap_bar_deadlift', 'Trap Bar Deadlift', 'barbell', 'compound', ['quads', 'glutes', 'hamstrings'], { form: 'deadlift', aliases: ['Hex Bar Deadlift'] }),
  ex('ex_hip_thrust', 'Hip Thrust', 'barbell', 'compound', ['glutes'], { secondaryMuscles: ['hamstrings'] }),
  // Machines, legs
  ex('ex_leg_press', 'Leg Press', 'machine', 'compound', ['quads', 'glutes']),
  ex('ex_leg_extension', 'Leg Extension', 'machine', 'isolation', ['quads']),
  ex('ex_lying_leg_curl', 'Lying Leg Curl', 'machine', 'isolation', ['hamstrings']),
  // Calves
  ex('ex_standing_calf_raise', 'Standing Calf Raise', 'machine', 'isolation', ['calves'], { form: 'calf_raise' }),
  ex('ex_seated_calf_raise', 'Seated Calf Raise', 'machine', 'isolation', ['calves'], { form: 'calf_raise' }),
  // Push
  ex('ex_bench_press', 'Bench Press', 'barbell', 'compound', ['chest', 'triceps'], { secondaryMuscles: ['shoulders'], aliases: ['Flat Bench'] }),
  ex('ex_incline_db_press', 'Incline Dumbbell Press', 'dumbbell', 'compound', ['chest', 'shoulders']),
  ex('ex_overhead_press', 'Overhead Press', 'barbell', 'compound', ['shoulders', 'triceps'], { aliases: ['OHP', 'Military Press'] }),
  ex('ex_dips', 'Dips', 'bodyweight', 'compound', ['chest', 'triceps'], { isBodyweight: true }),
  ex('ex_push_up', 'Push-Up', 'bodyweight', 'compound', ['chest', 'triceps'], { isBodyweight: true }),
  ex('ex_lateral_raise', 'Lateral Raise', 'dumbbell', 'isolation', ['shoulders']),
  ex('ex_cable_fly', 'Cable Fly', 'cable', 'isolation', ['chest']),
  ex('ex_triceps_pushdown', 'Triceps Pushdown', 'cable', 'isolation', ['triceps']),
  // Pull
  ex('ex_pull_up', 'Pull-Up', 'bodyweight', 'compound', ['lats', 'biceps'], { isBodyweight: true }),
  ex('ex_assisted_pull_up', 'Assisted Pull-Up', 'machine', 'compound', ['lats', 'biceps'], { isBodyweight: true }),
  ex('ex_barbell_row', 'Barbell Row', 'barbell', 'compound', ['back', 'lats'], { secondaryMuscles: ['biceps'] }),
  ex('ex_lat_pulldown', 'Lat Pulldown', 'cable', 'compound', ['lats'], { secondaryMuscles: ['biceps'] }),
  ex('ex_seated_cable_row', 'Seated Cable Row', 'cable', 'compound', ['back', 'lats']),
  ex('ex_face_pull', 'Face Pull', 'cable', 'isolation', ['shoulders', 'traps']),
  ex('ex_db_curl', 'Dumbbell Curl', 'dumbbell', 'isolation', ['biceps']),
  ex('ex_hammer_curl', 'Hammer Curl', 'dumbbell', 'isolation', ['biceps', 'forearms']),
  // Core
  ex('ex_plank', 'Plank', 'bodyweight', 'isolation', ['core'], { isBodyweight: true }),
  ex('ex_hanging_leg_raise', 'Hanging Leg Raise', 'bodyweight', 'isolation', ['core'], { isBodyweight: true }),
  ex('ex_cable_crunch', 'Cable Crunch', 'cable', 'isolation', ['core']),
  // A custom exercise linked to a built-in base movement.
  ex('ex_custom_ssb_squat', 'My Safety Bar Squat', 'barbell', 'compound', ['quads', 'glutes'], {
    source: 'custom',
    baseMovementId: 'ex_back_squat',
    form: 'squat',
  }),
];
