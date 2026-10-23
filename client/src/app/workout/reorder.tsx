import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState } from '@/components/ui';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { ReorderList, type ReorderItem } from '@/features/workout/ReorderList';
import { plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Reorder the workout's blocks. Supersets and circuits move as one unit. */
export default function ReorderSheet() {
  const { colors } = useAppTheme();
  const { workout, exercisesById, dispatch } = useActiveWorkout();

  const items: ReorderItem[] = (workout?.session.blocks ?? []).map((block) => {
    const names = block.exercises.map((e) => exercisesById.get(e.exerciseId)?.name ?? 'Exercise');
    const sets = block.exercises.reduce((n, e) => n + e.sets.length, 0);
    const grouped = block.type === 'superset' || block.type === 'circuit';
    return {
      id: block.id,
      title: grouped ? `${block.type === 'superset' ? 'Superset' : 'Circuit'}: ${names.join(' + ')}` : names[0],
      subtitle: plural(sets, 'set'),
    };
  });

  const onMove = useCallback((from: number, to: number) => dispatch({ type: 'moveBlock', from, to }), [dispatch]);
  const [dragging, setDragging] = useState(false);

  return (
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.content} scrollEnabled={!dragging}>
      <View style={styles.header}>
        <AppText variant="title2">Reorder exercises</AppText>
        <AppText variant="subhead" tone="secondary">
          Drag the handle. Supersets move together.
        </AppText>
      </View>
      {items.length ? (
        <ReorderList items={items} onMove={onMove} onDraggingChange={setDragging} />
      ) : (
        <EmptyState icon="arrow.up.arrow.down" title="Nothing to reorder yet" message="Exercises you add to this workout show up here to drag into order." />
      )}
      <Button title="Done" fullWidth onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
});
