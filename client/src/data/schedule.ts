import { addDays, daysBetween, isoWeekday } from './dates';
import type { ISODate, Plan, PlanSchedule, ScheduledOccurrence, Weekday } from './types';

/**
 * Calendar occurrences a plan produces between two dates (inclusive), for all three plan types
 * (spec 2.5). Paused and archived plans produce nothing. G3.3 hardens this with tests and adds
 * calendar shifts.
 */
export function scheduleOccurrences(plan: Plan, from: ISODate, to: ISODate): ScheduledOccurrence[] {
  if (plan.status !== 'active') return [];
  const occurrences: ScheduledOccurrence[] = [];
  const start = plan.startDate > from ? plan.startDate : from;

  for (let date = start; date <= to; date = addDays(date, 1)) {
    for (const workoutId of workoutsOn(plan.schedule, plan.startDate, date)) {
      occurrences.push({
        id: `occ_${plan.id}_${date}_${workoutId}`,
        planId: plan.id,
        planVersion: plan.version,
        planWorkoutId: workoutId,
        scheduledDate: date,
      });
    }
  }
  return occurrences;
}

/** Workout ids a schedule puts on one date. */
export function workoutsOn(schedule: PlanSchedule, startDate: ISODate, date: ISODate): string[] {
  const offset = daysBetween(startDate, date);
  if (offset < 0) return [];
  const weekday = isoWeekday(date);
  switch (schedule.type) {
    case 'weekly':
      return schedule.days.find((d) => d.weekday === weekday)?.workoutIds ?? [];
    case 'fixed': {
      const week = Math.floor(offset / 7) + 1;
      if (week > schedule.weeks) return [];
      return schedule.days.find((d) => d.week === week && d.weekday === weekday)?.workoutIds ?? [];
    }
    case 'rotating': {
      if (!schedule.sequence.length) return [];
      const step = schedule.sequence[offset % schedule.sequence.length];
      return step === 'rest' ? [] : [step];
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

/** Training days per week (or per cycle length for rotating plans). */
export function trainingDays(schedule: PlanSchedule): { count: number; per: 'week' | 'cycle'; cycleLength?: number } {
  if (schedule.type === 'rotating') {
    return { count: schedule.sequence.filter((s) => s !== 'rest').length, per: 'cycle', cycleLength: schedule.sequence.length };
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
