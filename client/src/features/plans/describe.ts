import { trainingDays, weekdaysByWorkout } from '@/data/schedule';
import type { Exercise, Plan, PlannedExercise, PlanSchedule, PlanWorkout, ProgressionRule, StarterTemplate, UnitSystem, Weekday } from '@/data/types';
import { formatLoad, formatRepTarget, plural } from '@/lib/format';
import { formatClock, spokenDuration } from '@/hooks/useNow';

export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
export const WEEKDAY_LETTER: Record<Weekday, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 7: 'S' };
/** Full names for VoiceOver, which can read "Mon" or "M" oddly. */
export const WEEKDAY_LONG: Record<Weekday, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
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

/** "Mon, Thu" for weekly/fixed plans ("Monday, Thursday" when `long`); empty for rotating ones. */
export function workoutDays(plan: Plan | StarterTemplate, workoutId: string, long = false): string {
  const days = weekdaysByWorkout(plan.schedule).get(workoutId) ?? [];
  return days.map((d) => (long ? WEEKDAY_LONG : WEEKDAY_SHORT)[d]).join(', ');
}

/** Short label for the narrow week-grid cells: "Upper A" → "UA", "Push" → "Push". */
export function abbreviate(name: string): string {
  const words = name.split(/[\s/&-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4);
  return words.map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase())).join('').slice(0, 3);
}

/** "5 exercises · 15 working sets · ~45 min"; `spoken` gives "…, about 45 minutes" for VoiceOver. */
export function workoutStats(workout: PlanWorkout, spoken = false): string {
  const exercises = workout.blocks.reduce((n, b) => n + b.exercises.length, 0);
  const sets = workout.blocks.flatMap((b) => b.exercises).flatMap((e) => e.sets).filter((s) => s.kind !== 'warmup').length;
  if (!exercises) return 'No exercises yet';
  const minutes = workout.estimatedMinutes ? (spoken ? `about ${plural(workout.estimatedMinutes, 'minute')}` : `~${workout.estimatedMinutes} min`) : undefined;
  return [plural(exercises, 'exercise'), plural(sets, 'working set'), minutes].filter(Boolean).join(spoken ? ', ' : ' · ');
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

/** prescriptionSummary for VoiceOver: "3 sets of 5 to 8 reps, 2 warm-ups, rest 3 minutes". */
export function spokenPrescription(planned: PlannedExercise): string {
  const working = planned.sets.filter((s) => s.kind !== 'warmup');
  const warmups = planned.sets.length - working.length;
  const first = working[0];
  const target = first?.targetReps;
  const reps = target === undefined ? 'reps not set' : typeof target === 'number' ? plural(target, 'rep') : `${target.min} to ${target.max} reps`;
  const parts = [first?.kind === 'timed_hold' ? `${plural(working.length, 'hold')} of ${spokenDuration(first.targetDurationSec ?? 0)}` : `${plural(working.length, 'set')} of ${reps}`];
  if (warmups) parts.push(plural(warmups, 'warm-up'));
  if (first?.restSec) parts.push(`rest ${spokenDuration(first.restSec)}`);
  if (first?.tempo) parts.push(`tempo ${first.tempo}`);
  return parts.join(', ');
}

export function exerciseName(exercisesById: Map<string, Exercise>, id: string): string {
  return exercisesById.get(id)?.name ?? 'Exercise';
}
