import { addDays, daysBetween, isoWeekday, startOfWeek } from './dates';
import type { CycleStep, ID, ISODate, Plan, PlanSchedule, PlanShift, ScheduledOccurrence, Weekday } from './types';

/**
 * Whether a push covers a workout originally on `original`. A weekly push covers the missed day
 * and the week it was pushed into, nothing in between, so a miss from last week doesn't drag last
 * week's other days along.
 */
export function shiftCovers(shift: PlanShift, original: ISODate, occurrenceId?: ID): boolean {
  if (occurrenceId && shift.alongIds?.includes(occurrenceId)) return true;
  if (original < shift.fromDate) return false;
  if (!shift.untilDate) return true;
  return original <= shift.untilDate && (original === shift.fromDate || original >= addDays(shift.untilDate, -6));
}

/**
 * Where a workout the plan put on `original` lands after the plan's pushes forward, applied in
 * the order they were made: each push moves the original dates it covers by its days, and pushes
 * add up. A weekly push never carries a workout past the end of its week; that workout stays on
 * its day, so the next week is exactly as usual (user's pick). A push never moves a workout it
 * kept (one already started when it was made), so pass the workout's id when there is one.
 */
export function shiftedDate(original: ISODate, shifts: readonly PlanShift[], occurrenceId?: ID): ISODate {
  let date = original;
  for (const shift of [...shifts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!shiftCovers(shift, original, occurrenceId)) continue;
    if (occurrenceId && shift.keptIds?.includes(occurrenceId)) continue;
    const moved = addDays(date, shift.days);
    if (shift.untilDate && moved > shift.untilDate) continue;
    date = moved;
  }
  return date;
}

/** The id a plan's workout gets on its original date. Stable through pushes. */
export function occurrenceIdFor(planId: ID, original: ISODate, workoutId: ID): ID {
  return `occ_${planId}_${original}_${workoutId}`;
}

/**
 * Where the plan's own pattern has got to by `date`, after its pushes: the latest original date
 * whose workouts have landed on or before `date`. The Plans tab uses it for a rotating cycle's
 * current step and a program's current week, so they agree with Today after a push.
 * `landedOn` says where a day's workouts land (its last one); without it, where the pushes move
 * the date, which ignores what they kept.
 */
export function originalDateFor(
  date: ISODate,
  shifts: readonly PlanShift[],
  kept: (original: ISODate) => boolean = () => false,
  landedOn: (original: ISODate) => ISODate = (original) => shiftedDate(original, shifts),
): ISODate {
  const reach = shifts.reduce((sum, s) => sum + Math.max(0, s.days), 0);
  const floor = addDays(date, -reach);
  // Days whose workouts a push kept in place are skipped, even past the floor (a kept day can sit
  // exactly on it). The limit only guards against a malformed predicate.
  const limit = addDays(floor, -400);
  for (let original = date; ; original = addDays(original, -1)) {
    if (kept(original) && original > limit) continue;
    if (original <= floor || landedOn(original) <= date) return original;
  }
}

/**
 * Calendar occurrences a plan produces between two dates (inclusive), for all three plan types
 * (spec 2.5), after its pushes forward. Paused and archived plans produce nothing. Ids come from
 * the original date, so a pushed workout keeps its id and is never scheduled twice.
 */
export function scheduleOccurrences(plan: Plan, from: ISODate, to: ISODate, shifts: readonly PlanShift[] = []): ScheduledOccurrence[] {
  if (plan.status !== 'active') return [];
  const own = shifts.filter((s) => s.planId === plan.id);
  // Workouts from up to this many days back can be pushed into the range.
  const reach = own.reduce((sum, s) => sum + Math.max(0, s.days), 0);
  const scanFrom = addDays(from, -reach);
  const start = plan.startDate > scanFrom ? plan.startDate : scanFrom;
  const occurrences: ScheduledOccurrence[] = [];

  for (let date = start; date <= to; date = addDays(date, 1)) {
    for (const workoutId of workoutsOn(plan.schedule, plan.startDate, date)) {
      const id = occurrenceIdFor(plan.id, date, workoutId);
      const scheduledDate = shiftedDate(date, own, id);
      if (scheduledDate < from || scheduledDate > to) continue;
      occurrences.push({
        id,
        planId: plan.id,
        planVersion: plan.version,
        planWorkoutId: workoutId,
        scheduledDate,
        ...(scheduledDate !== date && { shiftedFromDate: date }),
      });
    }
  }
  return occurrences.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

/**
 * The push forward for a missed workout (spec 2.5): it moves to `today`, and the plan's later
 * workouts move the same number of days, keeping their spacing and rest days. A weekly plan only
 * moves within the week the workout lands in, so the next week is exactly as usual (user's pick):
 * a workout that would be pushed past that week's end stays on its day. Programs and rotating
 * cycles move for good, since their order matters. Undefined if there's nothing to
 * push: the workout isn't in the past, it was started, or the plan is paused or archived.
 */
export function planShiftFor(input: { id: ID; plan: Plan; occurrence: ScheduledOccurrence; today: ISODate; weekStartsOn: Weekday; now: string }): PlanShift | undefined {
  const { plan, occurrence, today } = input;
  const days = daysBetween(occurrence.scheduledDate, today);
  if (plan.status !== 'active' || days <= 0 || occurrence.sessionId || occurrence.planId !== plan.id) return undefined;
  return {
    id: input.id,
    planId: plan.id,
    occurrenceId: occurrence.id,
    fromDate: occurrence.shiftedFromDate ?? occurrence.scheduledDate,
    ...(plan.schedule.type === 'weekly' && { untilDate: addDays(startOfWeek(today, input.weekStartsOn), 6) }),
    days,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * A cycle as plans stored it before a day could hold several workouts (`sequence`), as steps:
 * 'rest' (or anything that isn't an id) is a rest day, and an id a one-workout day. Order and
 * length are kept, so every date runs the same workout as before. Not a list gives no steps.
 */
export function stepsFromSequence(sequence: unknown): CycleStep[] {
  if (!Array.isArray(sequence)) return [];
  return sequence.map((s) => ({ workoutIds: typeof s === 'string' && s !== 'rest' ? [s] : [] }));
}

/**
 * A cycle's steps. Every reader goes through this: a row stored in the old shape that the startup
 * upgrade (db/upgradeCycleSteps.ts) somehow missed still schedules as it did, instead of stopping
 * the app from opening (the repository schedules every active plan at startup).
 */
export function cycleSteps(schedule: Extract<PlanSchedule, { type: 'rotating' }>): CycleStep[] {
  if (Array.isArray(schedule.steps)) return schedule.steps;
  return stepsFromSequence((schedule as unknown as { sequence?: unknown }).sequence);
}

/** Every workout id a schedule uses, once each. */
export function scheduledWorkoutIds(schedule: PlanSchedule): Set<ID> {
  const days = schedule.type === 'rotating' ? cycleSteps(schedule) : schedule.days;
  return new Set(days.flatMap((d) => d.workoutIds));
}

/** Without repeats: two copies of a workout on one date would share an occurrence id. */
const once = (ids: readonly string[] | undefined): string[] => [...new Set(ids ?? [])];

/** Workout ids a schedule puts on one date, each once. */
export function workoutsOn(schedule: PlanSchedule, startDate: ISODate, date: ISODate): string[] {
  const offset = daysBetween(startDate, date);
  if (offset < 0) return [];
  const weekday = isoWeekday(date);
  switch (schedule.type) {
    case 'weekly':
      return once(schedule.days.find((d) => d.weekday === weekday)?.workoutIds);
    case 'fixed': {
      const week = Math.floor(offset / 7) + 1;
      if (week > schedule.weeks) return [];
      return once(schedule.days.find((d) => d.week === week && d.weekday === weekday)?.workoutIds);
    }
    case 'rotating': {
      const steps = cycleSteps(schedule);
      if (!steps.length) return [];
      return once(steps[offset % steps.length].workoutIds);
    }
  }
}

/** For weekly and fixed plans: which weekdays each workout runs on (fixed plans use week 1). */
export function weekdaysByWorkout(schedule: PlanSchedule): Map<string, Weekday[]> {
  const map = new Map<string, Weekday[]>();
  if (schedule.type === 'rotating') return map;
  const days = schedule.type === 'weekly' ? schedule.days : schedule.days.filter((d) => d.week === 1);
  for (const day of days) {
    for (const id of day.workoutIds) map.set(id, [...(map.get(id) ?? []), day.weekday]);
  }
  return map;
}

/** Workouts on each weekday (1 = Monday) for the week grid; fixed plans show week 1's pattern. */
export function weekPattern(schedule: PlanSchedule): Record<Weekday, string[]> {
  const pattern = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as Record<Weekday, string[]>;
  if (schedule.type === 'rotating') return pattern;
  const days = schedule.type === 'weekly' ? schedule.days : schedule.days.filter((d) => d.week === 1);
  for (const day of days) pattern[day.weekday] = [...pattern[day.weekday], ...day.workoutIds];
  return pattern;
}

/** Builds a fixed schedule that repeats the same weekday pattern for every week. */
export function fixedFromPattern(weeks: number, pattern: Record<Weekday, string[]>): PlanSchedule {
  const days: { week: number; weekday: Weekday; workoutIds: string[] }[] = [];
  for (let week = 1; week <= weeks; week++) {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
      if (pattern[weekday].length) days.push({ week, weekday, workoutIds: pattern[weekday] });
    }
  }
  return { type: 'fixed', weeks, days };
}

export function weeklyFromPattern(pattern: Record<Weekday, string[]>): PlanSchedule {
  return {
    type: 'weekly',
    days: ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).filter((d) => pattern[d].length).map((weekday) => ({ weekday, workoutIds: pattern[weekday] })),
  };
}

/**
 * Training days per week, or per cycle for rotating plans: days with at least one workout, so a
 * cycle day with two workouts is one day. A cycle also gives `workouts`, the workouts on all its
 * days added up (a repeat on one day counts once), for the plan card's "3 workouts in a 3-day cycle".
 */
export function trainingDays(schedule: PlanSchedule): { count: number; per: 'week' | 'cycle'; cycleLength?: number; workouts?: number } {
  if (schedule.type === 'rotating') {
    const perStep = cycleSteps(schedule).map((s) => once(s.workoutIds).length);
    return { count: perStep.filter((n) => n > 0).length, per: 'cycle', cycleLength: perStep.length, workouts: perStep.reduce((sum, n) => sum + n, 0) };
  }
  return { count: Object.values(weekPattern(schedule)).filter((ids) => ids.length).length, per: 'week' };
}

/** 1-based week of a fixed-length plan containing `date`, or undefined outside the program. */
export function programWeek(plan: Plan, date: ISODate): number | undefined {
  if (plan.schedule.type !== 'fixed') return undefined;
  const offset = daysBetween(plan.startDate, date);
  const week = Math.floor(offset / 7) + 1;
  return offset < 0 || week > plan.schedule.weeks ? undefined : week;
}
