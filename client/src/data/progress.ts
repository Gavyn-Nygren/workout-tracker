import { countsAsWorkout, countsForPRs, effectiveLoadKg, setVolumeKg } from './calculations';
import { addDays, startOfWeek } from './dates';
import { lbToKg } from './units';
import type { EarnedBadge, Exercise, FormReport, ID, ISODate, StreakRecord, StreakState, WorkoutSession } from './types';

// Streak and badge rules, derived from logged history (refined with the real catalog in G3.10).

const byCompletion = (a: WorkoutSession, b: WorkoutSession) => (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');

/** Finished workouts that count as workouts (at least one completed working set), oldest first. */
function countedWorkouts(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter(countsAsWorkout).sort(byCompletion);
}

/**
 * Weekly streak (spec 2.5): consecutive weeks that met the weekly target, by completion date. A
 * partial workout counts if it has a completed working set. The current week only counts once its
 * target is met, and until the week ends it doesn't break the streak. Also derives the
 * "longest weekly streak" record (spec 2.7) and the day each streak length was first reached.
 */
export function deriveStreak(sessions: WorkoutSession[], today: ISODate, weeklyTarget: number): StreakState {
  const target = Math.max(1, weeklyTarget);
  const perWeek = new Map<ISODate, { count: number; met?: { date: ISODate; sessionId: ID } }>();
  for (const s of countedWorkouts(sessions)) {
    const week = startOfWeek(s.completedDate!);
    const entry = perWeek.get(week) ?? { count: 0 };
    entry.count++;
    // The workout that brought the week to its target is when the week was met.
    if (entry.count === target) entry.met = { date: s.completedDate!, sessionId: s.id };
    perWeek.set(week, entry);
  }
  const met = (week: ISODate) => (perWeek.get(week)?.count ?? 0) >= target;
  const thisWeek = startOfWeek(today);
  const thisWeekCompleted = perWeek.get(thisWeek)?.count ?? 0;

  const milestoneDates: ISODate[] = [];
  const records: StreakRecord[] = [];
  let longest = 0;
  let run = 0;
  let longestBeforeRun = 0;
  let runRecord: StreakRecord | undefined;
  const weeks = [...perWeek.keys()].sort();
  for (let week = weeks[0]; week && week <= thisWeek; week = addDays(week, 7)) {
    if (!met(week)) {
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
    const { date, sessionId } = perWeek.get(week)!.met!;
    milestoneDates.push(date);
    // The first streak is the baseline; a later one that outlasts it is a record, growing with it.
    if (longestBeforeRun === 0) continue;
    if (!runRecord) {
      runRecord = { id: `streak_${week}`, weeks: run, previousWeeks: longestBeforeRun, achievedDate: date, sessionId };
      records.push(runRecord);
    } else Object.assign(runRecord, { weeks: run, achievedDate: date, sessionId });
  }

  let current = 0;
  for (let week = met(thisWeek) ? thisWeek : addDays(thisWeek, -7); met(week); week = addDays(week, -7)) current++;
  return { currentWeeks: current, longestWeeks: longest, thisWeekCompleted, thisWeekTarget: target, milestoneDates, records };
}

export function deriveBadges(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, formReports: FormReport[], streak: StreakState): EarnedBadge[] {
  const counted = countedWorkouts(sessions);
  const badges: EarnedBadge[] = [];
  const add = (badgeKey: string, category: EarnedBadge['category'], title: string, description: string, earnedDate?: ISODate) => {
    if (earnedDate) badges.push({ id: `badge_${badgeKey}`, badgeKey, category, title, description, earnedDate });
  };

  add('first_workout', 'milestone', 'First Rep', 'Completed your first workout.', counted[0]?.completedDate);
  add('workouts_25', 'milestone', '25 Workouts', 'Completed 25 workouts.', counted[24]?.completedDate);

  let cumulativeKg = 0;
  let volumeDate: ISODate | undefined;
  const plateDates: Record<string, ISODate | undefined> = {};
  for (const session of sessions.filter((s) => s.status === 'completed' && s.completedDate).sort(byCompletion)) {
    for (const block of session.blocks) {
      for (const se of block.exercises) {
        const exercise = exercisesById.get(se.exerciseId);
        if (!exercise) continue;
        for (const set of se.sets) {
          cumulativeKg += setVolumeKg(set, exercise);
          const load = countsForPRs(set) ? effectiveLoadKg(set, exercise) : undefined;
          if (load === undefined) continue;
          if (exercise.id === 'ex_back_squat' && load >= lbToKg(225) - 0.01) plateDates.squat2 ??= session.completedDate;
          if (exercise.id === 'ex_deadlift' && load >= lbToKg(315) - 0.01) plateDates.deadlift3 ??= session.completedDate;
        }
      }
    }
    if (!volumeDate && cumulativeKg >= lbToKg(250_000)) volumeDate = session.completedDate;
  }

  add('squat_2_plate', 'strength', '2-Plate Squat', 'Squatted 225 lb for a working set.', plateDates.squat2);
  add('deadlift_3_plate', 'strength', '3-Plate Deadlift', 'Deadlifted 315 lb for a working set.', plateDates.deadlift3);
  add('volume_250k', 'milestone', 'Quarter Million', 'Lifted 250,000 lb of total volume.', volumeDate);
  // Dated by the day the streak first reached 4 weeks, so later workouts don't move it.
  add('streak_4_weeks', 'consistency', '4-Week Streak', 'Hit your weekly target 4 weeks in a row.', streak.milestoneDates[3]);
  const firstAnalysis = formReports.filter((r) => r.status === 'ready').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  add('first_analysis', 'form', 'Camera Ready', 'Analyzed your first set on camera.', firstAnalysis?.createdAt.slice(0, 10));
  return badges;
}

/** Workouts that count, for lifetime stats (Profile). */
export function workoutCount(sessions: WorkoutSession[]): number {
  return sessions.filter(countsAsWorkout).length;
}
