import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, NotFoundState, Skeleton } from '@/components/ui';
import { useExercises } from '@/data/hooks';
import type { Exercise } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Add an exercise to the active workout, or swap one (swaps suggest similar exercises first). */
export default function WorkoutExercisePicker() {
  const { colors } = useAppTheme();
  const { mode, entry: entryId } = useLocalSearchParams<{ mode: 'add' | 'swap'; entry?: string }>();
  const { workout, exercisesById, dispatch } = useActiveWorkout();
  // Same query the active workout reads its exercises from; here for its loading and error state.
  const exercises = useExercises();

  const swapping = mode === 'swap' ? workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === entryId) : undefined;
  const current = swapping ? exercisesById.get(swapping.exerciseId) : undefined;

  // The exercise to swap is gone: don't fall through to adding a new one.
  if (mode === 'swap' && !swapping) return <NotFoundState thing="Exercise" icon="dumbbell" backLabel="Close" />;

  const choose = (exercise: Exercise) => {
    if (swapping) dispatch({ type: 'swapExercise', entryId: swapping.id, exerciseId: exercise.id });
    else dispatch({ type: 'addExercise', exerciseId: exercise.id });
    router.back();
  };

  return (
    // The page background, not the sheet surface, so the list's cards stand up off it (iOS grouped style).
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      onAccessibilityEscape={() => router.back()}
    >
      <View style={styles.header}>
        {swapping && exercises.isPending ? (
          <Skeleton width="60%" height={28} />
        ) : (
          <AppText variant="title2" accessibilityRole="header">
            {swapping ? `Swap ${current?.name ?? 'exercise'}` : 'Add exercise'}
          </AppText>
        )}
        {swapping && (
          <AppText variant="subhead" tone="secondary">
            Keeps the same sets and reps; weights are cleared.
          </AppText>
        )}
      </View>
      <ExerciseList
        exercises={exercises.data ?? []}
        onPick={choose}
        similarTo={current}
        loading={exercises.isPending}
        error={!!exercises.error}
        onRetry={() => exercises.refetch()}
      />
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
