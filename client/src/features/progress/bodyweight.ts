import { daysBetween } from '@/data/dates';
import type { BodyweightEntry, ID, ISODate, UnitSystem } from '@/data/types';
import { kgToLb } from '@/data/units';

// Bodyweight on Progress (spec 2.10, G3.11), pure and unit-tested (tests/bodyweightTrend.test.ts).
//
// - The 7-day trend at a weigh-in is the mean of the weigh-ins in the 7 days ending that day (that
//   day and the 6 before), so a weigh-in before the range still counts toward the first days in it.
// - It's honest about gaps (user's pick): the line breaks where two weigh-ins are more than 7 days
//   apart, instead of drawing a steady change nobody measured.
// - Worked out in one pass (a sliding window), O(n) after sorting, and kept per list of weigh-ins,
//   so a re-render or a scrub step doesn't work it out again.
// - Typo guard for Log weight: a plausible range (Save is off outside it), and a weigh-in more than
//   10% from the nearest earlier one asks "Save anyway?".

/** The trend's window, in days. */
export const TREND_DAYS = 7;

/** A weigh-in or trend value on a day, in kg, or in the display unit when `units` was given. */
export type BodyweightPoint = { date: ISODate; value: number };

/**
 * A stretch of the trend line with no gap of more than 7 days between weigh-ins. The same shape as
 * series.ts's LineSegment (always solid), so the chart draws either kind. A run of one point draws
 * no line; its weigh-in's dot is already there.
 */
export type TrendRun = { points: BodyweightPoint[]; gap: false };

export type BodyweightSeries = {
  /** Weigh-ins in the range, oldest first. */
  points: BodyweightPoint[];
  /** The trend at each weigh-in in the range, oldest first (one per weigh-in, in step with `points`). */
  trend: BodyweightPoint[];
  /** `trend` split where weigh-ins are more than 7 days apart: draw each run as its own line. */
  runs: TrendRun[];
  /** The trend value on each weigh-in's day, for readouts and VoiceOver. */
  trendByDate: ReadonlyMap<ISODate, number>;
};

const byDate = (a: BodyweightEntry, b: BodyweightEntry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

function inDateOrder(entries: readonly BodyweightEntry[]): readonly BodyweightEntry[] {
  for (let i = 1; i < entries.length; i++) if (entries[i - 1].date > entries[i].date) return [...entries].sort(byDate);
  return entries;
}

function compute(entries: readonly BodyweightEntry[], from: ISODate | undefined, units: UnitSystem | undefined): BodyweightSeries {
  const sorted = inDateOrder(entries);
  const n = sorted.length;
  const shown = (kg: number) => (units === 'imperial' ? kgToLb(kg) : kg);
  // Each weigh-in's day as a number, so the window and the gaps are plain subtraction.
  const day = new Array<number>(n);
  for (let i = 0; i < n; i++) day[i] = i === 0 ? 0 : day[i - 1] + daysBetween(sorted[i - 1].date, sorted[i].date);

  const points: BodyweightPoint[] = [];
  const trend: BodyweightPoint[] = [];
  const runs: TrendRun[] = [];
  const trendByDate = new Map<ISODate, number>();
  let run: BodyweightPoint[] = [];
  // The window holds sorted[start] … sorted[end - 1]: every weigh-in up to the current day (a day
  // with two counts both) and none 7 or more days before it.
  let start = 0;
  let end = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    while (end < n && day[end] <= day[i]) sum += sorted[end++].weightKg;
    while (day[i] - day[start] >= TREND_DAYS) sum -= sorted[start++].weightKg;
    const entry = sorted[i];
    if (i > 0 && day[i] - day[i - 1] > TREND_DAYS && run.length) {
      runs.push({ points: run, gap: false });
      run = [];
    }
    if (from && entry.date < from) continue;
    const value = shown(sum / (end - start));
    const point = { date: entry.date, value };
    points.push({ date: entry.date, value: shown(entry.weightKg) });
    trend.push(point);
    run.push(point);
    trendByDate.set(entry.date, value);
  }
  if (run.length) runs.push({ points: run, gap: false });
  return { points, trend, runs, trendByDate };
}

const cache = new WeakMap<readonly BodyweightEntry[], Map<string, BodyweightSeries>>();

/**
 * Weigh-ins and the 7-day trend for the range starting `from` (all of them without it), in kg, or
 * in the display unit with `units`. The same list of weigh-ins (as read, never changed in place)
 * with the same options gives back the same result without working it out again, so it's cheap
 * to call on every render.
 */
export function bodyweightSeries(entries: readonly BodyweightEntry[], options: { from?: ISODate; units?: UnitSystem } = {}): BodyweightSeries {
  const key = `${options.from ?? ''}|${options.units ?? 'kg'}`;
  let forList = cache.get(entries);
  if (!forList) cache.set(entries, (forList = new Map()));
  let series = forList.get(key);
  if (!series) forList.set(key, (series = compute(entries, options.from, options.units)));
  return series;
}

// Typo guard (Log weight).

/** Plausible bodyweights in each unit system's display unit (lb or kg), inclusive. */
export const BODYWEIGHT_LIMITS: Record<UnitSystem, { min: number; max: number }> = {
  metric: { min: 25, max: 350 },
  imperial: { min: 55, max: 770 },
};

/** What Log weight shows in an empty field: a typical weight in the user's unit. */
export const BODYWEIGHT_PLACEHOLDER: Record<UnitSystem, number> = { metric: 80, imperial: 180 };

/** Whether a weight typed in the user's unit is a plausible bodyweight (Save is off otherwise). */
export function isPlausibleBodyweight(value: number | undefined, units: UnitSystem): boolean {
  if (value === undefined || !Number.isFinite(value)) return false;
  const { min, max } = BODYWEIGHT_LIMITS[units];
  return value >= min && value <= max;
}

/** How far a weigh-in may be from the nearest earlier one before Log weight asks "Save anyway?". */
export const BIG_CHANGE = 0.1;

export type BigChange = {
  /** The nearest earlier weigh-in, compared with. */
  previous: BodyweightEntry;
  /** The change as a fraction of `previous`: 0.12 is 12% heavier, −0.12 is 12% lighter. */
  change: number;
  /** The size of the change in whole percent, for the question ("12%"). */
  percent: number;
};

/**
 * Whether a weigh-in is more than 10% from the nearest earlier one (by date: the latest one before
 * its day), so Log weight asks "Save anyway?". `id`: the weigh-in being fixed, which isn't compared
 * with itself. A weigh-in with none before it, or within 10%, gives undefined.
 */
export function bigChangeFrom(entries: readonly BodyweightEntry[], weighIn: { date: ISODate; weightKg: number; id?: ID }): BigChange | undefined {
  let previous: BodyweightEntry | undefined;
  for (const e of entries) {
    if (e.id === weighIn.id || e.date >= weighIn.date) continue;
    if (!previous || e.date > previous.date) previous = e;
  }
  if (!previous || !(previous.weightKg > 0)) return undefined;
  const change = (weighIn.weightKg - previous.weightKg) / previous.weightKg;
  // Exactly 10% (198 lb after 180 lb) doesn't ask, whatever the rounding in the lb → kg conversion.
  if (!(Math.abs(change) > BIG_CHANGE + 1e-9)) return undefined;
  return { previous, change, percent: Math.round(Math.abs(change) * 100) };
}

/**
 * The weigh-in that saving one on `date` replaces (one per day), if any. `id`: the weigh-in being
 * fixed, which doesn't replace itself.
 */
export function replacedOn(entries: readonly BodyweightEntry[], date: ISODate, id?: ID): BodyweightEntry | undefined {
  return entries.find((e) => e.date === date && e.id !== id);
}
