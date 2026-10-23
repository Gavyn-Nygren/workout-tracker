import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ListRow, useToast } from '@/components/ui';
import { useExercises } from '@/data/hooks';
import type { Exercise } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { addGraph } from '@/features/progress/progressPrefs';
import { METRICS, type Metric } from '@/features/progress/series';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Custom graph builder (spec 2.10): pick an exercise, then a metric. */
export default function GraphBuilderSheet() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const { data: exercises } = useExercises();
  const [exercise, setExercise] = useState<Exercise | undefined>();
  const [metric, setMetric] = useState<Metric>('e1rm');

  return (
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title2">New graph</AppText>
      {exercise ? (
        <View style={styles.stack}>
          <Card padding="none">
            <ListRow title={exercise.name} subtitle="Exercise" icon="dumbbell" trailing={<Button title="Change" variant="ghost" size="sm" onPress={() => setExercise(undefined)} />} separator={false} />
          </Card>
          <AppText variant="headline">What should it show?</AppText>
          <View style={styles.wrap}>
            {METRICS.map((m) => (
              <Chip key={m.value} label={m.label} selected={metric === m.value} onPress={() => setMetric(m.value)} />
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
          <ExerciseList exercises={exercises ?? []} onPick={setExercise} />
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
