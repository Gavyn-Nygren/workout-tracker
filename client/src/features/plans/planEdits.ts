import { addDays, startOfWeek, todayISO } from '@/data/dates';
import { cycleSteps, fixedFromPattern, scheduledWorkoutIds, weeklyFromPattern, weekPattern } from '@/data/schedule';
import type {
  CycleStep,
  ID,
  ISODate,
  Plan,
  PlannedBlock,
  PlannedExercise,
  PlanSchedule,
  PlanWorkout,
  SetPrescription,
  StarterTemplate,
  TemplateDayOption,
  Weekday,
} from '@/data/types';
import { sortWeekdays, WEEKDAY_LONG } from '@/lib/format';
import { newId } from '@/lib/id';

// Pure edits to a plan. Screens apply one and save the result (the repository rebuilds the
// upcoming calendar; logged history is never touched).

export function updateWorkout(plan: Plan, workoutId: string, fn: (w: PlanWorkout) => PlanWorkout): Plan {
  return { ...plan, workouts: plan.workouts.map((w) => (w.id === workoutId ? fn(w) : w)) };
}

export function updatePlanned(plan: Plan, workoutId: string, plannedId: string, fn: (p: PlannedExercise) => PlannedExercise): Plan {
  return updateWorkout(plan, workoutId, (w) => ({
    ...w,
    blocks: w.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => (e.id === plannedId ? fn(e) : e)) })),
  }));
}

/**
 * Three straight sets of 8-12. No rest is set, so they rest like the exercise does anywhere else:
 * its remembered rest, or its type's default from Settings (spec 2.6), until the user types one.
 */
export function defaultSets(): SetPrescription[] {
  return [1, 2, 3].map(() => ({ kind: 'normal' as const, modifiers: [], targetReps: { min: 8, max: 12 }, targetRir: 2 }));
}

/** "Add warm-up": a warm-up set of 5 first, rest left blank so it uses the warm-up default from Settings. */
export function withWarmupSet(planned: PlannedExercise): PlannedExercise {
  return { ...planned, sets: [{ kind: 'warmup', modifiers: [], targetReps: 5 }, ...planned.sets] };
}

export function addExercise(plan: Plan, workoutId: string, exerciseId: string): Plan {
  const block: PlannedBlock = {
    id: newId('pb'),
    type: 'single',
    exercises: [{ id: newId('pe'), exerciseId, sets: defaultSets() }],
  };
  return updateWorkout(plan, workoutId, (w) => ({ ...w, blocks: [...w.blocks, block] }));
}

export function swapExercise(plan: Plan, workoutId: string, plannedId: string, exerciseId: string): Plan {
  return updatePlanned(plan, workoutId, plannedId, (p) => ({ ...p, exerciseId }));
}

export function removeExercise(plan: Plan, workoutId: string, plannedId: string): Plan {
  return updateWorkout(plan, workoutId, (w) => ({
    ...w,
    blocks: w.blocks
      .map((b) => {
        const exercises = b.exercises.filter((e) => e.id !== plannedId);
        return { ...b, exercises, type: exercises.length > 1 ? b.type : 'single' };
      })
      .filter((b) => b.exercises.length > 0),
  }));
}

export function moveBlock(plan: Plan, workoutId: string, from: number, to: number): Plan {
  return updateWorkout(plan, workoutId, (w) => {
    const blocks = [...w.blocks];
    const [moved] = blocks.splice(from, 1);
    if (moved) blocks.splice(Math.max(0, Math.min(blocks.length, to)), 0, moved);
    return { ...w, blocks };
  });
}

/** The set with its rest left blank, so it rests like the exercise does (see `defaultSets`). */
function withoutRest({ restSec: _, ...set }: SetPrescription): SetPrescription {
  return set;
}

/**
 * Joins a block with the next one into a superset, keeping the first block's position. The sets'
 * own rests are left blank: in a superset you rest after each round instead.
 */
export function supersetWithNext(plan: Plan, workoutId: string, blockIndex: number): Plan {
  return updateWorkout(plan, workoutId, (w) => {
    const current = w.blocks[blockIndex];
    const next = w.blocks[blockIndex + 1];
    if (!current || !next) return w;
    const merged: PlannedBlock = {
      id: current.id,
      type: current.type === 'circuit' || current.exercises.length + next.exercises.length > 2 ? 'circuit' : 'superset',
      roundRestSec: current.roundRestSec ?? 90,
      transitionRestSec: current.transitionRestSec,
      exercises: [...current.exercises, ...next.exercises].map((e) => ({ ...e, sets: e.sets.map(withoutRest) })),
    };
    return { ...w, blocks: [...w.blocks.slice(0, blockIndex), merged, ...w.blocks.slice(blockIndex + 2)] };
  });
}

/**
 * Splits a superset or circuit back into single exercises. No rest is filled in: a set keeps a rest
 * typed for it, and a blank one rests like the exercise does (see `defaultSets`).
 */
export function ungroup(plan: Plan, workoutId: string, blockIndex: number): Plan {
  return updateWorkout(plan, workoutId, (w) => {
    const block = w.blocks[blockIndex];
    if (!block || block.type === 'single') return w;
    const singles: PlannedBlock[] = block.exercises.map((e) => ({
      id: newId('pb'),
      type: 'single',
      exercises: [{ ...e, sets: e.sets.map((s) => (s.restSec ? s : withoutRest(s))) }],
    }));
    return { ...w, blocks: [...w.blocks.slice(0, blockIndex), ...singles, ...w.blocks.slice(blockIndex + 1)] };
  });
}

export function addWorkout(plan: Plan, name: string): { plan: Plan; workoutId: string } {
  const workout: PlanWorkout = { id: newId('pw'), name, blocks: [], estimatedMinutes: 45 };
  return { plan: { ...plan, workouts: [...plan.workouts, workout] }, workoutId: workout.id };
}

/**
 * Removes a workout and every place the schedule uses it. A cycle day it was on keeps its place,
 * as a rest day if nothing else is on it (owner's pick), so the cycle keeps its length and later
 * dates keep their days.
 */
export function removeWorkout(plan: Plan, workoutId: string): Plan {
  const schedule: PlanSchedule =
    plan.schedule.type === 'rotating'
      ? { type: 'rotating', steps: cycleSteps(plan.schedule).map((step) => ({ workoutIds: step.workoutIds.filter((id) => id !== workoutId) })) }
      : plan.schedule.type === 'weekly'
        ? { ...plan.schedule, days: plan.schedule.days.map((d) => ({ ...d, workoutIds: d.workoutIds.filter((id) => id !== workoutId) })).filter((d) => d.workoutIds.length) }
        : { ...plan.schedule, days: plan.schedule.days.map((d) => ({ ...d, workoutIds: d.workoutIds.filter((id) => id !== workoutId) })).filter((d) => d.workoutIds.length) };
  return { ...plan, schedule, workouts: plan.workouts.filter((w) => w.id !== workoutId) };
}

/** Adds or removes a workout on a weekday (weekly and fixed plans; fixed plans change every week). */
export function toggleWeekday(plan: Plan, weekday: Weekday, workoutId: string): Plan {
  if (plan.schedule.type === 'rotating') return plan;
  const pattern = weekPattern(plan.schedule);
  pattern[weekday] = pattern[weekday].includes(workoutId) ? pattern[weekday].filter((id) => id !== workoutId) : [...pattern[weekday], workoutId];
  const schedule = plan.schedule.type === 'weekly' ? weeklyFromPattern(pattern) : fixedFromPattern(plan.schedule.weeks, pattern);
  return { ...plan, schedule };
}

export function setProgramWeeks(plan: Plan, weeks: number): Plan {
  if (plan.schedule.type !== 'fixed') return plan;
  return { ...plan, schedule: fixedFromPattern(weeks, weekPattern(plan.schedule)) };
}

// Cycle edits, for rotating plans (other plans come back unchanged). A step index is the day's
// 0-based place in the cycle. Each edit goes through setCycleSteps, so what's saved is always clean.

/**
 * Replaces a rotating plan's cycle. Each step is copied, without repeats (they'd share an
 * occurrence id) or ids that aren't the plan's workouts. An empty step is a rest day.
 */
export function setCycleSteps(plan: Plan, steps: CycleStep[]): Plan {
  if (plan.schedule.type !== 'rotating') return plan;
  const known = new Set(plan.workouts.map((w) => w.id));
  return { ...plan, schedule: { type: 'rotating', steps: steps.map((step) => ({ workoutIds: [...new Set(step.workoutIds)].filter((id) => known.has(id)) })) } };
}

/** The plan's cycle, or none for other plans. */
const stepsOf = (plan: Plan): CycleStep[] => (plan.schedule.type === 'rotating' ? cycleSteps(plan.schedule) : []);

/** Adds a workout to a cycle day (at the end), or takes it off; a day left with none is a rest day. */
export function toggleCycleWorkout(plan: Plan, stepIndex: number, workoutId: ID): Plan {
  const steps = stepsOf(plan);
  const step = steps[stepIndex];
  if (!step) return plan;
  const workoutIds = step.workoutIds.includes(workoutId) ? step.workoutIds.filter((id) => id !== workoutId) : [...step.workoutIds, workoutId];
  return setCycleSteps(plan, steps.map((s, i) => (i === stepIndex ? { workoutIds } : s)));
}

/** Adds a day to the end of the cycle: these workouts, or a rest day for none. */
export function addCycleDay(plan: Plan, workoutIds: ID[]): Plan {
  return setCycleSteps(plan, [...stepsOf(plan), { workoutIds }]);
}

/** Deletes one day of the cycle; every later date then runs a different day. */
export function deleteCycleDay(plan: Plan, stepIndex: number): Plan {
  const steps = stepsOf(plan);
  if (!steps[stepIndex]) return plan;
  return setCycleSteps(plan, steps.filter((_, i) => i !== stepIndex));
}

/** Moves a cycle day from one place to another (ReorderList's drag). */
export function moveCycleDay(plan: Plan, from: number, to: number): Plan {
  const steps = [...stepsOf(plan)];
  if (!steps[from]) return plan;
  const [moved] = steps.splice(from, 1);
  steps.splice(Math.max(0, Math.min(steps.length, to)), 0, moved);
  return setCycleSteps(plan, steps);
}

/**
 * The first day of next week, for "start today or next Monday" (spec 2.5): next Monday, or next
 * Sunday when weeks start on Sunday. Always after `from`, so on a Monday it's a week later rather
 * than a second "today".
 */
export function nextWeekStart(from: ISODate = todayISO(), weekStartsOn: Weekday = 1): ISODate {
  return addDays(startOfWeek(from, weekStartsOn), 7);
}

/**
 * A template's "days a week" versions, fewest days first: its own schedule (the default) and
 * `otherDays`. A template with one version gives one option.
 */
export function templateDayOptions(template: Pick<StarterTemplate, 'daysPerWeek' | 'schedule' | 'otherDays'>): TemplateDayOption[] {
  const options: TemplateDayOption[] = [{ daysPerWeek: template.daysPerWeek, schedule: template.schedule }, ...(template.otherDays ?? [])];
  // A stable sort, on a new array: the template's own list is left as it is.
  return options.sort((a, b) => a.daysPerWeek - b.daysPerWeek);
}

/** The version with `daysPerWeek` days a week; the default when it's missing or no version has that many. */
export function templateDayOption(template: Pick<StarterTemplate, 'daysPerWeek' | 'schedule' | 'otherDays'>, daysPerWeek?: number): TemplateDayOption {
  const fallback: TemplateDayOption = { daysPerWeek: template.daysPerWeek, schedule: template.schedule };
  if (daysPerWeek === undefined || daysPerWeek === template.daysPerWeek) return fallback;
  return template.otherDays?.find((o) => o.daysPerWeek === daysPerWeek) ?? fallback;
}

/**
 * Copies a template into a new plan with fresh ids, so later template changes never touch it.
 * `daysPerWeek` picks one of its versions (templateDayOptions); without one, or with a count no
 * version has, it's the default. Only the workouts that version schedules are copied.
 */
export function planFromTemplate(template: StarterTemplate, startDate: ISODate, opts: { daysPerWeek?: number } = {}): Plan {
  const chosen = templateDayOption(template, opts.daysPerWeek).schedule;
  const used = scheduledWorkoutIds(chosen);
  const workouts = template.workouts.filter((w) => used.has(w.id));
  const workoutIds = new Map(workouts.map((w) => [w.id, newId('pw')]));
  const mapId = (id: string) => workoutIds.get(id) ?? id;
  const schedule: PlanSchedule =
    chosen.type === 'rotating'
      ? { type: 'rotating', steps: cycleSteps(chosen).map((step) => ({ workoutIds: step.workoutIds.map(mapId) })) }
      : chosen.type === 'weekly'
        ? { type: 'weekly', days: chosen.days.map((d) => ({ ...d, workoutIds: d.workoutIds.map(mapId) })) }
        : { type: 'fixed', weeks: chosen.weeks, days: chosen.days.map((d) => ({ ...d, workoutIds: d.workoutIds.map(mapId) })) };
  const now = new Date().toISOString();
  return {
    id: newId('plan'),
    name: template.name,
    templateId: template.id,
    version: 1,
    status: 'active',
    startDate,
    schedule,
    workouts: workouts.map((w) => ({
      ...w,
      id: mapId(w.id),
      // A deep copy: the plan shares nothing with the template, so template updates never reach it.
      blocks: (JSON.parse(JSON.stringify(w.blocks)) as PlannedBlock[]).map((b) => ({ ...b, id: newId('pb'), exercises: b.exercises.map((e) => ({ ...e, id: newId('pe') })) })),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A blank plan from the setup steps: one workout per training day, or per cycle step. Day
 * workouts are listed in the week-start's order, so a Sunday week lists Sunday's first.
 */
export function newPlan(input: {
  name: string;
  startDate: ISODate;
  type: PlanSchedule['type'];
  weekdays: Weekday[];
  weeks: number;
  cycle: ('workout' | 'rest')[];
  weekStartsOn?: Weekday;
}): Plan {
  const now = new Date().toISOString();
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let workouts: PlanWorkout[];
  let schedule: PlanSchedule;

  if (input.type === 'rotating') {
    // One new workout per workout day, named in cycle order; more can go on a day in the editor.
    const days = input.cycle.filter((step) => step === 'workout').length;
    workouts = Array.from({ length: days }, (_, i) => ({ id: newId('pw'), name: `Workout ${names[i] ?? i + 1}`, blocks: [], estimatedMinutes: 45 }));
    let n = 0;
    schedule = { type: 'rotating', steps: input.cycle.map((step) => ({ workoutIds: step === 'rest' ? [] : [workouts[n++].id] })) };
  } else {
    const days = sortWeekdays([...new Set(input.weekdays)], input.weekStartsOn);
    workouts = days.map((d) => ({ id: newId('pw'), name: WEEKDAY_LONG[d], blocks: [], estimatedMinutes: 45 }));
    const pattern = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as Record<Weekday, string[]>;
    days.forEach((d, i) => (pattern[d] = [workouts[i].id]));
    schedule = input.type === 'weekly' ? weeklyFromPattern(pattern) : fixedFromPattern(input.weeks, pattern);
  }

  return { id: newId('plan'), name: input.name.trim() || 'My plan', version: 1, status: 'active', startDate: input.startDate, schedule, workouts, createdAt: now, updatedAt: now };
}
