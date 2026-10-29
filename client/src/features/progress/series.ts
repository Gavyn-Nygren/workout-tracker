import { countsForPRs, countsForVolume, effectiveLoadKg, isWorkingSet, recordLoadKg, setE1RM, setVolumeKg } from '@/data/calculations';
import { addDays, daysBetween, fromISODate } from '@/data/dates';
import { isFinishedSession } from '@/data/reopen';
import type { Exercise, ISODate, LoggedSet, UnitSystem, WorkoutSession } from '@/data/types';
import { kgToLb } from '@/data/units';

// The numbers behind Progress (spec 2.10), counted by the spec 2.7 rules in data/calculations.ts
// and records.ts. Pure and unit-tested (tests/progressSeries.test.ts).
//
// - One point per finished workout that logged the exercise, in the order the workouts were
//   finished. A reopened workout counts as it was before the reopen (data/reopen.ts).
// - e1RM: the best set's Epley estimate on effective load; working sets of 12 reps or fewer, no
//   partial-rep sets, and bodyweight sets only with a weigh-in (never back-filled).
// - Top set: the heaviest working set as records compare it. Bodyweight and assisted lifts read the
//   weight added to bodyweight (0 is bodyweight, negative is assistance), so a weigh-in never moves
//   it; other lifts read the load. No partial-rep sets.
// - Volume: reps × effective load of every working set but timed holds, partial-rep sets included.
// - Reps: the same sets' reps. Sets: working sets (timed holds included).
// - Longest hold: the longest timed hold.

export type Metric = 'e1rm' | 'top_set' | 'volume' | 'reps' | 'sets' | 'longest_hold';

/**
 * `short` names a chip or label ("Top set"); `phrase` is the name inside a sentence ("No top set
 * yet", "Last e1RM Sep 19"), and `spokenPhrase` the same for VoiceOver.
 */
export const METRICS: { value: Metric; label: string; short: string; phrase: string; spokenPhrase: string }[] = [
  { value: 'e1rm', label: 'Estimated 1RM', short: 'e1RM', phrase: 'e1RM', spokenPhrase: 'estimated one-rep max' },
  { value: 'top_set', label: 'Top set weight', short: 'Top set', phrase: 'top set', spokenPhrase: 'top set' },
  { value: 'volume', label: 'Volume (reps × weight)', short: 'Volume', phrase: 'volume', spokenPhrase: 'volume' },
  { value: 'reps', label: 'Total reps', short: 'Reps', phrase: 'reps', spokenPhrase: 'total reps' },
  { value: 'sets', label: 'Working sets', short: 'Sets', phrase: 'sets', spokenPhrase: 'working sets' },
  { value: 'longest_hold', label: 'Longest hold', short: 'Longest hold', phrase: 'longest hold', spokenPhrase: 'longest hold' },
];

/** Whether a value (a route param, or something read from storage) is a known metric. */
export function isMetric(value: unknown): value is Metric {
  return typeof value === 'string' && METRICS.some((m) => m.value === value);
}

/** A metric from an unchecked value, or `fallback` when it isn't one. */
export function parseMetric(value: unknown, fallback: Metric = 'e1rm'): Metric {
  return isMetric(value) ? value : fallback;
}

/** An unknown metric reads as e1RM rather than crashing. */
const metricInfo = (m: Metric) => METRICS.find((x) => x.value === m) ?? METRICS[0];
export const metricLabel = (m: Metric) => metricInfo(m).label;
export const metricShort = (m: Metric) => metricInfo(m).short;
/** The metric's name inside a sentence: "e1RM", "top set", "longest hold". */
export const metricPhrase = (m: Metric) => metricInfo(m).phrase;
/** metricPhrase for VoiceOver: "estimated one-rep max". */
export const spokenMetricPhrase = (m: Metric) => metricInfo(m).spokenPhrase;
/** Metrics measured in weight, which are stored in kg and shown in the user's unit. */
export const isLoadMetric = (m: Metric) => m === 'e1rm' || m === 'top_set' || m === 'volume';

export type Point = {
  date: ISODate;
  /** Stored units: kg for weight metrics, otherwise reps, sets, or seconds. */
  value: number;
  sessionId?: string;
  /** When the workout was finished (a timestamp). Orders and places workouts done the same day. */
  at?: string;
  /**
   * Top set of a bodyweight or assisted lift: `value` is the weight added to bodyweight (0 is
   * bodyweight alone, negative is assistance), shown as "+20 lb", "Bodyweight", or "−20 lb".
   */
  added?: boolean;
};

/**
 * Where a point sits on a time axis, in ms: its day, plus the time of day it was finished, so two
 * workouts on one day get their own spots in the order they were done (always within that day).
 */
export function pointTime(point: Pick<Point, 'date' | 'at'>): number {
  const day = fromISODate(point.date).getTime();
  const at = point.at ? Date.parse(point.at) : NaN;
  if (Number.isNaN(at)) return day;
  // Clamped into the day, so a moment that fell on another local date (a trip) keeps the order.
  return day + Math.min(Math.max(at - day, 0), 86_399_999);
}

export type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'All';
/** `spoken` is for VoiceOver, which reads "1M" as "1 meter". */
export const RANGES: { value: RangeKey; label: string; spoken: string; days?: number }[] = [
  { value: '1M', label: '1M', spoken: '1 month', days: 30 },
  { value: '3M', label: '3M', spoken: '3 months', days: 91 },
  { value: '6M', label: '6M', spoken: '6 months', days: 182 },
  { value: '1Y', label: '1Y', spoken: '1 year', days: 365 },
  { value: 'All', label: 'All', spoken: 'All time' },
];
export function rangeStart(range: RangeKey, today: ISODate): ISODate | undefined {
  const days = RANGES.find((r) => r.value === range)?.days;
  return days ? addDays(today, -days) : undefined;
}

/** Converts a stored value (or a change in one) to what the chart shows (kg → lb for weight metrics). */
export function toDisplay(value: number, metric: Metric | 'bodyweight', units: UnitSystem): number {
  const weight = metric === 'bodyweight' || isLoadMetric(metric as Metric);
  return weight && units === 'imperial' ? kgToLb(value) : value;
}

/** One finished workout's completed sets of an exercise, from every entry of it in that workout. */
export type ExerciseLog = { session: WorkoutSession; date: ISODate; at?: string; sets: LoggedSet[] };

type Completion = Pick<WorkoutSession, 'completedAt' | 'completedDate'>;
/** Finish order, as records.ts uses: the completion moment, else the date. */
const byCompletion = (a: Completion, b: Completion) => (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');

const logIndex = new WeakMap<readonly WorkoutSession[], Map<string, ExerciseLog[]>>();

/**
 * Every exercise's logs, by exercise id, oldest first: finished workouts (reopened ones as they
 * were) with at least one completed set of it. Built once per sessions array (cached), so every
 * series, card, and list on a screen shares one pass over the history.
 */
export function exerciseLogs(sessions: WorkoutSession[]): Map<string, ExerciseLog[]> {
  const cached = logIndex.get(sessions);
  if (cached) return cached;
  const index = new Map<string, ExerciseLog[]>();
  for (const session of sessions.filter(isFinishedSession).sort(byCompletion)) {
    const byExercise = new Map<string, LoggedSet[]>();
    for (const block of session.blocks) {
      for (const entry of block.exercises) {
        for (const set of entry.sets) {
          if (!set.completedAt) continue;
          const sets = byExercise.get(entry.exerciseId);
          if (sets) sets.push(set);
          else byExercise.set(entry.exerciseId, [set]);
        }
      }
    }
    for (const [exerciseId, sets] of byExercise) {
      const log: ExerciseLog = { session, date: session.completedDate!, at: session.completedAt, sets };
      const logs = index.get(exerciseId);
      if (logs) logs.push(log);
      else index.set(exerciseId, [log]);
    }
  }
  logIndex.set(sessions, index);
  return index;
}

/** Whether a log has a working set (not only warm-ups): what makes an exercise "logged". */
export const hasWorkingSet = (log: ExerciseLog) => log.sets.some(isWorkingSet);

/** How Top set reads a lift's sets: weight added to bodyweight, or the load itself. */
export type TopSetReading = 'added' | 'total';

/**
 * Top set's reading for an exercise: added weight for a bodyweight lift, else the load. If the
 * history only has sets read the other way (a custom exercise whose "Counts bodyweight" setting
 * changed), that way, as the exercise's records do (records.ts exerciseBests).
 */
export function topSetReading(logs: readonly ExerciseLog[], exercise: Pick<Exercise, 'isBodyweight'>): TopSetReading {
  const preferred: TopSetReading = exercise.isBodyweight ? 'added' : 'total';
  let other = false;
  for (const log of logs) {
    for (const set of log.sets) {
      const load = topSetLoad(set, exercise);
      if (!load) continue;
      if ((load.added ? 'added' : 'total') === preferred) return preferred;
      other = true;
    }
  }
  return other ? (preferred === 'added' ? 'total' : 'added') : preferred;
}

/** A set's weight for Top set, as heaviest-weight records compare it; undefined if it doesn't count. */
function topSetLoad(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>) {
  if (!countsForPRs(set) || !set.reps) return undefined;
  return recordLoadKg(set, exercise);
}

const max = (values: number[]) => (values.length ? Math.max(...values) : undefined);

/** A log's value for a metric (stored units), or undefined when no set of it counts. */
function logValue(log: ExerciseLog, metric: Metric, exercise: Exercise, reading: TopSetReading): number | undefined {
  const sets = log.sets;
  switch (metric) {
    case 'e1rm':
      return max(sets.flatMap((s) => setE1RM(s, exercise) ?? []));
    case 'top_set':
      return max(sets.flatMap((s) => {
        const load = topSetLoad(s, exercise);
        return load && (load.added ? 'added' : 'total') === reading ? [load.kg] : [];
      }));
    case 'volume': {
      // Sets without an effective load (bodyweight sets with no weigh-in) are left out, not zero.
      const counted = sets.filter((s) => countsForVolume(s) && s.reps && effectiveLoadKg(s, exercise) !== undefined);
      return counted.length ? counted.reduce((sum, s) => sum + setVolumeKg(s, exercise), 0) : undefined;
    }
    case 'reps': {
      const reps = sets.filter(countsForVolume).reduce((sum, s) => sum + (s.reps ?? 0), 0);
      return reps > 0 ? reps : undefined;
    }
    case 'sets': {
      const count = sets.filter(isWorkingSet).length;
      return count > 0 ? count : undefined;
    }
    case 'longest_hold':
      return max(sets.flatMap((s) => (s.kind === 'timed_hold' && s.durationSec ? [s.durationSec] : [])));
    default:
      return undefined;
  }
}

/** A metric's points from an exercise's logs (see exerciseLogs), from `from` on if given. */
export function metricPoints(logs: readonly ExerciseLog[], exercise: Exercise, metric: Metric, from?: ISODate): Point[] {
  const reading = metric === 'top_set' ? topSetReading(logs, exercise) : 'total';
  const points: Point[] = [];
  for (const log of logs) {
    if (from && log.date < from) continue;
    const value = logValue(log, metric, exercise, reading);
    if (value === undefined) continue;
    const point: Point = { date: log.date, value, sessionId: log.session.id };
    if (log.at) point.at = log.at;
    if (metric === 'top_set' && reading === 'added') point.added = true;
    points.push(point);
  }
  return points;
}

/**
 * One point per finished workout where the exercise has a value for the metric (spec 2.10), in the
 * order the workouts were finished, from `from` on if given. Sets completed before an exercise was
 * skipped still count; a reopened workout counts as it was.
 */
export function exerciseSeries(input: {
  exerciseId: string;
  metric: Metric;
  sessions: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  from?: ISODate;
}): Point[] {
  const exercise = input.exercisesById.get(input.exerciseId);
  if (!exercise) return [];
  return metricPoints(exerciseLogs(input.sessions).get(input.exerciseId) ?? [], exercise, input.metric, input.from);
}

/** "About 4 weeks" for the change readout. */
export const CHANGE_DAYS = 28;

/**
 * The change shown on a Key exercises card and in the graph readout (one rule for both):
 * - `change`: the latest session against the most recent one at least 4 weeks before it.
 * - `last_logged`: the lift's latest session is more than 4 weeks before today, so no change is
 *   shown. `date` is that session's day.
 * - `metric_last`: the lift is recent, but the metric's latest value is more than 4 weeks old
 *   (later sessions had none: sets over 12 reps, bodyweight sets without a weigh-in). "Last e1RM …".
 * - `first_logged`: nothing is 4 weeks older than the latest session yet. `date` is the lift's
 *   first session.
 * - `metric_first`: as first_logged, but the lift was logged before the metric's first value. "First e1RM …".
 * - `none`: no points.
 * `delta` is in the points' units.
 */
export type ChangeSince =
  | { kind: 'none' }
  | { kind: 'change'; delta: number; since: ISODate; base: Point; latest: Point }
  | { kind: 'last_logged'; date: ISODate; latest: Point }
  | { kind: 'metric_last'; date: ISODate; latest: Point }
  | { kind: 'first_logged'; date: ISODate; latest: Point }
  | { kind: 'metric_first'; date: ISODate; latest: Point };

/** The first and last days a lift was logged (a session with a working set of it). */
export type LoggedSpan = { first: ISODate; last: ISODate };

/** loggedSpan from an exercise's logs (exerciseLogs): its first and last sessions with a working set. */
export function loggedSpan(logs: readonly ExerciseLog[]): LoggedSpan | undefined {
  let span: LoggedSpan | undefined;
  for (const log of logs) {
    if (!hasWorkingSet(log)) continue;
    if (!span) span = { first: log.date, last: log.date };
    else {
      if (log.date < span.first) span.first = log.date;
      if (log.date > span.last) span.last = log.date;
    }
  }
  return span;
}

/**
 * The change over about 4 weeks (CHANGE_DAYS). Pass the full history, oldest first, not points
 * cut to the range chips, so every range shows the same change. `logged` is the lift's own first
 * and last sessions (loggedSpan), so "Last logged" and "First logged" name the lift's sessions even
 * when some of them have no value for the metric; without it, the points' dates are used.
 */
export function changeSince(points: readonly Point[], today: ISODate, logged?: LoggedSpan): ChangeSince {
  const latest = points[points.length - 1];
  if (!latest) return { kind: 'none' };
  const lastDay = logged && logged.last > latest.date ? logged.last : latest.date;
  if (daysBetween(lastDay, today) > CHANGE_DAYS) return { kind: 'last_logged', date: lastDay, latest };
  if (daysBetween(latest.date, today) > CHANGE_DAYS) return { kind: 'metric_last', date: latest.date, latest };
  const cutoff = addDays(latest.date, -CHANGE_DAYS);
  for (let i = points.length - 2; i >= 0; i--) {
    const base = points[i];
    if (base.date <= cutoff) return { kind: 'change', delta: latest.value - base.value, since: base.date, base, latest };
  }
  const firstPoint = points[0].date;
  if (logged && logged.first < firstPoint) return { kind: 'metric_first', date: firstPoint, latest };
  return { kind: 'first_logged', date: firstPoint, latest };
}

/** A run of a line: solid, or a `gap` between two points further apart than the limit. */
export type LineSegment<T> = { points: T[]; gap: boolean };

/**
 * Splits a line where consecutive points are more than `maxGapDays` apart. Each gap becomes its own
 * two-point segment, for a dashed, faded line (graphs: 28 days), or for leaving the line broken
 * (skip the gap segments). Runs of a single point are kept, so every point is in a solid run.
 */
export function splitAtGaps<T extends { date: ISODate }>(points: readonly T[], maxGapDays = CHANGE_DAYS): LineSegment<T>[] {
  const segments: LineSegment<T>[] = [];
  let run: T[] = [];
  points.forEach((point, i) => {
    const previous = points[i - 1];
    if (previous && daysBetween(previous.date, point.date) > maxGapDays) {
      segments.push({ points: run, gap: false }, { points: [previous, point], gap: true });
      run = [];
    }
    run.push(point);
  });
  if (run.length) segments.push({ points: run, gap: false });
  return segments;
}

/**
 * A chart's direction for VoiceOver: "rising from 290 to 330 lb over 6 sessions". `format` turns a
 * value into speech (with its unit); `noun` names one point.
 */
export function describeTrend(points: Point[], format: (value: number) => string, noun = 'session'): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 'no data in this range';
  if (points.length === 1) return `1 ${noun}: ${format(last.value)}`;
  const change = last.value - first.value;
  const span = Math.max(Math.abs(first.value), Math.abs(last.value)) || 1;
  // Within half a percent reads as flat, so rounding noise isn't called a trend.
  const direction = Math.abs(change) / span < 0.005 ? 'steady' : change > 0 ? 'rising' : 'falling';
  const count = `${points.length} ${noun}s`;
  return direction === 'steady' ? `steady at ${format(last.value)} over ${count}` : `${direction} from ${format(first.value)} to ${format(last.value)} over ${count}`;
}

/** Whether `value` needs no more than `decimals` decimal places. */
const hasDecimals = (value: number, decimals: number) => {
  const scaled = value * 10 ** decimals;
  return Math.abs(Math.round(scaled) - scaled) < 1e-6;
};

/**
 * Round axis ticks ("nice numbers") spanning the data, about `count` of them. With `decimals` (the
 * places the labels show; progressFormat's valueTicks picks it per metric), every step is a number
 * the labels show exactly and at least one unit in the last place, so no two labels repeat and no
 * gridline is labelled with a rounded value. A flat range gets room around its value.
 */
export function niceTicks(min: number, max: number, count = 4, decimals?: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  const minStep = decimals === undefined ? 0 : 10 ** -decimals;
  if (max - min < 1e-9) {
    const pad = Math.max(Math.abs(min) * 0.05, minStep) || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const usable = (s: number) => decimals === undefined || (s >= minStep - 1e-9 && hasDecimals(s, decimals));
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50].map((m) => m * magnitude).find((s) => s >= rough - 1e-9 && usable(s)) ?? Math.max(minStep, 10 * magnitude);
  const places = decimals ?? 3;
  const round = (v: number) => Math.round(v * 10 ** places) / 10 ** places + 0; // + 0 turns −0 into 0
  const first = Math.floor(min / step + 1e-9);
  const last = Math.ceil(max / step - 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(round(i * step));
  return ticks;
}

/** A date tick on a long time axis: the first of a month, labelled "Mar", or the year on a January. */
export type TimeTick = { date: ISODate; label: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Month or year ticks for a time axis from `first` to `last` (1Y and All), at most `maxTicks`:
 * every month, every 2, 3 or 6 months, then every year or more. Months read "Feb", and each
 * January reads as its year ("2026"), so the axis says which year it's in; yearly ticks read
 * "2025". Empty when no month starts inside the span (short ranges label their ends instead).
 */
export function timeAxisTicks(first: ISODate, last: ISODate, maxTicks = 5): TimeTick[] {
  if (last <= first || maxTicks < 1) return [];
  const monthIndex = (date: ISODate) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  // The first month start on or after `first`, through the last one on or before `last`.
  const start = monthIndex(first) + (first.endsWith('-01') ? 0 : 1);
  const end = monthIndex(last);
  if (start > end) return [];
  for (const step of [1, 2, 3, 6, 12, 24, 60, 120, 600]) {
    const ticks: number[] = [];
    for (let m = Math.ceil(start / step) * step; m <= end; m += step) ticks.push(m);
    if (ticks.length > maxTicks) continue;
    return ticks.map((m) => {
      const year = Math.floor(m / 12);
      const month = m % 12;
      return { date: `${year}-${String(month + 1).padStart(2, '0')}-01`, label: step >= 12 || month === 0 ? String(year) : MONTHS[month] };
    });
  }
  return [];
}
