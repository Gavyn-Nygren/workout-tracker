// Progression rules (spec "Progression", roadmap G3.9). Pure, so they're unit-tested
// (tests/progression.test.ts). A rule only ever suggests: the sets start at the suggested weight,
// the workout says why (describeSuggestion), and "Use last time's weight" undoes it
// (undoSuggestion). The lifter can always change anything.
//
// The rules, with the user's picks:
// - History (decision C): a planned exercise builds on its own plan workout's last time
//   (history.ts slotHistory), or on the exercise's last time anywhere if that's never been done.
// - Working sets are completed normal and assisted sets: never warm-ups, drop sets or timed holds.
//   Each of last time's working sets is judged against the rep target of the plan's working set at
//   the same position now, or its own logged target if the plan has fewer sets now. A fixed target
//   of n reps is a range of n to n. Sets with no rep target don't count either way.
// - A miss (decision D) is a completed working set below the bottom of its range: for 8-12, 7 is
//   a miss and 9-11 isn't. "Top" is every working set done, each at the top of its range.
//   History from the "anywhere" fallback (another plan workout or plan, or freestyle) was done
//   against targets of its own, so a miss there is judged by the target the set was logged with
//   (none logged: never a miss): a heavy day's 5x5 isn't a miss for a light day's 8-12. The top
//   is still judged against the plan's targets now.
// - Rep range: top adds the increment, a miss follows the rule's miss setting, anything else
//   keeps the weight.
// - Weekly % (decision B): in a later week than last time, with every working set done and no
//   miss, the weight lifted last time goes up by the percent. Weeks are the program's weeks for a
//   fixed-length plan (as "Week N of M" counts them), otherwise calendar weeks from the week-start
//   setting. A gap of several weeks still adds one step. It needs a weight to scale.
// - A miss repeats the weight, or with a deload rule, drops it by its percent once there have been
//   N misses in a row at last time's weight. A different weight starts a fresh count.
// - Every change rounds to the exercise's increment and moves at least one increment past the
//   weight lifted last time (not past its rounded value), never below zero. Assisted sets get harder by taking assistance away; a deload adds assistance.
//   Percentages apply to the assistance itself. Bodyweight exercises progress their added weight.
//   The field is the planned working sets' (logging.ts plannedWorkingField), so a pull-up planned
//   as Assisted progresses its assistance. Only last time's sets logged in that field count.
// - A plan target weight on the working sets wins: no rule, no suggestion. No history, no suggestion.
// - After an increase or a deload, working reps start at the bottom of the range.

import { startOfWeek } from '@/data/dates';
import { loadField, plannedWorkingField, roundingIncrementFor, type LoadField } from '@/data/logging';
import type {
  Exercise,
  ISODate,
  LoggedSet,
  Plan,
  PlannedExercise,
  PlanShift,
  Preferences,
  ProgressionRule,
  ProgressionSuggestion,
  RepTarget,
  SessionExercise,
  SetKind,
  SetPrescription,
  UnitSystem,
  Weekday,
} from '@/data/types';
import { kgToLb, lbToKg, roundLoadKg } from '@/data/units';
import { currentProgramWeek } from '@/features/plans/position';
import { plural, unitLabel } from '@/lib/format';
import type { LastTime } from './history';

export type ProgressionPreferences = Pick<Preferences, 'units' | 'roundingIncrements'> & { weekStartsOn?: Weekday };

export type ProgressionInput = {
  planned: PlannedExercise;
  exercise: Exercise | undefined;
  /** The planned exercise's earlier times, newest first (history.ts slotHistory). */
  history: readonly LastTime[];
  preferences: ProgressionPreferences;
  /** The plan, for a fixed-length program's weeks. */
  plan?: Plan;
  /** Pushes forward, which move a program's weeks (only the plan's own are used). */
  shifts?: readonly PlanShift[];
  /** The day the workout is done. */
  today: ISODate;
};

/** A suggestion before its sets are known (buildSession fills them in). */
export type SuggestionCore = Omit<ProgressionSuggestion, 'sets' | 'dismissed'>;

export type Progression = {
  /** Last time's top working weight, rounded: the pre-fill without a rule. 0 with no history. */
  baseKg: number;
  /** What the working sets start at: the suggestion's weight, or `baseKg`. */
  suggestedKg: number;
  /** Which weight field the working sets log. */
  field: LoadField;
  suggestion?: SuggestionCore;
  /** After an increase or a deload: working reps start at the bottom of the range. */
  repsReset: boolean;
};

/** The sets progression reads and writes: normal and assisted ones. */
export const isProgressionKind = (kind: SetKind) => kind === 'normal' || kind === 'assisted';

export function repRange(target: RepTarget | undefined): { min: number; max: number } | undefined {
  if (target === undefined) return undefined;
  return typeof target === 'number' ? { min: target, max: target } : target;
}

/** The same weight, in the 0.05 kg steps records use. */
const sameKg = (a: number, b: number) => Math.round(a * 20) === Math.round(b * 20);

/**
 * The hardest completed working set's weight in `field`, in that field's own terms: the heaviest
 * load or added weight, or the least assistance. Only sets logged in that field count, so pull-ups
 * done with assistance last time give no added weight to build on. Undefined if there's none.
 */
export function topWorkingKg(entry: SessionExercise, exercise: Pick<Exercise, 'isBodyweight'> | undefined, field: LoadField): number | undefined {
  const values = entry.sets.filter((s) => s.completedAt && isProgressionKind(s.kind) && loadField(exercise, s.kind) === field).map((s) => s[field] ?? 0);
  if (!values.length) return undefined;
  return field === 'assistanceKg' ? Math.min(...values) : Math.max(...values);
}

type Outcome = {
  /** 'miss': a set fell below its range; 'top': every set done, each at its top; else 'hold'. */
  result: 'miss' | 'top' | 'hold';
  /** Every working set was done (none left unlogged, and the exercise wasn't skipped partway). */
  allDone: boolean;
  /** The top of the range the sets hit, when they share one. */
  topReps?: number;
};

/**
 * How last time went for a rule, judged against the plan's rep targets now (decision D). For
 * `anywhere` history (not this slot's own), a miss is judged by each set's own logged target
 * instead, the one it was done against.
 */
function outcomeOf({ entry, anywhere }: LastTime, plannedWorking: readonly SetPrescription[]): Outcome {
  const working = entry.sets.filter((s) => isProgressionKind(s.kind));
  let miss = false;
  let allTop = true;
  let anyTarget = false;
  let allDone = !entry.skipped && working.length > 0;
  const tops = new Set<number>();
  working.forEach((set, i) => {
    if (!set.completedAt) {
      allDone = false;
      return;
    }
    const own = repRange(set.target?.targetReps);
    // The plan's set at this position now; a set past the plan's end keeps its own logged target.
    const target = i < plannedWorking.length ? repRange(plannedWorking[i].targetReps) : own;
    const reps = set.reps ?? 0;
    const missBelow = anywhere ? own : target;
    if (missBelow && reps < missBelow.min) miss = true;
    if (!target) return;
    anyTarget = true;
    if (reps < target.max) allTop = false;
    tops.add(target.max);
  });
  const result = miss ? 'miss' : allDone && anyTarget && allTop ? 'top' : 'hold';
  return { result, allDone, topReps: tops.size === 1 ? [...tops][0] : undefined };
}

type Rounding = { units: UnitSystem; increment: number };

const toUnits = (kg: number, units: UnitSystem) => (units === 'imperial' ? kgToLb(kg) : kg);
const fromUnits = (value: number, units: UnitSystem) => (units === 'imperial' ? lbToKg(value) : value);

/** Float noise from the kg/lb round trip, in increments: 135 lb is stored as 134.9999… lb. */
const NOISE = 1e-6;

/**
 * `rawKg` rounded to the increment, at least one increment past `liftedKg` (what was lifted last
 * time, which may sit off the increment) in `direction` (+1 more, −1 less), and never below zero.
 * Rounds the way roundLoadKg does. So on a 5 lb increment 82.5 lb plus 2.5 is 85, and 135 plus
 * 2.5 is 140. `minimumStep` says the one-increment minimum or the zero floor set the result, not
 * `rawKg`.
 */
function moved(liftedKg: number, rawKg: number, direction: 1 | -1, { units, increment }: Rounding): { kg: number; minimumStep: boolean } {
  if (!(increment > 0)) {
    const kg = Math.max(0, direction > 0 ? Math.max(rawKg, liftedKg) : Math.min(rawKg, liftedKg));
    return { kg, minimumStep: kg !== rawKg };
  }
  const lifted = toUnits(liftedKg, units) / increment;
  const raw = Math.round(toUnits(rawKg, units) / increment);
  // The nearest increment strictly past what was lifted.
  const next = direction > 0 ? Math.floor(lifted + NOISE) + 1 : Math.ceil(lifted - NOISE) - 1;
  const to = Math.max(0, direction > 0 ? Math.max(raw, next) : Math.min(raw, next));
  return { kg: fromUnits(to * increment, units), minimumStep: to !== raw };
}

/** Whether `today` is in a later week than `last`: the program's weeks, or calendar weeks. */
function laterWeek(last: ISODate, today: ISODate, input: Pick<ProgressionInput, 'plan' | 'shifts' | 'preferences'>): boolean {
  const { plan, shifts } = input;
  if (plan?.schedule.type === 'fixed') {
    const was = currentProgramWeek(plan, last, shifts);
    const now = currentProgramWeek(plan, today, shifts);
    if (was !== undefined && now !== undefined) return now > was;
  }
  const weekStartsOn = input.preferences.weekStartsOn ?? 1;
  return startOfWeek(today, weekStartsOn) > startOfWeek(last, weekStartsOn);
}

/** Misses in a row at last time's weight, walking back from last time. */
function missStreak(history: readonly LastTime[], topKg: number, field: LoadField, plannedWorking: readonly SetPrescription[], exercise: Exercise | undefined): number {
  let count = 0;
  for (const time of history) {
    const top = topWorkingKg(time.entry, exercise, field);
    if (top === undefined || !sameKg(top, topKg) || outcomeOf(time, plannedWorking).result !== 'miss') break;
    count++;
  }
  return count;
}

/**
 * What the rule suggests for a planned exercise, from its earlier times. Without a rule (or with a
 * plan target weight, or no history, or last time logged in another field) it's last time's top
 * weight, rounded, with no suggestion.
 */
export function progressionFor(input: ProgressionInput): Progression {
  const { planned, exercise, history, preferences } = input;
  const field = plannedWorkingField(planned.sets, exercise);
  const rounding: Rounding = { units: preferences.units, increment: roundingIncrementFor(exercise?.equipment, preferences) };
  const last = history[0];
  const topKg = last ? topWorkingKg(last.entry, exercise, field) : undefined;
  const liftedKg = topKg ?? 0;
  const baseKg = roundLoadKg(liftedKg, rounding.units, rounding.increment);
  const plain: Progression = { baseKg, suggestedKg: baseKg, field, repsReset: false };

  const rule: ProgressionRule | undefined = planned.progression;
  if (!rule || !last || topKg === undefined) return plain;
  const plannedWorking = planned.sets.filter((s) => isProgressionKind(s.kind));
  // A weight typed into the plan wins over the rule.
  if (plannedWorking.some((s) => s.targetLoadKg !== undefined)) return plain;

  const outcome = outcomeOf(last, plannedWorking);
  // Harder is heavier, except with assistance, where it's less of it.
  const harder: 1 | -1 = field === 'assistanceKg' ? -1 : 1;
  // From what was lifted: 82.5 lb to 85 is a change, though 82.5 alone would round to 85 too.
  const changed = (toKg: number) => !sameKg(toKg, liftedKg);

  if (outcome.result === 'miss') {
    // A weekly-% rule has nothing to work from without a weight. (A rep-range deload from zero
    // load stays at zero below, while zero assistance can still get some.)
    if (rule.type === 'percent_weekly' && liftedKg <= 0) return plain;
    const missCount = missStreak(history, topKg, field, plannedWorking, exercise);
    const onMiss = rule.onMiss;
    if (onMiss.type === 'deload') {
      const deloadAfter = Math.max(1, onMiss.afterConsecutiveMisses);
      const step = missCount >= deloadAfter ? moved(liftedKg, liftedKg * (1 - (harder * onMiss.percent) / 100), harder === 1 ? -1 : 1, rounding) : undefined;
      if (step && changed(step.kg)) {
        const toKg = step.kg;
        return {
          ...plain,
          suggestedKg: toKg,
          repsReset: true,
          suggestion: { kind: 'deload', rule: rule.type, field, fromKg: liftedKg, toKg, percent: onMiss.percent, ...(step.minimumStep ? { minimumStep: true } : {}), missCount, deloadAfter },
        };
      }
      return { ...plain, suggestion: { kind: 'hold_after_miss', rule: rule.type, field, fromKg: liftedKg, toKg: baseKg, missCount, deloadAfter } };
    }
    return { ...plain, suggestion: { kind: 'hold_after_miss', rule: rule.type, field, fromKg: liftedKg, toKg: baseKg, missCount } };
  }

  let rawKg: number;
  if (rule.type === 'rep_range') {
    if (outcome.result !== 'top') return plain;
    rawKg = liftedKg + harder * rule.incrementKg;
  } else {
    const lastDate = last.session.completedDate;
    if (!outcome.allDone || liftedKg <= 0 || !lastDate || !laterWeek(lastDate, input.today, input)) return plain;
    rawKg = liftedKg * (1 + (harder * rule.percent) / 100);
  }
  const step = moved(liftedKg, rawKg, harder, rounding);
  const toKg = step.kg;
  // No room to get harder (no assistance left to take away).
  if (!changed(toKg)) return plain;
  const why = rule.type === 'rep_range' ? (outcome.topReps !== undefined ? { topReps: outcome.topReps } : {}) : { percent: rule.percent, ...(step.minimumStep ? { minimumStep: true } : {}) };
  return { ...plain, suggestedKg: toKg, repsReset: true, suggestion: { kind: 'increase', rule: rule.type, field, fromKg: liftedKg, toKg, ...why } };
}

// ---------------------------------------------------------------------------
// Undo: "Use last time's weight"

/** Within a hundredth of a kilogram: the same pre-filled number. */
const holds = (value: number | undefined, kg: number | undefined) =>
  value === undefined || kg === undefined ? value === kg : Math.abs(value - kg) < 0.01;

/** The field a set of this entry logs its weight in, given the suggestion's working-set field. */
function fieldOf(set: LoggedSet, workingField: LoadField): LoadField {
  if (workingField === 'loadKg') return 'loadKg';
  return set.kind === 'assisted' ? 'assistanceKg' : 'addedLoadKg';
}

/**
 * The entry with last time's weight back (G3.9 decision A's undo): sets not done yet that still
 * hold what the suggestion pre-filled (weight, reps and kind) go back to the pre-fill without the
 * rule: working sets to last time's weight and reps (kept inside the range), warm-ups and drop
 * sets to what they'd be from last time's weight. A set goes back whole or not at all, so a set
 * the lifter changed (even only its reps, or its kind) stays exactly as it is, and so does a
 * completed one. A working set added during the workout goes back to last time's weight while it
 * still holds the suggested weight and reps it was copied with. The suggestion is kept, marked
 * dismissed. An entry without one comes back unchanged.
 */
export function undoSuggestion(entry: SessionExercise): SessionExercise {
  const suggestion = entry.suggestion;
  if (!suggestion || suggestion.dismissed) return entry;
  const prefilled = new Map(suggestion.sets.map((s) => [s.setId, s]));
  // Pre-fill leaves a zero weight empty.
  const suggestedKg = suggestion.toKg > 0 ? suggestion.toKg : undefined;
  // The working sets the rule moved, the ones "Add set" copies. One saved without its kind counts by weight.
  const movedSets = suggestion.sets.filter((s) => (s.kind === undefined || isProgressionKind(s.kind)) && holds(s.kg, suggestedKg) && !holds(s.kg, s.lastKg));
  const sets = entry.sets.map((set) => {
    if (set.completedAt) return set;
    const field = fieldOf(set, suggestion.field);
    const was = prefilled.get(set.id);
    if (was) {
      // Changed by hand, even only its reps or kind: the lifter's set, left alone.
      if (!holds(set[field], was.kg) || set.reps !== was.reps || (was.kind !== undefined && set.kind !== was.kind)) return set;
      let next = set;
      if (was.kg !== was.lastKg) next = { ...next, [field]: was.lastKg };
      if (was.reps !== was.lastReps) next = { ...next, reps: was.lastReps };
      return next;
    }
    // A working set added during the workout, still as copied from one the rule moved.
    if (!isProgressionKind(set.kind) || field !== suggestion.field) return set;
    const copied = movedSets.find((s) => holds(set[field], s.kg) && set.reps === s.reps);
    return copied ? { ...set, [field]: copied.lastKg } : set;
  });
  return { ...entry, sets, suggestion: { ...suggestion, dismissed: true } };
}

/**
 * Whether "Use last time's weight" would still put a weight back: an increase or a deload that
 * hasn't been undone, with a set not done yet that still holds what the suggestion pre-filled (or
 * a set added since, still as copied from one). Once every such set is done or changed by hand,
 * there's no weight left to put back and the reason line is just information.
 */
export function canUndoSuggestion(entry: SessionExercise): boolean {
  const suggestion = entry.suggestion;
  if (!suggestion || suggestion.dismissed || suggestion.kind === 'hold_after_miss') return false;
  const undone = undoSuggestion(entry);
  return undone.sets.some((set, i) => {
    const field = fieldOf(set, suggestion.field);
    return !holds(set[field], entry.sets[i][field]);
  });
}

// ---------------------------------------------------------------------------
// The reason line

/** Which way the suggestion moved the lift: harder, easier, or the same weight after a miss. */
export type SuggestionDirection = 'up' | 'down' | 'same';

export type SuggestionText = { direction: SuggestionDirection; text: string; label: string };

/** "2.5", "10": a percent from the plan's steppers, without float noise. */
const percentText = (percent: number) => String(Math.round(percent * 10) / 10);

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A weight in the units set now, to the hundredth the weight field shows (61.25, not 61.3), so
 * the line matches the sets, microplates included.
 */
const shownValue = (kg: number, units: UnitSystem) => Math.round(toUnits(kg, units) * 100) / 100;
const valueFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const valueText = (value: number) => valueFormat.format(value);

/** VoiceOver's "5 pounds", "1 kilogram". */
const spokenValue = (value: number, units: UnitSystem) => `${valueText(value)} ${units === 'imperial' ? 'pound' : 'kilogram'}${valueText(value) === '1' ? '' : 's'}`;

/** "at 205", "at +25", "at bodyweight", "at −40" or "with no assistance": a weight the way its column shows it. */
function shownAt(kg: number, field: LoadField, units: UnitSystem): string {
  const value = shownValue(kg, units);
  if (field === 'assistanceKg') return value === 0 ? 'with no assistance' : `at −${valueText(value)}`;
  if (field === 'addedLoadKg') return value === 0 ? 'at bodyweight' : `at +${valueText(value)}`;
  return `at ${valueText(value)}`;
}

/** VoiceOver's name for a weight: "205 pounds", "bodyweight plus 25 pounds", "40 pounds of assistance", "no assistance". */
function spokenWeight(kg: number, field: LoadField, units: UnitSystem): string {
  const value = shownValue(kg, units);
  if (field === 'assistanceKg') return value === 0 ? 'no assistance' : `${spokenValue(value, units)} of assistance`;
  if (field === 'addedLoadKg') return value === 0 ? 'bodyweight' : `bodyweight plus ${spokenValue(value, units)}`;
  return spokenValue(value, units);
}

/** VoiceOver version of shownAt. */
function spokenAt(kg: number, field: LoadField, units: UnitSystem): string {
  const weight = spokenWeight(kg, field, units);
  return weight === 'no assistance' ? 'with no assistance' : `at ${weight}`;
}

/** Why a deload: "3 misses in a row at 205" / "missed reps at 205 last time". */
function missedAt(count: number, at: string): string {
  return count > 1 ? `${count} misses in a row ${at}` : `missed reps ${at} last time`;
}

/**
 * The line under an exercise's target saying what the suggestion changed and why (decision A), in
 * the units set now, plus its VoiceOver label. The arrow is drawn from `direction`, not the text:
 * - up: "+5 lb · every set hit 12 last time", "+5 lb · new week, +2.5%",
 *   "5 lb less assistance · every set hit 8 last time", "5 lb less assistance · new week, 2.5% less"
 * - down: "−10% · 3 misses in a row at 205", "5 lb more assistance · missed reps at −40 last time"
 * - same: "Same weight · missed reps last time", "Same weight · 2 of 3 misses before a deload"
 * A percent shows only when it's what happened: when the exercise's smallest step made the change
 * (minimumStep), the line says the weight instead ("−5 lb · …", "+5 lb · new week, reps hit last
 * time"). Undefined for a suggestion it can't read (saved by a newer version, say).
 */
export function describeSuggestion(suggestion: ProgressionSuggestion, units: UnitSystem): SuggestionText | undefined {
  const { kind, field, fromKg, toKg } = suggestion;
  if (!Number.isFinite(fromKg) || !Number.isFinite(toKg)) return undefined;
  // The change between the two weights as shown, so it adds up: 60 to 61.25 kg is 1.25.
  const deltaValue = Math.round(Math.abs(shownValue(toKg, units) - shownValue(fromKg, units)) * 100) / 100;
  const delta = `${valueText(deltaValue)} ${unitLabel(units)}`;
  const spokenDelta = spokenValue(deltaValue, units);
  const spokenTo = spokenWeight(toKg, field, units);
  const assisted = field === 'assistanceKg';
  const misses = Math.max(1, suggestion.missCount ?? 1);
  // The rule's percent, unless the smallest step made the change instead.
  const percent = suggestion.percent !== undefined && Number.isFinite(suggestion.percent) && !suggestion.minimumStep ? percentText(suggestion.percent) : undefined;

  if (kind === 'increase') {
    const why =
      suggestion.rule === 'percent_weekly'
        ? percent
          ? { text: assisted ? `new week, ${percent}% less` : `new week, +${percent}%`, label: `New week, ${percent} percent ${assisted ? 'less assistance' : 'more'} since you hit your reps.` }
          : { text: 'new week, reps hit last time', label: 'New week, and you hit your reps last time.' }
        : suggestion.topReps !== undefined
          ? { text: `every set hit ${suggestion.topReps} last time`, label: `Every set hit ${plural(suggestion.topReps, 'rep')} last time.` }
          : { text: 'every set hit its top reps last time', label: 'Every set hit its top reps last time.' };
    if (assisted) return { direction: 'up', text: `${delta} less assistance · ${why.text}`, label: `Suggested assistance down ${spokenDelta}, to ${spokenTo}. ${why.label}` };
    const what = field === 'addedLoadKg' ? 'added weight' : 'weight';
    return { direction: 'up', text: `+${delta} · ${why.text}`, label: `Suggested ${what} up ${spokenDelta}, to ${spokenTo}. ${why.label}` };
  }
  if (kind === 'deload') {
    const why = missedAt(misses, shownAt(fromKg, field, units));
    const spokenWhy = `${capitalized(missedAt(misses, spokenAt(fromKg, field, units)))}.`;
    if (assisted) return { direction: 'down', text: `${delta} more assistance · ${why}`, label: `Suggested deload: ${spokenDelta} more assistance, to ${spokenTo}. ${spokenWhy}` };
    const amount = percent ? `−${percent}%` : `−${delta}`;
    return { direction: 'down', text: `${amount} · ${why}`, label: `Suggested deload: down ${percent ? `${percent} percent` : spokenDelta}, to ${spokenTo}. ${spokenWhy}` };
  }
  if (kind === 'hold_after_miss') {
    const same = assisted ? 'Same assistance' : 'Same weight';
    const after = suggestion.deloadAfter;
    // Short of a deload, it says how close one is; past it (nothing left to take off), the streak.
    const pending = after !== undefined && misses < after;
    const text = pending ? `${misses} of ${after} misses before a deload` : misses > 1 ? `${misses} misses in a row` : 'missed reps last time';
    const label = pending ? `${misses} of ${after} misses in a row before a deload.` : misses > 1 ? `${misses} misses in a row.` : 'You missed reps last time.';
    return { direction: 'same', text: `${same} · ${text}`, label: `${same} as last time. ${label}` };
  }
  return undefined;
}

export type SuggestionLine = SuggestionText & {
  /** Tapping it can still offer "Use last time's weight" (canUndoSuggestion). */
  undoable: boolean;
};

/**
 * An active-workout entry's reason line, or undefined when there's none to show: no suggestion,
 * one already undone with "Use last time's weight", or a skipped exercise. A reopened workout
 * shows the suggestion it started with, undoable only while a set can still go back.
 */
export function suggestionLine(entry: SessionExercise, units: UnitSystem): SuggestionLine | undefined {
  const suggestion = entry.suggestion;
  if (!suggestion || suggestion.dismissed || entry.skipped) return undefined;
  const line = describeSuggestion(suggestion, units);
  return line && { ...line, undoable: canUndoSuggestion(entry) };
}
