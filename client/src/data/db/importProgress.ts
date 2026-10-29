import { cleanProgress, DEFAULT_PIN_IDS } from '../preferences';
import type { Preferences, ProgressGraph, ProgressPin } from '../types';
import { PREFERENCES_ID, putRow, readOneSync } from './rows';
import type { SqlDb } from './sql';

/**
 * One-time move (G3.11) of Progress's pins and saved graphs from the key-value store, where
 * versions before G3.11 kept them, into the preferences (Preferences.progress), so they're
 * exported, reset, and synced with the other settings. openDatabase.ts reads the two key-value
 * entries and removes them once this returns true.
 */

/** The key-value entries versions before G3.11 used. */
export const LEGACY_PROGRESS_KEYS = { pinned: 'progress.pinned', graphs: 'progress.graphs' } as const;

/**
 * The two sample graphs every install started with before G3.11. Graphs can't be edited, so one
 * with its id is untouched; those are dropped. Graphs the user added are kept.
 */
const OLD_SAMPLE_GRAPHS: readonly ProgressGraph[] = [
  { id: 'graph_squat_volume', exerciseId: 'ex_back_squat', metric: 'volume' },
  { id: 'graph_pullup_reps', exerciseId: 'ex_pull_up', metric: 'reps' },
];

const parse = (raw: string | null): unknown => {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * Moves the old key-value pins and graphs (the raw stored text, null when never saved) into the
 * preferences. Old pins: a list of exercise ids, where Squat, Bench, and Deadlift become default
 * pins (shown once logged) and the rest the user's own; never saved means the default pins. Old
 * graphs: kept minus the two untouched sample graphs; never saved means none. Only runs while the
 * saved preferences have no pins and graphs yet; otherwise the old values are leftovers and are
 * ignored. Anything unreadable is dropped (cleanProgress). Returns true when the key-value entries
 * can be removed: always, unless writing fails (it throws, and the move is tried at the next launch).
 */
export function importLegacyProgress(db: SqlDb, legacy: { pinned: string | null; graphs: string | null }): boolean {
  if (legacy.pinned === null && legacy.graphs === null) return true;
  db.withTransactionSync(() => {
    const stored = readOneSync<Partial<Preferences>>(db, 'preferences', PREFERENCES_ID);
    if (stored?.progress !== undefined) return;
    const oldPins = parse(legacy.pinned);
    const oldGraphs = parse(legacy.graphs);
    const pins: ProgressPin[] | undefined = Array.isArray(oldPins)
      ? oldPins.filter((id): id is string => typeof id === 'string').map((exerciseId) => (DEFAULT_PIN_IDS.includes(exerciseId) ? { exerciseId, isDefault: true } : { exerciseId }))
      : undefined;
    const untouchedSample = (g: unknown) =>
      OLD_SAMPLE_GRAPHS.some((s) => g && typeof g === 'object' && (g as ProgressGraph).id === s.id && (g as ProgressGraph).exerciseId === s.exerciseId && (g as ProgressGraph).metric === s.metric);
    const graphs = Array.isArray(oldGraphs) ? oldGraphs.filter((g) => !untouchedSample(g)) : [];
    putRow(db, 'preferences', PREFERENCES_ID, { ...stored, progress: cleanProgress({ pins, graphs }) });
  });
  return true;
}
