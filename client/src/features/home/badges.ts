import type { SFSymbol } from 'expo-symbols';

import { countsForPRs, effectiveLoadKg, setVolumeKg } from '@/data/calculations';
import type { BadgeCategory, EarnedBadge, Exercise, FormReport, StreakState, WorkoutSession } from '@/data/types';
import { lbToKg } from '@/data/units';

export const BADGE_ICON: Record<BadgeCategory, SFSymbol> = {
  milestone: 'flag.checkered',
  strength: 'dumbbell.fill',
  consistency: 'flame.fill',
  form: 'video.fill',
};

export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = {
  milestone: 'Milestone',
  strength: 'Strength',
  consistency: 'Consistency',
  form: 'Form',
};

/** A badge not yet earned, with progress toward it. */
export type NextBadge = {
  badgeKey: string;
  category: BadgeCategory;
  title: string;
  description: string;
  current: number;
  target: number;
  /** e.g. "41 / 50 workouts" */
  progressLabel: string;
};

type Stats = { workouts: number; volumeLb: number; bestLb: Map<string, number>; streakWeeks: number; recordings: number };

function stats(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, streak: StreakState | undefined, formReports: FormReport[]): Stats {
  const completed = sessions.filter((s) => s.status === 'completed');
  let volumeKg = 0;
  const best = new Map<string, number>();
  for (const s of completed) {
    for (const entry of s.blocks.flatMap((b) => b.exercises)) {
      const exercise = exercisesById.get(entry.exerciseId);
      if (!exercise) continue;
      for (const set of entry.sets) {
        volumeKg += setVolumeKg(set, exercise);
        const load = countsForPRs(set) ? effectiveLoadKg(set, exercise) : undefined;
        if (load !== undefined) best.set(exercise.id, Math.max(best.get(exercise.id) ?? 0, load));
      }
    }
  }
  const toLb = (kg: number) => kg / lbToKg(1);
  return {
    workouts: completed.length,
    volumeLb: toLb(volumeKg),
    bestLb: new Map([...best].map(([id, kg]) => [id, toLb(kg)])),
    streakWeeks: streak?.currentWeeks ?? 0,
    recordings: formReports.length,
  };
}

/**
 * Upcoming badges with progress, nearest first. The final catalog and thresholds are a content
 * task (roadmap G3.10); these are representative ones for the Home design.
 */
export function nextBadges(input: {
  earned: EarnedBadge[];
  sessions: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  streak?: StreakState;
  formReports: FormReport[];
  limit?: number;
}): NextBadge[] {
  const s = stats(input.sessions, input.exercisesById, input.streak, input.formReports);
  const lift = (id: string) => Math.round(s.bestLb.get(id) ?? 0);
  const catalog: NextBadge[] = [
    { badgeKey: 'workouts_50', category: 'milestone', title: '50 Workouts', description: 'Complete 50 workouts.', current: s.workouts, target: 50, progressLabel: `${s.workouts} / 50 workouts` },
    { badgeKey: 'workouts_100', category: 'milestone', title: '100 Workouts', description: 'Complete 100 workouts.', current: s.workouts, target: 100, progressLabel: `${s.workouts} / 100 workouts` },
    { badgeKey: 'streak_12_weeks', category: 'consistency', title: '12-Week Streak', description: 'Hit your weekly target 12 weeks in a row.', current: s.streakWeeks, target: 12, progressLabel: `${s.streakWeeks} / 12 weeks` },
    {
      badgeKey: 'volume_500k',
      category: 'milestone',
      title: 'Half a Million',
      description: 'Lift 500,000 lb of total volume.',
      current: Math.round(s.volumeLb),
      target: 500_000,
      progressLabel: `${Math.round(s.volumeLb / 1000)}k / 500k lb`,
    },
    { badgeKey: 'bench_2_plate', category: 'strength', title: '2-Plate Bench', description: 'Bench 225 lb for a working set.', current: lift('ex_bench_press'), target: 225, progressLabel: `${lift('ex_bench_press')} / 225 lb` },
    { badgeKey: 'squat_3_plate', category: 'strength', title: '3-Plate Squat', description: 'Squat 315 lb for a working set.', current: lift('ex_back_squat'), target: 315, progressLabel: `${lift('ex_back_squat')} / 315 lb` },
    { badgeKey: 'deadlift_4_plate', category: 'strength', title: '4-Plate Deadlift', description: 'Deadlift 405 lb for a working set.', current: lift('ex_deadlift'), target: 405, progressLabel: `${lift('ex_deadlift')} / 405 lb` },
    { badgeKey: 'form_10', category: 'form', title: 'Film Study', description: 'Analyze 10 sets on camera.', current: s.recordings, target: 10, progressLabel: `${s.recordings} / 10 recordings` },
  ];
  const earned = new Set(input.earned.map((b) => b.badgeKey));
  return catalog
    .filter((b) => !earned.has(b.badgeKey) && b.current < b.target)
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, input.limit ?? 3);
}
