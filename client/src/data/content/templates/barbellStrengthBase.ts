import type { StarterTemplate } from '../../types';
import { ex, fixed, hold, rr, single, version, versions, warmups, working, workout } from './helpers';

/**
 * 4. Barbell Strength Base (G3.13 catalog): twelve weeks to learn the squat, bench press, deadlift
 * and overhead press with rep ranges (double progression). Fixed, 3 days: Mon Squat & Bench,
 * Wed Deadlift & Press, Fri Variation Day. Squat and bench come up twice a week, the second time
 * as a variation (pause squat, close-grip bench), so the lighter day never pre-fills the heavy
 * day's weight. The canonical lift ids keep strength badges counting.
 */

const squatBench = workout('tw_bsb_squat_bench', 'Squat & Bench', [
  single(ex('ex_back_squat', [warmups([8, 3]), working(3, [5, 8])], { rule: rr(10) })),
  single(ex('ex_bench_press', [warmups([8, 3]), working(3, [5, 8])], { rule: rr(5) })),
  single(ex('ex_barbell_row', working(3, [6, 10]), { rule: rr(5) })),
  single(ex('ex_plank', hold(2, 30))),
]);

const deadliftPress = workout('tw_bsb_deadlift_press', 'Deadlift & Press', [
  single(ex('ex_deadlift', [warmups([5, 3]), working(3, [4, 6])], { rule: rr(10) })),
  single(ex('ex_overhead_press', [warmups([5]), working(3, [5, 8])], { rule: rr(5) })),
  single(ex('ex_pendlay_row', working(3, [6, 8]), { rule: rr(5) })),
  single(ex('ex_dead_bug', working(2, [8, 10]))),
]);

// The pause squat opens the day, so it gets the same two warm-ups as Monday's squat.
const variationDay = workout('tw_bsb_variation', 'Variation Day', [
  single(ex('ex_pause_squat', [warmups([8, 3]), working(3, [5, 8], { tempo: '2-2-1-0' })], { rule: rr(5) })),
  single(ex('ex_close_grip_bench', working(3, [6, 10]), { rule: rr(5) })),
  single(ex('ex_rdl', working(3, [6, 10]), { rule: rr(10) })),
  single(ex('ex_side_plank', hold(2, 30))),
]);

export const barbellStrengthBase: StarterTemplate = {
  id: 'tpl_barbell_strength_base',
  name: 'Barbell Strength Base',
  category: 'powerlifting',
  level: 'beginner',
  levels: ['beginner', 'intermediate'],
  goals: ['strength', 'muscle', 'general'],
  description: 'Twelve weeks to learn and build the squat, bench press, deadlift and overhead press.',
  equipment: ['barbell'],
  alsoNeeds: ['rack', 'bench'],
  durationWeeks: 12,
  ...versions(version(3, fixed(12, { mon: squatBench, wed: deadliftPress, fri: variationDay }))),
  workouts: [squatBench, deadliftPress, variationDay],
};
