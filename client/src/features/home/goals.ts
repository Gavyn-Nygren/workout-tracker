// Goal rules live in src/data/goals.ts; this keeps Home's imports working.
import { goalStatus, type GoalInput, type GoalStatus } from '@/data/goals';
import type { Goal } from '@/data/types';

export * from '@/data/goals';

export type GoalWithStatus = { goal: Goal; progress: GoalStatus };

/**
 * Every goal with its status, split for Home: in progress or reached in the last 7 days (Goals),
 * and reached 7 or more days ago (Completed goals, newest first).
 */
export function homeGoals(goals: Goal[], input: GoalInput): { all: GoalWithStatus[]; active: GoalWithStatus[]; completed: GoalWithStatus[] } {
  const all = goals.map((goal) => ({ goal, progress: goalStatus(goal, input) }));
  return {
    all,
    active: all.filter((g) => !g.progress.archived),
    completed: all.filter((g) => g.progress.archived).sort((a, b) => (b.progress.reachedDate ?? '').localeCompare(a.progress.reachedDate ?? '')),
  };
}
