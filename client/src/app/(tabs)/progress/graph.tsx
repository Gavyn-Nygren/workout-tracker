import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { LineChart } from '@/components/charts/LineChart';
import { AppText, Button, Card, Chip, EmptyState, Icon, useToast } from '@/components/ui';
import { formatMonthDay, formatShortDate, plural } from '@/lib/format';
import { Change, RangeChips } from '@/features/progress/ProgressParts';
import { addGraph, graphsStore, pinnedStore, removeGraph, togglePinned } from '@/features/progress/progressPrefs';
import { changeOverTime, exerciseSeries, METRICS, metricLabel, metricShort, toDisplay, type Metric, type Point } from '@/features/progress/series';
import { formatMetric, formatMetricDelta, useProgressData } from '@/features/progress/useProgressData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * Full graph. Opened from Your graphs it pages through every saved graph (swipe, spec 2.10);
 * opened from Key exercises it shows one exercise with a metric switcher.
 */
export default function GraphScreen() {
  const params = useLocalSearchParams<{ graph?: string; exercise?: string; metric?: Metric }>();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const graphs = graphsStore.use();
  const pinned = pinnedStore.use();
  const startIndex = Math.max(0, graphs.findIndex((g) => g.id === params.graph));
  const [page, setPage] = useState(startIndex);
  const [scrubbing, setScrubbing] = useState(false);
  const paging = Boolean(params.graph) && graphs.length > 0;

  const currentExercise = paging ? graphs[page]?.exerciseId : params.exercise;
  const isPinned = currentExercise ? pinned.includes(currentExercise) : false;

  const header = (
    <Stack.Screen
      options={{
        title: paging ? `Graph ${page + 1} of ${graphs.length}` : 'Graph',
        headerRight: currentExercise
          ? () => (
              <Pressable onPress={() => togglePinned(currentExercise)} accessibilityRole="button" accessibilityLabel={isPinned ? 'Unpin from Key exercises' : 'Pin to Key exercises'} hitSlop={10}>
                <Icon name={isPinned ? 'pin.fill' : 'pin'} color={colors.onChrome} size={18} />
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  if (paging) {
    return (
      <>
        {header}
        <FlatList
          data={graphs}
          keyExtractor={(g) => g.id}
          horizontal
          pagingEnabled
          scrollEnabled={!scrubbing}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width }}>
              <GraphPage exerciseId={item.exerciseId} metric={item.metric} savedId={item.id} onScrubbingChange={setScrubbing} />
            </View>
          )}
        />
      </>
    );
  }

  if (!params.exercise) {
    return <EmptyState icon="chart.xyaxis.line" title="No graph selected" message="Go back and pick an exercise." actionLabel="Back" onAction={() => router.back()} />;
  }
  return (
    <>
      {header}
      <GraphPage exerciseId={params.exercise} metric={params.metric ?? 'e1rm'} switchable />
    </>
  );
}

function GraphPage({
  exerciseId,
  metric: initialMetric,
  savedId,
  switchable,
  onScrubbingChange,
}: {
  exerciseId: string;
  metric: Metric;
  savedId?: string;
  switchable?: boolean;
  onScrubbingChange?: (scrubbing: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const toast = useToast();
  const data = useProgressData();
  const graphs = graphsStore.use();
  const [metric, setMetric] = useState<Metric>(initialMetric);
  const [selected, setSelected] = useState<Point | undefined>();
  const [scrubbing, setScrubbing] = useState(false);

  const exercise = data.exercisesById.get(exerciseId);
  const points = exerciseSeries({ exerciseId, metric, sessions: data.sessions, exercisesById: data.exercisesById, from: data.from }).map((p) => ({ ...p, value: toDisplay(p.value, metric, data.units) }));
  const latest = points[points.length - 1];
  const shown = selected ?? latest;
  const change = changeOverTime(points);
  const saved = graphs.some((g) => g.exerciseId === exerciseId && g.metric === metric);
  const sessionName = (id?: string) => data.sessions.find((s) => s.id === id)?.name;

  return (
    <ScrollView contentContainerStyle={styles.content} scrollEnabled={!scrubbing}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <AppText variant="title2">{exercise?.name ?? 'Exercise'}</AppText>
        <AppText variant="subhead" tone="secondary">
          {metricLabel(metric)}
        </AppText>
        <AppText variant="largeTitle" numeric>
          {shown ? formatMetric(shown.value, metric, data.units) : '—'}
        </AppText>
        {shown ? (
          <AppText variant="footnote" tone="secondary">
            {`${selected ? '' : 'Latest · '}${formatShortDate(shown.date)}${sessionName(shown.sessionId) ? ` · ${sessionName(shown.sessionId)}` : ''}`}
          </AppText>
        ) : (
          <AppText variant="footnote" tone="secondary">
            No sets in this range.
          </AppText>
        )}
        {!selected && change && <Change text={`${formatMetricDelta(change.delta, metric, data.units)} since ${formatMonthDay(change.since)}`} delta={change.delta} />}
      </View>

      <RangeChips />

      <Card>
        {points.length ? (
          <LineChart
            series={[{ key: 'main', label: metricShort(metric), color: colors.chartPrimary, points, style: 'line', area: true }]}
            primaryKey="main"
            formatValue={(v) => formatMetric(v, metric, data.units, false)}
            onSelect={setSelected}
            onScrubbingChange={(on) => {
              setScrubbing(on);
              onScrubbingChange?.(on);
            }}
            label={`${exercise?.name} ${metricLabel(metric)}: ${plural(points.length, 'session')}, latest ${latest ? formatMetric(latest.value, metric, data.units) : 'none'}. Values are listed below.`}
          />
        ) : (
          <EmptyState icon="chart.xyaxis.line" title="No data in this range" message="Try a longer range, or log this exercise in a workout." />
        )}
        <AppText variant="caption" tone="tertiary" style={styles.hint}>
          Drag across the chart to read any session.
        </AppText>
      </Card>

      {switchable && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {METRICS.map((m) => (
            <Chip key={m.value} label={m.short} selected={metric === m.value} onPress={() => setMetric(m.value)} />
          ))}
        </ScrollView>
      )}

      <View style={styles.buttons}>
        {savedId ? (
          <Button
            title="Remove graph"
            variant="ghost"
            size="sm"
            icon="trash"
            onPress={() => {
              removeGraph(savedId);
              router.back();
              toast.show({ message: 'Graph removed.' });
            }}
          />
        ) : (
          <Button
            title={saved ? 'In Your graphs' : 'Add to Your graphs'}
            variant="secondary"
            size="sm"
            icon={saved ? 'checkmark' : 'plus'}
            disabled={saved}
            onPress={() => {
              addGraph(exerciseId, metric);
              toast.show({ message: 'Added to Your graphs.', tone: 'success' });
            }}
          />
        )}
        <Button title="History" variant="ghost" size="sm" icon="clock.arrow.circlepath" onPress={() => router.push({ pathname: '/progress/history', params: { id: exerciseId } })} />
      </View>

      {points.length > 0 && (
        <Card padding="none">
          <View style={[styles.tableRow, { borderBottomColor: colors.border }]}>
            <AppText variant="caption" weight="700" tone="tertiary" style={styles.flex}>
              SESSION
            </AppText>
            <AppText variant="caption" weight="700" tone="tertiary">
              {metricShort(metric).toUpperCase()}
            </AppText>
          </View>
          {[...points].reverse().map((p, i, arr) => (
            <View key={`${p.date}-${i}`} style={[styles.tableRow, i < arr.length - 1 && { borderBottomColor: colors.border }]}>
              <AppText variant="subhead" style={styles.flex} numberOfLines={1}>
                {`${formatShortDate(p.date)}${sessionName(p.sessionId) ? ` · ${sessionName(p.sessionId)}` : ''}`}
              </AppText>
              <AppText variant="subhead" weight="700" numeric>
                {formatMetric(p.value, metric, data.units)}
              </AppText>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  readout: {
    gap: 2,
    minHeight: 132,
  },
  hint: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  chips: {
    gap: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
});
