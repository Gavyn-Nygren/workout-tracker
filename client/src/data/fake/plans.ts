import { fixedFromPattern } from '../schedule';
import { lbToKg } from '../units';
import type { PlannedBlock, PlannedExercise, Plan, PlanWorkout, SetPrescription, StarterTemplate } from '../types';

const STAMP = '2026-08-01T12:00:00.000Z';

// Starter sets leave rest blank, so each exercise rests the way it does anywhere else: the rest
// remembered for it, or its type's default from Settings (spec 2.6). Supersets and circuits set
// their own rest after each round. Plans made before G3.8 had a rest on every set; see
// db/blankPlanRests.ts for how those were cleared.

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

// ---------------------------------------------------------------------------
// Plan 1: Upper/Lower, weekly, 4 days

const upperA: PlanWorkout = {
  id: 'pw_upper_a',
  name: 'Upper A',
  estimatedMinutes: 65,
  blocks: [
    single('pb_ua_1', {
      id: 'pe_ua_bench',
      exerciseId: 'ex_bench_press',
      sets: [...warmups([95, 135], 5), ...working(3, { min: 5, max: 8 })],
      progression: repRange(5),
    }),
    single('pb_ua_2', { id: 'pe_ua_row', exerciseId: 'ex_barbell_row', sets: working(3, { min: 6, max: 10 }), progression: repRange(5) }),
    single('pb_ua_3', { id: 'pe_ua_ohp', exerciseId: 'ex_overhead_press', sets: working(3, { min: 6, max: 10 }, { tempo: '2-0-1-0' }) }),
    {
      id: 'pb_ua_4',
      type: 'superset',
      roundRestSec: 90,
      exercises: [
        { id: 'pe_ua_curl', exerciseId: 'ex_db_curl', sets: working(3, { min: 10, max: 12 }) },
        { id: 'pe_ua_pushdown', exerciseId: 'ex_triceps_pushdown', sets: working(3, { min: 10, max: 12 }) },
      ],
    },
  ],
};

const lowerA: PlanWorkout = {
  id: 'pw_lower_a',
  name: 'Lower A',
  estimatedMinutes: 70,
  blocks: [
    single('pb_la_1', {
      id: 'pe_la_squat',
      exerciseId: 'ex_back_squat',
      sets: [...warmups([135, 185], 5), ...working(3, { min: 5, max: 8 })],
      progression: repRange(5),
    }),
    single('pb_la_2', { id: 'pe_la_rdl', exerciseId: 'ex_rdl', sets: working(3, { min: 8, max: 10 }), progression: repRange(10) }),
    single('pb_la_3', { id: 'pe_la_bss', exerciseId: 'ex_bulgarian_split_squat', sets: working(3, { min: 8, max: 12 }) }),
    single('pb_la_4', { id: 'pe_la_curl', exerciseId: 'ex_lying_leg_curl', sets: working(3, { min: 10, max: 15 }) }),
  ],
};

const upperB: PlanWorkout = {
  id: 'pw_upper_b',
  name: 'Upper B',
  estimatedMinutes: 60,
  blocks: [
    single('pb_ub_1', { id: 'pe_ub_pullup', exerciseId: 'ex_pull_up', sets: working(4, { min: 5, max: 8 }) }),
    single('pb_ub_2', { id: 'pe_ub_incline', exerciseId: 'ex_incline_db_press', sets: working(3, { min: 8, max: 12 }), progression: repRange(5) }),
    single('pb_ub_3', { id: 'pe_ub_cablerow', exerciseId: 'ex_seated_cable_row', sets: working(3, { min: 10, max: 12 }) }),
    single('pb_ub_4', {
      id: 'pe_ub_lateral',
      exerciseId: 'ex_lateral_raise',
      sets: [...working(2, { min: 12, max: 15 }), { kind: 'drop', modifiers: ['to_failure'], targetReps: 12 }],
    }),
  ],
};

const lowerB: PlanWorkout = {
  id: 'pw_lower_b',
  name: 'Lower B',
  estimatedMinutes: 65,
  blocks: [
    single('pb_lb_1', {
      id: 'pe_lb_deadlift',
      exerciseId: 'ex_deadlift',
      sets: [...warmups([135, 225], 3), ...working(3, { min: 3, max: 5 })],
      progression: repRange(10),
    }),
    single('pb_lb_2', { id: 'pe_lb_frontsquat', exerciseId: 'ex_front_squat', sets: working(3, { min: 6, max: 8 }) }),
    single('pb_lb_3', { id: 'pe_lb_legpress', exerciseId: 'ex_leg_press', sets: working(3, { min: 10, max: 12 }) }),
    single('pb_lb_4', { id: 'pe_lb_ext', exerciseId: 'ex_leg_extension', sets: working(3, { min: 12, max: 15 }) }),
  ],
};

// ---------------------------------------------------------------------------
// Plan 2: Calves & Core, weekly, shares days with plan 1 (multi-workout days)

const calvesCore: PlanWorkout = {
  id: 'pw_calves_core',
  name: 'Calves & Core',
  estimatedMinutes: 20,
  blocks: [
    single('pb_cc_1', { id: 'pe_cc_standing', exerciseId: 'ex_standing_calf_raise', sets: working(4, { min: 10, max: 15 }, { tempo: '2-2-1-1' }) }),
    {
      id: 'pb_cc_2',
      type: 'circuit',
      roundRestSec: 90,
      transitionRestSec: 15,
      exercises: [
        { id: 'pe_cc_seated', exerciseId: 'ex_seated_calf_raise', sets: working(3, 15) },
        { id: 'pe_cc_legraise', exerciseId: 'ex_hanging_leg_raise', sets: working(3, { min: 8, max: 12 }) },
        { id: 'pe_cc_plank', exerciseId: 'ex_plank', sets: [1, 2, 3].map(() => ({ kind: 'timed_hold' as const, modifiers: [], targetDurationSec: 45 })) },
      ],
    },
  ],
};

export const fakePlans: Plan[] = [
  {
    id: 'plan_upper_lower',
    name: 'Upper / Lower Strength',
    templateId: 'tpl_upper_lower',
    version: 2,
    status: 'active',
    startDate: '2026-08-03',
    schedule: {
      type: 'weekly',
      days: [
        { weekday: 1, workoutIds: ['pw_upper_a'] },
        { weekday: 2, workoutIds: ['pw_lower_a'] },
        { weekday: 4, workoutIds: ['pw_upper_b'] },
        { weekday: 5, workoutIds: ['pw_lower_b'] },
      ],
    },
    workouts: [upperA, lowerA, upperB, lowerB],
    createdAt: STAMP,
    updatedAt: STAMP,
  },
  {
    id: 'plan_calves_core',
    name: 'Calves & Core',
    version: 1,
    status: 'active',
    startDate: '2026-08-03',
    schedule: {
      type: 'weekly',
      days: [
        { weekday: 1, workoutIds: ['pw_calves_core'] },
        { weekday: 4, workoutIds: ['pw_calves_core'] },
        { weekday: 6, workoutIds: ['pw_calves_core'] },
      ],
    },
    workouts: [calvesCore],
    createdAt: STAMP,
    updatedAt: STAMP,
  },
];

// ---------------------------------------------------------------------------
// Starter templates: stand-ins for the AI-drafted catalog (roadmap G3.13). Four carry full
// workouts, one per plan type plus Upper/Lower; the rest are listing-level for UI work.

const percent = (pct: number) => ({ type: 'percent_weekly', percent: pct, onMiss: { type: 'repeat' } }) as const;

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

const foundationsA: PlanWorkout = {
  id: 'tw_found_a',
  name: 'Day A',
  estimatedMinutes: 55,
  blocks: [
    single('tb_fa_1', { id: 'tp_fa_squat', exerciseId: 'ex_back_squat', sets: [...warmups([45, 95, 135], 5), ...working(5, 5)], progression: percent(2.5) }),
    single('tb_fa_2', { id: 'tp_fa_bench', exerciseId: 'ex_bench_press', sets: [...warmups([45, 95], 5), ...working(5, 5)], progression: percent(2.5) }),
    single('tb_fa_3', { id: 'tp_fa_row', exerciseId: 'ex_barbell_row', sets: working(3, 8) }),
  ],
};

const foundationsB: PlanWorkout = {
  id: 'tw_found_b',
  name: 'Day B',
  estimatedMinutes: 55,
  blocks: [
    single('tb_fb_1', { id: 'tp_fb_squat', exerciseId: 'ex_back_squat', sets: [...warmups([45, 95, 135], 5), ...working(3, 5)], progression: percent(2.5) }),
    single('tb_fb_2', { id: 'tp_fb_ohp', exerciseId: 'ex_overhead_press', sets: [...warmups([45], 5), ...working(5, 5)], progression: percent(2.5) }),
    single('tb_fb_3', { id: 'tp_fb_deadlift', exerciseId: 'ex_deadlift', sets: [...warmups([135, 185], 3), ...working(1, 5)], progression: percent(2.5) }),
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

const listing = (
  id: string,
  name: string,
  category: StarterTemplate['category'],
  level: StarterTemplate['level'],
  daysPerWeek: number,
  durationWeeks: number | undefined,
  description: string,
  equipment: StarterTemplate['equipment'],
): StarterTemplate => ({ id, name, category, level, daysPerWeek, durationWeeks, description, equipment, schedule: { type: 'rotating', sequence: [] }, workouts: [] });

export const fakeTemplates: StarterTemplate[] = [
  {
    id: 'tpl_upper_lower',
    name: 'Upper / Lower Strength',
    category: 'gym',
    level: 'intermediate',
    daysPerWeek: 4,
    description: 'Four days alternating upper and lower body, with heavy compounds and rep-range progression.',
    equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
    schedule: fakePlans[0].schedule,
    workouts: [upperA, lowerA, upperB, lowerB],
  },
  {
    id: 'tpl_ppl',
    name: 'Push / Pull / Legs',
    category: 'bodybuilding',
    level: 'intermediate',
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
  },
  {
    id: 'tpl_powerbuilding',
    name: 'Strength Foundations 12-Week',
    category: 'powerlifting',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 12,
    description: 'Twelve weeks of squat, bench, overhead press, and deadlift, adding about 2.5% a week. Alternates two short sessions.',
    equipment: ['barbell'],
    schedule: fixedFromPattern(12, { 1: ['tw_found_a'], 2: [], 3: ['tw_found_b'], 4: [], 5: ['tw_found_a'], 6: [], 7: [] }),
    workouts: [foundationsA, foundationsB],
  },
  {
    id: 'tpl_calisthenics',
    name: 'Bodyweight Basics',
    category: 'bodyweight',
    level: 'beginner',
    daysPerWeek: 3,
    description: 'Push-ups, pull-ups, lunges, and core on a rotating cycle: train, rest, train, rest. No gym needed.',
    equipment: ['bodyweight'],
    schedule: { type: 'rotating', sequence: ['tw_bw_a', 'rest', 'tw_bw_b', 'rest'] },
    workouts: [bodyweightA, bodyweightB],
  },
  listing('tpl_atg', 'Knees-Over-Toes Mobility Strength', 'atg', 'beginner', 3, 8, 'Full range-of-motion lower-body work: split squats, tibialis raises, and deep squats.', ['bodyweight', 'dumbbell']),
  listing('tpl_conditioning', 'Gym Conditioning Circuits', 'crossfit', 'intermediate', 4, undefined, 'Mixed-modal circuits pairing barbell lifts with bodyweight movements.', ['barbell', 'kettlebell', 'bodyweight']),
  listing('tpl_athlete', 'Field Athlete Power', 'athletic', 'intermediate', 3, 10, 'Explosive lower-body strength and single-leg stability for field sports.', ['barbell', 'dumbbell', 'bodyweight']),
];
