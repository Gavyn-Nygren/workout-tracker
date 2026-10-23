import { countsForPRs, countsForVolume, effectiveLoadKg, setE1RM, setVolumeKg } from '@/data/calculations';
import { addDays, daysBetween } from '@/data/dates';
import type { BodyweightEntry, Exercise, ISODate, UnitSystem, WorkoutSession } from '@/data/types';
import { kgToLb } from '@/data/units';

export type Metric = 'e1rm' | 'top_set' | 'volume' | 'reps' | 'sets';

export const METRICS: { value: Metric; label: string; short: string }[] = [
  { value: 'e1rm', label: 'Estimated 1RM', short: 'e1RM' },
  { value: 'top_set', label: 'Top set weight', short: 'Top set' },
  { value: 'volume', label: 'Volume (reps × weight)', short: 'Volume' },
  { value: 'reps', label: 'Total reps', short: 'Reps' },
  { value: 'sets', label: 'Working sets', short: 'Sets' },
];
export const metricLabel = (m: Metric) => METRICS.find((x) => x.value === m)!.label;
export const metricShort = (m: Metric) => METRICS.find((x) => x.value === m)!.short;
/** Metrics measured in weight, which are stored in kg and shown in the user's unit. */
export const isLoadMetric = (m: Metric) => m === 'e1rm' || m === 'top_set' || m === 'volume';

export type Point = { date: ISODate; value: number; sessionId?: string };

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

/** Converts a stored value to what the chart shows (kg → lb for weight metrics). */
export function toDisplay(value: number, metric: Metric | 'bodyweight', units: UnitSystem): number {
  const weight = metric === 'bodyweight' || isLoadMetric(metric as Metric);
  return weight && units === 'imperial' ? kgToLb(value) : value;
}

/** One point per completed session where the exercise was logged (spec 2.10). */
export function exerciseSeries(input: {
  exerciseId: string;
  metric: Metric;
  sessions: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  from?: ISODate;
}): Point[] {
  const exercise = input.exercisesById.get(input.exerciseId);
  if (!exercise) return [];
  const points: Point[] = [];
  for (const session of input.sessions) {
    if (session.status !== 'completed' || !session.completedDate) continue;
    if (input.from && session.completedDate < input.from) continue;
    const sets = session.blocks
      .flatMap((b) => b.exercises)
      .filter((e) => e.exerciseId === input.exerciseId && !e.skipped)
      .flatMap((e) => e.sets)
      .filter((s) => s.completedAt);
    if (!sets.length) continue;

    let value = 0;
    switch (input.metric) {
      case 'e1rm':
        value = Math.max(0, ...sets.map((s) => setE1RM(s, exercise) ?? 0));
        break;
      case 'top_set':
        value = Math.max(0, ...sets.filter(countsForPRs).map((s) => effectiveLoadKg(s, exercise) ?? 0));
        break;
      case 'volume':
        value = sets.reduce((sum, s) => sum + setVolumeKg(s, exercise), 0);
        break;
      case 'reps':
        value = sets.filter(countsForVolume).reduce((sum, s) => sum + (s.reps ?? 0), 0);
        break;
      case 'sets':
        value = sets.filter((s) => s.kind !== 'warmup').length;
        break;
    }
    if (value > 0) points.push({ date: session.completedDate, value, sessionId: session.id });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Change from the value about four weeks before the latest point (or the first point in range). */
export function changeOverTime(points: Point[], days = 28): { delta: number; since: ISODate } | undefined {
  const last = points[points.length - 1];
  if (!last || points.length < 2) return undefined;
  const cutoff = addDays(last.date, -days);
  const base = [...points].reverse().find((p) => p.date <= cutoff) ?? points[0];
  if (base === last) return undefined;
  return { delta: last.value - base.value, since: base.date };
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

/**
 * Exercises that matter most recently, for filling Key exercises after the pinned ones: compound
 * lifts first, then by how often they were logged. Bodyweight-only and timed exercises are left out,
 * since an e1RM isn't meaningful for them.
 */
export function mostFrequent(sessions: WorkoutSession[], since: ISODate, exclude: Set<string>, limit: number, exercisesById?: Map<string, Exercise>): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedDate || s.completedDate < since) continue;
    const seen = new Set<string>();
    for (const e of s.blocks.flatMap((b) => b.exercises)) {
      if (e.skipped || !e.sets.some((x) => x.completedAt) || seen.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
    }
  }
  // Compound lifts rank ahead of every isolation exercise, then by how often they're logged.
  const score = (id: string, count: number) => {
    const exercise = exercisesById?.get(id);
    if (!exercisesById) return count;
    if (!exercise || exercise.isBodyweight) return 0;
    return exercise.category === 'compound' ? 1000 + count : count;
  };
  return [...counts]
    .filter(([id]) => !exclude.has(id))
    .map(([id, count]) => [id, score(id, count)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** Weigh-ins plus a trailing 7-day average trend (user's pick: dots + trend line). */
export function bodyweightSeries(entries: BodyweightEntry[], from?: ISODate): { points: Point[]; trend: Point[] } {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const trend = sorted.map((entry) => {
    const window = sorted.filter((e) => e.date <= entry.date && daysBetween(e.date, entry.date) < 7);
    return { date: entry.date, value: window.reduce((sum, e) => sum + e.weightKg, 0) / window.length };
  });
  const inRange = (p: { date: ISODate }) => !from || p.date >= from;
  return { points: sorted.filter(inRange).map((e) => ({ date: e.date, value: e.weightKg })), trend: trend.filter(inRange) };
}

/** Round axis ticks ("nice numbers") spanning the data, about `count` of them. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
