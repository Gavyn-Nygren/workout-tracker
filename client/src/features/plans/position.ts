import { addDays, daysBetween, localDateOf } from '@/data/dates';
import { cycleSteps, occurrenceIdFor, originalDateFor, programWeek, scheduleOccurrences, shiftCovers, shiftedDate, workoutsOn } from '@/data/schedule';
import type { ID, ISODate, Plan, PlanSchedule, PlanShift, ScheduledOccurrence } from '@/data/types';

// Where a plan "is" today, for the Plans tab. Everything here reads the plan's pushes forward
// (spec 2.5), so the Plans tab agrees with Today after a missed workout is pushed.

/** How far ahead a plan card looks for the next workout: today and the 13 days after it. */
const NEXT_WINDOW_DAYS = 14;

/** A moved workout says "Moved from …" for this many days after the push that moved it. */
export const MOVED_NOTE_DAYS = 7;

/** One plan's pushes, from the list of every plan's. */
export function shiftsOf(planId: ID, shifts: readonly PlanShift[]): PlanShift[] {
  return shifts.filter((s) => s.planId === planId);
}

/**
 * The plan's next workout within two weeks, counting today's (done or not), after its pushes.
 * On a day with several, the first one Today shows. Other plans' pushes are ignored.
 */
export function nextWorkout(plan: Plan, today: ISODate, shifts: readonly PlanShift[] = []): { date: ISODate; name: string } | undefined {
  for (const occurrence of scheduleOccurrences(plan, today, addDays(today, NEXT_WINDOW_DAYS - 1), shifts)) {
    const workout = plan.workouts.find((w) => w.id === occurrence.planWorkoutId);
    if (workout) return { date: occurrence.scheduledDate, name: workout.name };
  }
  return undefined;
}

/**
 * The 1-based week a fixed-length program is in today, after its pushes. A program pushed past
 * its original end stays in its last week until its last pushed workout's day has passed.
 * Undefined for other plan types, before the start, and after the end. `occurrences` are the
 * stored workouts on `today` (see todaysOriginal). Other plans' pushes and workouts are ignored.
 */
export function currentProgramWeek(plan: Plan, today: ISODate, shifts: readonly PlanShift[] = [], occurrences: readonly ScheduledOccurrence[] = []): number | undefined {
  const own = occurrences.filter((o) => o.planId === plan.id);
  return programWeek(plan, todaysOriginal(plan.schedule, plan.startDate, today, shiftsOf(plan.id, shifts), own));
}

/**
 * The date the plan first put today's workouts on, so the step or week is what Today shows. It
 * reads the plan's stored workouts on `today`, which know which were started: the unstarted ones,
 * or the started ones when all are (the earliest date if they differ). Pushes alone can't tell: a
 * workout one push kept, whose session was deleted later, is moved from its old day by the next
 * push, so it can land before today with a later date than today's. On a rest day, where the
 * pattern has got to after the pushes (originalDateFor). `shifts` and `occurrences` must be this
 * plan's own.
 */
function todaysOriginal(schedule: PlanSchedule, startDate: ISODate, today: ISODate, shifts: readonly PlanShift[], occurrences: readonly ScheduledOccurrence[]): ISODate {
  const onToday = occurrences.filter((o) => o.scheduledDate === today);
  const unstarted = onToday.filter((o) => !o.sessionId);
  const originals = (unstarted.length ? unstarted : onToday).map((o) => o.shiftedFromDate ?? o.scheduledDate);
  if (originals.length) return originals.reduce((a, b) => (a < b ? a : b));
  return originalDateFor(today, shifts, keptOn(schedule, startDate, shifts), landedOn(schedule, startDate, shifts));
}

/**
 * Whether every workout the plan first put on a day was kept by a push (done or started early):
 * by the latest push that covers it, since a later push can move one an earlier push kept. One
 * an earlier push moved before it was done, then kept, still counts.
 */
function keptOn(schedule: PlanSchedule, startDate: ISODate, shifts: readonly PlanShift[]) {
  return (original: ISODate) => {
    const workouts = workoutsOn(schedule, startDate, original);
    return (
      workouts.length > 0 &&
      workouts.every((w) => {
        // Ties go to the later one in the list, as shiftedDate's stable sort applies them.
        const latest = shifts
          .filter((s) => shiftCovers(s, original, occurrenceIdFor(s.planId, original, w)))
          .reduce<PlanShift | undefined>((a, b) => (a && a.createdAt > b.createdAt ? a : b), undefined);
        return !!latest?.keptIds?.includes(occurrenceIdFor(latest.planId, original, w));
      })
    );
  };
}

/**
 * Where the last workout the plan first put on a day lands after its pushes, reading what each
 * push kept. A rest day moves as the pushes move its date. `shifts` must be one plan's own.
 */
function landedOn(schedule: PlanSchedule, startDate: ISODate, shifts: readonly PlanShift[]) {
  return (original: ISODate) => {
    const [first] = shifts;
    if (!first) return original;
    const dates = workoutsOn(schedule, startDate, original).map((w) => shiftedDate(original, shifts, occurrenceIdFor(first.planId, original, w)));
    return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : shiftedDate(original, shifts);
  };
}

/**
 * Which step of a rotating cycle (0-based) today is, after the plan's pushes: the one Today shows.
 * `shifts` and `occurrences` (the stored workouts on `today`, see todaysOriginal) must be this
 * plan's own. Undefined for other plan types, an empty cycle, or before the plan starts.
 */
export function currentRotatingStep(
  schedule: PlanSchedule,
  startDate: ISODate,
  today: ISODate,
  shifts: readonly PlanShift[] = [],
  occurrences: readonly ScheduledOccurrence[] = [],
): number | undefined {
  const length = schedule.type === 'rotating' ? cycleSteps(schedule).length : 0;
  if (!length) return undefined;
  const offset = cycleDaysToday(schedule, startDate, today, shifts, occurrences);
  return offset < 0 ? undefined : offset % length;
}

/**
 * How many days into its cycles a rotating plan is today, after its pushes (the day Today shows).
 * Negative before the plan starts. Same inputs as currentRotatingStep.
 */
export function cycleDaysToday(
  schedule: PlanSchedule,
  startDate: ISODate,
  today: ISODate,
  shifts: readonly PlanShift[] = [],
  occurrences: readonly ScheduledOccurrence[] = [],
): number {
  return daysBetween(startDate, todaysOriginal(schedule, startDate, today, shifts, occurrences));
}

/**
 * The date a moved workout shows as "Moved from …": its original date, for a week after a push
 * moved it. A rotating or program push moves every later workout for good, and those shouldn't
 * all say so for months. Undefined when it wasn't moved or the push is old news.
 */
export function movedFromDate(occurrence: ScheduledOccurrence | undefined, shifts: readonly PlanShift[], today: ISODate): ISODate | undefined {
  const original = occurrence?.shiftedFromDate;
  if (!occurrence || !original) return undefined;
  const recent = shifts.some(
    (s) =>
      s.planId === occurrence.planId &&
      shiftCovers(s, original, occurrence.id) &&
      !s.keptIds?.includes(occurrence.id) &&
      daysBetween(localDateOf(s.createdAt), today) <= MOVED_NOTE_DAYS,
  );
  return recent ? original : undefined;
}
