import type { ID, StarterTemplate } from '../../types';
import { ex, fixed, hold, pct, rr, single, superset, version, versions, warmups, working, workout } from './helpers';

/**
 * 8. Big Three Block (G3.13 catalog). Fixed, 6 weeks: 4 days (Mon Heavy Squat, Tue Heavy Bench,
 * Thu Heavy Deadlift, Fri Volume Day) or 3 days (Mon, Wed, Fri, without the Volume Day).
 * Weekly % only on the three heavy lifts, with no effort target on those sets; everything else
 * uses rep ranges. Lower body runs on Monday and Thursday only, and the second squat is a pause
 * squat, so a light day never pre-fills the heavy day's weight.
 */

const HEAVY_NOTE =
  'Week 1: a weight you could lift about 10 times, even if the app fills in more. It goes up about 2.5% each week, so the first weeks feel easy. ' +
  'Do as many reps in the range as you cleanly can. If 2.5% is less than your smallest plate step, the app adds one step. ' +
  'Add more warm-up sets if you need them.';

const PULL_UP_NOTE = 'Fewer than 5? Use a band, or jump up and lower slowly, until you get there. At 3×10, hold a dumbbell between your feet.';

/** A heavy lift: its warm-ups, then 3×3-5 with no effort target, up 2.5% a week. */
const heavy = (exerciseId: ID, warmupReps: readonly [number, number]) =>
  single(ex(exerciseId, [warmups(warmupReps), working(3, [3, 5], { rir: null })], { rule: pct(2.5), notes: HEAVY_NOTE }));

const heavySquat = workout('tw_btb_squat', 'Heavy Squat', [
  heavy('ex_back_squat', [5, 3]),
  single(ex('ex_pause_bench', [warmups([8, 3]), working(3, [5, 8])], { rule: rr(5) })),
  single(ex('ex_barbell_row', working(3, [6, 10]), { rule: rr(5) })),
  superset(75, ex('ex_hanging_knee_raise', working(2, [10, 15])), ex('ex_reverse_fly', working(2, [10, 20]), { rule: rr(5) })),
]);

const heavyBench = workout('tw_btb_bench', 'Heavy Bench', [
  heavy('ex_bench_press', [8, 3]),
  single(ex('ex_overhead_press', [warmups([5]), working(3, [5, 8])], { rule: rr(5) })),
  single(ex('ex_pull_up', working(3, [5, 10]), { notes: PULL_UP_NOTE })),
  superset(75, ex('ex_db_overhead_extension', working(2, [10, 15]), { rule: rr(5) }), ex('ex_db_curl', working(2, [10, 20]), { rule: rr(5) })),
]);

const heavyDeadlift = workout('tw_btb_deadlift', 'Heavy Deadlift', [
  heavy('ex_deadlift', [5, 3]),
  single(ex('ex_pause_squat', [warmups([5]), working(3, [4, 6], { tempo: '2-2-1-0' })], { rule: rr(5) })),
  single(ex('ex_chest_supported_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_side_plank', hold(2, 30))),
]);

const volumeDay = workout('tw_btb_volume', 'Volume Day', [
  single(ex('ex_close_grip_bench', [warmups([8]), working(3, [6, 8])], { rule: rr(5) })),
  single(ex('ex_db_row', working(3, [8, 12]), { rule: rr(5) })),
  single(ex('ex_incline_db_press', working(2, [8, 12]), { rule: rr(5) })),
  superset(60, ex('ex_lateral_raise', working(2, [10, 20]), { rule: rr(5) }), ex('ex_dead_bug', working(2, [8, 10]))),
]);

export const bigThreeBlock: StarterTemplate = {
  id: 'tpl_big_three_block',
  name: 'Big Three Block',
  category: 'powerlifting',
  level: 'intermediate',
  levels: ['intermediate', 'advanced'],
  goals: ['strength'],
  description: 'Six weeks of squat, bench press and deadlift. The weight rises about 2.5% a week as reps come down.',
  equipment: ['barbell', 'dumbbell'],
  alsoNeeds: ['rack', 'bench', 'pull_up_bar'],
  durationWeeks: 6,
  ...versions(
    version(4, fixed(6, { mon: heavySquat, tue: heavyBench, thu: heavyDeadlift, fri: volumeDay })),
    version(3, fixed(6, { mon: heavySquat, wed: heavyBench, fri: heavyDeadlift })),
  ),
  workouts: [heavySquat, heavyBench, heavyDeadlift, volumeDay],
};
