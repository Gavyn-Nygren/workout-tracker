import { addDays, daysBetween, localDateOf } from '@/data/dates';
import { occurrenceIdFor, originalDateFor, programWeek, scheduleOccurrences, shiftCovers, workoutsOn } from '@/data/schedule';
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
 * Undefined for other plan types, before the start, and after the end. Other plans' pushes are ignored.
 */
export function currentProgramWeek(plan: Plan, today: ISODate, shifts: readonly PlanShift[] = []): number | undefined {
  const own = shiftsOf(plan.id, shifts);
  return programWeek(plan, originalDateFor(today, own, keptOn(plan.schedule, plan.startDate, own)));
}

/** Whether every workout the plan first put on a day was kept there by a push (done or started early). */
function keptOn(schedule: PlanSchedule, startDate: ISODate, shifts: readonly PlanShift[]) {
  return (original: ISODate) => {
    const workouts = workoutsOn(schedule, startDate, original);
    return (
      workouts.length > 0 &&
      workouts.every((w) => shifts.some((s) => shiftCovers(s, original) && !!s.keptIds?.includes(occurrenceIdFor(s.planId, original, w))))
    );
  };
}

/**
 * Which step of a rotating cycle (0-based) today is, after the plan's pushes. `shifts` must be
 * this plan's own. Undefined for other plan types, an empty cycle, or before the plan starts.
 */
export function currentRotatingStep(schedule: PlanSchedule, startDate: ISODate, today: ISODate, shifts: readonly PlanShift[] = []): number | undefined {
  if (schedule.type !== 'rotating' || !schedule.sequence.length) return undefined;
  const offset = daysBetween(startDate, originalDateFor(today, shifts, keptOn(schedule, startDate, shifts)));
  return offset < 0 ? undefined : offset % schedule.sequence.length;
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
