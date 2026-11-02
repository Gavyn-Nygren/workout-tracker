// Wall-clock times for notifications (G3.12): 'HH:MM' strings on floating local dates, quiet
// hours, and the one place a local date and time become an instant. Pure, so the rules (and
// daylight saving, through process.env.TZ) are tested in Node (tests/notificationQuietHours.test.ts).
import { addDays, isISODate } from '@/data/dates';
import type { LocalTime, QuietHours } from './types';

const HHMM = /^(\d{2}):(\d{2})$/;

/** '07:30' → { h: 7, m: 30 }. Null for anything that isn't a real 24-hour 'HH:MM'. */
export function parseTime(hhmm: unknown): { h: number; m: number } | null {
  if (typeof hhmm !== 'string') return null;
  const match = HHMM.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 23 && m <= 59 ? { h, m } : null;
}

/**
 * The instant a local date and time happen on this phone, in its current time zone. A time the
 * clocks skip (02:30 on a spring-forward night) lands an hour later, 03:30; a time that happens
 * twice (01:30 on a fall-back night) is the first one. NaN when the date or time isn't valid.
 */
export function localInstantMs(at: LocalTime): number {
  const time = parseTime(at.time);
  if (!time || !isISODate(at.date)) return Number.NaN;
  const [y, m, d] = at.date.split('-').map(Number);
  return new Date(y, m - 1, d, time.h, time.m).getTime();
}

const minutesOf = (t: { h: number; m: number }) => t.h * 60 + t.m;

/** Quiet hours as minutes of the day, or null when they're off (unset, unreadable, or start === end). */
function quietMinutes(quiet?: QuietHours): { start: number; end: number } | null {
  if (!quiet) return null;
  const start = parseTime(quiet.start);
  const end = parseTime(quiet.end);
  if (!start || !end) return null;
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s === e ? null : { start: s, end: e };
}

/**
 * Whether a time falls inside quiet hours. They run from `start` up to (not including) `end`,
 * wrapping past midnight when `end` is earlier: 22:00–07:00 holds 23:30 and 06:59, not 07:00.
 */
export function inQuietHours(time: string, quiet?: QuietHours): boolean {
  const q = quietMinutes(quiet);
  const t = parseTime(time);
  if (!q || !t) return false;
  const m = minutesOf(t);
  return q.start < q.end ? m >= q.start && m < q.end : m >= q.start || m < q.end;
}

/**
 * Where quiet hours put a notification: unchanged outside them, otherwise at their end. A time in
 * the evening part of overnight quiet hours (23:00 in 22:00–07:00) moves to the next date.
 */
export function holdForQuietHours(at: LocalTime, quiet?: QuietHours): LocalTime {
  if (!quiet || !inQuietHours(at.time, quiet)) return at;
  const q = quietMinutes(quiet)!;
  const t = minutesOf(parseTime(at.time)!);
  const nextDay = q.start > q.end && t >= q.start;
  return { date: nextDay ? addDays(at.date, 1) : at.date, time: quiet.end };
}

/**
 * What quiet hours do to a workout reminder at `time`, for the hint under Settings' time picker:
 * nothing, held until they end the same day, or dropped (holding it would move it to the next day,
 * where "Lower A today" would be wrong).
 */
export function reminderQuietEffect(time: string, quiet?: QuietHours): { kind: 'none' } | { kind: 'held'; until: string } | { kind: 'dropped' } {
  if (!quiet || !inQuietHours(time, quiet)) return { kind: 'none' };
  const day = '2026-01-01';
  const held = holdForQuietHours({ date: day, time }, quiet);
  return held.date === day ? { kind: 'held', until: held.time } : { kind: 'dropped' };
}
