import { lbToKg } from '../units';
import type { PlannedBlock, PlannedExercise, Plan, PlanWorkout, SetPrescription } from '../types';

const STAMP = '2026-08-01T12:00:00.000Z';

// The sample plans. The starter templates are real content now, in src/data/content/templates/.
// tpl_upper_lower is still the sample plan's templateId: the catalog kept that id for Upper / Lower
// Builder, so the plan reads "From the Upper / Lower Builder template".
//
// Sample sets leave rest blank, so each exercise rests the way it does anywhere else: the rest
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
    single('pb_lb_2', { id: 'pe_lb_frontsquat', exerciseId: 'ex_front_squat', sets: working(3, { min: 6, max: 8 }), progression: repRange(5) }),
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
