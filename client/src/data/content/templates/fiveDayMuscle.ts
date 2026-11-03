import type { StarterTemplate } from '../../types';
import { ex, rr, single, superset, version, versions, warmups, weekly, working, workout } from './helpers';

/**
 * 7. Five-Day Muscle Builder (G3.13 catalog). Weekly, 5 days: Mon Upper Body, Tue Lower Body,
 * Thu Push, Fri Pull, Sat Legs. Every major muscle, biceps and side delts included, is trained
 * twice a week, each time with a different exercise.
 */

const upperBody = workout('tw_fdm_upper', 'Upper Body', [
  single(ex('ex_bench_press', [warmups([8, 3]), working(3, [6, 10])], { rule: rr(5) })),
  single(ex('ex_chest_supported_row', working(3, [8, 12]), { rule: rr(5) })),
  superset(90, ex('ex_machine_shoulder_press', working(3, [8, 12]), { rule: rr(5) }), ex('ex_lat_pulldown', working(3, [8, 12]), { rule: rr(5) })),
  superset(75, ex('ex_cable_curl', working(2, [10, 15]), { rule: rr(5) }), ex('ex_rope_pushdown', working(2, [10, 15]), { rule: rr(5) })),
  single(ex('ex_lateral_raise', working(3, [10, 20]), { rule: rr(5) })),
]);

const lowerBody = workout('tw_fdm_lower', 'Lower Body', [
  single(ex('ex_back_squat', [warmups([8, 3]), working(3, [6, 10])], { rule: rr(10) })),
  single(ex('ex_rdl', working(3, [8, 10]), { rule: rr(10) })),
  superset(90, ex('ex_leg_extension', working(3, [10, 15]), { rule: rr(5) }), ex('ex_seated_leg_curl', working(3, [10, 15]), { rule: rr(5) })),
  single(ex('ex_standing_calf_raise', working(4, [8, 12]), { rule: rr(5) })),
]);

const push = workout('tw_fdm_push', 'Push', [
  single(ex('ex_incline_db_press', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_chest_press_machine', working(3, [10, 12]), { rule: rr(5) })),
  superset(75, ex('ex_cable_fly', working(3, [12, 15]), { rule: rr(5) }), ex('ex_cable_lateral_raise', working(3, [12, 20]), { rule: rr(5) })),
  single(ex('ex_overhead_cable_extension', working(3, [10, 15]), { rule: rr(5) })),
]);

const pull = workout('tw_fdm_pull', 'Pull', [
  // The range starts at 6 here, so the note's threshold does too.
  single(ex('ex_pull_up', working(3, [6, 10]), { notes: 'Fewer than 6? Use the assisted pull-up machine or a band until you get there. At 3×10, hold a dumbbell between your feet.' })),
  single(ex('ex_seated_cable_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_straight_arm_pulldown', working(2, [12, 15]), { rule: rr(5) })),
  superset(75, ex('ex_reverse_pec_deck', working(3, [12, 20]), { rule: rr(5) }), ex('ex_incline_db_curl', working(3, [10, 15]), { rule: rr(5) })),
  single(ex('ex_hammer_curl', working(2, [10, 20]), { rule: rr(5) })),
]);

const legs = workout('tw_fdm_legs', 'Legs', [
  single(ex('ex_hack_squat', [warmups([10]), working(3, [8, 12])], { rule: rr(10) })),
  single(ex('ex_hip_thrust', working(3, [8, 12]), { rule: rr(10) })),
  single(ex('ex_bulgarian_split_squat', working(2, [8, 12]), { rule: rr(5) })),
  single(ex('ex_lying_leg_curl', working(3, [10, 15]), { rule: rr(5) })),
  superset(90, ex('ex_seated_calf_raise', working(3, [10, 15]), { rule: rr(5) }), ex('ex_cable_crunch', working(3, [10, 15]), { rule: rr(5) })),
]);

export const fiveDayMuscle: StarterTemplate = {
  id: 'tpl_five_day_muscle',
  name: 'Five-Day Muscle Builder',
  category: 'bodybuilding',
  level: 'intermediate',
  levels: ['intermediate', 'advanced'],
  goals: ['muscle', 'general'],
  description: 'Upper and lower days, then push, pull and legs, so each muscle is trained twice a week.',
  equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
  alsoNeeds: ['rack', 'bench', 'pull_up_bar'],
  ...versions(version(5, weekly({ mon: upperBody, tue: lowerBody, thu: push, fri: pull, sat: legs }))),
  workouts: [upperBody, lowerBody, push, pull, legs],
};
