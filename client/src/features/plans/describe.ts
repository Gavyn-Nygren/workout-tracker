import { plannedWorkingField } from '@/data/logging';
import { trainingDays, weekdaysByWorkout } from '@/data/schedule';
import type { Exercise, Plan, PlannedExercise, PlanSchedule, PlanWorkout, ProgressionRule, SetPrescription, StarterTemplate, TemplateDayOption, UnitSystem, Weekday } from '@/data/types';
import { kgToLb } from '@/data/units';
import { formatLoad, formatRepTarget, plural, sortWeekdays, unitLabel, WEEKDAY_LONG, WEEKDAY_SHORT } from '@/lib/format';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { templateDayOptions } from './planEdits';

// The weekday names live in lib/format with the week-order helpers; re-exported for existing imports.
export { WEEKDAY_LETTER, WEEKDAY_LONG, WEEKDAY_SHORT } from '@/lib/format';
/** ISO order (Monday first). For display order, use weekdayOrder(weekStartsOn) from lib/format. */
export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const PLAN_TYPE_LABEL: Record<PlanSchedule['type'], string> = { weekly: 'Weekly', fixed: 'Fixed-length', rotating: 'Rotating' };

export const CATEGORY_LABEL: Record<StarterTemplate['category'], string> = {
  bodybuilding: 'Bodybuilding',
  powerlifting: 'Powerlifting',
  atg: 'Full range',
  crossfit: 'Conditioning',
  athletic: 'Athletic',
  bodyweight: 'Bodyweight',
  gym: 'Gym',
};

export const LEVEL_LABEL: Record<StarterTemplate['level'], string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/**
 * A template's meta line on its card and page: "Beginner  ·  2 or 3 days/week  ·  Ongoing", with
 * every version's days (templateDayOptions), or only `option`'s ("Beginner  ·  3 days/week  ·
 * 8 weeks") once a version is picked.
 */
export function templateMeta(template: StarterTemplate, option?: Pick<TemplateDayOption, 'daysPerWeek'>): string {
  const counts = option ? [option.daysPerWeek] : [...new Set(templateDayOptions(template).map((o) => o.daysPerWeek))];
  const list = counts.length > 1 ? `${counts.slice(0, -1).join(', ')} or ${counts[counts.length - 1]}` : String(counts[0]);
  const days = `${list} ${counts.length === 1 && counts[0] === 1 ? 'day' : 'days'}/week`;
  return [LEVEL_LABEL[template.level], days, template.durationWeeks ? `${template.durationWeeks} weeks` : 'Ongoing'].join('  ·  ');
}

/** "Weekly · 4 days" / "Fixed-length · 12 weeks · 3 days" / "Rotating · 4-day cycle" */
export function describeSchedule(schedule: PlanSchedule): string {
  const days = trainingDays(schedule);
  if (schedule.type === 'rotating') return `Rotating · ${plural(days.count, 'workout')} in a ${days.cycleLength}-day cycle`;
  const base = `${plural(days.count, 'day')} a week`;
  return schedule.type === 'fixed' ? `${schedule.weeks} weeks · ${base}` : `Weekly · ${base}`;
}

/**
 * "Mon, Thu" for weekly/fixed plans ("Monday, Thursday" when `long`), in the week-start's order;
 * empty for rotating ones.
 */
export function workoutDays(plan: Plan | StarterTemplate, workoutId: string, long = false, weekStartsOn: Weekday = 1): string {
  const days = sortWeekdays(weekdaysByWorkout(plan.schedule).get(workoutId) ?? [], weekStartsOn);
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

/**
 * A rep-range rule's step as the engine takes it (features/workout/progression.ts, `moved`): the
 * stored kg in the user's units, rounded to whole rounding steps, and at least one step. So
 * lbToKg(5) is 5 lb, and in kg 2.5 on a barbell, 2 on dumbbells or 4 on kettlebells; 2.5 kg is
 * 5 lb. `direction` −1 is a step that takes assistance off, which rounds a half step down as the
 * engine does. A rounding step of 0 or less leaves the value unrounded, as the engine does too.
 * The value is in the user's units, not kg.
 */
export function shownIncrement(incrementKg: number, units: UnitSystem, roundingStep: number, direction: 1 | -1 = 1): number {
  const value = units === 'imperial' ? kgToLb(incrementKg) : incrementKg;
  // Float noise from the kg/lb round trip: lbToKg(5) shows as 4.9999… lb.
  const clean = (n: number) => Math.round(n * 1e6) / 1e6;
  if (!(roundingStep > 0)) return clean(value);
  const steps = value / roundingStep;
  return clean(Math.max(1, direction > 0 ? Math.round(steps) : -Math.round(-steps)) * roundingStep);
}

/**
 * A progression rule in a few words, for the plan workout's exercise list: "+5 lb at top of range
 * · deload 10% after 3 misses", "+5 lb when every set hits 5 · repeat on a miss" (fixed reps, from
 * `sets`), "+2.5% a week · repeat on a miss". When the working sets log assistance (`exercise`
 * assisted, or sets planned as Assisted), progress takes assistance away, so it says that: "5 lb
 * less assistance at top of range · 10% more assistance after 3 misses". With `roundingStep` (the
 * exercise's, from roundingIncrementFor) a rep-range step reads as the engine takes it
 * (shownIncrement): "+2.5 kg", not "+2.3 kg", for a 5 lb step in kg. Without it, the stored step
 * is shown as it is.
 */
export function describeProgression(
  rule: ProgressionRule | undefined,
  units: UnitSystem,
  sets: readonly SetPrescription[] = [],
  exercise?: Pick<Exercise, 'isBodyweight' | 'isAssisted'>,
  roundingStep?: number,
): string {
  if (!rule) return 'No auto progression';
  const { onMiss } = rule;
  const assisted = plannedWorkingField(sets, exercise) === 'assistanceKg';
  const misses = onMiss.type === 'deload' ? (onMiss.afterConsecutiveMisses === 1 ? 'a miss' : `${onMiss.afterConsecutiveMisses} misses`) : '';
  const miss = onMiss.type === 'repeat' ? 'repeat on a miss' : assisted ? `${onMiss.percent}% more assistance after ${misses}` : `deload ${onMiss.percent}% after ${misses}`;
  if (rule.type === 'percent_weekly') return `${assisted ? `${rule.percent}% less assistance` : `+${rule.percent}%`} a week · ${miss}`;
  // The sets the rule reads: normal and assisted ones (features/workout/progression.ts).
  const targets = sets.filter((s) => s.kind === 'normal' || s.kind === 'assisted').flatMap((s) => (s.targetReps === undefined ? [] : [s.targetReps]));
  const fixed = targets.length > 0 && targets.every((t) => typeof t === 'number');
  const when = !fixed ? 'at top of range' : new Set(targets).size === 1 ? `when every set hits ${targets[0]}` : 'when every set hits its reps';
  // As the reason line shows a change (progression.ts): up to two decimals, so 1.25 kg reads 1.25.
  const step = roundingStep === undefined ? formatLoad(rule.incrementKg, units) : `${Math.round(shownIncrement(rule.incrementKg, units, roundingStep, assisted ? -1 : 1) * 100) / 100} ${unitLabel(units)}`;
  return `${assisted ? `${step} less assistance` : `+${step}`} ${when} · ${miss}`;
}

/**
 * The plan editor's note under "If you miss the target reps" (G3.9 decision D): what counts as a
 * miss, from the working sets' rep targets (a fixed target of n is n to n). A set below the bottom
 * of its range is a miss; inside the range it isn't. With a deload, only misses in a row at the
 * same weight (or assistance, for `assisted` sets) count.
 */
export function missHint(ranges: readonly ({ min: number; max: number } | undefined)[], deload: boolean, assisted = false): string {
  const targets = ranges.filter((r) => r !== undefined);
  if (!targets.length) return 'Add target reps to the sets so the rule can tell when you hit or miss them.';
  const range = targets.find((r) => r.min < r.max);
  const what = range
    ? `A set below the bottom of its range counts as a miss: fewer than ${plural(range.min, 'rep')} for ${range.min}–${range.max}.`
    : 'A set with fewer reps than its target counts as a miss.';
  return deload ? `${what} Only misses in a row at the same ${assisted ? 'assistance' : 'weight'} count toward a deload.` : what;
}

/**
 * "3 × 5–8 · 2 warm-ups · rest 3:00". The rest shows only when the plan sets one: a blank rest
 * uses the exercise's own (remembered, or the default from Settings), so there's no plan rest to show.
 */
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

/**
 * The plan editor's note under the sets: what a rest left on Auto does, the way the rest timer
 * works it out (features/workout/rest.ts). Straight sets use the exercise's remembered rest or its
 * type's default; warm-ups always use the warm-up default; in a superset or circuit the working
 * sets rest after each round. `spoken` is for VoiceOver: it names the settings screen without the
 * arrow, and reads the round rest as words.
 */
export function autoRestHint(sets: readonly SetPrescription[], group: { type: 'superset' | 'circuit'; roundRestSec: number } | undefined, spoken = false): string {
  const where = spoken ? 'in Profile, Workout defaults' : 'in Profile → Workout defaults';
  const warmups = sets.some((s) => s.kind === 'warmup');
  if (group) {
    const round = spoken ? spokenDuration(group.roundRestSec) : formatClock(group.roundRestSec);
    return `In this ${group.type}, you rest ${round} after each round.${warmups ? ` Warm-ups left on Auto use your warm-up default ${where}.` : ''}`;
  }
  return warmups
    ? `Working sets left on Auto use the rest remembered for this exercise, or your default ${where}. Warm-ups left on Auto use your warm-up default.`
    : `Leave rest on Auto to use the rest remembered for this exercise, or your default ${where}.`;
}

export function exerciseName(exercisesById: Map<string, Exercise>, id: string): string {
  return exercisesById.get(id)?.name ?? 'Exercise';
}
