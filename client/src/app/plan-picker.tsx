import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, ErrorState, NotFoundState, Skeleton, ToastViewport } from '@/components/ui';
import { succeeded, useExercises, usePlan, useSavePlan } from '@/data/hooks';
import type { Exercise } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { addExercise, swapExercise } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Adds an exercise to a plan workout, or swaps one, then returns to the workout editor. */
export default function PlanExercisePicker() {
  const { colors } = useAppTheme();
  const { plan: planId, workout: workoutId, mode, pe } = useLocalSearchParams<{ plan: string; workout: string; mode: 'add' | 'swap'; pe?: string }>();
  const planQuery = usePlan(planId);
  const exercises = useExercises();
  const savePlan = useSavePlan();

  const plan = planQuery.data;
  const workout = plan?.workouts.find((w) => w.id === workoutId);
  const planned = workout?.blocks.flatMap((b) => b.exercises).find((e) => e.id === pe);
  const current = planned ? exercises.data?.find((e) => e.id === planned.exerciseId) : undefined;
  const loading = planQuery.isPending || exercises.isPending;

  if (planQuery.error) {
    return (
      <ErrorState
        fill
        title="Couldn't load this workout"
        onRetry={() => {
          planQuery.refetch();
          if (exercises.error) exercises.refetch();
        }}
      />
    );
  }
  // Something that should exist is gone: never add to the wrong workout, or add when asked to swap.
  if (!planQuery.isPending && !workout) return <NotFoundState thing="Workout" icon="dumbbell" backLabel="Close" />;
  if (workout && mode === 'swap' && !planned) return <NotFoundState thing="Exercise" icon="dumbbell" backLabel="Close" />;

  const choose = async (exercise: Exercise) => {
    // A second tap while the first saves would add the exercise twice.
    if (!plan || !workout || savePlan.isPending) return;
    const next = mode === 'swap' && planned ? swapExercise(plan, workout.id, planned.id, exercise.id) : addExercise(plan, workout.id, exercise.id, exercise.category);
    if (!(await succeeded(savePlan.mutateAsync(next)))) return;
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.cardElevated }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.header}>
          {loading ? (
            <Skeleton width="60%" height={28} />
          ) : (
            <AppText variant="title2">{mode === 'swap' ? `Swap ${current?.name ?? 'exercise'}` : `Add to ${workout?.name ?? 'workout'}`}</AppText>
          )}
          <AppText variant="subhead" tone="secondary">
            {mode === 'swap' ? 'Keeps the sets, reps, and progression.' : 'Starts with 3 × 8–12; adjust it after.'}
          </AppText>
        </View>
        <ExerciseList
          exercises={exercises.data ?? []}
          onPick={choose}
          similarTo={mode === 'swap' ? current : undefined}
          loading={loading}
          error={!!exercises.error}
          onRetry={() => exercises.refetch()}
        />
      </ScrollView>
      <ToastViewport bottomOffset={spacing.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
