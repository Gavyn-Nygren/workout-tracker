import { countsAsWorkout } from './calculations';
import { addDays, startOfWeek } from './dates';
import { flatWeekTargets, type WeekTargetLookup } from './weekTargets';
import type { ISODate, StreakRecord, StreakState, StreakWeek, Weekday, WorkoutSession } from './types';

// Streak rules, derived from logged history. Badges are in badges.ts, goals in goals.ts.

const byCompletion = (a: WorkoutSession, b: WorkoutSession) => (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');

/** Finished workouts that count as workouts (at least one completed working set), oldest first. */
function countedWorkouts(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter(countsAsWorkout).sort(byCompletion);
}

/**
 * Weekly streak (spec 2.5): consecutive weeks that met their target, by completion date. Each week
 * has its own target from `targets` (see weekTargets.ts): the stored one for a week that has ended,
 * live for this week. A plain number is the same target every week. A partial workout counts if
 * it has a completed working set. The current week only counts once its target is met, and until
 * the week ends it doesn't break the streak. Also derives the "longest weekly streak" record
 * (spec 2.7) and the day each streak length was first reached.
 */
export function deriveStreak(sessions: WorkoutSession[], today: ISODate, targets: WeekTargetLookup | number, weekStartsOn: Weekday = 1): StreakState {
  const targetOf = typeof targets === 'number' ? flatWeekTargets(targets) : targets;
  const doneByWeek = new Map<ISODate, WorkoutSession[]>();
  for (const s of countedWorkouts(sessions)) {
    const week = startOfWeek(s.completedDate!, weekStartsOn);
    const done = doneByWeek.get(week) ?? [];
    done.push(s);
    doneByWeek.set(week, done);
  }
  const thisWeek = startOfWeek(today, weekStartsOn);

  const weeks: StreakWeek[] = [];
  // The workout that brought each met week to its target is when the week was met.
  const metBy = new Map<ISODate, WorkoutSession>();
  for (let week = [...doneByWeek.keys()].sort()[0]; week && week <= thisWeek; week = addDays(week, 7)) {
    const done = doneByWeek.get(week) ?? [];
    const { target: wanted, source, planned, frozen } = targetOf(week);
    const target = Math.max(1, Math.round(wanted));
    const met = done.length >= target;
    if (met) metBy.set(week, done[target - 1]);
    weeks.push({ weekStart: week, target, source, planned, completed: done.length, met, frozen });
  }

  const milestoneDates: ISODate[] = [];
  const records: StreakRecord[] = [];
  let longest = 0;
  let run = 0;
  let longestBeforeRun = 0;
  let runRecord: StreakRecord | undefined;
  for (const { weekStart: week, met } of weeks) {
    if (!met) {
      if (week !== thisWeek) run = 0;
      continue;
    }
    if (run === 0) {
      longestBeforeRun = longest;
      runRecord = undefined;
    }
    run++;
    if (run <= longest) continue;
    longest = run;
    const { completedDate: date, id: sessionId } = metBy.get(week)!;
    milestoneDates.push(date!);
    // The first streak is the baseline; a later one that outlasts it is a record, growing with it.
    if (longestBeforeRun === 0) continue;
    if (!runRecord) {
      runRecord = { id: `streak_${week}`, weeks: run, previousWeeks: longestBeforeRun, achievedDate: date!, sessionId };
      records.push(runRecord);
    } else Object.assign(runRecord, { weeks: run, achievedDate: date, sessionId });
  }

  // This week is last when there's a counted workout by now; until it's met it doesn't break the run.
  let i = weeks.length - 1;
  if (weeks[i]?.weekStart === thisWeek && !weeks[i].met) i--;
  let current = 0;
  for (; i >= 0 && weeks[i].met; i--) current++;

  // Before any counted workout, this week isn't in `weeks`; its target still shows on Home.
  const now = weeks.at(-1)?.weekStart === thisWeek ? weeks.at(-1)! : { ...targetOf(thisWeek), completed: 0 };
  return {
    currentWeeks: current,
    longestWeeks: longest,
    thisWeekCompleted: now.completed,
    thisWeekTarget: Math.max(1, Math.round(now.target)),
    thisWeekSource: now.source,
    thisWeekPlanned: now.planned,
    weeks,
    milestoneDates,
    records,
  };
}

/** Workouts that count, for lifetime stats (Profile). */
export function workoutCount(sessions: WorkoutSession[]): number {
  return sessions.filter(countsAsWorkout).length;
}
