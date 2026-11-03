import type { StarterTemplate } from '../../types';
import { ex, fixed, hold, rr, single, superset, version, versions, warmups, working, workout } from './helpers';

/**
 * 5. Full-Range Strength (G3.13 catalog): eight weeks of slow, deep lower-body work with a push
 * and a pull every session. Fixed, 3 days (Mon A, Wed B, Fri C) or 2 days (Mon A, Thu B).
 * Bodyweight moves and holds carry no rule; their notes say how to make them harder.
 */

const fullRangeA = workout('tw_frs_a', 'Full Range A', [
  single(
    ex('ex_goblet_squat', [warmups([8]), working(3, [8, 12], { tempo: '3-2-1-0' })], {
      rule: rr(5),
      notes: 'Go as deep as you can control. A small plate under your heels is fine.',
    }),
  ),
  single(ex('ex_db_rdl', working(3, [8, 12], { tempo: '3-1-1-0' }), { rule: rr(5) })),
  superset(
    90,
    ex('ex_push_up', working(3, [5, 15]), { notes: 'Fewer than 5? Put your hands on a bench. At 3×15, take three seconds on the way down.' }),
    ex('ex_chest_supported_row', working(3, [8, 12]), { rule: rr(5) }),
  ),
  single(ex('ex_calf_raise_bw', working(2, [12, 20], { tempo: '2-2-1-1' }), { notes: 'At 2×20, hold a dumbbell.' })),
]);

const fullRangeB = workout('tw_frs_b', 'Full Range B', [
  single(
    ex('ex_split_squat', working(3, [8, 15], { tempo: '3-1-1-0' }), {
      rule: rr(5),
      notes: 'Let the front knee move forward as you lower.',
    }),
  ),
  single(
    ex('ex_cossack_squat', working(2, [6, 8]), {
      notes: 'Sit as low as you can control onto one leg, with the other leg straight. At 2×8, hold a dumbbell at your chest.',
    }),
  ),
  superset(90, ex('ex_db_shoulder_press', working(3, [8, 15]), { rule: rr(5) }), ex('ex_reverse_fly', working(3, [10, 20]), { rule: rr(5) })),
  superset(
    60,
    ex('ex_nordic_curl', working(2, [3, 5]), {
      notes: 'Anchor your heels under something sturdy. Lower as slowly as you can, then push back up with your hands.',
    }),
    ex('ex_side_plank', hold(2, 30)),
  ),
]);

const fullRangeC = workout('tw_frs_c', 'Full Range C', [
  single(ex('ex_step_up', working(2, [8, 15]), { rule: rr(5), notes: 'Use a step height you can control on the way down.' })),
  single(ex('ex_single_leg_rdl', working(2, [8, 12]), { rule: rr(5) })),
  superset(90, ex('ex_db_bench_press', working(3, [8, 12]), { rule: rr(5) }), ex('ex_db_row', working(3, [8, 12]), { rule: rr(5) })),
  superset(
    60,
    ex('ex_tibialis_raise', working(2, [15, 25])),
    ex('ex_deep_squat_hold', hold(2, 45), { notes: 'Sit into the bottom of a squat and stay there. Hold a door frame if you need to.' }),
  ),
]);

export const fullRangeStrength: StarterTemplate = {
  id: 'tpl_full_range_strength',
  name: 'Full-Range Strength',
  category: 'atg',
  level: 'beginner',
  levels: ['beginner', 'intermediate'],
  goals: ['mobility', 'general'],
  description: 'Eight weeks of slow, deep squats, split squats and hinges, plus upper-body pressing and rows.',
  equipment: ['dumbbell'],
  alsoNeeds: ['bench', 'box'],
  durationWeeks: 8,
  ...versions(
    version(3, fixed(8, { mon: fullRangeA, wed: fullRangeB, fri: fullRangeC })),
    version(2, fixed(8, { mon: fullRangeA, thu: fullRangeB })),
  ),
  workouts: [fullRangeA, fullRangeB, fullRangeC],
};
