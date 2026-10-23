import { countsForPRs, effectiveLoadKg, setE1RM, setVolumeKg } from '../calculations';
import { addDays, startOfWeek } from '../dates';
import { lbToKg } from '../units';
import type { EarnedBadge, Exercise, FormReport, Goal, ISODate, PersonalRecord, StreakState, WorkoutSession } from '../types';

export { derivePersonalRecords } from '../records';

const STAMP = '2026-08-01T12:00:00.000Z';

/** Weekly streak: weeks where completed workouts (partials included) met the weekly target. */
export function deriveStreak(sessions: WorkoutSession[], today: ISODate, weeklyTarget: number): StreakState {
  const perWeek = new Map<ISODate, number>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedDate) continue;
    const week = startOfWeek(s.completedDate);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  const thisWeek = startOfWeek(today);
  const thisWeekCompleted = perWeek.get(thisWeek) ?? 0;

  const weeks = [...perWeek.keys()].sort();
  let longest = 0;
  let run = 0;
  for (let week = weeks[0]; week && week <= thisWeek; week = addDays(week, 7)) {
    const met = (perWeek.get(week) ?? 0) >= weeklyTarget;
    if (met) run++;
    else if (week !== thisWeek) run = 0;
    longest = Math.max(longest, run);
  }

  // The current week only counts once its target is met; until then it doesn't break the streak.
  let current = 0;
  for (let week = thisWeekCompleted >= weeklyTarget ? thisWeek : addDays(thisWeek, -7); (perWeek.get(week) ?? 0) >= weeklyTarget; week = addDays(week, -7)) {
    current++;
  }
  return { currentWeeks: current, longestWeeks: longest, thisWeekCompleted, thisWeekTarget: weeklyTarget };
}

export function deriveBadges(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, formReports: FormReport[], streak: StreakState): EarnedBadge[] {
  const completed = sessions.filter((s) => s.status === 'completed' && s.completedDate);
  const badges: EarnedBadge[] = [];
  const add = (badgeKey: string, category: EarnedBadge['category'], title: string, description: string, earnedDate?: ISODate) => {
    if (earnedDate) badges.push({ id: `badge_${badgeKey}`, badgeKey, category, title, description, earnedDate });
  };

  add('first_workout', 'milestone', 'First Rep', 'Completed your first workout.', completed[0]?.completedDate);
  add('workouts_25', 'milestone', '25 Workouts', 'Completed 25 workouts.', completed[24]?.completedDate);

  let cumulativeKg = 0;
  let volumeDate: ISODate | undefined;
  const plateDates: Record<string, ISODate | undefined> = {};
  for (const session of completed) {
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
  if (streak.longestWeeks >= 4) add('streak_4_weeks', 'consistency', '4-Week Streak', 'Hit your weekly target 4 weeks in a row.', completed.at(-1)?.completedDate);
  add('first_analysis', 'form', 'Camera Ready', 'Analyzed your first set on camera.', formReports[0]?.createdAt.slice(0, 10));
  return badges;
}

export function fakeGoals(today: ISODate): Goal[] {
  return [
    { id: 'goal_bench', title: 'Bench 225 × 5', type: 'lift', exerciseId: 'ex_bench_press', target: { kind: 'load_reps', loadKg: lbToKg(225), reps: 5 }, deadline: addDays(today, 56), createdAt: STAMP, updatedAt: STAMP },
    { id: 'goal_frequency', title: 'Train 4× per week', type: 'frequency', workoutsPerWeek: 4, createdAt: STAMP, updatedAt: STAMP },
    { id: 'goal_bodyweight', title: 'Reach 180 lb', type: 'bodyweight', targetKg: lbToKg(180), startKg: lbToKg(186), deadline: addDays(today, 30), createdAt: STAMP, updatedAt: STAMP },
    { id: 'goal_squat_depth', title: 'Squat depth: 70° knee angle', type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg: 70, startDeg: 83, createdAt: STAMP, updatedAt: STAMP },
  ];
}
