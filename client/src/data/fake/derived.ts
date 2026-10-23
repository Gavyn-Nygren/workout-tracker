import { addDays } from '../dates';
import { lbToKg } from '../units';
import type { Goal, ISODate } from '../types';

export { derivePersonalRecords } from '../records';
export { deriveBadges, deriveStreak } from '../progress';

const STAMP = '2026-08-01T12:00:00.000Z';

export function fakeGoals(today: ISODate): Goal[] {
  return [
    { id: 'goal_bench', title: 'Bench 225 × 5', type: 'lift', exerciseId: 'ex_bench_press', target: { kind: 'load_reps', loadKg: lbToKg(225), reps: 5 }, deadline: addDays(today, 56), createdAt: STAMP, updatedAt: STAMP },
    { id: 'goal_frequency', title: 'Train 4× per week', type: 'frequency', workoutsPerWeek: 4, createdAt: STAMP, updatedAt: STAMP },
    { id: 'goal_bodyweight', title: 'Reach 180 lb', type: 'bodyweight', targetKg: lbToKg(180), startKg: lbToKg(186), deadline: addDays(today, 30), createdAt: STAMP, updatedAt: STAMP },
    { id: 'goal_squat_depth', title: 'Squat depth: 70° knee angle', type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg: 70, startDeg: 83, createdAt: STAMP, updatedAt: STAMP },
  ];
}
