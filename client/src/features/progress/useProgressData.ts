import { useMemo } from 'react';

import { useRepository } from '@/data/DataProvider';
import { useBodyweight, useExercises, usePersonalRecords, usePreferences, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { UnitSystem } from '@/data/types';
import { unitLabel } from '@/lib/format';
import { rangeStore } from './progressPrefs';
import { rangeStart, type Metric } from './series';

/** Shared reads for every Progress screen, scoped by the range chips at the top. */
export function useProgressData() {
  const today = useRepository().today();
  const sessions = useSessions();
  const exercises = useExercises();
  const bodyweight = useBodyweight();
  const records = usePersonalRecords();
  const preferences = usePreferences();
  const units = (preferences.data ?? defaultPreferences).units;
  const range = rangeStore.use();
  const exercisesById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const queries = [sessions, exercises, bodyweight, records, preferences];

  return {
    today,
    units,
    range,
    from: rangeStart(range, today),
    sessions: sessions.data ?? [],
    exercisesById,
    bodyweight: bodyweight.data ?? [],
    records: records.data ?? [],
    isLoading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error ?? null,
    retry: () => queries.forEach((q) => q.error && q.refetch()),
  };
}

/** Display formatting for a metric value that's already in display units. */
export function formatMetric(value: number, metric: Metric | 'bodyweight', units: UnitSystem, withUnit = true): string {
  if (metric === 'reps' || metric === 'sets') return `${Math.round(value)}${withUnit ? ` ${metric}` : ''}`;
  const unit = withUnit ? ` ${unitLabel(units)}` : '';
  if (metric === 'bodyweight') return `${Math.round(value * 10) / 10}${unit}`;
  // Values arrive already converted to the display unit.
  return `${value >= 1000 ? Math.round(value).toLocaleString('en-US') : Math.round(value)}${unit}`;
}

/** "+15 lb" / "−3 reps" with a true minus sign. */
export function formatMetricDelta(delta: number, metric: Metric | 'bodyweight', units: UnitSystem): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${formatMetric(Math.abs(delta), metric, units)}`;
}

