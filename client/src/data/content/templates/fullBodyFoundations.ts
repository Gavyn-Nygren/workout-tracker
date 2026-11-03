import type { StarterTemplate } from '../../types';
import { ex, hold, rr, single, superset, version, versions, warmups, weekly, working, workout } from './helpers';

/**
 * 1. Full-Body Foundations (G3.13 catalog): beginner full-body days on machines, cables and
 * dumbbells, a squat, a push and a pull each session, no exercise repeated across days. The hinge
 * (Romanian deadlift on A, hip thrust on C) comes twice a week on 3 days and once on 2, where B's
 * leg curl adds hamstring work. Weekly, 3 days (Mon A, Wed B, Fri C) or 2 days (Mon A, Thu B).
 * Full Body B is the tour's Today art (tutorial.ts TOUR_ART).
 */

const fullBodyA = workout('tw_fbf_a', 'Full Body A', [
  single(ex('ex_goblet_squat', [warmups([8]), working(3, [8, 12])], { rule: rr(5) })),
  single(ex('ex_chest_press_machine', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_lat_pulldown', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_db_rdl', working(2, [8, 12]), { rule: rr(5) })),
  superset(60, ex('ex_lateral_raise', working(2, [10, 20]), { rule: rr(5) }), ex('ex_plank', hold(2, 30))),
]);

const fullBodyB = workout('tw_fbf_b', 'Full Body B', [
  single(ex('ex_leg_press', [warmups([10]), working(3, [10, 15])], { rule: rr(10) })),
  single(ex('ex_seated_cable_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_db_shoulder_press', working(3, [8, 15]), { rule: rr(5) })),
  single(ex('ex_lying_leg_curl', working(2, [10, 15]), { rule: rr(5) })),
  superset(60, ex('ex_db_curl', working(2, [10, 20]), { rule: rr(5) }), ex('ex_triceps_pushdown', working(2, [10, 15]), { rule: rr(5) })),
]);

const fullBodyC = workout('tw_fbf_c', 'Full Body C', [
  single(ex('ex_split_squat', working(3, [8, 15]), { rule: rr(5) })),
  single(ex('ex_db_bench_press', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_db_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_hip_thrust_db', working(2, [10, 15]), { rule: rr(5) })),
  superset(60, ex('ex_face_pull', working(2, [12, 15]), { rule: rr(5) }), ex('ex_dead_bug', working(2, [8, 10]))),
]);

export const fullBodyFoundations: StarterTemplate = {
  id: 'tpl_full_body_foundations',
  name: 'Full-Body Foundations',
  category: 'gym',
  level: 'beginner',
  levels: ['beginner', 'intermediate'],
  goals: ['general', 'muscle', 'strength'],
  description: 'Full-body workouts on machines, cables and dumbbells. Reach the top of each rep range, then add weight.',
  equipment: ['dumbbell', 'machine', 'cable'],
  alsoNeeds: ['bench'],
  ...versions(version(3, weekly({ mon: fullBodyA, wed: fullBodyB, fri: fullBodyC })), version(2, weekly({ mon: fullBodyA, thu: fullBodyB }))),
  workouts: [fullBodyA, fullBodyB, fullBodyC],
};
