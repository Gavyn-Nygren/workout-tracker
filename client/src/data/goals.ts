// Goal rules (spec 2.9, G3.10 decisions), unit-tested in tests/goals.test.ts.
//
// - Everything is derived from history. A goal is reached the first time since it was set that its
//   target was met, and stays reached after a dip. 7 days later it moves to Completed goals.
// - Lift goals measure from when the goal was set: the start is the best in the 12 weeks before it
//   (else the first value after), and only a workout finished after it can reach it. Bodyweight
//   lifts compare added weight, as records do.
// - Weekly goals with a deadline count workouts from when the goal was set to the deadline, out of
//   workouts per week × weeks. Without one they show this week's count and are never reached.
// - Bodyweight goals are reached by a weigh-in on or after the day they were set. Without a start
//   weight, the first weigh-in after sets it.
// - Form goals read the newest report with a trusted angle for the goal's joint. Knee and hip goals
//   aim deeper (a smaller angle), ankle goals higher (larger), as the form report compares them.
//   Without a recording when the goal was set, the first recording after is the start.
// - Editing a goal to another type, exercise or joint starts it over (goalEditStartsOver).
// - Pace: a straight line to 100% at the deadline, with a little slack: from 0% when the goal was
//   set, or, for a deadline added or changed later, from the progress it had then. A goal with no
//   start yet (goalAwaitsStart) has no pace, only days left.
import { countsAsWorkout, countsForPRs, effectiveLoadKg, recordLoadKg, setE1RM } from './calculations';
import { addDays, daysBetween, localDateOf, startOfWeek } from './dates';
import type { BodyweightEntry, Exercise, FormReport, Goal, ID, ISODate, ISODateTime, Joint, LoggedSet, StreakState, Weekday, WorkoutSession } from './types';

export type LiftGoal = Extract<Goal, { type: 'lift' }>;
export type WeeklyGoal = Extract<Goal, { type: 'frequency' }>;
export type BodyweightGoal = Extract<Goal, { type: 'bodyweight' }>;
export type FormGoal = Extract<Goal, { type: 'form' }>;

export type GoalInput = {
  sessions: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  bodyweight: BodyweightEntry[];
  formReports: FormReport[];
  /** Weekly goals without a deadline show the streak's count for this week. */
  streak?: Pick<StreakState, 'thisWeekCompleted'>;
  today: ISODate;
  /** Counts this week when there's no streak. */
  weekStartsOn?: Weekday;
};

/** What reached a goal: a workout, a weigh-in, or a form report. */
export type GoalSource = { sessionId: ID } | { bodyweightEntryId: ID } | { formReportId: ID };

export type GoalPace = 'on_track' | 'behind' | 'past_deadline';

export type GoalStatus = {
  /** 0..1 toward the target; 1 once reached. */
  fraction: number;
  /** Raw values in the goal's own unit (kg, degrees, workouts). */
  current?: number;
  start?: number;
  target: number;
  /** Reached at some point since the goal was set, even if it has dipped since. */
  reached: boolean;
  reachedDate?: ISODate;
  reachedBy?: GoalSource;
  /** Reached 7 or more days ago: it moves from Home's goals to Completed goals. */
  archived: boolean;
  /** Only for unreached goals with a deadline. 'past_deadline' has no days left. */
  pace?: GoalPace;
  daysLeft?: number;
  /** Lift goals on bodyweight exercises: values are weight added to bodyweight (negative for assistance). */
  addedLoad?: boolean;
  /** Weekly goals: this week's count (no deadline), or the total by the deadline. */
  mode?: 'this_week' | 'total';
  done?: number;
  total?: number;
};

/** Days a reached goal stays on Home before it moves to Completed goals. */
export const GOAL_ARCHIVE_DAYS = 7;
/** A lift goal's start is the best in this many days before it was set. */
export const LIFT_BASELINE_DAYS = 84;
/** A little slack so a single quiet week doesn't flip a goal to "behind". */
const PACE_SLACK = 0.05;
/** Weights within 0.05 kg are the same weight, as for records, so kg↔lb rounding can't miss a target. */
const KG_TOLERANCE = 0.05;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const byCompletion = (a: WorkoutSession, b: WorkoutSession) => (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');
const byCreated = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

// Every goal reads the same history, so it's sorted once per sessions array, not once per goal.
const finishedCache = new WeakMap<WorkoutSession[], WorkoutSession[]>();
const countedCache = new WeakMap<WorkoutSession[], WorkoutSession[]>();

/** Finished workouts, oldest first (as records count them). Don't mutate the result: it's shared. */
function finished(sessions: WorkoutSession[]): WorkoutSession[] {
  let sorted = finishedCache.get(sessions);
  if (!sorted) {
    sorted = sessions.filter((s) => s.status === 'completed' && s.completedDate).sort(byCompletion);
    finishedCache.set(sessions, sorted);
  }
  return sorted;
}

/** Finished workouts that count as workouts (countsAsWorkout), oldest first. Shared, like finished(). */
function counted(sessions: WorkoutSession[]): WorkoutSession[] {
  let list = countedCache.get(sessions);
  if (!list) {
    list = finished(sessions).filter(countsAsWorkout);
    countedCache.set(sessions, list);
  }
  return list;
}

/** Whether a finished workout was completed at or after a moment. */
function completedSince(session: WorkoutSession, since: ISODateTime): boolean {
  if (session.completedAt) return Date.parse(session.completedAt) >= Date.parse(since);
  return (session.completedDate ?? '') >= localDateOf(since);
}

/** Whether a moment is at or after another. */
const atOrAfter = (moment: ISODateTime, since: ISODateTime) => Date.parse(moment) >= Date.parse(since);

// ---------------------------------------------------------------------------
// Lift goals

/** What a lift goal measures: heaviest load at the target reps or more, or best e1RM. */
export type LiftShape = { kind: 'load_reps'; reps: number } | { kind: 'e1rm' };

/**
 * A set's value for a lift goal, in kg. Load goals on bodyweight exercises compare what was added to
 * bodyweight (negative for assistance), as records do; added and total loads are never compared.
 */
function liftValue(set: LoggedSet, exercise: Exercise, shape: LiftShape): number | undefined {
  if (!countsForPRs(set) || !set.reps) return undefined;
  if (shape.kind === 'e1rm') return setE1RM(set, exercise);
  if (set.reps < shape.reps) return undefined;
  const load = recordLoadKg(set, exercise);
  return load && load.added === exercise.isBodyweight ? load.kg : undefined;
}

/** Whether a lift goal compares added weight: load goals on bodyweight exercises. */
export function liftGoalAddsToBodyweight(shape: LiftShape, exercise: Pick<Exercise, 'isBodyweight'> | undefined): boolean {
  return shape.kind === 'load_reps' && Boolean(exercise?.isBodyweight);
}

/**
 * The kind the goal form saves a lift goal as. Bodyweight exercises aren't offered e1RM, so they take
 * weight × reps, except an existing e1RM goal on that same exercise (set before G3.10, or before the
 * exercise was marked as counting bodyweight): editing it keeps it an e1RM goal.
 */
export function liftGoalFormKind(
  chosen: LiftShape['kind'],
  exercise: Pick<Exercise, 'id' | 'isBodyweight'> | undefined,
  existing?: Pick<LiftGoal, 'exerciseId' | 'target'>,
): LiftShape['kind'] {
  if (!exercise?.isBodyweight) return chosen;
  return chosen === 'e1rm' && existing?.target.kind === 'e1rm' && existing.exerciseId === exercise.id ? 'e1rm' : 'load_reps';
}

/** What a goal measures, for deciding whether an edit starts it over. */
export type GoalSubject = { type: 'lift'; exerciseId: ID } | { type: 'form'; exerciseId: ID; joint: Joint } | { type: 'frequency' } | { type: 'bodyweight' };

/**
 * Whether saving a goal from the form starts it over today (a new set date), so it measures only
 * what happens from now: a new goal, a new type, a lift or form goal moved to another exercise or
 * joint, or a weekly goal given a new deadline. Changing only the target, reps or kind keeps it.
 */
export function goalEditStartsOver(existing: Goal | undefined, next: GoalSubject, newDeadline: boolean): boolean {
  if (!existing || existing.type !== next.type) return true;
  if (existing.type === 'lift' && next.type === 'lift') return existing.exerciseId !== next.exerciseId;
  if (existing.type === 'form' && next.type === 'form') return existing.exerciseId !== next.exerciseId || existing.joint !== next.joint;
  return next.type === 'frequency' && newDeadline;
}

/**
 * The `deadlineSetAt` the goal form saves: `now` when a goal that keeps its set date gets a new or
 * changed deadline, so its pace counts from now; the goal's own while it keeps its deadline. None
 * without a deadline, or for a goal that starts over (its pace counts from its new set date).
 */
export function goalDeadlineSetAt(existing: Goal | undefined, startsOver: boolean, deadline: ISODate | undefined, now: ISODateTime): ISODateTime | undefined {
  if (!existing || startsOver || !deadline) return undefined;
  return deadline === existing.deadline ? existing.deadlineSetAt : now;
}

export type LiftBest = {
  /** kg: the load (added weight for bodyweight lifts), or the e1RM. */
  value: number;
  /** The set's reps, and for an e1RM best, the load it was lifted at. */
  reps: number;
  loadKg?: number;
  addedLoad: boolean;
  sessionId: ID;
  setId: ID;
  date: ISODate;
};

/**
 * Which workouts count: completed at or after `since`, before `before` (timestamps), and on or
 * after `withinDays` days before the date of `before` (else `today`).
 */
export type LiftWindow = { since?: ISODateTime; before?: ISODateTime; withinDays?: number; today?: ISODate };

/**
 * An exercise's best for a lift goal's measure in a window of finished workouts, for the goal form's
 * hint ("Your best in the last 12 weeks: 215 × 5"). Ties go to more reps, then the earlier set.
 */
export function liftBest(exerciseId: ID, shape: LiftShape, sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, window: LiftWindow = {}): LiftBest | undefined {
  const exercise = exercisesById.get(exerciseId);
  if (!exercise) return undefined;
  const anchor = window.before ? localDateOf(window.before) : window.today;
  const from = window.withinDays !== undefined && anchor ? addDays(anchor, -window.withinDays) : undefined;
  let best: LiftBest | undefined;
  for (const session of finished(sessions)) {
    if (window.since && !completedSince(session, window.since)) continue;
    if (window.before && completedSince(session, window.before)) continue;
    if (from && session.completedDate! < from) continue;
    for (const set of exerciseSets(session, exerciseId)) {
      const value = liftValue(set, exercise, shape);
      if (value === undefined) continue;
      const reps = set.reps ?? 0;
      if (best && (value < best.value - 1e-9 || (Math.abs(value - best.value) <= 1e-9 && reps <= best.reps))) continue;
      best = {
        value,
        reps,
        ...(shape.kind === 'e1rm' ? { loadKg: effectiveLoadKg(set, exercise) } : {}),
        addedLoad: liftGoalAddsToBodyweight(shape, exercise),
        sessionId: session.id,
        setId: set.id,
        date: session.completedDate!,
      };
    }
  }
  return best;
}

function exerciseSets(session: WorkoutSession, exerciseId: ID): LoggedSet[] {
  return session.blocks.flatMap((b) => b.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets));
}

/** A workout's best value for a lift goal. */
function sessionLiftBest(session: WorkoutSession, exercise: Exercise, shape: LiftShape): number | undefined {
  let best: number | undefined;
  for (const set of exerciseSets(session, exercise.id)) {
    const value = liftValue(set, exercise, shape);
    if (value !== undefined && (best === undefined || value > best)) best = value;
  }
  return best;
}

function liftStatus(goal: LiftGoal, input: GoalInput): GoalStatus {
  const target = goal.target.loadKg;
  const exercise = input.exercisesById.get(goal.exerciseId);
  const addedLoad = liftGoalAddsToBodyweight(goal.target, exercise) ? { addedLoad: true } : {};
  if (!exercise) return { fraction: 0, target, reached: false, archived: false, ...addedLoad };
  const baseline = liftBest(goal.exerciseId, goal.target, input.sessions, input.exercisesById, { before: goal.createdAt, withinDays: LIFT_BASELINE_DAYS });

  let first: number | undefined;
  let best: number | undefined;
  let reached: WorkoutSession | undefined;
  for (const session of finished(input.sessions)) {
    if (!completedSince(session, goal.createdAt)) continue;
    const value = sessionLiftBest(session, exercise, goal.target);
    if (value === undefined) continue;
    first ??= value;
    best = best === undefined ? value : Math.max(best, value);
    if (!reached && value >= target - KG_TOLERANCE) reached = session;
  }

  const start = baseline?.value ?? first;
  // Nothing logged since the goal was set: the bar starts at 0 and current shows the start.
  const current = best ?? start;
  let fraction = 0;
  if (reached) fraction = 1;
  else if (best !== undefined && start !== undefined && target > start) fraction = clamp01((best - start) / (target - start));
  else if (best !== undefined && target > 0) fraction = clamp01(best / target);
  return { fraction, current, start, target, ...reachedFields(reached && { date: reached.completedDate!, by: { sessionId: reached.id } }), ...addedLoad };
}

// ---------------------------------------------------------------------------
// Weekly goals

/** Workouts in a weekly goal with a deadline: per week × weeks from the day it was set (at least 1). */
export function weeklyGoalTotal(goal: Pick<WeeklyGoal, 'workoutsPerWeek' | 'createdAt' | 'deadline'>): number | undefined {
  if (!goal.deadline) return undefined;
  const weeks = Math.max(1, Math.round(daysBetween(localDateOf(goal.createdAt), goal.deadline) / 7));
  return goal.workoutsPerWeek * weeks;
}

function thisWeekCount(input: Pick<GoalInput, 'sessions' | 'today' | 'weekStartsOn' | 'streak'>): number {
  if (input.streak) return input.streak.thisWeekCompleted;
  const week = startOfWeek(input.today, input.weekStartsOn);
  return input.sessions.filter((s) => countsAsWorkout(s) && startOfWeek(s.completedDate!, input.weekStartsOn) === week).length;
}

function weeklyStatus(goal: WeeklyGoal, input: Pick<GoalInput, 'sessions' | 'today' | 'weekStartsOn' | 'streak'>): GoalStatus {
  const total = weeklyGoalTotal(goal);
  if (total === undefined) {
    const done = thisWeekCount(input);
    const target = goal.workoutsPerWeek;
    return { fraction: clamp01(done / Math.max(1, target)), current: done, target, reached: false, archived: false, mode: 'this_week', done, total: target };
  }
  const inWindow = counted(input.sessions).filter((s) => completedSince(s, goal.createdAt) && s.completedDate! <= goal.deadline!);
  const done = inWindow.length;
  const reached = total > 0 ? inWindow[total - 1] : undefined;
  return {
    fraction: reached ? 1 : clamp01(done / Math.max(1, total)),
    current: done,
    start: 0,
    target: total,
    ...reachedFields(reached && { date: reached.completedDate!, by: { sessionId: reached.id } }),
    mode: 'total',
    done,
    total,
  };
}

// ---------------------------------------------------------------------------
// Bodyweight goals

/**
 * A bodyweight goal's stored start weight. Goals saved without a weigh-in before G3.10 stored the
 * target as their start, which counts as none: the first weigh-in after the goal was set starts it.
 */
export function bodyweightGoalStartKg(goal: Pick<BodyweightGoal, 'startKg' | 'targetKg'>): number | undefined {
  return goal.startKg !== undefined && Math.abs(goal.startKg - goal.targetKg) > KG_TOLERANCE ? goal.startKg : undefined;
}

function bodyweightStatus(goal: BodyweightGoal, input: GoalInput): GoalStatus {
  const target = goal.targetKg;
  const entries = [...input.bodyweight].sort((a, b) => a.date.localeCompare(b.date));
  const since = entries.filter((e) => e.date >= localDateOf(goal.createdAt));
  const current = entries.at(-1)?.weightKg;
  const start = bodyweightGoalStartKg(goal) ?? since[0]?.weightKg;
  if (start === undefined) return { fraction: 0, current, target, reached: false, archived: false };

  // Lose or gain, from the start; a start at the target is reached by a weigh-in at the target.
  const direction = Math.abs(target - start) <= KG_TOLERANCE ? 0 : Math.sign(target - start);
  const meets = (kg: number) => (direction < 0 ? kg <= target + KG_TOLERANCE : direction > 0 ? kg >= target - KG_TOLERANCE : Math.abs(kg - target) <= KG_TOLERANCE);
  const reached = since.find((e) => meets(e.weightKg));
  const fraction = reached ? 1 : current === undefined || direction === 0 ? 0 : clamp01((current - start) / (target - start));
  return { fraction, current, start, target, ...reachedFields(reached && { date: reached.date, by: { bodyweightEntryId: reached.id } }) };
}

// ---------------------------------------------------------------------------
// Form goals

/** Average bottom angle of a joint across a report's trusted reps. */
export function reportAngle(report: FormReport, joint: Joint): number | undefined {
  const values = report.reps.filter((r) => r.confidence === 'high').map((r) => r.angles[joint]?.minDeg).filter((v): v is number => v !== undefined);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

/** An exercise's ready reports that have a trusted angle for a joint, oldest first. */
function angledReports(formReports: FormReport[], exerciseId: ID, joint: Joint): { report: FormReport; angle: number }[] {
  return formReports
    .filter((r) => r.exerciseId === exerciseId && r.status === 'ready')
    .sort(byCreated)
    .flatMap((report) => {
      const angle = reportAngle(report, joint);
      return angle === undefined ? [] : [{ report, angle }];
    });
}

/** The newest ready report with a trusted angle for the joint: a form goal's current value, and its start when set. */
export function latestFormAngle(formReports: FormReport[], exerciseId: ID, joint: Joint): { report: FormReport; angle: number } | undefined {
  return angledReports(formReports, exerciseId, joint).at(-1);
}

/** Whether a form goal at this joint aims for a larger angle: a higher calf raise. Knee and hip aim deeper (smaller). */
export function formGoalAimsHigher(joint: Joint): boolean {
  return joint === 'ankle';
}

/**
 * How many whole degrees `now` improved on `before` at a joint, as the form report compares them:
 * deeper (smaller) for knees and hips, higher (larger) for the ankle. Negative when it got worse;
 * undefined without trusted angles in both. Recent wins and the range-of-motion badges use this.
 */
export function formGainDeg(before: FormReport, now: FormReport, joint: Joint): number | undefined {
  const was = reportAngle(before, joint);
  const is = reportAngle(now, joint);
  if (was === undefined || is === undefined) return undefined;
  return formGoalAimsHigher(joint) ? Math.round(is) - Math.round(was) : Math.round(was) - Math.round(is);
}

function formStatus(goal: FormGoal, input: GoalInput): GoalStatus {
  const reports = angledReports(input.formReports, goal.exerciseId, goal.joint);
  const current = reports.at(-1)?.angle;
  const since = reports.filter((r) => atOrAfter(r.report.createdAt, goal.createdAt));
  // Saved without a recording: the first recording after the goal was set is the start.
  const start = goal.startDeg ?? since[0]?.angle;
  // +1 when a larger angle is better, -1 when smaller is. Whole degrees, as reports show them.
  const aim = formGoalAimsHigher(goal.joint) ? 1 : -1;
  const meets = (angle: number) => aim * (Math.round(angle) - goal.targetDeg) >= 0;
  const reached = since.find((r) => meets(r.angle));
  // Progress from the start toward the target; none without a start, or when it was already at or past it.
  const span = start === undefined ? 0 : aim * (goal.targetDeg - start);
  const fraction = reached ? 1 : current === undefined || start === undefined || span <= 0 ? 0 : clamp01((aim * (current - start)) / span);
  return {
    fraction,
    current,
    start,
    target: goal.targetDeg,
    ...reachedFields(reached && { date: localDateOf(reached.report.createdAt), by: { formReportId: reached.report.id } }),
  };
}

// ---------------------------------------------------------------------------
// Status, pace, and archive

function reachedFields(reached: { date: ISODate; by: GoalSource } | undefined | false): Pick<GoalStatus, 'reached' | 'reachedDate' | 'reachedBy' | 'archived'> {
  // `archived` is set from today in goalStatus.
  return reached ? { reached: true, reachedDate: reached.date, reachedBy: reached.by, archived: false } : { reached: false, archived: false };
}

/**
 * Whether a goal has no start yet, so no progress and no pace (only days left): a lift goal with
 * nothing logged in the 12 weeks before it was set or since, a bodyweight goal before its first
 * weigh-in, a form goal before its first recording since it was set. Weekly goals always have one.
 */
export function goalAwaitsStart(goal: Goal, status: Pick<GoalStatus, 'start'>): boolean {
  return goal.type !== 'frequency' && status.start === undefined;
}

/** The history recorded by `moment`: workouts finished, weigh-ins dated and reports made by then. */
function historyAt(input: GoalInput, moment: ISODateTime): GoalInput {
  const day = localDateOf(moment);
  return {
    ...input,
    sessions: input.sessions.filter((s) => !completedSince(s, moment)),
    // Weigh-ins are by day; one on that day counts if it was entered by then.
    bodyweight: input.bodyweight.filter((e) => e.date < day || (e.date === day && Date.parse(e.createdAt) <= Date.parse(moment))),
    formReports: input.formReports.filter((r) => Date.parse(r.createdAt) <= Date.parse(moment)),
    streak: undefined,
    today: day,
  };
}

/**
 * Where a goal's pace line starts: the day it was set, at 0%; or, for a deadline added or changed
 * after that (`deadlineSetAt`), that day, at the progress the goal had at that moment.
 */
function paceStart(goal: Goal, input: GoalInput): { day: ISODate; fraction: number } {
  const moment = goal.deadlineSetAt;
  if (!moment || Date.parse(moment) <= Date.parse(goal.createdAt)) return { day: localDateOf(goal.createdAt), fraction: 0 };
  return { day: localDateOf(moment), fraction: measure(goal, historyAt(input, moment)).fraction };
}

/** A straight line to 100% at the end of the deadline day, from where the pace starts, with a little slack. */
function withPace(status: GoalStatus, goal: Goal, input: GoalInput): GoalStatus {
  const { today } = input;
  if (!goal.deadline || status.reached) return status;
  if (today > goal.deadline) return { ...status, pace: 'past_deadline' };
  const daysLeft = daysBetween(today, goal.deadline) + 1;
  if (goalAwaitsStart(goal, status)) return { ...status, daysLeft };
  const from = paceStart(goal, input);
  // Midday today, through the end of the deadline day.
  const elapsed = clamp01((daysBetween(from.day, today) + 0.5) / Math.max(1, daysBetween(from.day, goal.deadline) + 1));
  const expected = from.fraction + (1 - from.fraction) * elapsed;
  return { ...status, daysLeft, pace: status.fraction >= expected - PACE_SLACK ? 'on_track' : 'behind' };
}

/** Whether a goal reached on `reachedDate` has moved to Completed goals by `today`. */
export function isGoalArchived(reachedDate: ISODate | undefined, today: ISODate): boolean {
  return reachedDate !== undefined && today >= addDays(reachedDate, GOAL_ARCHIVE_DAYS);
}

/** Progress and the reached date for each goal type, without archive or pace. */
function measure(goal: Goal, input: GoalInput): GoalStatus {
  switch (goal.type) {
    case 'lift':
      return liftStatus(goal, input);
    case 'frequency':
      return weeklyStatus(goal, input);
    case 'bodyweight':
      return bodyweightStatus(goal, input);
    case 'form':
      return formStatus(goal, input);
  }
}

/** Progress, reached date, archive, and pace for each goal type (spec 2.9, G3.10). */
export function goalStatus(goal: Goal, input: GoalInput): GoalStatus {
  const status = measure(goal, input);
  return withPace({ ...status, archived: isGoalArchived(status.reachedDate, input.today) }, goal, input);
}

/**
 * The weekly goal that sets the streak target: the newest (by last edit) that existed on `today`
 * and wasn't archived by then. Pass a past week's last day as `today` to ask what it was then.
 */
export function weeklyGoalTarget(goals: Goal[], input: Pick<GoalInput, 'sessions' | 'today'>, reachedDates?: WeeklyReachedDates): number | undefined {
  // Newest first, and only as far as the first one still active: usually one status to work out.
  const active = goals
    .filter((g): g is WeeklyGoal => g.type === 'frequency' && localDateOf(g.createdAt) <= input.today)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    // Only a goal with a deadline can be reached, and so archived.
    .find((g) => !g.deadline || !isGoalArchived(weeklyReachedDate(g, input.sessions, reachedDates), input.today));
  return active?.workoutsPerWeek;
}

/**
 * When each weekly goal with a deadline was reached, by goal id, for asking weeklyGoalTarget about
 * many weeks over the same history (weekTargets.ts). With a deadline, the date doesn't depend on today.
 */
export type WeeklyReachedDates = Map<ID, ISODate | undefined>;

function weeklyReachedDate(goal: WeeklyGoal, sessions: WorkoutSession[], memo?: WeeklyReachedDates): ISODate | undefined {
  if (memo?.has(goal.id)) return memo.get(goal.id);
  // `today` only matters for a goal without a deadline, which is never reached.
  const date = weeklyStatus(goal, { sessions, today: goal.deadline ?? localDateOf(goal.createdAt) }).reachedDate;
  memo?.set(goal.id, date);
  return date;
}

function sameSource(a: GoalSource | undefined, b: GoalSource): boolean {
  if (!a) return false;
  if ('sessionId' in b) return 'sessionId' in a && a.sessionId === b.sessionId;
  if ('bodyweightEntryId' in b) return 'bodyweightEntryId' in a && a.bodyweightEntryId === b.bodyweightEntryId;
  return 'formReportId' in a && a.formReportId === b.formReportId;
}

/** Goals that a workout, weigh-in, or form report reached, for "Goal reached" celebrations. */
export function goalsReachedBy(goals: Goal[], source: GoalSource, input: GoalInput): Goal[] {
  return goals.filter((goal) => sameSource(goalStatus(goal, input).reachedBy, source));
}

export const goalsReachedBySession = (goals: Goal[], sessionId: ID, input: GoalInput) => goalsReachedBy(goals, { sessionId }, input);
export const goalsReachedByWeighIn = (goals: Goal[], bodyweightEntryId: ID, input: GoalInput) => goalsReachedBy(goals, { bodyweightEntryId }, input);
export const goalsReachedByReport = (goals: Goal[], formReportId: ID, input: GoalInput) => goalsReachedBy(goals, { formReportId }, input);
