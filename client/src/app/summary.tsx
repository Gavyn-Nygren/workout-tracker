import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Confetti, ErrorState, NotFoundState, ScreenSkeleton, ToastViewport } from '@/components/ui';
import { useExercises, usePlans, usePreferences, useSessions, useUpdatePlanWorkout } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { diffAgainstPlan } from '@/features/summary/planDiff';
import { ComparisonCard, ExercisesCard, RecordsCard, SavePlanCard } from '@/features/summary/SummaryCards';
import { SummaryHero } from '@/features/summary/SummaryHero';
import { buildSummary } from '@/features/summary/summarize';
import { useHaptics } from '@/hooks/useHaptics';
import { plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/**
 * Workout summary (roadmap G2.3). Opened right after Finish (`fresh=1`: celebrate PRs and offer to
 * save changes to the plan) or from Today's "View summary" for any past workout.
 */
export default function SummaryScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { session: sessionId, fresh } = useLocalSearchParams<{ session: string; fresh?: string }>();
  const justFinished = fresh === '1';

  const sessions = useSessions();
  const exercises = useExercises();
  const plans = usePlans();
  const preferences = usePreferences().data ?? defaultPreferences;
  const updatePlanWorkout = useUpdatePlanWorkout();

  const exercisesById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const session = sessions.data?.find((s) => s.id === sessionId);
  const plan = plans.data?.find((p) => p.id === session?.planId);
  const workout = plan?.workouts.find((w) => w.id === session?.planWorkoutId);

  const summary = useMemo(
    () => (session && sessions.data ? buildSummary(session, sessions.data, exercisesById) : undefined),
    [session, sessions.data, exercisesById],
  );
  // Only offer plan updates right after finishing, before the plan has changed underneath it.
  const diff = useMemo(
    () => (justFinished && session && workout ? diffAgainstPlan(session, workout, exercisesById) : undefined),
    // The plan changes once the user accepts; keep the original comparison.
    [justFinished, session, exercisesById, workout?.id],
  );

  const celebrate = justFinished && preferences.celebrations && (summary?.records.length ?? 0) > 0;
  useEffect(() => {
    if (celebrate) haptics.success();
  }, [celebrate, haptics]);

  // Confetti and haptics are silent to VoiceOver, so say the result once after a fresh finish.
  // Queued, so it follows the screen's first reading instead of cutting it off.
  const announced = useRef(false);
  useEffect(() => {
    if (!justFinished || !summary || !session || announced.current) return;
    announced.current = true;
    const records = summary.records.length;
    AccessibilityInfo.announceForAccessibilityWithOptions(
      `${session.completion === 'partial' ? 'Partial workout saved.' : 'Workout complete.'}${records ? ` ${plural(records, 'new personal record')}.` : ''}`,
      { queue: true },
    );
  }, [justFinished, summary, session]);

  const failed = [sessions, exercises].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this workout" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (sessions.isLoading || exercises.isLoading) return <ScreenSkeleton hero />;
  if (!session || !summary) return <NotFoundState thing="Workout" icon="dumbbell" backLabel="Close" />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.padded, readable, { paddingBottom: insets.bottom + spacing.huge }]}>
        <SummaryHero session={session} planName={plan?.name} summary={summary} units={preferences.units} />
        {diff && diff.changes.length > 0 && plan && workout && (
          <SavePlanCard
            workoutName={workout.name}
            planName={plan.name}
            changes={diff.changes}
            onSave={() => updatePlanWorkout.mutateAsync({ planId: plan.id, workoutId: workout.id, blocks: diff.blocks })}
          />
        )}
        <RecordsCard summary={summary} units={preferences.units} />
        <ComparisonCard summary={summary} units={preferences.units} name={session.name} />
        <ExercisesCard summary={summary} units={preferences.units} />
        <Button title="Done" fullWidth onPress={() => router.back()} />
      </ScrollView>
      {celebrate && <Confetti />}
      <ToastViewport bottomOffset={spacing.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  padded: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
});
