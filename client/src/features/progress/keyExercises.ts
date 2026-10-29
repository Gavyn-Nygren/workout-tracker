// Key exercises on Progress (spec 2.10, G3.11 picks), pure and unit-tested (tests/keyExercises.test.ts).
//
// - Pins first: Squat, Bench and Deadlift are pinned by default and rank first, but a default pin's
//   card appears only once that lift has been logged. Pins the user added always show ("Not logged
//   yet" until they are), however many there are. Pins whose exercise no longer exists are dropped.
// - Then automatic picks fill the slots left, up to 6 cards in all: lifts with e1RM data (at least
//   one set with an e1RM) in the last 8 weeks, compound lifts before isolation lifts, then by how many
//   of those workouts they were in, ties to the one logged most recently. A pick with no point in
//   the selected range is left out.
// - A card shows e1RM; a pinned lift with no e1RM data shows its own best metric instead (top set,
//   longest hold, …), labelled on the card.
// - The change is changeSince over the full history, not the range, with "Last logged" and "First
//   logged" read from the lift's own sessions (not only those with a value for the card's metric).
import { setE1RM } from '@/data/calculations';
import { addDays } from '@/data/dates';
import type { Exercise, ISODate, WorkoutSession } from '@/data/types';
import { availabilityFromLogs } from './metrics';
import { changeSince, exerciseLogs, hasWorkingSet, loggedSpan, metricPoints, type ChangeSince, type ExerciseLog, type Metric, type Point } from './series';

/** Cards shown when the pins leave room (pins past it still all show). */
export const KEY_LIMIT = 6;
/** Automatic picks count the last 8 weeks (spec 2.10). */
export const KEY_WINDOW_DAYS = 56;
/**
 * A pinned exercise, as stored (ProgressPin in data/types.ts). `isDefault`: one of the default pins
 * (Squat, Bench, Deadlift; DEFAULT_PIN_IDS in data/preferences.ts) the user hasn't touched, shown
 * once logged. Any other pin is the user's own and always shows.
 */
export type KeyPin = { exerciseId: string; isDefault?: boolean };

/** `data`: points in the range. `not_logged`: no working set ever. `out_of_range`: logged, but not in the range. */
export type KeyCardState = 'data' | 'not_logged' | 'out_of_range';

export type KeyCard = {
  exerciseId: string;
  exercise: Exercise;
  /** Pinned by the user, a default pin, or picked automatically. */
  source: 'user_pin' | 'default_pin' | 'auto';
  pinned: boolean;
  /** e1RM, or for a pinned lift with no e1RM data its own best metric (label it on the card). */
  metric: Metric;
  /** Whether `metric` isn't e1RM, so the card says which metric it shows. */
  fallback: boolean;
  state: KeyCardState;
  /** Points in the range, oldest first, in stored units (toDisplay before showing). */
  points: Point[];
  /** The latest point of all time (the card's number), if any. */
  latest?: Point;
  /** The change over about 4 weeks, from the full history (describeChange formats it). */
  change: ChangeSince;
};

export type KeyExercisesInput = {
  /** Every session; finished ones count, and reopened ones as they were. */
  sessions: WorkoutSession[];
  exercisesById: Map<string, Exercise>;
  /** The pins in card order (Preferences.progress.pins). */
  pins: readonly KeyPin[];
  today: ISODate;
  /** The range chips' start (rangeStart); undefined for All. */
  from?: ISODate;
  limit?: number;
};

type Candidate = { exercise: Exercise; count: number; lastAt: string };

/** The Key exercises cards, in order. Empty means the "Nothing to chart yet" state. */
export function keyExercises(input: KeyExercisesInput): KeyCard[] {
  const { exercisesById, today, from } = input;
  const limit = input.limit ?? KEY_LIMIT;
  const index = exerciseLogs(input.sessions);
  const logsOf = (id: string): ExerciseLog[] => index.get(id) ?? [];

  // One entry per pinned exercise: a pin the user made wins over the same default pin. Default
  // pins rank first, then the user's, each in pinned order.
  const byUser = new Map<string, boolean>();
  for (const pin of input.pins) byUser.set(pin.exerciseId, (byUser.get(pin.exerciseId) ?? false) || !pin.isDefault);
  const ordered = [...byUser].sort(([, a], [, b]) => Number(a) - Number(b));

  const cards: KeyCard[] = [];
  for (const [exerciseId, user] of ordered) {
    const exercise = exercisesById.get(exerciseId);
    if (!exercise) continue;
    const logs = logsOf(exerciseId);
    const logged = logs.some(hasWorkingSet);
    if (!user && !logged) continue;
    cards.push(card(exercise, logs, user ? 'user_pin' : 'default_pin', logged, today, from));
  }

  const windowStart = addDays(today, -(KEY_WINDOW_DAYS - 1));
  const candidates: Candidate[] = [];
  for (const [exerciseId, logs] of index) {
    const exercise = exercisesById.get(exerciseId);
    if (!exercise || byUser.has(exerciseId)) continue;
    let count = 0;
    let lastAt = '';
    for (const log of logs) {
      if (log.date < windowStart || log.date > today || !log.sets.some((s) => setE1RM(s, exercise) !== undefined)) continue;
      count += 1;
      lastAt = log.at ?? log.date;
    }
    if (count) candidates.push({ exercise, count, lastAt });
  }
  const compound = (c: Candidate) => (c.exercise.category === 'compound' ? 0 : 1);
  candidates.sort((a, b) => compound(a) - compound(b) || b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.exercise.name.localeCompare(b.exercise.name));

  for (const { exercise } of candidates) {
    if (cards.length >= limit) break;
    const auto = card(exercise, logsOf(exercise.id), 'auto', true, today, from, 'e1rm');
    if (auto.points.length) cards.push(auto);
  }
  return cards;
}

function card(exercise: Exercise, logs: ExerciseLog[], source: KeyCard['source'], logged: boolean, today: ISODate, from: ISODate | undefined, metric?: Metric): KeyCard {
  const chosen = metric ?? cardMetric(exercise, logs);
  const all = metricPoints(logs, exercise, chosen);
  const points = from ? all.filter((p) => p.date >= from) : all;
  return {
    exerciseId: exercise.id,
    exercise,
    source,
    pinned: source !== 'auto',
    metric: chosen,
    fallback: chosen !== 'e1rm',
    state: !logged ? 'not_logged' : points.length ? 'data' : 'out_of_range',
    points,
    latest: all[all.length - 1],
    change: changeSince(all, today, loggedSpan(logs)),
  };
}

/**
 * A pinned card's metric: e1RM when the lift has e1RM data, else its first useful one (metrics.ts):
 * top set, longest hold, volume, reps, sets. Not logged yet: e1RM, or Longest hold for a hold.
 */
function cardMetric(exercise: Exercise, logs: ExerciseLog[]): Metric {
  if (metricPoints(logs, exercise, 'e1rm').length) return 'e1rm';
  return availabilityFromLogs(exercise, logs).defaultMetric;
}
