// The full graph screen and the graph builder (spec 2.10, G3.11): which metric a graph opens on,
// its readout, its empty states, and its session table. Pure and unit-tested (tests/graphView.test.ts).
//
// - A graph opened from a link (Key exercises, History) shows the metric asked for when it fits the
//   exercise, else the exercise's first useful metric (metrics.ts). A saved graph keeps its metric.
// - The readout shows the latest value of all time and the change over about 4 weeks (the same
//   describeChange as the Key exercises cards), or the session being scrubbed.
// - Dates carry the year when it isn't this year, in text and speech.
// - Bodyweight lifts' Top set reads as added weight: "+20 lb", "Bodyweight", "−20 lb".
import type { ISODate, UnitSystem } from '@/data/types';
import { formatLongDateYear, formatShortDateYear } from '@/lib/format';
import { NO_WEIGH_IN, NOT_LOGGED, type ExerciseMetrics, type MetricAvailability } from './metrics';
import { describeChange, formatMetric, spokenMetric, type ChangeText } from './progressFormat';
import { describeTrend, isMetric, metricLabel, metricPhrase, type ChangeSince, type Metric, type Point } from './series';

/**
 * The metric a graph opened from a link shows: the one asked for (a route param, unchecked) when
 * it fits the exercise, else the exercise's first useful one. Before the exercise is known, the
 * one asked for if it's a metric at all, else e1RM.
 */
export function graphMetric(asked: unknown, availability?: ExerciseMetrics): Metric {
  if (!availability) return isMetric(asked) ? asked : 'e1rm';
  if (isMetric(asked) && availability.offered.some((m) => m.metric === asked)) return asked;
  return availability.defaultMetric;
}

/** Whether a metric reads as added weight for this exercise (a bodyweight lift's Top set). */
export function readsAdded(metric: Metric, availability?: ExerciseMetrics): boolean {
  return metric === 'top_set' && Boolean(availability?.all.find((m) => m.metric === 'top_set')?.added);
}

/** The metric's name under the exercise's: "Top set weight · added to bodyweight" for a bodyweight lift. */
export function metricSubtitle(metric: Metric, added: boolean): string {
  return added ? `${metricLabel(metric)} · added to bodyweight` : metricLabel(metric);
}

/** A point as shown and spoken. `value` is in display units (toDisplay). */
export function pointValue(point: Point, metric: Metric, units: UnitSystem): { text: string; spoken: string } {
  const options = { added: point.added };
  return { text: formatMetric(point.value, metric, units, true, options), spoken: spokenMetric(point.value, metric, units, options) };
}

/** What VoiceOver says for a session on the chart and in the table: "Tuesday, October 20, 2025, Push Day: 225 pounds". */
export function spokenPoint(point: Point, metric: Metric, units: UnitSystem, today: ISODate, name?: string): string {
  return `${formatLongDateYear(point.date, today)}${name ? `, ${name}` : ''}: ${pointValue(point, metric, units).spoken}`;
}

export type GraphReadout = {
  value: string;
  spokenValue: string;
  /** "Latest · Tue, Oct 20 · Push Day", the scrubbed session's date, or "Last logged Aug 20 · Push Day" / "Last e1RM Aug 20 · Push Day". */
  line: string;
  spokenLine: string;
  /** The change over about 4 weeks (`isChange`, with its arrow), or plain "First logged Oct 1", "First e1RM Oct 1". Not while scrubbing. */
  change?: ChangeText & { isChange: boolean };
};

/**
 * The readout above the chart. `shown` (display units) is the scrubbed point, or the latest of all
 * time; `change` is changeSince over the full history (stored units). Undefined when nothing's logged.
 * A lift last logged more than 4 weeks ago says so instead of showing a change ("Last logged",
 * the lift's last session; "Last e1RM" when only the metric's value is that old).
 */
export function graphReadout(input: {
  shown?: Point;
  selected: boolean;
  change: ChangeSince;
  metric: Metric;
  units: UnitSystem;
  today: ISODate;
  name?: string;
}): GraphReadout | undefined {
  const { shown, metric, units, today, name } = input;
  if (!shown) return undefined;
  const value = pointValue(shown, metric, units);
  const withName = (text: string, sep: string) => (name ? `${text}${sep}${name}` : text);
  const base = { value: value.text, spokenValue: value.spoken };
  if (input.selected) {
    return { ...base, line: withName(formatShortDateYear(shown.date, today), ' · '), spokenLine: withName(formatLongDateYear(shown.date, today), ', ') };
  }
  const described = describeChange(input.change, metric, units, today);
  // "Last logged Aug 20" / "Last e1RM Aug 20" replaces the date line when it names the shown
  // value's own day, so the date isn't there twice.
  const { change } = input;
  const swapsDate = (change.kind === 'last_logged' || change.kind === 'metric_last') && change.date === shown.date;
  if (swapsDate && described) {
    return { ...base, line: withName(described.text, ' · '), spokenLine: withName(described.spoken, ', ') };
  }
  return {
    ...base,
    line: withName(`Latest · ${formatShortDateYear(shown.date, today)}`, ' · '),
    spokenLine: withName(`Latest, ${formatLongDateYear(shown.date, today)}`, ', '),
    change: described && { ...described, isChange: input.change.kind === 'change' },
  };
}

/** What the chart card says when it has nothing to draw. `action`: a button that helps. */
export type GraphEmpty = { title: string; message: string; action?: 'log_weight' | 'show_all' };

/**
 * Why the chart is empty, or undefined when the range has points. `info` is the metric's
 * availability for the exercise (undefined: not known yet). `hasWeighIn`: whether any weigh-in is
 * saved (undefined: not known), so Log weight is offered only when it's the missing piece.
 */
export function graphEmpty(info: MetricAvailability | undefined, pointsInRange: number, hasWeighIn?: boolean): GraphEmpty | undefined {
  if (pointsInRange > 0) return undefined;
  if (info && !info.fits) {
    return {
      title: `No ${metricPhrase(info.metric)} for this exercise`,
      message: info.metric === 'longest_hold' ? 'It’s logged with reps, not as timed holds.' : 'It’s logged as timed holds.',
    };
  }
  if (!info || info.hasData) return { title: 'Nothing in this range', message: 'Try a longer range.', action: 'show_all' };
  if (info.reason === NOT_LOGGED || !info.reason) return { title: 'Not logged yet', message: 'Log it in a workout and it shows up here.' };
  const title = `No ${metricPhrase(info.metric)} yet`;
  if (info.reason === NO_WEIGH_IN) {
    // Sets keep the bodyweight they were logged with (never back-filled), so a weigh-in helps from then on.
    return { title, message: `${NO_WEIGH_IN}. Sets you log after a weigh-in count.`, action: hasWeighIn ? undefined : 'log_weight' };
  }
  return { title, message: `${info.reason}.` };
}

/** The builder's line under the metric chips: why the picked metric has no data yet, if it hasn't. */
export function metricNote(info: MetricAvailability | undefined): string | undefined {
  if (!info || info.hasData) return undefined;
  const reason = info.reason ?? NOT_LOGGED;
  return `No data yet: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
}

/** A metric chip's VoiceOver label: "Estimated 1RM", or "Estimated 1RM, no data yet". */
export function chipLabel(info: MetricAvailability): string {
  return info.hasData ? info.label : `${info.label}, no data yet`;
}

export type SessionRow = {
  key: string;
  /** Opens that workout's summary. */
  sessionId?: string;
  /** "Tue, Oct 20 · Push Day" */
  title: string;
  value: string;
  spoken: string;
};

/** The session table, newest first. `points` are in display units. */
export function sessionRows(points: readonly Point[], metric: Metric, units: UnitSystem, today: ISODate, nameOf: (sessionId?: string) => string | undefined): SessionRow[] {
  const rows: SessionRow[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    const name = nameOf(p.sessionId);
    rows.push({
      key: p.sessionId ?? `${p.date}-${p.at ?? i}`,
      sessionId: p.sessionId,
      title: `${formatShortDateYear(p.date, today)}${name ? ` · ${name}` : ''}`,
      value: pointValue(p, metric, units).text,
      spoken: spokenPoint(p, metric, units, today, name),
    });
  }
  return rows;
}

/** The chart's VoiceOver label: "Back Squat, Estimated 1RM, rising from 140 to 150 kilograms over 6 sessions. Values are listed below." */
export function chartLabel(name: string, metric: Metric, points: readonly Point[], units: UnitSystem): string {
  const added = points.some((p) => p.added);
  const trend = describeTrend([...points], (v) => spokenMetric(v, metric, units, { added }));
  return `${name}, ${metricLabel(metric)}, ${trend}. Values are listed below.`;
}
