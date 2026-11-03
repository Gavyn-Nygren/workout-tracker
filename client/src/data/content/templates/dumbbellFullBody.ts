import type { StarterTemplate } from '../../types';
import { ex, rr, single, superset, version, versions, warmups, weekly, working, workout } from './helpers';

/**
 * 2. Dumbbell Full Body (G3.13 catalog): a pair of dumbbells and a bench. Each day has a squat or
 * lunge, a hinge or hip thrust, a press and a pull: a row on days 1 and 2, a pullover and a reverse
 * fly on day 3. Supersets of opposing muscles keep it near 45 minutes. Light dumbbell presses and
 * lunges use 8-15 reps, so the jump to the next dumbbell doesn't stall them.
 * Weekly, 3 days (Mon 1, Wed 2, Fri 3) or 2 days (Mon 1, Thu 2).
 */

const dumbbell1 = workout('tw_dbf_1', 'Dumbbell 1', [
  single(ex('ex_goblet_squat', [warmups([8]), working(3, [8, 12])], { rule: rr(5) })),
  superset(120, ex('ex_db_bench_press', working(3, [8, 12]), { rule: rr(5) }), ex('ex_db_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_db_rdl', working(3, [8, 12]), { rule: rr(5) })),
  superset(60, ex('ex_lateral_raise', working(2, [10, 20]), { rule: rr(5) }), ex('ex_db_curl', working(2, [10, 20]), { rule: rr(5) })),
]);

const dumbbell2 = workout('tw_dbf_2', 'Dumbbell 2', [
  single(ex('ex_reverse_lunge', working(3, [8, 15]), { rule: rr(5) })),
  superset(120, ex('ex_db_shoulder_press', working(3, [8, 15]), { rule: rr(5) }), ex('ex_chest_supported_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_hip_thrust_db', working(3, [10, 15]), { rule: rr(5) })),
  superset(60, ex('ex_db_overhead_extension', working(2, [10, 15]), { rule: rr(5) }), ex('ex_dead_bug', working(2, [8, 10]))),
]);

const dumbbell3 = workout('tw_dbf_3', 'Dumbbell 3', [
  single(ex('ex_bulgarian_split_squat', working(3, [8, 15]), { rule: rr(5) })),
  superset(120, ex('ex_incline_db_press', working(3, [8, 12]), { rule: rr(5) }), ex('ex_db_pullover', working(3, [10, 15]), { rule: rr(5) })),
  single(ex('ex_db_deadlift', working(3, [8, 12]), { rule: rr(5) })),
  superset(60, ex('ex_hammer_curl', working(2, [10, 20]), { rule: rr(5) }), ex('ex_reverse_fly', working(2, [10, 20]), { rule: rr(5) })),
]);

export const dumbbellFullBody: StarterTemplate = {
  id: 'tpl_dumbbell_full_body',
  name: 'Dumbbell Full Body',
  category: 'gym',
  level: 'beginner',
  levels: ['beginner', 'intermediate'],
  goals: ['general', 'muscle', 'strength'],
  description: 'Full-body workouts with a pair of dumbbells and a bench, for home or a small gym.',
  equipment: ['dumbbell'],
  alsoNeeds: ['bench'],
  ...versions(version(3, weekly({ mon: dumbbell1, wed: dumbbell2, fri: dumbbell3 })), version(2, weekly({ mon: dumbbell1, thu: dumbbell2 }))),
  workouts: [dumbbell1, dumbbell2, dumbbell3],
};
