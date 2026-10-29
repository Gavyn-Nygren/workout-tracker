import { useMemo } from 'react';

import { useToday } from '@/data/DataProvider';
import { useBodyweight, useExercises, usePreferences, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { beforeReopens } from '@/data/reopen';
import type { BodyweightEntry, WorkoutSession } from '@/data/types';
import { rangeStore } from './useProgressPrefs';
import { rangeStart } from './series';

/**
 * The reads a Progress screen can use (the preferences are always read: units and pins). A screen
 * waits on, and fails on, only the ones it names. Records aren't here: History reads them itself.
 */
export type ProgressRead = 'sessions' | 'exercises' | 'bodyweight';

/** Loading and error state of some reads (and the preferences), with a retry of the failed ones. */
export type ReadStatus = { isLoading: boolean; error: Error | null; retry: () => void };

/** What a screen waits on when it doesn't say: everything. */
const DEFAULT_READS: readonly ProgressRead[] = ['sessions', 'exercises', 'bodyweight'];

// One empty list each, so a screen's memos and the engine's per-list caches see the same array
// on every render before the data arrives.
const NO_SESSIONS: WorkoutSession[] = [];
const NO_BODYWEIGHT: BodyweightEntry[] = [];

/**
 * Shared reads for every Progress screen, scoped by the range chips at the top.
 *
 * - `reads`: what the screen uses. `isLoading`, `error` and `retry` cover those and the
 *   preferences; `status(reads)` gives the same for a part of the screen (a section with its own
 *   loading and error state).
 * - `sessions` has reopened workouts as they were before the reopen (data/reopen.ts), so a workout
 *   being edited never drops out of Progress.
 */
export function useProgressData(reads: readonly ProgressRead[] = DEFAULT_READS) {
  const today = useToday();
  const sessions = useSessions();
  const exercises = useExercises();
  const bodyweight = useBodyweight();
  const preferences = usePreferences();
  const units = (preferences.data ?? defaultPreferences).units;
  const range = rangeStore.use();
  const exercisesById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const queries = { sessions, exercises, bodyweight };

  const status = (only: readonly ProgressRead[]): ReadStatus => {
    const used = [preferences, ...only.map((read) => queries[read])];
    return {
      isLoading: used.some((q) => q.isLoading),
      error: used.find((q) => q.error)?.error ?? null,
      retry: () => used.forEach((q) => q.error && q.refetch()),
    };
  };
  const all = status(reads);

  return {
    today,
    units,
    range,
    from: rangeStart(range, today),
    sessions: beforeReopens(sessions.data ?? NO_SESSIONS),
    exercisesById,
    bodyweight: bodyweight.data ?? NO_BODYWEIGHT,
    isLoading: all.isLoading,
    error: all.error,
    retry: all.retry,
    status,
  };
}

// Formatting moved to progressFormat.ts (pure, tested); re-exported here until every screen imports it there.
export { formatMetric, formatMetricDelta, spokenMetric, spokenMetricDelta } from './progressFormat';
