import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, ListRow, ScreenSkeleton, ScreenState } from '@/components/ui';
import { cardSegment } from '@/features/progress/cardSegment';
import { exerciseRowsView, type ExerciseRowView } from '@/features/progress/progressPage';
import { useProgressData } from '@/features/progress/useProgressData';
import { plural } from '@/lib/format';
import { loggedExercises } from '@/features/progress/variations';
import { useAppTheme } from '@/theme/ThemeProvider';
import { readable } from '@/theme/layout';
import { spacing } from '@/theme/tokens';

/**
 * Every exercise ever logged (Progress → All exercises → Show all), last logged first. All time,
 * whatever the range chips say. Virtualized, so a long history scrolls smoothly.
 */
export default function AllExercisesScreen() {
  const data = useProgressData(['sessions', 'exercises']);
  const rows = useMemo(() => exerciseRowsView(loggedExercises(data.sessions), data.exercisesById, data.today), [data.sessions, data.exercisesById, data.today]);

  if (data.error) return <ErrorState fill title="Couldn't load your exercises" onRetry={data.retry} />;
  if (data.isLoading) return <ScreenSkeleton />;
  if (!rows.length) {
    return (
      <ScreenState>
        <EmptyState icon="dumbbell" title="Nothing logged yet" message="Exercises show up here once you log them in a workout." />
      </ScreenState>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.exerciseId}
      renderItem={({ item, index }) => <Row row={item} first={index === 0} last={index === rows.length - 1} />}
      ListHeaderComponent={
        <AppText variant="footnote" tone="secondary" style={styles.note}>
          {`${plural(rows.length, 'exercise')}, all time, last logged first.`}
        </AppText>
      }
      contentContainerStyle={[styles.content, readable]}
      initialNumToRender={16}
    />
  );
}

/** One row of the grouped list, drawn like a Card's rows (cardSegment), so the list can be virtualized. */
function Row({ row, first, last }: { row: ExerciseRowView; first: boolean; last: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[cardSegment(colors, first, last), styles.row]}>
      <ListRow
        title={row.title}
        subtitle={row.subtitle}
        accessibilityLabel={row.label}
        accessibilityHint="Opens its history."
        onPress={() => router.push({ pathname: '/progress/history', params: { id: row.exerciseId } })}
        separator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },
  note: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  // Clips the pressed highlight to the rounded ends.
  row: {
    overflow: 'hidden',
  },
});
