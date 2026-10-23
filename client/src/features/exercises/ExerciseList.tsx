import type { SFSymbol } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, Chip, EmptyState, ErrorState, ListRow, SectionHeader, Skeleton, TextField } from '@/components/ui';
import type { Equipment, Exercise, MuscleGroup } from '@/data/types';
import { radius, spacing } from '@/theme/tokens';
import { EQUIPMENT_LABEL, exerciseMatches, MUSCLE_LABEL } from './search';

export { EQUIPMENT_LABEL, MUSCLE_LABEL };

/** Every muscle group, in body order, as filter chips. */
const FILTERS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'chest', 'back', 'lats', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'core'];

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
  /** The exercises are still loading: placeholder rows show under the search and filters. */
  loading?: boolean;
  /** The exercises failed to load: an inline error with `onRetry` shows under the search and filters. */
  error?: boolean;
  onRetry?: () => void;
};

/** Search, muscle filters, and a tappable list. Shared by the workout picker, plan editor, and library. */
export function ExerciseList({ exercises, onPick, similarTo, groupCustom, accessory, loading, error, onRetry }: Props) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  const sorted = useMemo(() => [...exercises].sort((a, b) => a.name.localeCompare(b.name)), [exercises]);
  const filtered = sorted.filter((e) => e.id !== similarTo?.id && exerciseMatches(e, query) && (!muscle || e.primaryMuscles.includes(muscle)));

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
          // One muscle at a time, so VoiceOver reads these as a pick-one group.
          <Chip key={m} label={MUSCLE_LABEL[m]} role="radio" selected={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
      </ScrollView>
      {accessory}
      {error ? (
        <ErrorState title="Couldn't load exercises" onRetry={() => onRetry?.()} />
      ) : loading ? (
        <SkeletonRows />
      ) : !exercises.length ? (
        <EmptyState
          icon="dumbbell"
          title="No exercises yet"
          message={accessory ? 'Your exercises appear here. Create a custom exercise to add the first one.' : 'Your exercises appear here. Add custom ones from Plans → Exercises.'}
        />
      ) : !filtered.length ? (
        <EmptyState
          icon="magnifyingglass"
          title="No matches"
          message={accessory ? 'Try another search or clear the filters, or create a custom exercise.' : 'Try another search or clear the filters.'}
          actionLabel={query.trim() || muscle ? 'Clear filters' : undefined}
          onAction={() => {
            setQuery('');
            setMuscle(null);
          }}
        />
      ) : (
        groups
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
          ))
      )}
    </View>
  );
}

/** Placeholder for the list while it loads, shaped like a section of rows. VoiceOver hears "Loading". */
function SkeletonRows() {
  return (
    <View style={styles.group} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <Skeleton width={120} height={13} />
      <Card padding="none">
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton width={30} height={30} radius={radius.sm} />
            <View style={styles.skeletonText}>
              <Skeleton width="55%" height={15} />
              <Skeleton width="35%" height={12} />
            </View>
          </View>
        ))}
      </Card>
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
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  skeletonText: {
    flex: 1,
    gap: spacing.xs + 2,
  },
});
