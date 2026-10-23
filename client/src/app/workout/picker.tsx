import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, EmptyState, ListRow, SectionHeader, TextField } from '@/components/ui';
import type { Exercise, MuscleGroup } from '@/data/types';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const MUSCLE_FILTERS: { value: MuscleGroup; label: string }[] = [
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'calves', label: 'Calves' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'lats', label: 'Lats' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'core', label: 'Core' },
];

const EQUIPMENT_ICON = {
  barbell: 'figure.strengthtraining.traditional',
  dumbbell: 'dumbbell',
  kettlebell: 'dumbbell',
  machine: 'gearshape',
  cable: 'cable.connector',
  band: 'circle.dashed',
  bodyweight: 'figure.core.training',
  other: 'square.grid.2x2',
} as const;

function matches(exercise: Exercise, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [exercise.name, ...(exercise.aliases ?? [])].some((n) => n.toLowerCase().includes(q));
}

/** Add an exercise, or swap one: swaps suggest the same base movement or muscles first. */
export default function ExercisePickerSheet() {
  const { colors } = useAppTheme();
  const { mode, entry: entryId } = useLocalSearchParams<{ mode: 'add' | 'swap'; entry?: string }>();
  const { workout, exercisesById, dispatch } = useActiveWorkout();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  const swapping = mode === 'swap' ? workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === entryId) : undefined;
  const current = swapping ? exercisesById.get(swapping.exerciseId) : undefined;

  const all = useMemo(() => [...exercisesById.values()].sort((a, b) => a.name.localeCompare(b.name)), [exercisesById]);
  const filtered = all.filter((e) => e.id !== current?.id && matches(e, query) && (!muscle || e.primaryMuscles.includes(muscle)));

  const suggested = current
    ? filtered.filter(
        (e) =>
          (current.baseMovementId && (e.id === current.baseMovementId || e.baseMovementId === current.baseMovementId)) ||
          e.baseMovementId === current.id ||
          (current.formAnalysis && e.formAnalysis === current.formAnalysis) ||
          e.primaryMuscles.some((m) => current.primaryMuscles.includes(m)),
      )
    : [];
  const rest = filtered.filter((e) => !suggested.includes(e));

  const choose = (exercise: Exercise) => {
    if (swapping) dispatch({ type: 'swapExercise', entryId: swapping.id, exerciseId: exercise.id });
    else dispatch({ type: 'addExercise', exerciseId: exercise.id });
    router.back();
  };

  const renderList = (title: string, list: Exercise[]) =>
    list.length > 0 && (
      <View style={styles.group}>
        <SectionHeader title={title} />
        <Card padding="none">
          {list.map((exercise, i) => (
            <ListRow
              key={exercise.id}
              title={exercise.name}
              subtitle={[exercise.equipment, exercise.primaryMuscles.join(', '), exercise.formAnalysis ? 'form analysis' : undefined].filter(Boolean).join(' · ')}
              icon={EQUIPMENT_ICON[exercise.equipment ?? 'other']}
              onPress={() => choose(exercise)}
              separator={i < list.length - 1}
            />
          ))}
        </Card>
      </View>
    );

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
      <TextField label="Search" value={query} onChangeText={setQuery} placeholder="Exercise name" autoCorrect={false} clearButtonMode="while-editing" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {MUSCLE_FILTERS.map((m) => (
          <Chip key={m.value} label={m.label} selected={muscle === m.value} onPress={() => setMuscle(muscle === m.value ? null : m.value)} />
        ))}
      </ScrollView>

      {renderList('Suggested swaps', suggested)}
      {renderList(swapping ? 'All exercises' : 'Exercises', rest)}
      {!suggested.length && !rest.length && (
        <EmptyState icon="magnifyingglass" title="No matches" message="Try another name or muscle. Custom exercises arrive with the Plans screens (G2.4)." />
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
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  chips: {
    gap: spacing.sm,
  },
  group: {
    gap: spacing.sm,
  },
});
