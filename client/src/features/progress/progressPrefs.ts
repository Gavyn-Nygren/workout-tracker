import { DEFAULT_PIN_IDS, defaultProgress } from '@/data/preferences';
import type { Exercise, ID, ProgressGraph, ProgressPin, ProgressPreferences } from '@/data/types';
import { newId } from '@/lib/id';
import { isMetric, RANGES, type Metric, type RangeKey } from './series';

// What the user keeps on Progress (spec 2.10, G3.11), pure and unit-tested (tests/progressPrefs.test.ts).
// Screens use it through useProgressPrefs.ts.
//
// - Pins and saved graphs are saved in the preferences (Preferences.progress), so they're in the
//   JSON export, reset by Erase all data and Load sample data, and synced like other settings.
//   data/preferences.ts cleans what's stored (cleanProgress); this module only builds on clean data.
// - Pins (ProgressPin) are in card order. A default pin (Squat, Bench, Deadlift: `isDefault`) shows
//   only once that lift is logged; a pin the user added always shows, "Not logged yet" until then.
//   Unpinning a default pin drops it; pinning that lift again makes it the user's own pin.
// - Every pin shows, however many there are (keyExercises fills the slots left up to 6).
// - A pin whose exercise no longer exists is left out, and dropped from storage on the next change.
//   A graph whose exercise no longer exists stays, so its row can say "Deleted exercise" with Remove.
// - A graph with a metric this version doesn't know is left out.
// - The range chip is a per-device convenience kept in the key-value store (useProgressPrefs.ts).

export { DEFAULT_PIN_IDS, defaultProgress };
export type { ProgressPin, ProgressPreferences };

/** A saved graph whose metric Progress knows. */
export type SavedGraph = ProgressGraph & { metric: Metric };

/** The range Progress starts on (spec 2.10), and goes back to after Erase all data or Load sample data. */
export const DEFAULT_RANGE: RangeKey = '3M';

/** A stored range, or the default when it isn't one Progress knows. */
export function parseRange(value: unknown): RangeKey {
  return RANGES.some((r) => r.value === value) ? (value as RangeKey) : DEFAULT_RANGE;
}

/**
 * The pins to show, in card order: every pin whose exercise exists. Without `exercisesById` (or
 * while it's empty, before the exercises load) nothing is left out.
 */
export function shownPins(progress: ProgressPreferences, exercisesById?: ReadonlyMap<ID, Exercise>): ProgressPin[] {
  if (!exercisesById?.size) return progress.pins;
  const kept = progress.pins.filter((p) => exercisesById.has(p.exerciseId));
  return kept.length === progress.pins.length ? progress.pins : kept;
}

/** The pin for an exercise, if it's pinned (a default pin counts, logged or not). */
export function pinFor(progress: ProgressPreferences, exerciseId: ID): ProgressPin | undefined {
  return progress.pins.find((p) => p.exerciseId === exerciseId);
}

export function isPinned(progress: ProgressPreferences, exerciseId: ID): boolean {
  return pinFor(progress, exerciseId) !== undefined;
}

/**
 * Pins or unpins an exercise. Unpinning drops the pin, a default one included; pinning adds the
 * user's own pin at the end, which always shows. Pins of exercises that no longer exist are
 * dropped along the way (when `exercisesById` is given).
 */
export function setPinned(progress: ProgressPreferences, exerciseId: ID, pinned: boolean, exercisesById?: ReadonlyMap<ID, Exercise>): ProgressPreferences {
  const pins = shownPins(progress, exercisesById);
  const has = pins.some((p) => p.exerciseId === exerciseId);
  if (pinned === has && pins === progress.pins) return progress;
  if (pinned) return { ...progress, pins: has ? pins : [...pins, { exerciseId }] };
  return { ...progress, pins: pins.filter((p) => p.exerciseId !== exerciseId) };
}

/** Pins an exercise that isn't pinned, or unpins one that is (see setPinned). */
export function togglePin(progress: ProgressPreferences, exerciseId: ID, exercisesById?: ReadonlyMap<ID, Exercise>): ProgressPreferences {
  const pinned = shownPins(progress, exercisesById).some((p) => p.exerciseId === exerciseId);
  return setPinned(progress, exerciseId, !pinned, exercisesById);
}

/** Your graphs as shown, in the order added: every saved graph with a metric Progress knows. */
export function shownGraphs(progress: ProgressPreferences): SavedGraph[] {
  return progress.graphs.filter((g): g is SavedGraph => isMetric(g.metric));
}

/** The saved graph for an exercise and metric, if there is one. */
export function graphFor(progress: ProgressPreferences, exerciseId: ID, metric: Metric): SavedGraph | undefined {
  return shownGraphs(progress).find((g) => g.exerciseId === exerciseId && g.metric === metric);
}

/**
 * Adds a graph at the end of Your graphs. If that exercise and metric already has one, nothing
 * changes and that one comes back. `id` is for tests.
 */
export function withGraph(progress: ProgressPreferences, exerciseId: ID, metric: Metric, id = newId('graph')): { progress: ProgressPreferences; graph: SavedGraph } {
  const existing = graphFor(progress, exerciseId, metric);
  if (existing) return { progress, graph: existing };
  const graph: SavedGraph = { id, exerciseId, metric };
  return { progress: { ...progress, graphs: [...progress.graphs, graph] }, graph };
}

/** Removes a saved graph (nothing changes if it's already gone). */
export function withoutGraph(progress: ProgressPreferences, graphId: ID): ProgressPreferences {
  return progress.graphs.some((g) => g.id === graphId) ? { ...progress, graphs: progress.graphs.filter((g) => g.id !== graphId) } : progress;
}
