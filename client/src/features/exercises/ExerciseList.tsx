import type { SFSymbol } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, Chip, EmptyState, ListRow, SectionHeader, TextField } from '@/components/ui';
import type { Equipment, Exercise, MuscleGroup } from '@/data/types';
import { spacing } from '@/theme/tokens';

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
  chest: 'Chest',
  back: 'Back',
  lats: 'Lats',
  traps: 'Traps',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
};

const FILTERS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'core'];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  kettlebell: 'Kettlebell',
  band: 'Band',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

export const EQUIPMENT_ICON: Record<Equipment, SFSymbol> = {
  barbell: 'figure.strengthtraining.traditional',
  dumbbell: 'dumbbell',
  kettlebell: 'dumbbell',
  machine: 'gearshape',
  cable: 'cable.connector',
  band: 'circle.dashed',
  bodyweight: 'figure.core.training',
  other: 'square.grid.2x2',
};

export function exerciseSubtitle(exercise: Exercise): string {
  return [
    exercise.equipment && EQUIPMENT_LABEL[exercise.equipment],
    exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', '),
    exercise.formAnalysis ? 'Form analysis' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function matches(exercise: Exercise, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [exercise.name, ...(exercise.aliases ?? [])].some((n) => n.toLowerCase().includes(q));
}

/** Exercises that make sensible swaps: same base movement or form family, or shared primary muscles. */
export function isSimilar(candidate: Exercise, to: Exercise): boolean {
  return (
    (to.baseMovementId !== undefined && (candidate.id === to.baseMovementId || candidate.baseMovementId === to.baseMovementId)) ||
    candidate.baseMovementId === to.id ||
    (to.formAnalysis !== undefined && candidate.formAnalysis === to.formAnalysis) ||
    candidate.primaryMuscles.some((m) => to.primaryMuscles.includes(m))
  );
}

type Props = {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  /** Swap mode: suggest exercises similar to this one first, and hide it. */
  similarTo?: Exercise;
  /** Library mode groups your custom exercises first. */
  groupCustom?: boolean;
  /** Shown under the search field, e.g. a "New exercise" button. */
  accessory?: ReactNode;
};

/** Search, muscle filters, and a tappable list. Shared by the workout picker, plan editor, and library. */
export function ExerciseList({ exercises, onPick, similarTo, groupCustom, accessory }: Props) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  const sorted = useMemo(() => [...exercises].sort((a, b) => a.name.localeCompare(b.name)), [exercises]);
  const filtered = sorted.filter((e) => e.id !== similarTo?.id && matches(e, query) && (!muscle || e.primaryMuscles.includes(muscle)));

  const groups: [string, Exercise[]][] = [];
  if (similarTo) {
    const similar = filtered.filter((e) => isSimilar(e, similarTo));
    groups.push(['Suggested swaps', similar], ['All exercises', filtered.filter((e) => !similar.includes(e))]);
  } else if (groupCustom) {
    groups.push(['My exercises', filtered.filter((e) => e.source === 'custom')], ['Library', filtered.filter((e) => e.source === 'builtin')]);
  } else {
    groups.push(['Exercises', filtered]);
  }

  return (
    <View style={styles.wrap}>
      <TextField label="Search" value={query} onChangeText={setQuery} placeholder="Exercise name" autoCorrect={false} clearButtonMode="while-editing" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {FILTERS.map((m) => (
          <Chip key={m} label={MUSCLE_LABEL[m]} selected={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
      </ScrollView>
      {accessory}
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([title, list]) => (
          <View key={title} style={styles.group}>
            <SectionHeader title={`${title} · ${list.length}`} />
            <Card padding="none">
              {list.map((exercise, i) => (
                <ListRow
                  key={exercise.id}
                  title={exercise.name}
                  subtitle={exerciseSubtitle(exercise)}
                  icon={EQUIPMENT_ICON[exercise.equipment ?? 'other']}
                  onPress={() => onPick(exercise)}
                  separator={i < list.length - 1}
                />
              ))}
            </Card>
          </View>
        ))}
      {!filtered.length && <EmptyState icon="magnifyingglass" title="No matches" message="Try another name or muscle, or create a custom exercise." />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  chips: {
    gap: spacing.sm,
  },
  group: {
    gap: spacing.sm,
  },
});
