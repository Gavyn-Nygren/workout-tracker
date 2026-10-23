import { trainingDays, weekdaysByWorkout } from '@/data/schedule';
import type { Exercise, Plan, PlannedExercise, PlanSchedule, PlanWorkout, ProgressionRule, StarterTemplate, UnitSystem, Weekday } from '@/data/types';
import { formatLoad, formatRepTarget, plural } from '@/lib/format';
import { formatClock } from '@/hooks/useNow';

export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
export const WEEKDAY_LETTER: Record<Weekday, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 7: 'S' };
export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const PLAN_TYPE_LABEL: Record<PlanSchedule['type'], string> = { weekly: 'Weekly', fixed: 'Fixed-length', rotating: 'Rotating' };

export const CATEGORY_LABEL: Record<StarterTemplate['category'], string> = {
  bodybuilding: 'Bodybuilding',
  powerlifting: 'Powerlifting',
  atg: 'ATG',
  crossfit: 'Conditioning',
  athletic: 'Athletic',
  bodyweight: 'Bodyweight',
  gym: 'Gym',
};

export const LEVEL_LABEL: Record<StarterTemplate['level'], string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** "Weekly · 4 days" / "Fixed-length · 12 weeks · 3 days" / "Rotating · 4-day cycle" */
export function describeSchedule(schedule: PlanSchedule): string {
  const days = trainingDays(schedule);
  if (schedule.type === 'rotating') return `Rotating · ${plural(days.count, 'workout')} in a ${days.cycleLength}-day cycle`;
  const base = `${plural(days.count, 'day')} a week`;
  return schedule.type === 'fixed' ? `${schedule.weeks} weeks · ${base}` : `Weekly · ${base}`;
}

/** "Mon, Thu" for weekly/fixed plans; empty for rotating ones. */
export function workoutDays(plan: Plan | StarterTemplate, workoutId: string): string {
  const days = weekdaysByWorkout(plan.schedule).get(workoutId) ?? [];
  return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** Short label for the narrow week-grid cells: "Upper A" → "UA", "Push" → "Push". */
export function abbreviate(name: string): string {
  const words = name.split(/[\s/&-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4);
  return words.map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase())).join('').slice(0, 3);
}

export function workoutStats(workout: PlanWorkout): string {
  const exercises = workout.blocks.reduce((n, b) => n + b.exercises.length, 0);
  const sets = workout.blocks.flatMap((b) => b.exercises).flatMap((e) => e.sets).filter((s) => s.kind !== 'warmup').length;
  if (!exercises) return 'No exercises yet';
  return `${plural(exercises, 'exercise')} · ${plural(sets, 'working set')}${workout.estimatedMinutes ? ` · ~${workout.estimatedMinutes} min` : ''}`;
}

export function describeProgression(rule: ProgressionRule | undefined, units: UnitSystem): string {
  if (!rule) return 'No auto progression';
  const miss = rule.onMiss.type === 'repeat' ? 'repeat on a miss' : `deload ${rule.onMiss.percent}% after ${rule.onMiss.afterConsecutiveMisses} misses`;
  return rule.type === 'rep_range' ? `+${formatLoad(rule.incrementKg, units)} at top of range · ${miss}` : `+${rule.percent}% a week · ${miss}`;
}

/** "3 × 5–8 · 2 warm-ups · rest 3:00" */
export function prescriptionSummary(planned: PlannedExercise): string {
  const working = planned.sets.filter((s) => s.kind !== 'warmup');
  const warmups = planned.sets.length - working.length;
  const first = working[0];
  const parts = [first?.kind === 'timed_hold' ? `${working.length} × ${first.targetDurationSec ?? 0} s` : `${working.length} × ${formatRepTarget(first?.targetReps) || '?'}`];
  if (warmups) parts.push(plural(warmups, 'warm-up'));
  if (first?.restSec) parts.push(`rest ${formatClock(first.restSec)}`);
  if (first?.tempo) parts.push(`tempo ${first.tempo}`);
  return parts.join(' · ');
}

export function exerciseName(exercisesById: Map<string, Exercise>, id: string): string {
  return exercisesById.get(id)?.name ?? 'Exercise';
}
