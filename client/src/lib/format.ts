import { fromISODate } from '@/data/dates';
import type { ISODate, RepTarget, UnitSystem } from '@/data/types';
import { kgToLb } from '@/data/units';

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
