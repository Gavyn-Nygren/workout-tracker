import type { StarterTemplate } from '../../types';
import { ex, rr, single, superset, version, versions, warmups, weekly, working, workout } from './helpers';

/**
 * 6. Upper / Lower Builder (G3.13 catalog; keeps the stand-in's id tpl_upper_lower, which the
 * sample plan points at). Weekly, 4 days: Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B.
 * Heavy compound work first, then 8-20 rep work; every second exposure is a different exercise.
 */

const PULL_UP_NOTE = 'Fewer than 5? Use the assisted pull-up machine or a band until you get there. At 3×10, hold a dumbbell between your feet.';

const upperA = workout('tw_ulb_upper_a', 'Upper A', [
  single(ex('ex_bench_press', [warmups([8, 3]), working(3, [5, 8])], { rule: rr(5) })),
  single(ex('ex_barbell_row', working(3, [6, 10]), { rule: rr(5) })),
  superset(90, ex('ex_db_shoulder_press', working(3, [8, 12]), { rule: rr(5) }), ex('ex_lat_pulldown', working(3, [8, 12]), { rule: rr(5) })),
  superset(75, ex('ex_cable_curl', working(3, [10, 15]), { rule: rr(5) }), ex('ex_rope_pushdown', working(3, [10, 15]), { rule: rr(5) })),
]);

const lowerA = workout('tw_ulb_lower_a', 'Lower A', [
  single(ex('ex_back_squat', [warmups([8, 3]), working(3, [5, 8])], { rule: rr(10) })),
  single(ex('ex_rdl', working(3, [6, 10]), { rule: rr(10) })),
  single(ex('ex_leg_press', working(2, [10, 15]), { rule: rr(10) })),
  superset(90, ex('ex_seated_leg_curl', working(3, [10, 15]), { rule: rr(5) }), ex('ex_standing_calf_raise', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_hanging_knee_raise', working(2, [10, 15]))),
]);

const upperB = workout('tw_ulb_upper_b', 'Upper B', [
  single(ex('ex_incline_db_press', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_pull_up', working(3, [5, 10]), { notes: PULL_UP_NOTE })),
  single(ex('ex_seated_cable_row', working(3, [10, 12]), { rule: rr(5) })),
  superset(75, ex('ex_pec_deck', working(3, [12, 15]), { rule: rr(5) }), ex('ex_reverse_pec_deck', working(3, [12, 20]), { rule: rr(5) })),
  superset(75, ex('ex_cable_lateral_raise', working(3, [12, 20]), { rule: rr(5) }), ex('ex_overhead_cable_extension', working(3, [10, 15]), { rule: rr(5) })),
]);

const lowerB = workout('tw_ulb_lower_b', 'Lower B', [
  single(ex('ex_deadlift', [warmups([5, 3]), working(3, [3, 5])], { rule: rr(10) })),
  single(ex('ex_bulgarian_split_squat', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_leg_extension', working(3, [10, 15]), { rule: rr(5) })),
  single(ex('ex_lying_leg_curl', working(2, [10, 15]), { rule: rr(5) })),
  superset(90, ex('ex_seated_calf_raise', working(3, [10, 15]), { rule: rr(5) }), ex('ex_cable_crunch', working(3, [10, 15]), { rule: rr(5) })),
]);

export const upperLowerBuilder: StarterTemplate = {
  id: 'tpl_upper_lower',
  name: 'Upper / Lower Builder',
  category: 'gym',
  level: 'intermediate',
  levels: ['intermediate', 'advanced'],
  goals: ['strength', 'muscle', 'general'],
  description: 'Upper and lower body on alternate days: heavy compound lifts first, then higher-rep work for size.',
  equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
  alsoNeeds: ['rack', 'bench', 'pull_up_bar'],
  ...versions(version(4, weekly({ mon: upperA, tue: lowerA, thu: upperB, fri: lowerB }))),
  workouts: [upperA, lowerA, upperB, lowerB],
};
