import type { ID, PlannedBlock, PlannedExercise, PlanSchedule, PlanWorkout, SetPrescription, StarterTemplate } from '../../src/data/types';
import { lbToKg } from '../../src/data/units';

/**
 * Two of the stand-in starter templates the app shipped before the real catalog (G3.13), frozen
 * for the G3.8 rest-cleanup tests in planRests.test.ts. Plans copied from them before G3.8 are
 * what db/blankPlanRests.ts cleans, and LEGACY_TEMPLATE_RESTS_SEC lists their exercises' old
 * rests. Moved unchanged from src/data/fake/plans.ts (only `levels` and `goals` were added, which
 * StarterTemplate now requires). Never edit them, and never ship them: tpl_calisthenics is retired.
 *
 * tpl_calisthenics keeps the cycle shape of its time, `sequence` (one workout or 'rest' a day): it is
 * what plans copied from it stored. So these are typed as LegacyStarterTemplate, not StarterTemplate,
 * and a test reads the cycle as steps with stepsFromSequence, as the startup upgrade does
 * (db/upgradeCycleSteps.ts).
 */

/** A rotating cycle as it was stored before a day could hold several workouts. */
export type LegacyCycle = { type: 'rotating'; sequence: (ID | 'rest')[] };

/** A template of that time: its schedule may be a cycle in the old shape. */
export type LegacyStarterTemplate = Omit<StarterTemplate, 'schedule'> & { schedule: PlanSchedule | LegacyCycle };

function working(count: number, reps: SetPrescription['targetReps'], extra: Partial<SetPrescription> = {}): SetPrescription[] {
  return Array.from({ length: count }, () => ({ kind: 'normal' as const, modifiers: [], targetReps: reps, targetRir: 2, ...extra }));
}

function warmups(loadsLb: number[], reps: number): SetPrescription[] {
  return loadsLb.map((lb) => ({ kind: 'warmup' as const, modifiers: [], targetReps: reps, targetLoadKg: lbToKg(lb) }));
}

function single(id: string, exercise: PlannedExercise): PlannedBlock {
  return { id, type: 'single', exercises: [exercise] };
}

const repRange = (incrementLb: number) =>
  ({ type: 'rep_range', incrementKg: lbToKg(incrementLb), onMiss: { type: 'deload', afterConsecutiveMisses: 3, percent: 10 } }) as const;

const pplPush: PlanWorkout = {
  id: 'tw_ppl_push',
  name: 'Push',
  estimatedMinutes: 60,
  blocks: [
    single('tb_push_1', { id: 'tp_push_bench', exerciseId: 'ex_bench_press', sets: [...warmups([95, 135], 5), ...working(4, { min: 6, max: 10 })], progression: repRange(5) }),
    single('tb_push_2', { id: 'tp_push_incline', exerciseId: 'ex_incline_db_press', sets: working(3, { min: 8, max: 12 }) }),
    single('tb_push_3', { id: 'tp_push_ohp', exerciseId: 'ex_overhead_press', sets: working(3, { min: 8, max: 10 }) }),
    {
      id: 'tb_push_4',
      type: 'superset',
      roundRestSec: 75,
      exercises: [
        { id: 'tp_push_lateral', exerciseId: 'ex_lateral_raise', sets: working(3, { min: 12, max: 15 }) },
        { id: 'tp_push_pushdown', exerciseId: 'ex_triceps_pushdown', sets: working(3, { min: 10, max: 15 }) },
      ],
    },
  ],
};

const pplPull: PlanWorkout = {
  id: 'tw_ppl_pull',
  name: 'Pull',
  estimatedMinutes: 60,
  blocks: [
    single('tb_pull_1', { id: 'tp_pull_pullup', exerciseId: 'ex_pull_up', sets: working(4, { min: 6, max: 10 }) }),
    single('tb_pull_2', { id: 'tp_pull_row', exerciseId: 'ex_barbell_row', sets: working(4, { min: 6, max: 10 }), progression: repRange(5) }),
    single('tb_pull_3', { id: 'tp_pull_pulldown', exerciseId: 'ex_lat_pulldown', sets: working(3, { min: 10, max: 12 }) }),
    {
      id: 'tb_pull_4',
      type: 'superset',
      roundRestSec: 75,
      exercises: [
        { id: 'tp_pull_facepull', exerciseId: 'ex_face_pull', sets: working(3, { min: 12, max: 15 }) },
        { id: 'tp_pull_curl', exerciseId: 'ex_db_curl', sets: working(3, { min: 10, max: 12 }) },
      ],
    },
  ],
};

const pplLegs: PlanWorkout = {
  id: 'tw_ppl_legs',
  name: 'Legs',
  estimatedMinutes: 70,
  blocks: [
    single('tb_legs_1', { id: 'tp_legs_squat', exerciseId: 'ex_back_squat', sets: [...warmups([135, 185], 5), ...working(4, { min: 6, max: 10 })], progression: repRange(5) }),
    single('tb_legs_2', { id: 'tp_legs_rdl', exerciseId: 'ex_rdl', sets: working(3, { min: 8, max: 10 }) }),
    single('tb_legs_3', { id: 'tp_legs_press', exerciseId: 'ex_leg_press', sets: working(3, { min: 10, max: 15 }) }),
    single('tb_legs_4', { id: 'tp_legs_curl', exerciseId: 'ex_lying_leg_curl', sets: working(3, { min: 10, max: 15 }) }),
    single('tb_legs_5', { id: 'tp_legs_calf', exerciseId: 'ex_standing_calf_raise', sets: working(4, { min: 10, max: 15 }) }),
  ],
};

const bodyweightA: PlanWorkout = {
  id: 'tw_bw_a',
  name: 'Bodyweight A',
  estimatedMinutes: 35,
  blocks: [
    {
      id: 'tb_bwa_1',
      type: 'circuit',
      roundRestSec: 120,
      transitionRestSec: 20,
      exercises: [
        { id: 'tp_bwa_pushup', exerciseId: 'ex_push_up', sets: working(3, { min: 8, max: 15 }, { modifiers: ['amrap'] }) },
        { id: 'tp_bwa_lunge', exerciseId: 'ex_reverse_lunge', sets: working(3, { min: 10, max: 12 }) },
        { id: 'tp_bwa_plank', exerciseId: 'ex_plank', sets: [1, 2, 3].map(() => ({ kind: 'timed_hold' as const, modifiers: [], targetDurationSec: 30 })) },
      ],
    },
  ],
};

const bodyweightB: PlanWorkout = {
  id: 'tw_bw_b',
  name: 'Bodyweight B',
  estimatedMinutes: 35,
  blocks: [
    single('tb_bwb_1', { id: 'tp_bwb_pullup', exerciseId: 'ex_pull_up', sets: working(3, { min: 3, max: 8 }, { modifiers: ['amrap'] }) }),
    single('tb_bwb_2', { id: 'tp_bwb_dips', exerciseId: 'ex_dips', sets: working(3, { min: 6, max: 12 }) }),
    single('tb_bwb_3', { id: 'tp_bwb_bss', exerciseId: 'ex_bulgarian_split_squat', sets: working(3, { min: 8, max: 12 }) }),
    single('tb_bwb_4', { id: 'tp_bwb_legraise', exerciseId: 'ex_hanging_leg_raise', sets: working(3, { min: 8, max: 12 }) }),
  ],
};

/** The old Push / Pull / Legs (its id now belongs to the catalog's Push Pull Legs). */
export const legacyPpl: StarterTemplate = {
  id: 'tpl_ppl',
  name: 'Push / Pull / Legs',
  category: 'bodybuilding',
  level: 'intermediate',
  levels: ['intermediate'],
  goals: ['muscle'],
  daysPerWeek: 6,
  description: 'High-volume hypertrophy split that trains each muscle twice a week, with supersets to keep sessions near an hour.',
  equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
  schedule: {
    type: 'weekly',
    days: [
      { weekday: 1, workoutIds: ['tw_ppl_push'] },
      { weekday: 2, workoutIds: ['tw_ppl_pull'] },
      { weekday: 3, workoutIds: ['tw_ppl_legs'] },
      { weekday: 4, workoutIds: ['tw_ppl_push'] },
      { weekday: 5, workoutIds: ['tw_ppl_pull'] },
      { weekday: 6, workoutIds: ['tw_ppl_legs'] },
    ],
  },
  workouts: [pplPush, pplPull, pplLegs],
};

/** The old Bodyweight Basics (a rotating cycle; its id is retired). */
export const legacyCalisthenics: LegacyStarterTemplate = {
  id: 'tpl_calisthenics',
  name: 'Bodyweight Basics',
  category: 'bodyweight',
  level: 'beginner',
  levels: ['beginner'],
  goals: ['general'],
  daysPerWeek: 3,
  description: 'Push-ups, pull-ups, lunges, and core on a rotating cycle: train, rest, train, rest. No gym needed.',
  equipment: ['bodyweight'],
  schedule: { type: 'rotating', sequence: ['tw_bw_a', 'rest', 'tw_bw_b', 'rest'] },
  workouts: [bodyweightA, bodyweightB],
};

/** Both frozen stand-ins. */
export const LEGACY_TEMPLATES: readonly LegacyStarterTemplate[] = [legacyPpl, legacyCalisthenics];
