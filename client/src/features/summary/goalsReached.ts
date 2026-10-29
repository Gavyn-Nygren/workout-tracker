// Which goals a workout, weigh-in, or form report reached, for "Goal reached" celebrations (G3.10).
// The goal rules live in src/data/goals.ts; this only picks what each moment celebrates.
import { goalStatus, goalsReachedBy, type GoalInput, type GoalSource } from '@/data/goals';
import { daysBetween, localDateOf } from '@/data/dates';
import type { BodyweightEntry, Exercise, FormReport, Goal, ID, ISODate, WorkoutSession } from '@/data/types';
import { plural } from '@/lib/format';

/** Goals `source` reaches in `after` that weren't reached at all in `before`. */
export function goalsNewlyReached(goals: Goal[], source: GoalSource, before: GoalInput, after: GoalInput): Goal[] {
  const reachedBefore = new Set(goals.filter((g) => goalStatus(g, before).reached).map((g) => g.id));
  return goalsReachedBy(goals, source, after).filter((g) => !reachedBefore.has(g.id));
}

// Only workouts reach lift and weekly goals, so that's all a workout's input needs.
const workoutGoals = (goals: Goal[]) => goals.filter((g) => g.type === 'lift' || g.type === 'frequency');
const workoutInput = (sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, today: ISODate): GoalInput => ({
  sessions,
  exercisesById,
  bodyweight: [],
  formReports: [],
  today,
});

/** Goals a finished workout reached: the summary's "Goal reached". */
export function goalsReachedByWorkout(goals: Goal[], sessionId: ID, sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, today: ISODate): Goal[] {
  return goalsReachedBy(workoutGoals(goals), { sessionId }, workoutInput(sessions, exercisesById, today));
}

/**
 * Goals a reopened workout reaches that weren't reached before it was reopened, so finishing it
 * again celebrates only what the edits added (like recordsAddedByReopen). `original` is the
 * version from before the reopen and `finished` the one being saved; every other session is taken
 * from `sessions` as it is.
 */
export function goalsAddedByReopen(
  goals: Goal[],
  sessions: WorkoutSession[],
  original: WorkoutSession | undefined,
  finished: WorkoutSession,
  exercisesById: Map<string, Exercise>,
  today: ISODate,
): Goal[] {
  const others = sessions.filter((s) => s.id !== finished.id);
  const input = (version: WorkoutSession | undefined) => workoutInput(version ? [...others, version] : others, exercisesById, today);
  return goalsNewlyReached(workoutGoals(goals), { sessionId: finished.id }, input(original), input(finished));
}

/**
 * Goals a new weigh-in reached that weren't reached before it. `entries` are the weigh-ins from
 * before the save; the new one replaces any on the same day, as saving does.
 */
export function goalsReachedByNewWeighIn(goals: Goal[], entries: BodyweightEntry[], entry: BodyweightEntry, today: ISODate): Goal[] {
  const input = (bodyweight: BodyweightEntry[]): GoalInput => ({ sessions: [], exercisesById: new Map(), bodyweight, formReports: [], today });
  const after = [...entries.filter((e) => e.date !== entry.date && e.id !== entry.id), entry];
  return goalsNewlyReached(
    goals.filter((g) => g.type === 'bodyweight'),
    { bodyweightEntryId: entry.id },
    input(entries),
    input(after),
  );
}

/** Form goals a report reached. */
export function goalsReachedByFormReport(goals: Goal[], reportId: ID, formReports: FormReport[], today: ISODate): Goal[] {
  const input: GoalInput = { sessions: [], exercisesById: new Map(), bodyweight: [], formReports, today };
  return goalsReachedBy(
    goals.filter((g) => g.type === 'form'),
    { formReportId: reportId },
    input,
  );
}

/** "Goal reached: Reach 180 lb." or "Goals reached: Bench Press 225 × 5 and Train 4× per week." */
export function goalReachedMessage(goals: Pick<Goal, 'title'>[]): string {
  const titles = goals.map((g) => g.title);
  const list = titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}` : (titles[0] ?? '');
  return `${titles.length > 1 ? 'Goals' : 'Goal'} reached: ${list}.`;
}

/** "Reached 24 days after you set it", as Home's Recent wins says it. */
export function reachedAfter(goal: Pick<Goal, 'createdAt'>, reachedDate: ISODate): string {
  const days = daysBetween(localDateOf(goal.createdAt), reachedDate);
  return days > 0 ? `Reached ${plural(days, 'day')} after you set it` : 'Reached the day you set it';
}
