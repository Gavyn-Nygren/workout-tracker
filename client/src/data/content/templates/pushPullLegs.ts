import type { StarterTemplate } from '../../types';
import { drop, ex, rr, single, superset, version, versions, warmups, weekly, working, workout } from './helpers';

/**
 * 12. Push Pull Legs: each workout twice a week over 6 days, for experienced lifters who want more
 * volume. Whole workouts repeat, so each keeps its own history. Rep ranges throughout: no top
 * sets for as many reps as possible, and no session-by-session jumps.
 */

const push = workout('tw_ppl_push', 'Push', [
  single(ex('ex_bench_press', [warmups([8, 3]), working(4, [6, 10])], { rule: rr(5) })),
  single(ex('ex_incline_db_press', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_machine_shoulder_press', working(3, [8, 12]), { rule: rr(5) })),
  superset(75, ex('ex_cable_lateral_raise', working(3, [12, 20]), { rule: rr(5) }), ex('ex_overhead_cable_extension', working(3, [10, 15]), { rule: rr(5) })),
  single(ex('ex_pec_deck', [working(2, [12, 15]), drop(12)], { rule: rr(5) })),
]);

const pull = workout('tw_ppl_pull', 'Pull', [
  single(ex('ex_pull_up', working(3, [6, 10]), { notes: 'Fewer than 6? Use the assisted pull-up machine or a band until you get there. At 3×10, hold a dumbbell between your feet.' })),
  single(ex('ex_barbell_row', [warmups([8]), working(3, [6, 10])], { rule: rr(5) })),
  single(ex('ex_seated_cable_row', working(3, [10, 12]), { rule: rr(5) })),
  superset(75, ex('ex_reverse_pec_deck', working(3, [12, 20]), { rule: rr(5) }), ex('ex_cable_curl', working(3, [10, 15]), { rule: rr(5) })),
  single(ex('ex_hammer_curl', working(2, [10, 20]), { rule: rr(5) })),
]);

const legs = workout('tw_ppl_legs', 'Legs', [
  single(ex('ex_back_squat', [warmups([8, 3]), working(4, [5, 8])], { rule: rr(10) })),
  single(ex('ex_rdl', working(3, [8, 10]), { rule: rr(10) })),
  single(ex('ex_leg_press', working(3, [10, 15]), { rule: rr(10) })),
  superset(90, ex('ex_seated_leg_curl', working(3, [10, 15]), { rule: rr(5) }), ex('ex_standing_calf_raise', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_hanging_leg_raise', working(2, [10, 15]))),
]);

export const pushPullLegs: StarterTemplate = {
  id: 'tpl_ppl',
  name: 'Push Pull Legs',
  category: 'bodybuilding',
  level: 'advanced',
  levels: ['intermediate', 'advanced'],
  goals: ['muscle'],
  description: 'Push, pull and legs, each twice a week, for experienced lifters who want more volume.',
  equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
  alsoNeeds: ['rack', 'bench', 'pull_up_bar'],
  ...versions(version(6, weekly({ mon: push, tue: pull, wed: legs, thu: push, fri: pull, sat: legs }))),
  workouts: [push, pull, legs],
};
