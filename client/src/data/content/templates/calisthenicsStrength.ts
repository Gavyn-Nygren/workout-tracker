import type { StarterTemplate } from '../../types';
import { ex, hold, single, superset, version, versions, weekly, working, workout } from './helpers';

/**
 * 9. Calisthenics Strength: bodyweight upper and lower days on bars, 4 days (3 days drops Lower B,
 * so legs come once a week). No progression rules: bodyweight work has none, and the notes say
 * how to make a move harder.
 */

const NORDIC_NOTE = 'Anchor your heels under something sturdy. Lower as slowly as you can, then push back up with your hands. At 3×6, push back up with less help from your hands.';

const upperA = workout('tw_cal_upper_a', 'Upper A', [
  superset(
    120,
    ex('ex_pull_up', working(4, [5, 10]), { notes: 'At 4×10, wear a loaded backpack, log its weight and start back at 5.' }),
    ex('ex_dips', working(4, [6, 12]), { notes: 'At 4×12, wear a loaded backpack, log its weight and start back at 6.' }),
  ),
  superset(
    90,
    ex('ex_pike_push_up', working(3, [6, 12]), { notes: 'At 3×12, put your feet on a bench.' }),
    ex('ex_hanging_leg_raise', working(3, [8, 12]), { notes: 'At 3×12, move to Toes-to-Bar.' }),
  ),
  single(ex('ex_l_sit', hold(3, 15), { notes: 'On the floor, on two chairs or on the dip bars. Tuck your knees if straight legs are too hard.' })),
]);

const lowerA = workout('tw_cal_lower_a', 'Lower A', [
  single(ex('ex_pistol_squat', working(3, [3, 8]), { notes: 'Hold a door frame until you can do them freely. At 3×8 without support, wear a loaded backpack.' })),
  single(ex('ex_nordic_curl', working(3, [3, 6]), { notes: NORDIC_NOTE })),
  superset(
    90,
    ex('ex_bulgarian_split_squat_bw', working(3, [10, 15]), { notes: 'At 3×15, wear a loaded backpack.' }),
    ex('ex_single_leg_hip_thrust', working(3, [10, 15]), { notes: 'At 3×15, rest a loaded backpack on your hips.' }),
  ),
  single(ex('ex_calf_raise_bw', working(3, [15, 25]), { notes: 'When 25 is easy, do them one leg at a time.' })),
]);

const upperB = workout('tw_cal_upper_b', 'Upper B', [
  superset(
    120,
    ex('ex_chin_up', working(4, [5, 10]), { notes: 'At 4×10, wear a loaded backpack, log its weight and start back at 5.' }),
    ex('ex_decline_push_up', working(4, [8, 15]), { notes: 'Feet on a bench or chair. At 4×15, take three seconds on the way down.' }),
  ),
  superset(
    90,
    ex('ex_inverted_row', working(3, [8, 15]), { notes: 'Feet up on a bench to make it harder.' }),
    ex('ex_diamond_push_up', working(3, [6, 15]), { notes: 'At 3×15, take three seconds on the way down.' }),
  ),
  single(ex('ex_hollow_hold', hold(3, 30))),
]);

const lowerB = workout('tw_cal_lower_b', 'Lower B', [
  single(ex('ex_sissy_squat', working(3, [8, 15]), { notes: 'Hold a post or door frame for balance. At 3×15, take three seconds on the way down.' })),
  single(ex('ex_slider_leg_curl', working(3, [8, 12]), { notes: 'Heels on a towel on a smooth floor. At 3×12, do them one leg at a time.' })),
  single(ex('ex_walking_lunge_bw', working(3, [10, 16]), { notes: 'Count every step. At 3×16, wear a loaded backpack.' })),
  superset(60, ex('ex_copenhagen_plank', hold(2, 20)), ex('ex_tibialis_raise', working(2, [15, 25]), { notes: 'At 2×25, stand on one leg.' })),
]);

export const calisthenicsStrength: StarterTemplate = {
  id: 'tpl_calisthenics_strength',
  name: 'Calisthenics Strength',
  category: 'bodyweight',
  level: 'intermediate',
  levels: ['intermediate', 'advanced'],
  goals: ['strength', 'muscle', 'general'],
  description: 'Bodyweight strength on bars: upper and lower days, three or four days a week.',
  equipment: ['bodyweight'],
  alsoNeeds: ['bench', 'pull_up_bar', 'dip_bars', 'low_bar'],
  ...versions(
    version(4, weekly({ mon: upperA, tue: lowerA, thu: upperB, fri: lowerB })),
    version(3, weekly({ mon: upperA, wed: lowerA, fri: upperB })),
  ),
  workouts: [upperA, lowerA, upperB, lowerB],
};
