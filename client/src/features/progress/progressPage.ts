// What the Progress page shows (spec 2.10, G3.11), pure and unit-tested (tests/progressPage.test.ts).
// The engine picks and counts (keyExercises.ts, series.ts, bodyweight.ts, variations.ts); this
// module turns its results into the page's text, numbers and VoiceOver labels.
//
// - Key exercises cards: the latest value of all time (e1RM, or a pinned lift's own metric, named on
//   the card), the change over about 4 weeks from describeChange, and the range's points.
// - Your graphs rows: the latest value of all time with its date, or why there's none; a graph
//   whose exercise no longer exists reads "Deleted exercise".
// - Bodyweight card: the 7-day trend at the latest weigh-in, its change in the range, or when the
//   last weigh-in was if it's older than the trend's window.
// - All exercises: every logged exercise, all time, last logged first.
// - Dates carry the year when it isn't this year, in text and speech.
import type { ChartGaps } from '@/components/charts/chartMath';
import { daysBetween } from '@/data/dates';
import type { BodyweightEntry, Exercise, ISODate, UnitSystem } from '@/data/types';
import { formatLongDateYear, formatMonthDayYear, formatShortDateYear, plural } from '@/lib/format';
import { bodyweightSeries, TREND_DAYS, type BodyweightPoint } from './bodyweight';
import type { KeyCard } from './keyExercises';
import { availabilityFromLogs } from './metrics';
import { describeChange, deltaDirection, formatMetric, formatMetricDelta, spokenMetric, spokenMetricDelta, type Direction } from './progressFormat';
import type { SavedGraph } from './progressPrefs';
import { describeTrend, metricPoints, metricShort, toDisplay, type ExerciseLog, type Metric, type Point } from './series';
import type { LoggedExercise } from './variations';

/** A metric's name for VoiceOver (the visible ones abbreviate: "e1RM", "Sets"). */
export const SPOKEN_METRIC: Record<Metric, string> = {
  e1rm: 'Estimated one-rep max',
  top_set: 'Top set',
  volume: 'Volume',
  reps: 'Total reps',
  sets: 'Working sets',
  longest_hold: 'Longest hold',
};

/** All exercises rows shown on the page; the rest are a tap away (a virtualized list). */
export const ALL_EXERCISES_PREVIEW = 8;

/**
 * A card's or row's status line. `isChange`: a change ("+5 kg since Oct 1", "No change since Oct 1"),
 * shown with its arrow; otherwise plain ("Last logged Aug 20", "Not logged yet").
 */
export type StatusLine = { text: string; spoken: string; direction: Direction; isChange: boolean };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plain = (text: string, spoken = text): StatusLine => ({ text, spoken, direction: 'none', isChange: false });
/** Sentences for a VoiceOver label: the non-empty parts, each ending in a full stop. */
const sentences = (...parts: (string | undefined | false)[]) =>
  parts
    .filter((p): p is string => Boolean(p))
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ');

/** A stored value as shown, and as spoken: "+20 lb" / "bodyweight plus 20 pounds". */
function shownValue(point: Point, metric: Metric, units: UnitSystem) {
  const value = toDisplay(point.value, metric, units);
  const options = { added: point.added };
  return { text: formatMetric(value, metric, units, true, options), spoken: spokenMetric(value, metric, units, options) };
}

/** Points in display units, for a sparkline. */
const displayPoints = (points: readonly Point[], metric: Metric, units: UnitSystem): Point[] => points.map((p) => ({ ...p, value: toDisplay(p.value, metric, units) }));

/** The range's direction for VoiceOver ("rising from 130 to 140 kilograms over 8 sessions"), from two points up. */
function spokenTrend(points: Point[], metric: Metric, units: UnitSystem): string | undefined {
  if (points.length < 2) return undefined;
  const added = points.some((p) => p.added);
  return describeTrend(points, (v) => spokenMetric(v, metric, units, { added }));
}

// Key exercises.

export type KeyCardView = {
  exerciseId: string;
  metric: Metric;
  name: string;
  pinned: boolean;
  /** The metric, named on a card that isn't showing e1RM ("Top set", "Longest hold"). */
  metricLabel?: string;
  /** The latest value of all time: "142.5 kg", "+20 lb", "75 s", or "—" when there's none. */
  value: string;
  status?: StatusLine;
  /** The range's points in display units, oldest first, for the sparkline. */
  points: Point[];
  /** Logged, but nothing in the range: the sparkline's spot says so. */
  emptyRange: boolean;
  /** The whole card for VoiceOver. */
  label: string;
};

/** A Key exercises card as shown (keyExercises picks the cards). */
export function keyCardView(card: KeyCard, units: UnitSystem, today: ISODate): KeyCardView {
  const { metric, latest } = card;
  const name = card.exercise.name;
  const shown = latest && shownValue(latest, metric, units);
  let status: StatusLine | undefined;
  if (card.state === 'not_logged') status = plain('Not logged yet');
  else {
    const change = describeChange(card.change, metric, units, today);
    if (change) status = { ...change, isChange: card.change.kind === 'change' };
  }
  const points = displayPoints(card.points, metric, units);
  const emptyRange = card.state === 'out_of_range';
  const trend = spokenTrend(points, metric, units);
  return {
    exerciseId: card.exerciseId,
    metric,
    name,
    pinned: card.pinned,
    metricLabel: card.fallback ? metricShort(metric) : undefined,
    value: shown?.text ?? '—',
    status,
    points,
    emptyRange,
    label: sentences(
      `${name}${card.pinned ? ', pinned' : ''}`,
      shown && `${SPOKEN_METRIC[metric]}, ${shown.spoken}`,
      status?.spoken,
      trend && `In this range, ${trend}`,
      emptyRange && 'Nothing in this range',
    ),
  };
}

/** The Key exercises menu's pin item. */
export const pinActionLabel = (pinned: boolean) => (pinned ? 'Unpin from Key exercises' : 'Pin to Key exercises');

// Your graphs.

type GraphRowBase = {
  graphId: string;
  metric: Metric;
  /** "Back Squat · Volume", or "Deleted exercise · Volume". */
  title: string;
  /** The remove sheet's title. */
  sheetTitle: string;
  label: string;
};

export type GraphRowView =
  | (GraphRowBase & { kind: 'deleted' })
  | (GraphRowBase & {
      kind: 'graph';
      exerciseId: string;
      /** "142.5 kg · Tue, Oct 20", or why there's nothing yet ("Logged without a weigh-in"). */
      subtitle: string;
      /** The range's points in display units, for the sparkline. */
      points: Point[];
    });

/** Why a saved graph has no value yet: the metric's reason (metrics.ts), or that it doesn't fit. */
function noDataReason(exercise: Exercise, logs: readonly ExerciseLog[], metric: Metric): string {
  const info = availabilityFromLogs(exercise, logs).all.find((m) => m.metric === metric);
  if (info?.fits) return info.reason ?? 'Not logged yet';
  return 'Doesn’t apply to this exercise';
}

/**
 * A Your graphs row. `exercise` is undefined when it no longer exists (the row offers Remove);
 * `logs` are the exercise's (exerciseLogs), `from` the range's start.
 */
export function graphRowView(graph: SavedGraph, exercise: Exercise | undefined, logs: readonly ExerciseLog[], units: UnitSystem, today: ISODate, from?: ISODate): GraphRowView {
  const short = metricShort(graph.metric);
  if (!exercise) {
    const title = `Deleted exercise · ${short}`;
    return { kind: 'deleted', graphId: graph.id, metric: graph.metric, title, sheetTitle: title, label: `Deleted exercise, ${SPOKEN_METRIC[graph.metric]} graph.` };
  }
  const all = metricPoints(logs, exercise, graph.metric);
  const latest = all[all.length - 1];
  const points = displayPoints(from ? all.filter((p) => p.date >= from) : all, graph.metric, units);
  const shown = latest && shownValue(latest, graph.metric, units);
  const reason = latest ? undefined : noDataReason(exercise, logs, graph.metric);
  const trend = spokenTrend(points, graph.metric, units);
  const title = `${exercise.name} · ${short}`;
  return {
    kind: 'graph',
    graphId: graph.id,
    exerciseId: exercise.id,
    metric: graph.metric,
    title,
    sheetTitle: title,
    subtitle: latest && shown ? `${shown.text} · ${formatShortDateYear(latest.date, today)}` : reason!,
    points,
    label: sentences(
      `${exercise.name}, ${SPOKEN_METRIC[graph.metric]}`,
      latest && shown ? `Latest ${shown.spoken}, ${formatLongDateYear(latest.date, today)}` : reason,
      trend && capitalize(trend),
      latest && !points.length && 'Nothing in this range',
    ),
  };
}

// Bodyweight.

export type BodyweightCardView = {
  /** The 7-day trend at the latest weigh-in ("81.4 kg"), or "—" with none. */
  value: string;
  status: StatusLine;
  /** The range's trend in display units, oldest first. Draw it with BODYWEIGHT_GAPS. */
  trend: BodyweightPoint[];
  label: string;
};

/**
 * The trend line breaks where weigh-ins are more than 7 days apart (bodyweight.ts runs), instead of
 * drawing a steady change nobody measured (user's pick).
 */
export const BODYWEIGHT_GAPS: ChartGaps = { days: TREND_DAYS, draw: 'none' };

/**
 * The Bodyweight card: the trend at the latest weigh-in, and its change across the range (neutral:
 * neither way is better). When the latest weigh-in is older than the trend's window it says when
 * that was instead, so an old trend doesn't read as current.
 */
export function bodyweightCardView(entries: readonly BodyweightEntry[], units: UnitSystem, today: ISODate, from?: ISODate): BodyweightCardView {
  const everything = bodyweightSeries(entries, { units });
  const ranged = bodyweightSeries(entries, { from, units });
  const latest = everything.trend[everything.trend.length - 1];
  const value = latest ? formatMetric(latest.value, 'bodyweight', units) : '—';
  const date = latest && { text: formatMonthDayYear(latest.date, today), spoken: formatLongDateYear(latest.date, today) };

  let status: StatusLine;
  if (!latest || !date) status = plain('No weigh-ins yet');
  else if (daysBetween(latest.date, today) > TREND_DAYS) status = plain(`Last weigh-in ${date.text}`, `Last weigh-in ${date.spoken}`);
  else if (ranged.trend.length > 1) {
    const delta = ranged.trend[ranged.trend.length - 1].value - ranged.trend[0].value;
    status = {
      text: `${formatMetricDelta(delta, 'bodyweight', units)} in range`,
      spoken: `${capitalize(spokenMetricDelta(delta, 'bodyweight', units))} in range`,
      direction: deltaDirection(delta, 'bodyweight'),
      isChange: true,
    };
  } else status = plain(`Weighed in ${date.text}`, `Weighed in ${date.spoken}`);

  return {
    value,
    status,
    trend: ranged.trend,
    label: sentences(`Bodyweight, 7-day trend ${latest ? spokenMetric(latest.value, 'bodyweight', units) : 'not available'}`, status.spoken),
  };
}

// All exercises.

export type ExerciseRowView = { exerciseId: string; title: string; subtitle: string; label: string };

/** All exercises rows (loggedExercises: all time, last logged first). Exercises that no longer exist are left out. */
export function exerciseRowsView(logged: readonly LoggedExercise[], exercisesById: ReadonlyMap<string, Exercise>, today: ISODate): ExerciseRowView[] {
  const rows: ExerciseRowView[] = [];
  for (const item of logged) {
    const exercise = exercisesById.get(item.exerciseId);
    if (!exercise) continue;
    const count = plural(item.sessions, 'session');
    rows.push({
      exerciseId: item.exerciseId,
      title: exercise.name,
      subtitle: `${count} · last ${formatShortDateYear(item.lastDate, today)}`,
      label: `${exercise.name}, ${count}, last ${formatLongDateYear(item.lastDate, today)}`,
    });
  }
  return rows;
}
