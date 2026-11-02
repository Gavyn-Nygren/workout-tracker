// When the weekly summary goes out and which week it covers (spec 2.11, G3.12). Pure, so the
// week table, quiet hours and daylight saving are tested in Node (tests/summaryTiming.test.ts).
//
// The rule: a summary on the week's last day covers that week so far (Sunday 19:00 with Monday
// weeks); on any other day it covers the week before (Monday with Monday weeks, or Sunday or
// Monday with Sunday weeks). The week comes from the configured day, not from where quiet hours
// hold the summary, so a summary held past midnight still covers the week it was meant for.
import { addDays, isoWeekday, startOfWeek, toISODate, weekdayIndex } from '@/data/dates';
import type { ISODate, Weekday } from '@/data/types';
import { WEEKDAY_SHORT } from '@/lib/format';
import { holdForQuietHours, localInstantMs, parseTime } from './localTime';
import type { LocalTime, QuietHours, SummaryFire } from './types';

type SummaryAt = { weekday: Weekday; time: string };

const isWeekday = (value: unknown): value is Weekday => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 7;

/** The latest date on or before `date` that falls on `weekday` (ISO: 1 = Monday … 7 = Sunday). */
function onOrBefore(date: ISODate, weekday: Weekday): ISODate {
  return addDays(date, -((isoWeekday(date) - weekday + 7) % 7));
}

/** The first day of the week a summary sent on `configuredDate` covers. */
export function summaryWeekFor(configuredDate: ISODate, weekStartsOn: Weekday): ISODate {
  const start = startOfWeek(configuredDate, weekStartsOn);
  return weekdayIndex(configuredDate, weekStartsOn) === 6 ? start : addDays(start, -7);
}

function fireOn(date: ISODate, at: SummaryAt, quietHours: QuietHours | undefined, weekStartsOn: Weekday, toInstant: (at: LocalTime) => number): SummaryFire {
  const configured = { date, time: at.time };
  const held = holdForQuietHours(configured, quietHours);
  return { configured, held, fireAtMs: toInstant(held), weekStart: summaryWeekFor(date, weekStartsOn) };
}

/**
 * The next `count` summaries still ahead of `nowMs`, soonest first. Quiet hours are applied
 * before the "still ahead" check, so a Sunday 19:00 summary held to Monday 08:00 is still wanted
 * when the app is opened on Sunday at 21:00.
 */
export function summaryFires(input: {
  nowMs: number;
  at: SummaryAt;
  quietHours?: QuietHours;
  weekStartsOn: Weekday;
  count: number;
  toInstant?: (at: LocalTime) => number;
}): SummaryFire[] {
  const { nowMs, at, quietHours, weekStartsOn, count, toInstant = localInstantMs } = input;
  if (count <= 0 || !parseTime(at.time) || !isWeekday(at.weekday) || !Number.isFinite(nowMs)) return [];
  // Start a week back: a held summary lands at most a day after its configured date.
  let date = onOrBefore(addDays(toISODate(new Date(nowMs)), -7), at.weekday);
  const fires: SummaryFire[] = [];
  for (let i = 0; fires.length < count && i < count + 4; i++, date = addDays(date, 7)) {
    const fire = fireOn(date, at, quietHours, weekStartsOn, toInstant);
    if (fire.fireAtMs > nowMs) fires.push(fire);
  }
  return fires;
}

/**
 * The most recent summary send (held time at or before `nowMs`), or null when the setting can't
 * be read. The Developer preview uses it for real numbers.
 */
export function latestSummaryFire(input: { nowMs: number; at: SummaryAt; quietHours?: QuietHours; weekStartsOn: Weekday }): SummaryFire | null {
  const { nowMs, at, quietHours, weekStartsOn } = input;
  if (!parseTime(at.time) || !isWeekday(at.weekday) || !Number.isFinite(nowMs)) return null;
  // A send dated tomorrow can't have happened yet, so start from tomorrow's slot and go back.
  let date = onOrBefore(addDays(toISODate(new Date(nowMs)), 1), at.weekday);
  for (let i = 0; i < 4; i++, date = addDays(date, -7)) {
    const fire = fireOn(date, at, quietHours, weekStartsOn, localInstantMs);
    if (fire.fireAtMs <= nowMs) return fire;
  }
  return null;
}

/**
 * The week the most recent summary (held time at or before `nowMs`) covered: what "See latest
 * summary" opens. With an unreadable setting, the week a Sunday summary would have covered.
 */
export function latestSummaryWeek(input: { nowMs: number; at: SummaryAt; quietHours?: QuietHours; weekStartsOn: Weekday }): ISODate {
  const fire = latestSummaryFire(input);
  if (fire) return fire.weekStart;
  const today = toISODate(new Date(Number.isFinite(input.nowMs) ? input.nowMs : Date.now()));
  return summaryWeekFor(onOrBefore(today, isWeekday(input.at.weekday) ? input.at.weekday : 7), input.weekStartsOn);
}

/** Which week a summary on `weekday` covers, for the caption under Settings' day picker. */
export function summaryCoverageCaption(weekday: Weekday, weekStartsOn: Weekday): string {
  const last = (((weekStartsOn + 5) % 7) + 1) as Weekday;
  const range = `${WEEKDAY_SHORT[weekStartsOn]}–${WEEKDAY_SHORT[last]}`;
  return weekday === last ? `Covers ${range}, this week so far` : `Covers last week (${range})`;
}
