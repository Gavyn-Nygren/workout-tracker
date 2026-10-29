import { useMemo } from 'react';

import { usePreferences, useSaveProgressPreferences } from '@/data/hooks';
import { defaultProgress } from '@/data/preferences';
import type { Exercise, ID, ProgressPin } from '@/data/types';
import { createLocalStore } from '@/lib/localStore';
import { DEFAULT_RANGE, parseRange, setPinned, shownGraphs, shownPins, togglePin, withGraph, withoutGraph, type SavedGraph } from './progressPrefs';
import type { Metric, RangeKey } from './series';

/**
 * The key-value entry holding the range chip. DataProvider resets it with the data (Erase all data,
 * Load sample data), so keep the two in step.
 */
export const RANGE_KEY = 'progress.range';

const rangeEntry = createLocalStore<RangeKey>(RANGE_KEY, DEFAULT_RANGE);

/**
 * The time range that scopes everything on Progress: a per-device convenience, kept in the
 * key-value store. A stored value Progress doesn't know reads as the default.
 */
export const rangeStore = {
  get: (): RangeKey => parseRange(rangeEntry.get()),
  set: (range: RangeKey) => rangeEntry.set(range),
  use: (): RangeKey => parseRange(rangeEntry.use()),
};

export type ProgressPrefs = {
  /** False until the preferences load. Until then the lists show the defaults and changes do nothing. */
  ready: boolean;
  /**
   * Key exercises pins in card order, minus any whose exercise no longer exists (once
   * `exercisesById` has loaded). A pin with `isDefault` shows only once its lift is logged.
   */
  pins: ProgressPin[];
  /**
   * Your graphs in the order added, minus any with a metric Progress doesn't know. A graph whose
   * exercise no longer exists stays: show it as "Deleted exercise" with Remove.
   */
  graphs: SavedGraph[];
  /** Whether an exercise is pinned (a default pin counts, logged or not). */
  isPinned: (exerciseId: ID) => boolean;
  /** Pins or unpins. Pinning adds the user's own pin at the end; unpinning a default pin drops it. */
  togglePin: (exerciseId: ID) => void;
  setPinned: (exerciseId: ID, pinned: boolean) => void;
  /**
   * Adds a graph (or finds the one that exercise and metric already has) and returns it, already in
   * `graphs` on every screen, so it can be opened straight away. Undefined before the preferences load.
   */
  addGraph: (exerciseId: ID, metric: Metric) => SavedGraph | undefined;
  removeGraph: (graphId: ID) => void;
};

/**
 * Progress's pins and saved graphs (progressPrefs.ts has the rules), saved in the preferences.
 * Pass the exercises (useProgressData's exercisesById) so pins of exercises that no longer exist
 * are left out, and dropped from storage with the next change. A failed save shows an error toast
 * and the saved state comes back.
 */
export function useProgressPrefs(exercisesById?: ReadonlyMap<ID, Exercise>): ProgressPrefs {
  const preferences = usePreferences();
  const save = useSaveProgressPreferences();
  const progress = preferences.data?.progress ?? defaultProgress;
  const ready = preferences.data !== undefined;

  return useMemo<ProgressPrefs>(() => {
    const pins = shownPins(progress, exercisesById);
    const pinned = new Set(pins.map((p) => p.exerciseId));
    return {
      ready,
      pins,
      graphs: shownGraphs(progress),
      isPinned: (exerciseId) => pinned.has(exerciseId),
      togglePin: (exerciseId) => void save((current) => togglePin(current, exerciseId, exercisesById)),
      setPinned: (exerciseId, on) => void save((current) => setPinned(current, exerciseId, on, exercisesById)),
      addGraph: (exerciseId, metric) => {
        let graph: SavedGraph | undefined;
        save((current) => {
          const added = withGraph(current, exerciseId, metric);
          graph = added.graph;
          return added.progress;
        });
        return graph;
      },
      removeGraph: (graphId) => void save((current) => withoutGraph(current, graphId)),
    };
  }, [progress, ready, exercisesById, save]);
}
