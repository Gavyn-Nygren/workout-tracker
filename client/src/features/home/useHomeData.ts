import { useMemo } from 'react';

import { useBadges, useBodyweight, useFormReports, useGoals, usePersonalRecords, usePreferences, useSessions, useStreak } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { beforeReopens } from '@/data/reopen';
import type { BodyweightEntry, FormReport, Goal, WorkoutSession } from '@/data/types';
import { weekDates } from '@/lib/format';
import { useAgenda } from '../today/useAgenda';
import { homeGoals, type GoalInput } from './goals';
import { buildWins } from './wins';

// Stand-ins while a read loads, the same every time so the shared goal split below can match them.
const NO_GOALS: Goal[] = [];
const NO_SESSIONS: WorkoutSession[] = [];
const NO_WEIGH_INS: BodyweightEntry[] = [];
const NO_REPORTS: FormReport[] = [];

/**
 * Every goal's status, worked out once for all the screens showing Home's data at the same time
 * (Home stays mounted under the goal sheets): the last result is kept while every read it came
 * from is the same.
 */
let lastGoals: { key: unknown[]; value: ReturnType<typeof homeGoals> } | undefined;
function sharedHomeGoals(goals: Goal[], input: GoalInput): ReturnType<typeof homeGoals> {
  const key = [goals, input.sessions, input.exercisesById, input.bodyweight, input.formReports, input.streak, input.today, input.weekStartsOn];
  if (lastGoals && lastGoals.key.every((part, i) => part === key[i])) return lastGoals.value;
  const value = homeGoals(goals, input);
  lastGoals = { key, value };
  return value;
}

/** Everything Home shows, computed once and shared with the goal sheets. */
export function useHomeData() {
  const { today, agenda, exercisesById, units, isLoading: agendaLoading, error: agendaError, retry: agendaRetry } = useAgenda();
  const streak = useStreak();
  const goals = useGoals();
  const badges = useBadges();
  const records = usePersonalRecords();
  const formReports = useFormReports();
  const bodyweight = useBodyweight();
  const sessions = useSessions();

  const queries = [streak, goals, badges, records, formReports, bodyweight, sessions];
  const isLoading = agendaLoading || queries.some((q) => q.isLoading);
  const error = agendaError ?? queries.find((q) => q.error)?.error ?? null;
  const retry = () => {
    agendaRetry();
    queries.forEach((q) => q.error && q.refetch());
  };

  // The same week the streak counts (both follow the week-start setting).
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? defaultPreferences.weekStartsOn;
  const week = useMemo(() => weekDates(today, weekStartsOn).map((date) => ({ date, items: agenda.get(date) ?? [] })), [agenda, today, weekStartsOn]);

  /**
   * What goal progress is measured from; also what "Goal reached" celebrations check (goalsReachedBy*).
   * A reopened workout counts as it was before the reopen (reopen.ts).
   */
  const goalInput = useMemo<GoalInput>(
    () => ({
      sessions: beforeReopens(sessions.data ?? NO_SESSIONS),
      exercisesById,
      bodyweight: bodyweight.data ?? NO_WEIGH_INS,
      formReports: formReports.data ?? NO_REPORTS,
      streak: streak.data,
      today,
      weekStartsOn,
    }),
    [sessions.data, exercisesById, bodyweight.data, formReports.data, streak.data, today, weekStartsOn],
  );

  // A reached goal stays on Home for 7 days, then moves to Completed goals.
  const goalLists = useMemo(() => sharedHomeGoals(goals.data ?? NO_GOALS, goalInput), [goals.data, goalInput]);

  const wins = useMemo(
    () =>
      buildWins({
        records: records.data ?? [],
        streakRecords: streak.data?.records,
        formReports: formReports.data ?? NO_REPORTS,
        badges: badges.data?.earned ?? [],
        goals: goalLists.all,
        exercisesById,
        units,
        today,
      }),
    [records.data, streak.data, formReports.data, badges.data, goalLists, exercisesById, units, today],
  );

  const earned = useMemo(() => [...(badges.data?.earned ?? [])].sort((a, b) => b.earnedDate.localeCompare(a.earnedDate)), [badges.data]);

  return {
    isLoading,
    error,
    retry,
    today,
    units,
    exercisesById,
    streak: streak.data,
    week,
    /** Goals on Home: in progress, or reached in the last 7 days. */
    goals: goalLists.active,
    /** Goals reached 7 or more days ago, newest first. */
    completedGoals: goalLists.completed,
    goalInput,
    wins,
    earned,
    /** Next up candidates, nearest to done first (Home shows the first 3). */
    upcoming: badges.data?.nextUp ?? [],
    /** Every badge not earned yet, with progress. */
    unearned: badges.data?.progress ?? [],
    latestBodyweightKg: [...(bodyweight.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weightKg,
    formReports: formReports.data ?? [],
  };
}
