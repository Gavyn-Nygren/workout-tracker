import { router } from 'expo-router';
import { useMemo } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Sparkline } from '@/components/charts/Sparkline';
import { AppText, Button, Card, EmptyState, ErrorState, Icon, ListRow, PressableScale, ScreenState, SectionHeader, Skeleton } from '@/components/ui';
import { keyExercises } from '@/features/progress/keyExercises';
import {
  ALL_EXERCISES_PREVIEW,
  BODYWEIGHT_GAPS,
  bodyweightCardView,
  exerciseRowsView,
  graphRowView,
  keyCardView,
  pinActionLabel,
  type BodyweightCardView,
  type GraphRowView,
  type KeyCardView,
} from '@/features/progress/progressPage';
import { confirmRemoveGraph, RangeChips, StatusText } from '@/features/progress/ProgressParts';
import { exerciseLogs } from '@/features/progress/series';
import { useProgressData } from '@/features/progress/useProgressData';
import { useProgressPrefs } from '@/features/progress/useProgressPrefs';
import { loggedExercises } from '@/features/progress/variations';
import { useAppTheme } from '@/theme/ThemeProvider';
import { Columns, dashboard, useTextScale } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

/**
 * Progress (spec 2.10), one scrolling page (user's pick): range, Key exercises, Your graphs,
 * bodyweight, and every logged exercise. The picking and counting live in the engine
 * (keyExercises.ts, series.ts, bodyweight.ts, variations.ts) and the page's text in progressPage.ts.
 *
 * Each part waits on, and fails on, only what it reads: the workouts parts (Key exercises, Your
 * graphs, All exercises) on sessions and exercises, the Bodyweight card on the weigh-ins, so one
 * failed read doesn't blank the page. A reopened workout counts as it was until it's finished again.
 */
export default function ProgressScreen() {
  const { scheme } = useAppTheme();
  const data = useProgressData(['sessions', 'exercises', 'bodyweight']);
  const prefs = useProgressPrefs(data.exercisesById);
  const page = data.status([]);
  const workouts = data.status(['sessions', 'exercises']);
  const weighIns = data.status(['bodyweight']);
  const workoutsReady = !workouts.isLoading && !workouts.error;

  const { sessions, exercisesById, today, from, units } = data;
  const keyCards = useMemo(
    () => (workoutsReady ? keyExercises({ sessions, exercisesById, pins: prefs.pins, today, from }).map((card) => keyCardView(card, units, today)) : []),
    [workoutsReady, sessions, exercisesById, prefs.pins, today, from, units],
  );
  const graphRows = useMemo(() => {
    if (!workoutsReady) return [];
    const logs = exerciseLogs(sessions);
    return prefs.graphs.map((g) => graphRowView(g, exercisesById.get(g.exerciseId), logs.get(g.exerciseId) ?? [], units, today, from));
  }, [workoutsReady, sessions, exercisesById, prefs.graphs, units, today, from]);
  const exerciseRows = useMemo(() => (workoutsReady ? exerciseRowsView(loggedExercises(sessions), exercisesById, today) : []), [workoutsReady, sessions, exercisesById, today]);
  const bodyweight = useMemo(() => bodyweightCardView(data.bodyweight, units, today, from), [data.bodyweight, units, today, from]);

  if (page.error) {
    return (
      <ScreenState>
        <ErrorState title="Couldn't load your progress" onRetry={page.retry} />
      </ScreenState>
    );
  }

  if (page.isLoading) {
    return (
      <View style={[styles.content, dashboard]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        <Skeleton height={36} radius={radius.pill} />
        <Skeleton height={96} radius={radius.card} />
        <Skeleton height={96} radius={radius.card} />
      </View>
    );
  }

  const togglePin = (view: KeyCardView) => {
    prefs.togglePin(view.exerciseId);
    AccessibilityInfo.announceForAccessibility(view.pinned ? `Unpinned ${view.name}.` : `Pinned ${view.name} to Key exercises.`);
  };
  const openHistory = (exerciseId: string) => router.push({ pathname: '/progress/history', params: { id: exerciseId } });
  const keyMenu = (view: KeyCardView) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: view.name, options: [pinActionLabel(view.pinned), 'View history', 'Cancel'], cancelButtonIndex: 2, userInterfaceStyle: scheme },
      (i) => {
        if (i === 0) togglePin(view);
        if (i === 1) openHistory(view.exerciseId);
      },
    );
  const removeGraph = (row: GraphRowView) =>
    confirmRemoveGraph({
      title: row.sheetTitle,
      scheme,
      onRemove: () => {
        prefs.removeGraph(row.graphId);
        AccessibilityInfo.announceForAccessibility('Graph removed.');
      },
    });

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]}>
      <RangeChips />

      {/* iPad: key exercises on the left; graphs, bodyweight, and the exercise list on the right. */}
      <Columns
        left={
          <View style={styles.section}>
            <SectionHeader title="Key exercises · e1RM" accessibilityLabel="Key exercises, estimated one-rep max" />
            {workouts.error ? (
              <Card>
                <ErrorState title="Couldn't load your workouts" onRetry={workouts.retry} />
              </Card>
            ) : workouts.isLoading ? (
              <Loading />
            ) : keyCards.length ? (
              keyCards.map((view) => <KeyExerciseCard key={view.exerciseId} view={view} onMenu={keyMenu} onTogglePin={togglePin} onHistory={openHistory} />)
            ) : (
              <Card>
                <EmptyState icon="chart.line.uptrend.xyaxis" title="Nothing to chart yet" message="Finish a few workouts and your most-trained lifts appear here." />
              </Card>
            )}
          </View>
        }
        right={
          <>
            {/* Without the workouts there's nothing to graph; Key exercises shows the error. */}
            {!workouts.error && (
              <View style={styles.section}>
                <SectionHeader title="Your graphs" actionLabel="New" actionAccessibilityLabel="New graph" onAction={() => router.push('/graph-builder')} />
                {prefs.graphs.length === 0 ? (
                  <Card padding="none">
                    <EmptyState icon="plus.forwardslash.minus" title="No custom graphs" message="Build one: pick an exercise and a metric like volume or reps." actionLabel="New graph" onAction={() => router.push('/graph-builder')} />
                  </Card>
                ) : workouts.isLoading ? (
                  <Loading count={1} height={64} />
                ) : (
                  <Card padding="none">
                    {graphRows.map((row, i) => (
                      <GraphRow key={row.graphId} row={row} separator={i < graphRows.length - 1} onRemove={removeGraph} />
                    ))}
                  </Card>
                )}
              </View>
            )}

            <View style={styles.section}>
              <SectionHeader title="Bodyweight" actionLabel="Log" actionAccessibilityLabel="Log bodyweight" onAction={() => router.push('/log-weight')} />
              {weighIns.error ? (
                <Card>
                  <ErrorState title="Couldn't load your weigh-ins" onRetry={weighIns.retry} />
                </Card>
              ) : weighIns.isLoading ? (
                <Loading count={1} />
              ) : (
                <BodyweightCard view={bodyweight} />
              )}
            </View>

            {/* Hidden until something is logged; Key exercises already explains the empty state. */}
            {exerciseRows.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title={`All exercises · ${exerciseRows.length}`} accessibilityLabel={`All exercises, ${exerciseRows.length}, all time`} />
                {/* The range chips scope the charts above; this list is every exercise ever logged. */}
                <AppText variant="footnote" tone="secondary" style={styles.note}>
                  All time, last logged first.
                </AppText>
                <Card padding="none">
                  {exerciseRows.slice(0, ALL_EXERCISES_PREVIEW).map((row, i) => (
                    <ListRow
                      key={row.exerciseId}
                      title={row.title}
                      subtitle={row.subtitle}
                      accessibilityLabel={row.label}
                      accessibilityHint="Opens its history."
                      onPress={() => openHistory(row.exerciseId)}
                      separator={i < Math.min(exerciseRows.length, ALL_EXERCISES_PREVIEW) - 1 || exerciseRows.length > ALL_EXERCISES_PREVIEW}
                    />
                  ))}
                  {exerciseRows.length > ALL_EXERCISES_PREVIEW && (
                    <ListRow title={`Show all ${exerciseRows.length}`} accessibilityLabel={`Show all ${exerciseRows.length} exercises`} accessibilityHint="Opens the full list." onPress={() => router.push('/progress/exercises')} separator={false} />
                  )}
                </Card>
              </View>
            )}

            <Button title="Log bodyweight" variant="secondary" icon="scalemass" fullWidth onPress={() => router.push('/log-weight')} />
          </>
        }
      />
    </ScrollView>
  );
}

function Loading({ count = 2, height = 96 }: { count?: number; height?: number }) {
  return (
    <View style={styles.section} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius={radius.card} />
      ))}
    </View>
  );
}

/** A Key exercises card: tap for the graph, long-press for Pin/Unpin and View history. */
function KeyExerciseCard({
  view,
  onMenu,
  onTogglePin,
  onHistory,
}: {
  view: KeyCardView;
  onMenu: (view: KeyCardView) => void;
  onTogglePin: (view: KeyCardView) => void;
  onHistory: (exerciseId: string) => void;
}) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/progress/graph', params: { exercise: view.exerciseId, metric: view.metric } })}
      onLongPress={() => onMenu(view)}
      accessibilityRole="button"
      accessibilityLabel={view.label}
      accessibilityHint="Opens the full graph."
      accessibilityActions={[
        { name: 'pin', label: pinActionLabel(view.pinned) },
        { name: 'history', label: 'View history' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'pin') onTogglePin(view);
        if (e.nativeEvent.actionName === 'history') onHistory(view.exerciseId);
      }}
    >
      <Card>
        <View style={large ? styles.keyColumn : styles.keyRow}>
          <View style={large ? undefined : styles.keyText}>
            <View style={styles.inline}>
              {view.pinned && <Icon name="pin.fill" color={colors.accentText} size={11} />}
              <AppText variant="subhead" weight="700" numberOfLines={large ? undefined : 2} style={styles.flex}>
                {view.name}
              </AppText>
            </View>
            {/* A pinned lift without e1RM data shows its own best; say which. */}
            {view.metricLabel && (
              <AppText variant="caption" tone="secondary">
                {view.metricLabel}
              </AppText>
            )}
            <AppText variant="title2" numeric>
              {view.value}
            </AppText>
            {view.status && <StatusText status={view.status} />}
          </View>
          <View style={large ? undefined : styles.spark}>
            {view.points.length > 0 ? (
              <Sparkline points={view.points} height={64} label={view.label} />
            ) : (
              view.emptyRange && (
                <AppText variant="caption" tone="tertiary" style={large ? undefined : styles.sparkNote}>
                  Nothing in this range
                </AppText>
              )
            )}
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

/** A Your graphs row: tap for the graph, long-press to remove; a deleted exercise's row offers Remove. */
function GraphRow({ row, separator, onRemove }: { row: GraphRowView; separator: boolean; onRemove: (row: GraphRowView) => void }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const rule = separator && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth };

  if (row.kind === 'deleted') {
    return (
      <View style={[styles.graphRow, rule]}>
        <View style={styles.flex} accessible accessibilityLabel={row.label}>
          <AppText variant="subhead" weight="700" tone="secondary">
            {row.title}
          </AppText>
        </View>
        <Button title="Remove" variant="ghost" size="sm" onPress={() => onRemove(row)} accessibilityLabel="Remove graph" accessibilityHint="Asks before removing it." />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/progress/graph', params: { graph: row.graphId } })}
      onLongPress={() => onRemove(row)}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      accessibilityHint="Opens the graph."
      accessibilityActions={[{ name: 'remove', label: 'Remove graph' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'remove' && onRemove(row)}
      style={({ pressed }) => [styles.graphRow, rule, pressed && { backgroundColor: colors.input }]}
    >
      <View style={styles.flex}>
        <AppText variant="subhead" weight="700" numberOfLines={large ? undefined : 2}>
          {row.title}
        </AppText>
        <AppText variant="footnote" tone="secondary" numeric>
          {row.subtitle}
        </AppText>
      </View>
      {/* At large text sizes the name needs the room; the full graph is a tap away. */}
      {!large && <View style={styles.miniSpark}>{row.points.length > 0 && <Sparkline points={row.points} height={36} label={row.label} />}</View>}
      <Icon name="chevron.right" color={colors.textTertiary} size={13} />
    </Pressable>
  );
}

/** The 7-day trend at the latest weigh-in, its change in the range, and the trend line (broken across gaps). */
function BodyweightCard({ view }: { view: BodyweightCardView }) {
  const { large } = useTextScale();
  return (
    <PressableScale onPress={() => router.push('/progress/bodyweight')} accessibilityRole="button" accessibilityLabel={view.label} accessibilityHint="Opens your bodyweight log.">
      <Card>
        <View style={large ? styles.keyColumn : styles.keyRow}>
          <View style={large ? undefined : styles.keyText}>
            <AppText variant="subhead" weight="700">
              7-day trend
            </AppText>
            <AppText variant="title2" numeric>
              {view.value}
            </AppText>
            {/* Neutral: neither way is better for bodyweight. */}
            <StatusText status={view.status} neutral />
          </View>
          <View style={large ? undefined : styles.spark}>{view.trend.length > 0 && <Sparkline points={view.trend} height={64} label={view.label} gaps={BODYWEIGHT_GAPS} />}</View>
        </View>
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  note: {
    paddingHorizontal: spacing.xs,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  keyText: {
    width: '46%',
    gap: 2,
  },
  // Large text: the numbers take the full width and the sparkline sits under them.
  keyColumn: {
    gap: spacing.md,
  },
  spark: {
    flex: 1,
  },
  sparkNote: {
    textAlign: 'center',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  graphRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  miniSpark: {
    width: 84,
  },
  flex: {
    flex: 1,
  },
});
