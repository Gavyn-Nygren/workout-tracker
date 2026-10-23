import { useMemo } from 'react';

import { addDays, startOfWeek } from '@/data/dates';
import { useBadges, useBodyweight, useFormReports, useGoals, usePersonalRecords, useSessions, useStreak } from '@/data/hooks';
import { useAgenda } from '../today/useAgenda';
import { nextBadges } from './badges';
import { goalProgress } from './goals';
import { buildWins } from './wins';

/** Everything Home shows, computed once and shared with the badge sheet. */
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

  const week = useMemo(() => {
    const monday = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return { date, items: agenda.get(date) ?? [] };
    });
  }, [agenda, today]);

  const goalsWithProgress = useMemo(
    () =>
      (goals.data ?? []).map((goal) => ({
        goal,
        progress: goalProgress(goal, {
          sessions: sessions.data ?? [],
          exercisesById,
          bodyweight: bodyweight.data ?? [],
          formReports: formReports.data ?? [],
          streak: streak.data,
          today,
        }),
      })),
    [goals.data, sessions.data, exercisesById, bodyweight.data, formReports.data, streak.data, today],
  );

  const wins = useMemo(
    () => buildWins({ records: records.data ?? [], formReports: formReports.data ?? [], badges: badges.data ?? [], exercisesById, units, today }),
    [records.data, formReports.data, badges.data, exercisesById, units, today],
  );

  const earned = useMemo(() => [...(badges.data ?? [])].sort((a, b) => b.earnedDate.localeCompare(a.earnedDate)), [badges.data]);
  const upcoming = useMemo(
    () => nextBadges({ earned, sessions: sessions.data ?? [], exercisesById, streak: streak.data, formReports: formReports.data ?? [], limit: 8 }),
    [earned, sessions.data, exercisesById, streak.data, formReports.data],
  );

  return {
    isLoading,
    error,
    retry,
    today,
    units,
    exercisesById,
    streak: streak.data,
    week,
    goals: goalsWithProgress,
    wins,
    earned,
    upcoming,
    latestBodyweightKg: [...(bodyweight.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weightKg,
    formReports: formReports.data ?? [],
  };
}
