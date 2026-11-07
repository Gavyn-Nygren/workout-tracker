import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Confetti, ErrorState, NotFoundState, ScreenSkeleton, ToastViewport, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { succeeded, useDeleteSession, useExercises, useGoals, useOccurrences, usePlans, usePlanVersions, usePreferences, useSessions, useUpdatePlanWorkout } from '@/data/hooks';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { defaultPreferences } from '@/data/preferences';
import { beforeReopens } from '@/data/reopen';
import { planPromptFor, type PlanPrompt } from '@/features/summary/planDiff';
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
  // A reopened workout shows and counts as it was before the reopen, until it's finished again.
  const allSessions = sessions.data && beforeReopens(sessions.data);
  const session = allSessions?.find((s) => s.id === sessionId);
  const plan = plans.data?.find((p) => p.id === session?.planId);
  // The plan version a scheduled workout was built from is its occurrence's.
  const scheduledDay = session?.scheduledDate ?? today;
  const occurrences = useOccurrences({ from: scheduledDay, to: scheduledDay });
  const planVersions = usePlanVersions();

  const summary = useMemo(
    () => (session && allSessions ? buildSummary(session, allSessions, exercisesById) : undefined),
    [session, allSessions, exercisesById],
  );
  // Only offer plan updates right after finishing a new workout. Worked out once, when everything
  // it reads is loaded and fresh: accepting changes the plan, and the card should stay as it was.
  const [prompt, setPrompt] = useState<PlanPrompt | null>();
  const promptReady = [plans, planVersions, occurrences, exercises].every((q) => q.data && !q.isFetching);
  if (prompt === undefined && fresh && session && promptReady && plans.data && planVersions.data && occurrences.data) {
    setPrompt(planPromptFor(session, { plans: plans.data, planVersions: planVersions.data, occurrences: occurrences.data }, exercisesById) ?? null);
  }

  // A reopened workout already celebrated its records the first time, so only new ones count.
  const newRecordCount = reopened ? Number(params.newRecords ?? 0) || 0 : (fresh ? (summary?.records.length ?? 0) : 0);
  const newRecords = newRecordCount > 0;
  // Goals this workout reached; after a reopen, only those its edits reached.
  const reachedGoals = useMemo(() => {
    if (!session || !allSessions || !goals.data) return [];
    const reached = goalsReachedByWorkout(goals.data, session.id, allSessions, exercisesById, today);
    if (!reopened) return reached;
    const added = new Set((params.newGoals ?? '').split(',').filter(Boolean));
    return reached.filter((g) => added.has(g.id));
  }, [session, allSessions, goals.data, exercisesById, today, reopened, params.newGoals]);
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
        {prompt && (
          <SavePlanCard
            workoutName={prompt.workout.name}
            planName={prompt.plan.name}
            changes={prompt.changes}
            onSave={() => updatePlanWorkout.mutateAsync({ planId: prompt.plan.id, workoutId: prompt.workout.id, blocks: prompt.blocks })}
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
