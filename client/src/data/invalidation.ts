// Which cached reads each write makes stale. Reads never go stale on their own (staleTime is
// Infinity), so invalidating here is the only way a screen recalculates. Kept free of React so the
// rules can be unit-tested (tests/invalidation.test.ts).
import type { DataRepository } from './repository';
import type { ISODate } from './types';

/** The first part of every query key in hooks.ts, one per kind of read. */
export type QueryRoot =
  | 'preferences'
  | 'exercises'
  | 'plans'
  | 'planVersions'
  | 'planShifts'
  | 'templates'
  | 'occurrences'
  | 'sessions'
  | 'bodyweight'
  | 'personalRecords'
  | 'goals'
  | 'badges'
  | 'streak'
  | 'formReports'
  | 'recordings';

/** How a repository write is named; every other method is a read. */
export const WRITE_NAME = /^(save|delete|update|push|undo)/;

/** Every repository write. A new write fails the typecheck until it has an entry below. */
export type Mutation = Extract<keyof DataRepository, `save${string}` | `delete${string}` | `update${string}` | `push${string}` | `undo${string}`>;

/** Reads derived from logged workouts: records, streak weeks, and badges. */
const DERIVED_FROM_WORKOUTS = ['personalRecords', 'streak', 'badges'] as const satisfies readonly QueryRoot[];

/** Plan edits rebuild the plan's upcoming calendar. */
const PLAN_READS = ['plans', 'planVersions', 'occurrences'] as const satisfies readonly QueryRoot[];

/** The goal's weekly target sets the streak, and the streak earns badges. */
const GOAL_READS = ['goals', 'streak', 'badges'] as const satisfies readonly QueryRoot[];

export const INVALIDATES: Record<Mutation, readonly QueryRoot[]> = {
  // Saving also links the scheduled workout to the session.
  saveSession: ['sessions', 'occurrences', ...DERIVED_FROM_WORKOUTS],
  // Deleting frees the scheduled workout and takes the workout's form recordings and reports with it.
  deleteSession: ['sessions', 'occurrences', ...DERIVED_FROM_WORKOUTS, 'formReports', 'recordings'],
  updatePlanWorkout: PLAN_READS,
  savePlan: PLAN_READS,
  deletePlan: [...PLAN_READS, 'planShifts'],
  // A push forward (and its undo) moves the plan's unstarted workouts.
  pushPlanForward: ['occurrences', 'planShifts'],
  undoPlanShift: ['occurrences', 'planShifts'],
  // Records read the exercise's bodyweight setting, and badges count its volume.
  saveExercise: ['exercises', ...DERIVED_FROM_WORKOUTS],
  saveGoal: GOAL_READS,
  deleteGoal: GOAL_READS,
  // Sets keep the bodyweight snapshot taken when they were done, so a weigh-in never changes records.
  saveBodyweight: ['bodyweight'],
  deleteBodyweight: ['bodyweight'],
  deleteRecordingVideo: ['formReports', 'recordings'],
  // The set loses its link to the recording, and the first analysis earns a badge.
  deleteFormReport: ['formReports', 'recordings', 'sessions', 'badges'],
  // The week-start setting decides which workouts share a streak week.
  savePreferences: ['preferences', 'streak', 'badges'],
};

/** The slice of TanStack Query's client used here, so tests can pass a stand-in. */
export type Invalidator = {
  invalidateQueries(filters: { queryKey: readonly unknown[] }): Promise<void>;
};

/** Marks every query under these keys stale; the ones on screen refetch. */
export function invalidateKeys(client: Invalidator, keys: readonly QueryRoot[]): Promise<void[]> {
  return Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** Refreshes what a successful write made stale. */
export function invalidateAfter(client: Invalidator, mutation: Mutation): Promise<void[]> {
  return invalidateKeys(client, INVALIDATES[mutation]);
}

/** Reads that depend on today's date, so they go stale when the day changes even with no write. */
export const DATE_DEPENDENT: readonly QueryRoot[] = ['streak', 'badges', 'occurrences'];

/** Milliseconds until a second past the next local midnight, when "today" changes. */
export function msUntilTomorrow(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * What to refresh when the app comes back to the foreground, or at midnight: the date-dependent
 * reads if the day changed since the last check (either way, so a time-zone change counts too),
 * otherwise nothing.
 */
export function staleOnForeground(lastCheckedDay: ISODate, today: ISODate): readonly QueryRoot[] {
  return lastCheckedDay === today ? [] : DATE_DEPENDENT;
}
