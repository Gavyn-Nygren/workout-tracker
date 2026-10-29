// Geometry and labels for the charts (LineChart, Sparkline), pure and unit-tested
// (tests/chartMath.test.ts). Values are in display units; dates are local ISO dates.
//
// - x is a point's place in time (pointTime): its day plus the time it was finished, so workouts
//   done the same day sit in the order they were finished. Same-day points closer than a minimum
//   gap are spread apart around their middle, so a drag can reach each one.
// - A line can split where points are far apart (the gap rule is series.ts splitAtGaps): a dashed,
//   faded segment across the gap (graphs: 28 days), or no line at all (bodyweight trend: 7 days).
// - Axis labels never repeat, and their size is estimated so the padding can hold them.
import type { ISODate } from '@/data/types';
import { pointTime, splitAtGaps, timeAxisTicks, type Point } from '@/features/progress/series';
import { formatMonthDayYear } from '@/lib/format';

type Timed = Pick<Point, 'date' | 'at'>;

/** How a line treats points further apart than `days`: a dashed, faded segment, or no line. */
export type ChartGaps = { days: number; draw: 'dashed' | 'none' };

/** A stretch of a line by point index (both ends included): solid, or a gap to draw dashed. */
export type Run = { from: number; to: number; gap: boolean };

/**
 * A line's runs. Without `gaps` it's one solid run. With them, it breaks where consecutive points
 * are more than `gaps.days` apart, with a two-point gap run in between when they're drawn dashed.
 * A run of one point (from === to) has no line; draw it as a marker so it stays visible.
 */
export function lineRuns(points: readonly Pick<Point, 'date'>[], gaps?: ChartGaps | false): Run[] {
  if (!points.length) return [];
  if (!gaps) return [{ from: 0, to: points.length - 1, gap: false }];
  const indexed = points.map((p, i) => ({ date: p.date, i }));
  return splitAtGaps(indexed, gaps.days)
    .filter((s) => s.points.length > 0 && (!s.gap || gaps.draw === 'dashed'))
    .map((s) => ({ from: s.points[0].i, to: s.points[s.points.length - 1].i, gap: s.gap }));
}

/** The time span an x axis covers, in ms (pointTime). */
export type TimeDomain = { t0: number; t1: number };

/**
 * The span covering every point of every series. When they all fall on one day it has no width,
 * so they sit in the middle (finish times would otherwise stretch one day edge to edge).
 */
export function timeDomain(series: readonly (readonly Timed[])[]): TimeDomain | undefined {
  let t0 = Infinity;
  let t1 = -Infinity;
  let firstDate: ISODate | undefined;
  let oneDay = true;
  for (const points of series) {
    for (const p of points) {
      const t = pointTime(p);
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
      if (firstDate === undefined) firstDate = p.date;
      else if (p.date !== firstDate) oneDay = false;
    }
  }
  if (!Number.isFinite(t0)) return undefined;
  return { t0, t1: oneDay ? t0 : t1 };
}

/**
 * Each point's x within `left … left + width`. Consecutive points on the same day closer than
 * `minGap` are spread evenly around their middle (kept inside the plot), so each can be reached.
 */
export function placeX(points: readonly Timed[], domain: TimeDomain, left: number, width: number, minGap = 0): number[] {
  const span = domain.t1 - domain.t0;
  const xs = points.map((p) => (span > 0 ? left + ((pointTime(p) - domain.t0) / span) * width : left + width / 2));
  if (minGap <= 0) return xs;
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (j + 1 < points.length && points[j + 1].date === points[i].date) j++;
    const needed = minGap * (j - i);
    if (j > i && xs[j] - xs[i] < needed) {
      const start = Math.max(left, Math.min((xs[i] + xs[j]) / 2 - needed / 2, left + width - needed));
      for (let k = i; k <= j; k++) xs[k] = start + (k - i) * minGap;
    }
    i = j + 1;
  }
  return xs;
}

/**
 * The point a touch at (x, y) reads: the nearest by x. Among points in the same column (within
 * `column` of that distance), the one nearest the finger's height, so stacked points (a dense
 * chart, two workouts on one day) can each be reached. -1 when there are no points.
 */
export function nearestIndex(xs: readonly number[], ys: readonly number[], x: number, y?: number, column = 2): number {
  let best = -1;
  let bestDx = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dx = Math.abs(xs[i] - x);
    if (dx < bestDx) {
      bestDx = dx;
      best = i;
    }
  }
  if (best < 0 || y === undefined) return best;
  let pick = best;
  let pickDy = Math.abs(ys[best] - y);
  for (let i = 0; i < xs.length; i++) {
    if (i === best || Math.abs(xs[i] - x) > bestDx + column) continue;
    const dy = Math.abs(ys[i] - y);
    if (dy < pickDy) {
      pick = i;
      pickDy = dy;
    }
  }
  return pick;
}

/**
 * A rough width for a label in SF Pro (semibold, tabular digits), on the generous side so padding
 * sized from it holds the real text.
 */
export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ',' || ch === '.' || ch === ' ' || ch === ':') em += 0.32;
    else if (/[A-Z]/.test(ch)) em += 0.7;
    else if (/[a-z]/.test(ch)) em += 0.58;
    else em += 0.64;
  }
  return em * fontSize;
}

/** Axis ticks with their labels, leaving out any tick whose label repeats the one below it. */
export function uniqueTicks(ticks: readonly number[], label: (value: number) => string): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (const value of ticks) {
    const text = label(value);
    if (out.length && out[out.length - 1].label === text) continue;
    out.push({ value, label: text });
  }
  return out;
}

/**
 * An axis label from 10,000 up in thousands ("12.5K", dataviz: compact large ticks) when that's
 * exact to one decimal; anything else as `format` gives it.
 */
export function compactTick(value: number, format: (value: number) => string): string {
  if (Math.abs(value) >= 10_000 && Math.abs(Math.round(value) - value) < 1e-9 && Math.round(value) % 100 === 0) {
    return `${value < 0 ? '−' : ''}${Math.abs(Math.round(value / 100)) / 10}K`;
  }
  return format(value);
}

/** A date label under the plot. `x` is where `anchor` sits; `markX` is the tick mark's place. */
/**
 * An x-axis label. `date` is the day it marks, unique among an axis's labels (its React key: the
 * text isn't, since a long span repeats month names, "Jul … 2026 … Jul").
 */
export type TimeLabel = { date: ISODate; x: number; text: string; anchor: 'start' | 'middle' | 'end'; markX?: number };

export type TimeLabelInput = {
  /** The first and last plotted points, with their x. */
  first: { date: ISODate; x: number };
  last: { date: ISODate; x: number };
  /** 'ends' labels the first and last dates; 'months' gives month or year ticks (1Y, All). */
  mode: 'ends' | 'months';
  /** A day's x (its start), for month ticks. */
  xOf: (date: ISODate) => number;
  /** The whole chart's width; labels stay inside it. */
  width: number;
  today: ISODate;
  /** A label's width (textWidth at the axis font size). */
  measure: (text: string) => number;
  maxTicks?: number;
};

/** Space kept between two date labels. */
const LABEL_GAP = 10;

/**
 * The x-axis labels. Month mode places month ticks ("Mar", the year on a January) under their
 * month starts, dropping any that would touch a neighbour; with fewer than 3 left (a short span)
 * it labels the ends instead, which say more. Ends read "Oct 20", with the year when it isn't
 * this year; one day gets one label, and two that would touch keep only the last.
 */
export function timeLabels(input: TimeLabelInput): TimeLabel[] {
  const { first, last, width, today, measure } = input;
  const clamp = (x: number, w: number) => Math.min(Math.max(x, w / 2), width - w / 2);
  if (input.mode === 'months') {
    const labels: TimeLabel[] = [];
    let right = -Infinity;
    for (const tick of timeAxisTicks(first.date, last.date, input.maxTicks ?? 5)) {
      const w = measure(tick.label);
      const markX = input.xOf(tick.date);
      const x = clamp(markX, w);
      if (x - w / 2 < right + LABEL_GAP) continue;
      labels.push({ date: tick.date, x, text: tick.label, anchor: 'middle', markX });
      right = x + w / 2;
    }
    if (labels.length >= 3) return labels;
  }
  const lastText = formatMonthDayYear(last.date, today);
  const lastWidth = measure(lastText);
  if (first.date === last.date) return [{ date: last.date, x: clamp(last.x, lastWidth), text: lastText, anchor: 'middle' }];
  const firstText = formatMonthDayYear(first.date, today);
  const firstWidth = measure(firstText);
  const startX = Math.min(Math.max(first.x, 0), width - firstWidth);
  const endX = Math.max(Math.min(last.x, width), lastWidth);
  const end: TimeLabel = { date: last.date, x: endX, text: lastText, anchor: 'end' };
  if (startX + firstWidth + LABEL_GAP > endX - lastWidth) return [end];
  return [{ date: first.date, x: startX, text: firstText, anchor: 'start' }, end];
}

/** How many month ticks fit a plot this wide at this font size. */
export function maxTimeTicks(plotWidth: number, fontSize: number): number {
  return Math.max(2, Math.min(6, Math.floor(plotWidth / (textWidth('Mmm', fontSize) + 28))));
}

const num = (v: number) => v.toFixed(1);

/** An SVG path through points `from … to` (both included). */
export function linePath(xs: readonly number[], ys: readonly number[], from = 0, to = xs.length - 1): string {
  let d = '';
  for (let i = from; i <= to; i++) d += `${i === from ? 'M' : ' L'}${num(xs[i])},${num(ys[i])}`;
  return d;
}

/** The area under points `from … to`, down to `baseline`. */
export function areaPath(xs: readonly number[], ys: readonly number[], from: number, to: number, baseline: number): string {
  return `${linePath(xs, ys, from, to)} L${num(xs[to])},${num(baseline)} L${num(xs[from])},${num(baseline)} Z`;
}

/** Many dots as one path of circles, for dense dot series (one SVG node instead of hundreds). */
export function dotsPath(xs: readonly number[], ys: readonly number[], r: number): string {
  let d = '';
  for (let i = 0; i < xs.length; i++) {
    d += `M${num(xs[i] - r)},${num(ys[i])} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 `;
  }
  return d.trim();
}
