import { addDays, startOfWeek } from './dates';
import { weeklyGoalTarget, type WeeklyReachedDates } from './goals';
import type { Goal, ISODate, ScheduledOccurrence, StreakTargetSource, Weekday, WorkoutSession } from './types';

// Weekly streak targets (spec 2.5; G3.10, "What's planned that week"). Pure, so the repository and
// the sample data count the same way. Freezing finished weeks is the repository's job.

/** A week's streak target, where it came from, and how many workouts the plans scheduled that week. */
export type WeekTarget = { target: number; source: StreakTargetSource; planned: number };

/** A week's target as deriveStreak reads it: `frozen` when it's the stored one for a finished week. */
export type WeekTargetLookup = (weekStart: ISODate) => WeekTarget & { frozen: boolean };

/**
 * The target for a week with `planned` scheduled workouts: the weekly goal's workouts per week if
 * there is one; otherwise what the plans scheduled; otherwise (no plan, or between programs) 1.
 */
export function targetFor(goalTarget: number | undefined, planned: number): WeekTarget {
  if (goalTarget !== undefined && goalTarget > 0) return { target: Math.max(1, Math.round(goalTarget)), source: 'goal', planned };
  if (planned > 0) return { target: planned, source: 'plan', planned };
  return { target: 1, source: 'minimum', planned };
}

/**
 * Scheduled workouts per week, keyed by the week's first day. Pass the stored occurrences (any
 * plan, on their dates after pushes, deleted ones left out); done, missed, and upcoming all count.
 */
export function plannedPerWeek(occurrences: Iterable<Pick<ScheduledOccurrence, 'scheduledDate'>>, weekStartsOn: Weekday): Map<ISODate, number> {
  const counts = new Map<ISODate, number>();
  for (const { scheduledDate } of occurrences) {
    const week = startOfWeek(scheduledDate, weekStartsOn);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}

/** The target for the week starting `weekStart` (a first day under `weekStartsOn`). */
export function weekTarget(
  goalTarget: number | undefined,
  occurrences: Iterable<Pick<ScheduledOccurrence, 'scheduledDate'>>,
  weekStartsOn: Weekday,
  weekStart: ISODate,
): WeekTarget {
  return targetFor(goalTarget, plannedPerWeek(occurrences, weekStartsOn).get(weekStart) ?? 0);
}

/** Every week's target computed now, nothing frozen: for the sample dataset and tests. */
export function liveWeekTargets(
  goalTarget: number | undefined,
  occurrences: Iterable<Pick<ScheduledOccurrence, 'scheduledDate'>>,
  weekStartsOn: Weekday,
): WeekTargetLookup {
  const planned = plannedPerWeek(occurrences, weekStartsOn);
  return (weekStart) => ({ ...targetFor(goalTarget, planned.get(weekStart) ?? 0), frozen: false });
}

/** The same target every week (tests, and callers with a single number). Counts as a goal. */
export function flatWeekTargets(target: number): WeekTargetLookup {
  return () => ({ target: Math.max(1, Math.round(target)), source: 'goal', planned: 0, frozen: false });
}

/** What every week's target is worked out from. */
export type WeekTargetHistory = {
  goals: Goal[];
  /** A weekly goal with a deadline stops setting the target once it's archived, which these decide. */
  sessions: WorkoutSession[];
  /** Stored occurrences, as for plannedPerWeek. */
  occurrences: Iterable<Pick<ScheduledOccurrence, 'scheduledDate'>>;
  weekStartsOn: Weekday;
  today: ISODate;
};

/**
 * Every week's target as things stand now, nothing frozen. A week's weekly goal is the one that was
 * active as the week ended (this week: today), per goals.ts weeklyGoalTarget: created by then and
 * not archived by then. The repository freezes finished weeks with this; the sample data uses it.
 */
export function weekTargetsFromHistory(input: WeekTargetHistory): WeekTargetLookup {
  const planned = plannedPerWeek(input.occurrences, input.weekStartsOn);
  // Each weekly goal's reached date is worked out once, however many weeks are asked about.
  const reachedDates: WeeklyReachedDates = new Map();
  return (weekStart) => {
    const end = addDays(weekStart, 6);
    const goalTarget = weeklyGoalTarget(input.goals, { sessions: input.sessions, today: end < input.today ? end : input.today }, reachedDates);
    return { ...targetFor(goalTarget, planned.get(weekStart) ?? 0), frozen: false };
  };
}
