import type { ISODate, Weekday } from './types';

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar date as 'YYYY-MM-DD'. */
export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses 'YYYY-MM-DD' as local midnight. */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function isoWeekday(iso: ISODate): Weekday {
  const day = fromISODate(iso).getDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** First day of the week containing `iso`, for a week starting on `weekStartsOn`. */
export function startOfWeek(iso: ISODate, weekStartsOn: Weekday = 1): ISODate {
  const offset = (isoWeekday(iso) - weekStartsOn + 7) % 7;
  return addDays(iso, -offset);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86_400_000);
}
