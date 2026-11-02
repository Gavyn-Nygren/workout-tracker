import { useMemo } from 'react';

import { useToday } from '@/data/DataProvider';
import { addDays } from '@/data/dates';
import { useExercises, useFormReports, useGoals, useOccurrences, usePersonalRecords, usePlans, usePlanVersions, usePreferences, useSessions, useStreak } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { Exercise, ISODate } from '@/data/types';
import { latestSummaryWeek } from '@/features/notifications/summaryTiming';
import { buildWeeklySummary, summaryWeekStart } from './weeklySummary';

const NO_EXERCISES: Exercise[] = [];

/** "HH:MM" of a moment, local time. */
function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * "Your week" (G3.12), computed live from the same reads as Home, so it's never stale. `week` is
 * the screen's `?week=` (any day of the week; a week saved under the other week-start setting
 * moves to the one sharing most days). Without it, the week the latest weekly summary covered.
 */
export function useWeeklySummary(week?: string) {
  const today = useToday();
  const preferences = usePreferences();
  const prefs = preferences.data ?? defaultPreferences;
  const { weekStartsOn, units } = prefs;
  const { weeklySummaryAt, quietHours } = prefs.notifications;

  const weekStart: ISODate = useMemo(
    () => summaryWeekStart(week, weekStartsOn) ?? latestSummaryWeek({ nowMs: Date.now(), at: weeklySummaryAt, quietHours, weekStartsOn }),
    // `today` so the latest week moves on at midnight.
    [week, weekStartsOn, weeklySummaryAt, quietHours, today],
  );
  const range = useMemo(() => ({ from: weekStart, to: addDays(weekStart, 6) }), [weekStart]);

  const sessions = useSessions();
  const exercises = useExercises();
  const records = usePersonalRecords();
  const streak = useStreak();
  const occurrences = useOccurrences(range);
  const plans = usePlans();
  const planVersions = usePlanVersions();
  const formReports = useFormReports();
  const goals = useGoals();

  const queries = [preferences, sessions, exercises, records, streak, occurrences, plans, planVersions, formReports, goals];
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;

  const exercisesById = useMemo(() => new Map((exercises.data ?? NO_EXERCISES).map((e) => [e.id, e])), [exercises.data]);

  const summary = useMemo(() => {
    if (!sessions.data || !records.data || !streak.data || !occurrences.data || !plans.data || !planVersions.data || !formReports.data || !goals.data) return undefined;
    return buildWeeklySummary({
      weekStart,
      weekStartsOn,
      asOf: { date: today, time: clock(Date.now()) },
      sessions: sessions.data,
      exercisesById,
      records: records.data,
      streak: streak.data,
      occurrences: occurrences.data,
      plans: plans.data,
      planVersions: planVersions.data,
      formReports: formReports.data,
      goals: goals.data,
    });
  }, [weekStart, weekStartsOn, today, sessions.data, exercisesById, records.data, streak.data, occurrences.data, plans.data, planVersions.data, formReports.data, goals.data]);

  return {
    summary,
    weekStart,
    today,
    units,
    exercisesById,
    isLoading,
    error,
    retry: () => queries.forEach((q) => q.error && q.refetch()),
  };
}
