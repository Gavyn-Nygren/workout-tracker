import type { StarterTemplate } from '../../types';
import { ex, hold, superset, version, versions, weekly, working, workout } from './helpers';

/**
 * 3. Home Bodyweight Starter (G3.13 catalog): push, pull and legs every session with no weights,
 * all in supersets so a workout fits in about 30 minutes. Weekly, 3 days (Mon A, Wed B, Fri C) or
 * 2 days (Mon A, Thu B). No progression rules anywhere (a rep-range rule on bodyweight would
 * suggest added weight); the notes say how to make a move harder.
 */

const INCLINE_PUSH_UP = 'Hands on a table or counter. Use a lower surface as it gets easier. At 3×15, move to Push-Up.';
const INVERTED_ROW = 'Under a sturdy table or a low bar. Bend your knees to make it easier, straighten them to make it harder.';
const PIKE_PUSH_UP =
  'Hips high, head toward the floor between your hands. Too hard? Put your hands on a stair or sturdy step. At 3×12, put your feet on it instead.';
const AIR_SQUAT = 'At 3×20, take three seconds on the way down.';
const PUSH_UP = "Can't do 3 yet? Put your hands on a table. At 3×12, take three seconds on the way down.";

const invertedRow = ex('ex_inverted_row', working(3, [5, 12]), { notes: INVERTED_ROW });

const homeA = workout('tw_hbs_a', 'Home A', [
  superset(90, ex('ex_incline_push_up', working(3, [6, 15]), { notes: INCLINE_PUSH_UP }), invertedRow),
  superset(90, ex('ex_bodyweight_squat', working(3, [12, 20]), { notes: AIR_SQUAT }), ex('ex_glute_bridge_bw', working(3, [12, 20]), { notes: 'At 3×20, do them one leg at a time.' })),
  superset(60, ex('ex_plank', hold(2, 30)), ex('ex_dead_bug', working(2, [8, 10]))),
]);

const homeB = workout('tw_hbs_b', 'Home B', [
  superset(90, ex('ex_pike_push_up', working(3, [3, 12]), { notes: PIKE_PUSH_UP }), invertedRow),
  superset(90, ex('ex_reverse_lunge_bw', working(3, [8, 12]), { notes: 'At 3×12, take three seconds on the way down.' }), ex('ex_calf_raise_bw', working(3, [12, 20]), { notes: 'At 3×20, do them one leg at a time.' })),
  superset(60, ex('ex_side_plank', hold(2, 30)), ex('ex_bird_dog', working(2, [8, 10]))),
]);

const homeC = workout('tw_hbs_c', 'Home C', [
  superset(90, ex('ex_push_up', working(3, [3, 12]), { notes: PUSH_UP }), invertedRow),
  superset(90, ex('ex_split_squat_bw', working(3, [8, 12]), { notes: 'At 3×12, pause for two seconds at the bottom.' }), ex('ex_single_leg_hip_thrust', working(3, [8, 12]), { notes: 'At 3×12, pause for two seconds at the top.' })),
  superset(60, ex('ex_hollow_hold', hold(2, 20)), ex('ex_lying_leg_raise', working(2, [8, 12]), { notes: 'At 2×12, lower your legs more slowly.' })),
]);

export const bodyweightStarter: StarterTemplate = {
  id: 'tpl_bodyweight_starter',
  name: 'Home Bodyweight Starter',
  category: 'bodyweight',
  level: 'beginner',
  levels: ['beginner'],
  goals: ['general', 'strength', 'muscle'],
  description: 'Short full-body workouts at home with no weights. Get more reps, then move to a harder version.',
  equipment: ['bodyweight'],
  alsoNeeds: ['low_bar'],
  ...versions(version(3, weekly({ mon: homeA, wed: homeB, fri: homeC })), version(2, weekly({ mon: homeA, thu: homeB }))),
  workouts: [homeA, homeB, homeC],
};
