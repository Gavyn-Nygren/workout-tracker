import { addDays, fromISODate, startOfWeek } from '@/data/dates';
import type { ISODate, RepTarget, UnitSystem, Weekday } from '@/data/types';
import { kgToLb } from '@/data/units';

// Weekdays are ISO numbers everywhere (1 = Mon … 7 = Sun), in stored data too. Only the order
// they're shown in follows the week-start setting.
export const WEEKDAY_LETTER: Record<Weekday, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 7: 'S' };
export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
/** Full names for VoiceOver, which can read "Mon" or "M" oddly. */
export const WEEKDAY_LONG: Record<Weekday, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };

/** The seven weekdays in display order: Monday weeks give 1 … 7, Sunday weeks give 7, 1 … 6. */
export function weekdayOrder(weekStartsOn: Weekday = 1): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => (((weekStartsOn - 1 + i) % 7) + 1) as Weekday);
}

/** Sorts weekdays into display order for the week start. */
export function sortWeekdays(days: readonly Weekday[], weekStartsOn: Weekday = 1): Weekday[] {
  const position = (d: Weekday) => (d - weekStartsOn + 7) % 7;
  return [...days].sort((a, b) => position(a) - position(b));
}

/** The seven dates of the week containing `date`, first day first. It's the week the streak counts. */
export function weekDates(date: ISODate, weekStartsOn: Weekday = 1): ISODate[] {
  const first = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

const weekdayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const formatWeekday = (date: ISODate) => weekdayLong.format(fromISODate(date));
export const formatWeekdayShort = (date: ISODate) => weekdayShort.format(fromISODate(date));
/** "Oct 22" */
export const formatMonthDay = (date: ISODate) => monthDay.format(fromISODate(date));
/** "Tue, Oct 20" */
export const formatShortDate = (date: ISODate) => `${formatWeekdayShort(date)}, ${formatMonthDay(date)}`;
/** "October 2026" */
export const formatMonthYear = (date: ISODate) => monthYear.format(fromISODate(date));
/** "Thursday, October 22" (for VoiceOver labels) */
export const formatLongDate = (date: ISODate) => longDate.format(fromISODate(date));

export function unitLabel(units: UnitSystem): 'lb' | 'kg' {
  return units === 'imperial' ? 'lb' : 'kg';
}

/** Load in the user's unit, without the unit: 18450 → "18,450". */
export function formatLoadValue(kg: number, units: UnitSystem): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg;
  return value >= 1000 ? integer.format(value) : String(Math.round(value * 10) / 10);
}

export function formatLoad(kg: number, units: UnitSystem): string {
  return `${formatLoadValue(kg, units)} ${unitLabel(units)}`;
}

/** VoiceOver version of formatLoad: "225 pounds". */
export function spokenLoad(kg: number, units: UnitSystem): string {
  return `${formatLoadValue(kg, units)} ${units === 'imperial' ? 'pounds' : 'kilograms'}`;
}

/** Whether a load shows as 0 in the user's unit. */
const showsAsZero = (kg: number, units: UnitSystem) => formatLoadValue(Math.abs(kg), units) === '0';

/**
 * A bodyweight lift's load as what was added to bodyweight: "Bodyweight", "+20 lb", or "−20 lb"
 * for assistance (true minus sign). `bodyweight` is the word used when nothing was added, so it
 * can be lowercase mid-sentence.
 */
export function formatAddedLoad(kg: number, units: UnitSystem, bodyweight = 'Bodyweight'): string {
  if (showsAsZero(kg, units)) return bodyweight;
  return `${kg > 0 ? '+' : '−'}${formatLoad(Math.abs(kg), units)}`;
}

/** VoiceOver version of formatAddedLoad: "bodyweight plus 20 pounds", "20 pounds of assistance". */
export function spokenAddedLoad(kg: number, units: UnitSystem): string {
  if (showsAsZero(kg, units)) return 'bodyweight';
  return kg > 0 ? `bodyweight plus ${spokenLoad(kg, units)}` : `${spokenLoad(-kg, units)} of assistance`;
}

/** "5–8" or "12" */
export function formatRepTarget(target: RepTarget | undefined): string {
  if (target === undefined) return '';
  return typeof target === 'number' ? String(target) : `${target.min}–${target.max}`;
}

/** "58 min" or "1 h 5 min" */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "+1,240 lb" / "−320 lb" (true minus sign). */
export function formatSignedLoad(kg: number, units: UnitSystem): string {
  const sign = kg > 0 ? '+' : kg < 0 ? '−' : '±';
  return `${sign}${formatLoad(Math.abs(kg), units)}`;
}

/** "+4 min", "−2 sets", "±0 s" */
export function formatSigned(value: number, unit: string): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return `${sign}${Math.abs(rounded)} ${unit}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
