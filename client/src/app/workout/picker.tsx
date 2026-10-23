import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
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

  const swapping = mode === 'swap' ? workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === entryId) : undefined;
  const current = swapping ? exercisesById.get(swapping.exerciseId) : undefined;

  const choose = (exercise: Exercise) => {
    if (swapping) dispatch({ type: 'swapExercise', entryId: swapping.id, exerciseId: exercise.id });
    else dispatch({ type: 'addExercise', exerciseId: exercise.id });
    router.back();
  };

  return (
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.header}>
        <AppText variant="title2">{swapping ? `Swap ${current?.name ?? 'exercise'}` : 'Add exercise'}</AppText>
        {swapping && (
          <AppText variant="subhead" tone="secondary">
            Keeps the same sets and reps; weights are cleared.
          </AppText>
        )}
      </View>
      <ExerciseList exercises={[...exercisesById.values()]} onPick={choose} similarTo={current} />
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
