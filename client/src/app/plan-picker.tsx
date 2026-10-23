import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useExercises, usePlans, useSavePlan } from '@/data/hooks';
import type { Exercise } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { addExercise, swapExercise } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Adds an exercise to a plan workout, or swaps one, then returns to the workout editor. */
export default function PlanExercisePicker() {
  const { colors } = useAppTheme();
  const { plan: planId, workout: workoutId, mode, pe } = useLocalSearchParams<{ plan: string; workout: string; mode: 'add' | 'swap'; pe?: string }>();
  const { data: plans } = usePlans();
  const { data: exercises } = useExercises();
  const savePlan = useSavePlan();

  const plan = plans?.find((p) => p.id === planId);
  const workout = plan?.workouts.find((w) => w.id === workoutId);
  const planned = workout?.blocks.flatMap((b) => b.exercises).find((e) => e.id === pe);
  const current = planned ? exercises?.find((e) => e.id === planned.exerciseId) : undefined;

  const choose = async (exercise: Exercise) => {
    if (!plan || !workout) return;
    const next = mode === 'swap' && planned ? swapExercise(plan, workout.id, planned.id, exercise.id) : addExercise(plan, workout.id, exercise.id, exercise.category);
    await savePlan.mutateAsync(next);
    router.back();
  };

  return (
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.header}>
        <AppText variant="title2">{mode === 'swap' ? `Swap ${current?.name ?? 'exercise'}` : `Add to ${workout?.name ?? 'workout'}`}</AppText>
        <AppText variant="subhead" tone="secondary">
          {mode === 'swap' ? 'Keeps the sets, reps, and progression.' : 'Starts with 3 × 8–12; adjust it after.'}
        </AppText>
      </View>
      <ExerciseList exercises={exercises ?? []} onPick={choose} similarTo={mode === 'swap' ? current : undefined} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
