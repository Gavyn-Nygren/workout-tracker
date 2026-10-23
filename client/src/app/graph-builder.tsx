import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ListRow, useToast } from '@/components/ui';
import { useExercises } from '@/data/hooks';
import type { Exercise } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { addGraph } from '@/features/progress/progressPrefs';
import { METRICS, type Metric } from '@/features/progress/series';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Custom graph builder (spec 2.10): pick an exercise, then a metric. */
export default function GraphBuilderSheet() {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const exercises = useExercises();
  const [exercise, setExercise] = useState<Exercise | undefined>();
  const [metric, setMetric] = useState<Metric>('e1rm');

  return (
    // The page background, not the sheet color, so the cards stand out (iOS grouped style).
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title2" accessibilityRole="header">
        New graph
      </AppText>
      {exercise ? (
        <View style={styles.stack}>
          <View style={styles.picked}>
            <Card padding="none">
              <ListRow
                title={exercise.name}
                subtitle="Exercise"
                icon="dumbbell"
                // Large text: the button moves under the card so the name keeps the row's width.
                trailing={large ? undefined : <Button title="Change" variant="ghost" size="sm" accessibilityLabel="Change exercise" onPress={() => setExercise(undefined)} />}
                separator={false}
              />
            </Card>
            {large && <Button title="Change exercise" variant="ghost" size="sm" onPress={() => setExercise(undefined)} />}
          </View>
          <AppText variant="headline">What should it show?</AppText>
          <View style={styles.wrap}>
            {METRICS.map((m) => (
              <Chip key={m.value} label={m.label} role="radio" selected={metric === m.value} onPress={() => setMetric(m.value)} />
            ))}
          </View>
          <Button
            title="Add graph"
            icon="plus"
            fullWidth
            onPress={() => {
              const graph = addGraph(exercise.id, metric);
              router.back();
              router.push({ pathname: '/progress/graph', params: { graph: graph.id } });
              toast.show({ message: 'Added to Your graphs.', tone: 'success' });
            }}
          />
        </View>
      ) : (
        <>
          <AppText variant="subhead" tone="secondary">
            Pick an exercise first.
          </AppText>
          <ExerciseList exercises={exercises.data ?? []} onPick={setExercise} loading={exercises.isPending} error={!!exercises.error} onRetry={() => exercises.refetch()} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  stack: {
    gap: spacing.lg,
  },
  picked: {
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
