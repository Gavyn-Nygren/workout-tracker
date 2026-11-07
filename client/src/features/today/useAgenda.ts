import { useMemo } from 'react';

import { useToday } from '@/data/DataProvider';
import { addDays } from '@/data/dates';
import { useExercises, useOccurrences, usePersonalRecords, usePlans, usePlanVersions, usePreferences, useSessions } from '@/data/hooks';
import type { Exercise } from '@/data/types';
import { buildAgenda, type Agenda } from './agenda';

/** Days of history and future the calendar strip can browse. */
export const AGENDA_PAST_DAYS = 70;
export const AGENDA_FUTURE_DAYS = 28;

const NO_EXERCISES: Exercise[] = [];
const exerciseMaps = new WeakMap<Exercise[], Map<string, Exercise>>();

/** One map per exercises read, shared by every screen, so work keyed on it can be shared too (useHomeData). */
function exerciseMapOf(exercises: Exercise[]): Map<string, Exercise> {
  let map = exerciseMaps.get(exercises);
  if (!map) {
    map = new Map(exercises.map((e) => [e.id, e]));
    exerciseMaps.set(exercises, map);
  }
  return map;
}

export function useAgenda() {
  const today = useToday();
  const range = useMemo(() => ({ from: addDays(today, -AGENDA_PAST_DAYS), to: addDays(today, AGENDA_FUTURE_DAYS) }), [today]);

  const occurrences = useOccurrences(range);
  const sessions = useSessions();
  const plans = usePlans();
  const planVersions = usePlanVersions();
  const exercises = useExercises();
  const records = usePersonalRecords();
  const preferences = usePreferences();

  const queries = [occurrences, sessions, plans, planVersions, exercises, records, preferences];
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;

  const agenda = useMemo<Agenda>(
    () =>
      occurrences.data && sessions.data && plans.data
        ? buildAgenda({ occurrences: occurrences.data, sessions: sessions.data, plans: plans.data, planVersions: planVersions.data, today })
        : new Map(),
    [occurrences.data, sessions.data, plans.data, planVersions.data, today],
  );
  const exercisesById = exerciseMapOf(exercises.data ?? NO_EXERCISES);
  const planStatus = useMemo(() => new Map((plans.data ?? []).map((p) => [p.id, p.status])), [plans.data]);

  return {
    today,
    range,
    agenda,
    /** Each plan that still exists, by id: a deleted plan's workouts can stay on the calendar as history. */
    planStatus,
    exercisesById,
    records: records.data ?? [],
    units: preferences.data?.units ?? 'imperial',
    isLoading,
    error,
    retry: () => queries.forEach((q) => q.refetch()),
  };
}
