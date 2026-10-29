// Log weight and the weigh-in log (spec 2.10, G3.11): which day, the typo guard's wording, what an
// edit changes, and the Bodyweight screen's log rows. Pure and unit-tested (tests/logWeight.test.ts).
// The rules (plausible range, the 10% question, one weigh-in per day) live in bodyweight.ts and the
// repository; this is how the screens use them.
import { addDays } from '@/data/dates';
import type { BodyweightEntry, ISODate, UnitSystem } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { formatLongDateYear, formatMonthDayYear, formatShortDateYear, unitLabel } from '@/lib/format';
import { BODYWEIGHT_LIMITS, isPlausibleBodyweight, type BigChange } from './bodyweight';
import { deltaDirection, formatMetric, formatMetricDelta, spokenMetric, spokenMetricDelta } from './progressFormat';

/** The date choices: today, yesterday, or any earlier day from the date picker. */
export type DayChoice = 'today' | 'yesterday' | 'other';

/** Which choice a date is. */
export function dayChoiceOf(date: ISODate, today: ISODate): DayChoice {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  return 'other';
}

/** The date a choice means; 'other' keeps the picked date, never later than today. */
export function dateForChoice(choice: DayChoice, picked: ISODate, today: ISODate): ISODate {
  if (choice === 'today') return today;
  if (choice === 'yesterday') return addDays(today, -1);
  return picked > today ? today : picked;
}

/**
 * When the day changes while a weigh-in is being fixed (the sheet left open past midnight), the
 * same date as a choice for the new day: yesterday's "Today" becomes "Yesterday", so Save never
 * moves the weigh-in to a day the user didn't pick.
 */
export function rollDayChoice(choice: DayChoice, picked: ISODate, oldToday: ISODate, newToday: ISODate): { choice: DayChoice; picked: ISODate } {
  const date = dateForChoice(choice, picked, oldToday);
  const next = dayChoiceOf(date, newToday);
  return { choice: next, picked: next === 'other' ? date : picked };
}

/** A weight in kg as the field shows it: the user's unit, to 0.1. */
export function weightForField(kg: number, units: UnitSystem): number {
  return Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 10) / 10;
}

/** A weight typed in the user's unit, in kg. */
export function weightFromField(value: number, units: UnitSystem): number {
  return units === 'imperial' ? lbToKg(value) : value;
}

/** "180.2 lb" from kg, as the field shows it. */
export const formatWeighIn = (kg: number, units: UnitSystem) => `${weightForField(kg, units)} ${unitLabel(units)}`;

/**
 * Why Save is off for a typed weight, in a few words, or undefined when it's fine. An empty field
 * has no message (Save is just off). `editing`: the field is still being typed in, so a weight
 * below the minimum isn't called out yet (typing 180 passes through 1 and 18); one above the
 * maximum is, since more digits only make it bigger. VoiceOver's hint for Save passes no options
 * and always says why.
 */
export function weightProblem(value: number | undefined, units: UnitSystem, options: { editing?: boolean } = {}): string | undefined {
  if (value === undefined || isPlausibleBodyweight(value, units)) return undefined;
  const { min, max } = BODYWEIGHT_LIMITS[units];
  if (options.editing && value < min) return undefined;
  return `Enter a weight between ${min} and ${max} ${unitLabel(units)}.`;
}

/** Whether Save can be pressed. */
export const canSaveWeight = (value: number | undefined, units: UnitSystem) => isPlausibleBodyweight(value, units);

/**
 * Onboarding's weigh-in step: Continue moves on without saving when the field is empty (like
 * Skip), and is off for a weight outside the plausible range, as Log weight's Save is.
 */
export const canContinueWithWeight = (value: number | undefined, units: UnitSystem) => value === undefined || canSaveWeight(value, units);

/** The "Save anyway?" message: "That’s 12% more than 162.4 lb on Oct 20." */
export function bigChangeMessage(big: BigChange, units: UnitSystem, today: ISODate): string {
  return `That’s ${big.percent}% ${big.change > 0 ? 'more' : 'less'} than ${formatWeighIn(big.previous.weightKg, units)} on ${formatMonthDayYear(big.previous.date, today)}.`;
}

/** The line under the date when that day already has a weigh-in: "This replaces 181.4 lb logged that day." */
export function replacesHint(replaced: BodyweightEntry, units: UnitSystem): string {
  return `This replaces ${formatWeighIn(replaced.weightKg, units)} logged that day.`;
}

/** The confirm for moving a weigh-in onto a day that has one: a title and a message. */
export function replaceQuestion(replaced: BodyweightEntry, units: UnitSystem, today: ISODate): { title: string; message: string } {
  return {
    title: `Replace the weigh-in on ${formatShortDateYear(replaced.date, today)}?`,
    message: `That day has ${formatWeighIn(replaced.weightKg, units)}. Only one weigh-in per day is kept.`,
  };
}

/**
 * What saving an edit changes (for updateBodyweight): the date if it moved, and the weight if the
 * field differs from what it showed. A weight left as shown keeps the stored kg exactly, so
 * changing only the date never rounds the weight through lb. Empty when nothing changed.
 */
export function weighInChange(entry: Pick<BodyweightEntry, 'date' | 'weightKg'>, edit: { date: ISODate; value: number }, units: UnitSystem): { date?: ISODate; weightKg?: number } {
  const change: { date?: ISODate; weightKg?: number } = {};
  if (edit.date !== entry.date) change.date = edit.date;
  if (edit.value !== weightForField(entry.weightKg, units)) change.weightKg = weightFromField(edit.value, units);
  return change;
}

/** One row of the Bodyweight screen's log. */
export type WeighInRow = {
  entry: BodyweightEntry;
  /** "Tue, Oct 20" (the year added when it isn't this year). */
  dateText: string;
  /** "180.2 lb" */
  valueText: string;
  /** The change from the weigh-in before it: "−0.4 lb", "No change"; none for the first. */
  deltaText?: string;
  accessibilityLabel: string;
};

/**
 * Every weigh-in, newest first, each with its change from the one before it (in one pass), for the
 * Bodyweight screen's log.
 */
export function weighInRows(entries: readonly BodyweightEntry[], units: UnitSystem, today: ISODate): WeighInRow[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shown = (kg: number) => (units === 'imperial' ? kgToLb(kg) : kg);
  return sorted.map((entry, i) => {
    const value = shown(entry.weightKg);
    const previous = sorted[i + 1];
    const delta = previous ? value - shown(previous.weightKg) : undefined;
    const spokenChange = delta === undefined ? '' : deltaDirection(delta, 'bodyweight') === 'none' ? ', the same as the previous weigh-in' : `, ${spokenMetricDelta(delta, 'bodyweight', units)} from the previous weigh-in`;
    return {
      entry,
      dateText: formatShortDateYear(entry.date, today),
      valueText: formatMetric(value, 'bodyweight', units),
      ...(delta !== undefined && { deltaText: formatMetricDelta(delta, 'bodyweight', units) }),
      accessibilityLabel: `${formatLongDateYear(entry.date, today)}: ${spokenMetric(value, 'bodyweight', units)}${spokenChange}`,
    };
  });
}
