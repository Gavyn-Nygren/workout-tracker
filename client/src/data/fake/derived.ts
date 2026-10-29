import { addDays, fromISODate } from '../dates';
import { lbToKg } from '../units';
import type { Goal, ISODate } from '../types';

export { deriveBadges } from '../badges';
export { derivePersonalRecords } from '../records';
export { deriveStreak } from '../progress';

/** 9 am local on a day, as an ISO timestamp: before that day's sample workouts (5:30 pm). */
function morningOf(date: ISODate): string {
  const d = fromISODate(date);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Sample goals, set relative to `today` so each shows its state whichever day the sample is loaded
 * (the history is relative too; tests/sampleGoals.test.ts):
 * - Bench: a lift goal with a deadline, behind pace (190 when set 4 weeks ago, 200 now, 225 to go).
 * - Weekly: 5 a week for 8 weeks, set 3 weeks ago; on track. It sets the streak target since then;
 *   earlier weeks needed what the plans scheduled.
 * - Bodyweight: reached two days ago by the newest weigh-in, so it's on Home with a check.
 * - Overhead press: reached 8 to 14 days ago, so it's in Completed goals.
 * - Squat depth: a form goal partway there, no deadline.
 */
export function fakeGoals(today: ISODate): Goal[] {
  const set = (daysAgo: number) => {
    const stamp = morningOf(addDays(today, -daysAgo));
    return { createdAt: stamp, updatedAt: stamp };
  };
  return [
    { id: 'goal_bench', title: 'Bench 225 × 5', type: 'lift', exerciseId: 'ex_bench_press', target: { kind: 'load_reps', loadKg: lbToKg(225), reps: 5 }, deadline: addDays(today, 28), ...set(28) },
    { id: 'goal_frequency', title: 'Train 5× per week', type: 'frequency', workoutsPerWeek: 5, deadline: addDays(today, 56 - 21), ...set(21) },
    { id: 'goal_bodyweight', title: 'Reach 181 lb', type: 'bodyweight', targetKg: lbToKg(181), startKg: lbToKg(182.9), deadline: addDays(today, 30 - 20), ...set(20) },
    { id: 'goal_ohp', title: 'Overhead Press 115 × 6', type: 'lift', exerciseId: 'ex_overhead_press', target: { kind: 'load_reps', loadKg: lbToKg(115), reps: 6 }, ...set(35) },
    { id: 'goal_squat_depth', title: 'Squat depth: 70° knee angle', type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg: 70, startDeg: 83, ...set(42) },
  ];
}
