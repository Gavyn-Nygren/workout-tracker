import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Confetti, ErrorState, NotFoundState, ScreenSkeleton, ToastViewport, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { succeeded, useDeleteSession, useExercises, useGoals, usePlans, usePreferences, useSessions, useUpdatePlanWorkout } from '@/data/hooks';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { defaultPreferences } from '@/data/preferences';
import { diffAgainstPlan } from '@/features/summary/planDiff';
import { goalReachedMessage, goalsReachedByWorkout } from '@/features/summary/goalsReached';
import { ComparisonCard, ExercisesCard, GoalsReachedCard, RecordsCard, SavePlanCard } from '@/features/summary/SummaryCards';
import { SummaryHero } from '@/features/summary/SummaryHero';
import { buildSummary } from '@/features/summary/summarize';
import { useHaptics } from '@/hooks/useHaptics';
import { plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/**
 * Workout summary (roadmap G2.3). Opened right after Finish, from Today's "View summary", or from
 * history. After finishing a new workout (`fresh=1`) it celebrates PRs and offers to save changes
 * to the plan. After finishing a reopened one (`reopened=1`) it celebrates only if the edits set new
 * records (`newRecords` = how many, G3.6) or reached goals (`newGoals` = their ids, comma-separated,
 * G3.10), and never offers plan changes.
 */
export default function SummaryScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const active = useActiveWorkout();
  const deleteSession = useDeleteSession();
  const haptics = useHaptics();
  const params = useLocalSearchParams<{ session: string; fresh?: string; reopened?: string; newRecords?: string; newGoals?: string }>();
  const sessionId = params.session;
  const reopened = params.reopened === '1';
  const fresh = params.fresh === '1' && !reopened;
  const justFinished = fresh || reopened;

  const sessions = useSessions();
  const exercises = useExercises();
  const plans = usePlans();
  const goals = useGoals();
  const today = useToday();
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
  // Only offer plan updates right after finishing a new workout, before the plan has changed underneath it.
  const diff = useMemo(
    () => (fresh && session && workout ? diffAgainstPlan(session, workout, exercisesById) : undefined),
    // The plan changes once the user accepts; keep the original comparison.
    [fresh, session, exercisesById, workout?.id],
  );

  // A reopened workout already celebrated its records the first time, so only new ones count.
  const newRecordCount = reopened ? Number(params.newRecords ?? 0) || 0 : (fresh ? (summary?.records.length ?? 0) : 0);
  const newRecords = newRecordCount > 0;
  // Goals this workout reached; after a reopen, only those its edits reached.
  const reachedGoals = useMemo(() => {
    if (!session || !sessions.data || !goals.data) return [];
    const reached = goalsReachedByWorkout(goals.data, session.id, sessions.data, exercisesById, today);
    if (!reopened) return reached;
    const added = new Set((params.newGoals ?? '').split(',').filter(Boolean));
    return reached.filter((g) => added.has(g.id));
  }, [session, sessions.data, goals.data, exercisesById, today, reopened, params.newGoals]);
  const newGoals = justFinished && reachedGoals.length > 0;
  const celebrate = (newRecords || newGoals) && preferences.celebrations;
  useEffect(() => {
    if (celebrate) haptics.success();
  }, [celebrate, haptics]);

  // Confetti and haptics are silent to VoiceOver, so say the result once after finishing.
  // Queued, so it follows the screen's first reading instead of cutting it off.
  const announced = useRef(false);
  // Waits for goals so it can say which were reached.
  const goalsLoading = goals.isLoading;
  useEffect(() => {
    if (!justFinished || !summary || !session || goalsLoading || announced.current) return;
    announced.current = true;
    const saved = reopened ? 'Changes saved.' : session.completion === 'partial' ? 'Partial workout saved.' : 'Workout complete.';
    // After a reopen, only the records the edits added are new.
    const records = newRecords ? ` ${plural(newRecordCount, 'new personal record')}.` : '';
    const reached = reachedGoals.length ? ` ${goalReachedMessage(reachedGoals)}` : '';
    AccessibilityInfo.announceForAccessibilityWithOptions(`${saved}${records}${reached}`, { queue: true });
  }, [justFinished, reopened, newRecords, newRecordCount, summary, session, goalsLoading, reachedGoals]);

  const failed = [sessions, exercises].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this workout" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (sessions.isLoading || exercises.isLoading) return <ScreenSkeleton hero />;
  if (!session || !summary) return <NotFoundState thing="Workout" icon="dumbbell" backLabel="Close" />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.padded, readable, { paddingBottom: insets.bottom + spacing.huge }]}>
        <SummaryHero
          session={session}
          planName={plan?.name}
          summary={summary}
          units={preferences.units}
          onMenu={() =>
            ActionSheetIOS.showActionSheetWithOptions(
              { title: session.name, options: ['Delete workout', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme },
              (choice) => {
                if (choice !== 0) return;
                if (active.workout?.session.id === session.id) {
                  Alert.alert('This workout is open', 'Finish or discard it first, then delete it.');
                  return;
                }
                Alert.alert(`Delete ${session.name}?`, 'Its sets, personal records, and form recordings are removed, and your stats recalculate. This can\u2019t be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      // Close first, so the summary doesn't flash "not found" as the workout disappears.
                      router.back();
                      if (await succeeded(deleteSession.mutateAsync(session.id))) toast.show({ message: 'Workout deleted.' });
                    },
                  },
                ]);
              },
            )
          }
        />
        {diff && diff.changes.length > 0 && plan && workout && (
          <SavePlanCard
            workoutName={workout.name}
            planName={plan.name}
            changes={diff.changes}
            onSave={() => updatePlanWorkout.mutateAsync({ planId: plan.id, workoutId: workout.id, blocks: diff.blocks })}
          />
        )}
        <GoalsReachedCard goals={reachedGoals} date={session.completedDate} />
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
