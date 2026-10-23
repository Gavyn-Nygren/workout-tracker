import { createLocalStore } from '@/lib/localStore';
import { newId } from '@/lib/id';
import type { Metric, RangeKey } from './series';

export type SavedGraph = { id: string; exerciseId: string; metric: Metric };

/** Exercises pinned to the top of Key exercises (spec 2.10: pinned + most frequent). */
export const pinnedStore = createLocalStore<string[]>('progress.pinned', ['ex_back_squat', 'ex_bench_press', 'ex_deadlift']);

/** "Your graphs": custom exercise × metric graphs the user has loaded. */
export const graphsStore = createLocalStore<SavedGraph[]>('progress.graphs', [
  { id: 'graph_squat_volume', exerciseId: 'ex_back_squat', metric: 'volume' },
  { id: 'graph_pullup_reps', exerciseId: 'ex_pull_up', metric: 'reps' },
]);

/** The time range that scopes everything on Progress. */
export const rangeStore = createLocalStore<RangeKey>('progress.range', '3M');

export function togglePinned(exerciseId: string) {
  pinnedStore.set((prev) => (prev.includes(exerciseId) ? prev.filter((id) => id !== exerciseId) : [...prev, exerciseId]));
}

export function addGraph(exerciseId: string, metric: Metric): SavedGraph {
  const existing = graphsStore.get().find((g) => g.exerciseId === exerciseId && g.metric === metric);
  if (existing) return existing;
  const graph = { id: newId('graph'), exerciseId, metric };
  graphsStore.set((prev) => [...prev, graph]);
  return graph;
}

export function removeGraph(id: string) {
  graphsStore.set((prev) => prev.filter((g) => g.id !== id));
}
