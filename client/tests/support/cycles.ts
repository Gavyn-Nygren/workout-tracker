import type { PlanSchedule } from '../../src/data/types';

/** A rotating schedule from its days' workouts, in order: cycle(['a'], ['b'], []) is A, B, rest. */
export const cycle = (...days: string[][]): Extract<PlanSchedule, { type: 'rotating' }> => ({ type: 'rotating', steps: days.map((workoutIds) => ({ workoutIds })) });
