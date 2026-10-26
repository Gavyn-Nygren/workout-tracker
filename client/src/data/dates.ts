import type { ISODate, Weekday } from './types';

// Two kinds of time (spec 2.5, "Dates and time zones"):
// - An ISODate ('YYYY-MM-DD') is a local "floating" calendar date: a day on the user's calendar,
//   not a moment. It never changes when the clocks or the time zone change.
// - A timestamp (completedAt, createdAt, …) is a UTC moment from `new Date().toISOString()`.
//   Turn one into a calendar date with localDateOf, never with `.slice(0, 10)` (that's the UTC
//   date, a day late on an evening in the Americas).
// Day math (addDays, daysBetween, weekdays, weeks) uses the date's numbers alone, through UTC,
// which has no daylight saving. So it can't drift across a clock change, a time zone where
// midnight is skipped, or a trip.

const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The date as a count of days on a time line with no clock changes. For day math only. */
function dayNumber(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(day: number): ISODate {
  const date = new Date(day * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whether a value is a real calendar date written as 'YYYY-MM-DD' (no time, no zone). */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Local calendar date of a Date as 'YYYY-MM-DD'. */
export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The Date at the start of a calendar day, in local time: midnight, or 1:00 where the clocks skip
 * midnight that day. For display and charts; use the helpers below for day math.
 */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The local calendar date of a UTC timestamp: what the phone's calendar showed at that moment.
 * A string that's already a date ('YYYY-MM-DD') comes back unchanged, since it has no moment to
 * convert (and `new Date('2026-10-26')` would read it as UTC midnight, the day before in the
 * Americas). Throws on anything that isn't a date or timestamp.
 */
export function localDateOf(timestamp: string): ISODate {
  if (DATE_ONLY.test(timestamp)) return timestamp;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) throw new RangeError(`Not a timestamp: ${timestamp}`);
  return toISODate(new Date(ms));
}

/** Today's local date. Screens use useToday() instead, which updates at midnight. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** The calendar date `days` later (or earlier, if negative). */
export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(iso) + days);
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return dayNumber(to) - dayNumber(from);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: ISODate): Weekday {
  const day = new Date(dayNumber(iso) * DAY_MS).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** Where a date falls in its week: 0 on the first day of the week, 6 on the last. */
export function weekdayIndex(iso: ISODate, weekStartsOn: Weekday = 1): number {
  return (isoWeekday(iso) - weekStartsOn + 7) % 7;
}

/** First day of the week containing `iso`, for a week starting on `weekStartsOn`. */
export function startOfWeek(iso: ISODate, weekStartsOn: Weekday = 1): ISODate {
  return addDays(iso, -weekdayIndex(iso, weekStartsOn));
}

/** Last day of the week containing `iso`. (A week's seven dates: weekDates in lib/format.) */
export function endOfWeek(iso: ISODate, weekStartsOn: Weekday = 1): ISODate {
  return addDays(startOfWeek(iso, weekStartsOn), 6);
}

/**
 * When a finished workout counts (spec 2.5): the moment Finish is tapped and the local date at that
 * moment, so a workout that runs past midnight counts on the day it finished. A reopened workout
 * passes what it had (`kept`) and keeps it, so an edit, a later day, or a trip never moves it.
 */
export function completionStamp(now: Date, kept?: { completedAt?: string; completedDate?: ISODate }): { completedAt: string; completedDate: ISODate } {
  const completedAt = kept?.completedAt ?? now.toISOString();
  const completedDate = kept?.completedDate ?? (kept?.completedAt ? localDateOf(kept.completedAt) : toISODate(now));
  return { completedAt, completedDate };
}
