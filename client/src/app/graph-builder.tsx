import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ErrorState, ListRow, Skeleton, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { useExercises, useSessions } from '@/data/hooks';
import type { Exercise, WorkoutSession } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { chipLabel, metricNote } from '@/features/progress/graphView';
import { metricAvailability } from '@/features/progress/metrics';
import type { Metric } from '@/features/progress/series';
import { useProgressPrefs } from '@/features/progress/useProgressPrefs';
import { loggedExercises } from '@/features/progress/variations';
import { formatMonthDayYear, plural } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const NO_SESSIONS: WorkoutSession[] = [];
const NO_EXERCISES: Exercise[] = [];

/**
 * Custom graph builder (spec 2.10): pick an exercise (the ones you've logged first, with how often
 * and when), then one of the metrics that fit it. A graph that's already saved opens instead.
 */
export default function GraphBuilderSheet() {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const today = useToday();
  const exercises = useExercises();
  const sessions = useSessions();
  const prefs = useProgressPrefs();
  const [exercise, setExercise] = useState<Exercise | undefined>();
  const [picked, setPicked] = useState<Metric | undefined>();

  const history = sessions.data ?? NO_SESSIONS;
  const logged = useMemo(() => new Map(loggedExercises(history).map((l) => [l.exerciseId, l])), [history]);
  const firstGroup = useMemo(() => (logged.size ? { title: 'Logged', ids: new Set(logged.keys()), restTitle: 'Not logged yet' } : undefined), [logged]);
  const loggedLine = useCallback(
    (e: Exercise) => {
      const l = logged.get(e.id);
      return l ? `${plural(l.sessions, 'workout')} · last ${formatMonthDayYear(l.lastDate, today)}` : undefined;
    },
    [logged, today],
  );

  const availability = useMemo(() => (exercise ? metricAvailability(exercise, history) : undefined), [exercise, history]);
  const metric = picked ?? availability?.defaultMetric ?? 'e1rm';
  const info = availability?.all.find((m) => m.metric === metric);
  const existing = exercise ? prefs.graphs.find((g) => g.exerciseId === exercise.id && g.metric === metric) : undefined;

  const pick = (next: Exercise | undefined) => {
    setExercise(next);
    setPicked(undefined);
  };
  const open = (graphId: string) => {
    router.back();
    router.push({ pathname: '/progress/graph', params: { graph: graphId } });
  };

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
                subtitle={loggedLine(exercise) ?? 'Not logged yet'}
                icon="dumbbell"
                // Large text: the button moves under the card so the name keeps the row's width.
                trailing={large ? undefined : <Button title="Change" variant="ghost" size="sm" accessibilityLabel="Change exercise" onPress={() => pick(undefined)} />}
                separator={false}
              />
            </Card>
            {large && <Button title="Change exercise" variant="ghost" size="sm" onPress={() => pick(undefined)} />}
          </View>
          <AppText variant="headline">What should it show?</AppText>
          {sessions.error ? (
            <ErrorState title="Couldn't load your workouts" onRetry={() => sessions.refetch()} />
          ) : !availability || sessions.isPending ? (
            <View style={styles.wrap} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
              <Skeleton width={120} height={34} radius={radius.pill} />
              <Skeleton width={96} height={34} radius={radius.pill} />
              <Skeleton width={140} height={34} radius={radius.pill} />
            </View>
          ) : (
            <>
              {/* Only the metrics that fit this exercise. */}
              <View style={styles.wrap}>
                {availability.offered.map((m) => (
                  <Chip key={m.metric} label={m.label} accessibilityLabel={chipLabel(m)} role="radio" selected={metric === m.metric} onPress={() => setPicked(m.metric)} />
                ))}
              </View>
              {(existing || metricNote(info)) && (
                <AppText variant="footnote" tone="secondary">
                  {existing ? 'Already in Your graphs.' : metricNote(info)}
                </AppText>
              )}
              {existing ? (
                <Button title="Open graph" icon="chart.xyaxis.line" fullWidth onPress={() => open(existing.id)} />
              ) : (
                <Button
                  title="Add graph"
                  icon="plus"
                  fullWidth
                  disabled={!prefs.ready}
                  onPress={() => {
                    const graph = prefs.addGraph(exercise.id, metric);
                    if (!graph) return;
                    open(graph.id);
                    toast.show({ message: 'Added to Your graphs.', tone: 'success' });
                  }}
                />
              )}
            </>
          )}
        </View>
      ) : (
        <>
          <AppText variant="subhead" tone="secondary">
            Pick an exercise first.
          </AppText>
          <ExerciseList
            exercises={exercises.data ?? NO_EXERCISES}
            onPick={pick}
            firstGroup={firstGroup}
            subtitleFor={loggedLine}
            loading={exercises.isPending}
            error={!!exercises.error}
            onRetry={() => exercises.refetch()}
          />
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
