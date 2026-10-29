// Which graph metrics fit an exercise, which have data, and why one that fits has none yet (G3.11).
// Pure and unit-tested (tests/progressMetrics.test.ts). The graph builder and the graph's metric
// chips offer only metrics that fit; "Open graph" and a pinned card without e1RM data use the first
// useful one.
import { countsForPRs, effectiveLoadKg, isPartialRepSet, isWorkingSet } from '@/data/calculations';
import type { Exercise, LoggedSet, WorkoutSession } from '@/data/types';
import { exerciseLogs, METRICS, metricPoints, topSetReading, type ExerciseLog, type Metric } from './series';

/**
 * Exercises done as timed holds, for one with nothing logged yet (any exercise can log holds; once
 * logged, what was logged decides). Custom exercises linked to one count too; built-in variations
 * don't inherit it (Dead Bug and Bird Dog are Plank variations done for reps), so every built-in
 * hold is listed here by id.
 */
const HOLD_EXERCISES = new Set(['ex_plank', 'ex_side_plank', 'ex_hollow_hold', 'ex_l_sit', 'ex_copenhagen_plank', 'ex_wall_sit', 'ex_dead_hang', 'ex_superman']);

export function isHoldExercise(exercise: Pick<Exercise, 'id' | 'baseMovementId' | 'source'>): boolean {
  if (HOLD_EXERCISES.has(exercise.id)) return true;
  return exercise.source === 'custom' && exercise.baseMovementId !== undefined && HOLD_EXERCISES.has(exercise.baseMovementId);
}

/**
 * The order "the first useful metric" is picked in: e1RM, then the lift's own best (top set,
 * longest hold), then volume, reps, sets.
 */
export const USEFUL_ORDER: Metric[] = ['e1rm', 'top_set', 'longest_hold', 'volume', 'reps', 'sets'];

export type MetricAvailability = {
  metric: Metric;
  label: string;
  short: string;
  /** It applies to the exercise: to how it's been logged, or for one not logged yet, to what it is. */
  fits: boolean;
  /** At least one workout has a value for it (all time). */
  hasData: boolean;
  /** For a metric that fits but has no data yet: why, in a few words ("Only sets of 12 reps or fewer"). */
  reason?: string;
  /** Top set of a bodyweight or assisted lift: it reads the weight added to bodyweight. */
  added?: boolean;
};

export type ExerciseMetrics = {
  /** Every metric, in METRICS order. */
  all: MetricAvailability[];
  /** The ones that fit, in METRICS order: what the builder and the chips offer. */
  offered: MetricAvailability[];
  /** The first useful metric (USEFUL_ORDER): the first that has data, else the first that fits. */
  defaultMetric: Metric;
};

export const NOT_LOGGED = 'Not logged yet';
const WARMUPS_ONLY = 'Warm-ups don’t count';
/**
 * Bodyweight sets with no bodyweight saved with them. A set takes the latest weigh-in when it's
 * completed and is never back-filled (spec 2.6), so a weigh-in logged later doesn't change these
 * sets: the wording stays true after one ("Needs a weigh-in" wouldn't).
 */
export const NO_WEIGH_IN = 'Logged without a weigh-in';
const TWELVE_OR_FEWER = 'Only sets of 12 reps or fewer';
const NO_PARTIALS = 'Partial-rep sets don’t count';

/** Why e1RM has no value: the most useful thing to say about the sets that were logged. */
function e1rmReason(repSets: LoggedSet[], exercise: Exercise): string {
  const counted = repSets.filter((s) => countsForPRs(s) && s.reps);
  if (!counted.length) return repSets.some(isPartialRepSet) ? NO_PARTIALS : NOT_LOGGED;
  if (counted.some((s) => (s.reps ?? 0) <= 12 && effectiveLoadKg(s, exercise) === undefined)) return NO_WEIGH_IN;
  return TWELVE_OR_FEWER;
}

/** Why a metric that fits has no data yet. */
function reasonFor(metric: Metric, working: LoggedSet[], everything: LoggedSet[], exercise: Exercise): string {
  if (!working.length) return everything.length ? WARMUPS_ONLY : NOT_LOGGED;
  const repSets = working.filter((s) => s.kind !== 'timed_hold');
  switch (metric) {
    case 'e1rm':
      return e1rmReason(repSets, exercise);
    case 'top_set':
      return repSets.some(isPartialRepSet) ? NO_PARTIALS : NOT_LOGGED;
    case 'volume':
      return repSets.some((s) => s.reps && effectiveLoadKg(s, exercise) === undefined) ? NO_WEIGH_IN : NOT_LOGGED;
    default:
      return NOT_LOGGED;
  }
}

/** metricAvailability from an exercise's logs (series.ts exerciseLogs), for callers that have them. */
export function availabilityFromLogs(exercise: Exercise, logs: readonly ExerciseLog[]): ExerciseMetrics {
  const everything = logs.flatMap((l) => l.sets);
  const working = everything.filter(isWorkingSet);
  const holdsLogged = working.some((s) => s.kind === 'timed_hold');
  const repsLogged = working.some((s) => s.kind !== 'timed_hold');
  const holdLike = working.length ? holdsLogged && !repsLogged : isHoldExercise(exercise);
  const fits = (metric: Metric) => {
    if (metric === 'sets') return true;
    if (metric === 'longest_hold') return working.length ? holdsLogged : holdLike;
    return working.length ? repsLogged : !holdLike;
  };
  const added = topSetReading(logs, exercise) === 'added';

  const all = METRICS.map(({ value: metric, label, short }): MetricAvailability => {
    const fit = fits(metric);
    const hasData = metricPoints(logs, exercise, metric).length > 0;
    const info: MetricAvailability = { metric, label, short, fits: fit, hasData };
    if (fit && !hasData) info.reason = reasonFor(metric, working, everything, exercise);
    if (metric === 'top_set' && added) info.added = true;
    return info;
  });
  const byMetric = new Map(all.map((m) => [m.metric, m]));
  const firstWith = (test: (m: MetricAvailability) => boolean) => USEFUL_ORDER.find((m) => test(byMetric.get(m)!));
  const defaultMetric = firstWith((m) => m.fits && m.hasData) ?? firstWith((m) => m.fits) ?? 'e1rm';
  return { all, offered: all.filter((m) => m.fits), defaultMetric };
}

/**
 * Which metrics fit an exercise, which have data (all time, finished workouts, reopened ones as they
 * were), the reason for each that fits but has none yet, and the default metric for "Open graph".
 * A lift logged with reps gets the rep metrics; one logged as timed holds gets Longest hold; both
 * get both; Sets always fits. Before anything's logged it goes by what the exercise is.
 */
export function metricAvailability(exercise: Exercise, sessions: WorkoutSession[]): ExerciseMetrics {
  return availabilityFromLogs(exercise, exerciseLogs(sessions).get(exercise.id) ?? []);
}

/** The first useful metric for an exercise: what "Open graph" opens on. */
export function defaultMetric(exercise: Exercise, sessions: WorkoutSession[]): Metric {
  return metricAvailability(exercise, sessions).defaultMetric;
}

/** Whether a metric fits an exercise (see metricAvailability), for checking a saved graph or a link. */
export function metricFits(metric: Metric, exercise: Exercise, sessions: WorkoutSession[]): boolean {
  return metricAvailability(exercise, sessions).offered.some((m) => m.metric === metric);
}
