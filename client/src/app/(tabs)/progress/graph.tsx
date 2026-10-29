import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ListRenderItem, type ListViewToken } from 'react-native';

import { compactTick } from '@/components/charts/chartMath';
import { LineChart, type ChartGaps, type ChartSeries } from '@/components/charts/LineChart';
import { AppText, Button, Card, Chip, EmptyState, ErrorState, Icon, NotFoundState, ScreenState, Skeleton, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { useBodyweight, useExercises, usePreferences, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { Exercise, WorkoutSession } from '@/data/types';
import { chartLabel, graphEmpty, graphMetric, graphReadout, metricSubtitle, readsAdded, sessionRows, spokenPoint, type SessionRow } from '@/features/progress/graphView';
import { availabilityFromLogs } from '@/features/progress/metrics';
import { Change, confirmRemoveGraph, RangeChips } from '@/features/progress/ProgressParts';
import { formatMetric, valueTicks } from '@/features/progress/progressFormat';
import type { SavedGraph } from '@/features/progress/progressPrefs';
import { CHANGE_DAYS, changeSince, exerciseLogs, loggedSpan, metricPoints, metricShort, rangeStart, toDisplay, type ExerciseLog, type Metric, type Point } from '@/features/progress/series';
import { rangeStore, useProgressPrefs } from '@/features/progress/useProgressPrefs';
import { readable, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const NO_SESSIONS: WorkoutSession[] = [];
const NO_EXERCISES: Exercise[] = [];
const NO_LOGS: ExerciseLog[] = [];
const NO_POINTS: Point[] = [];
/** Sessions more than about 4 weeks apart are joined by a dashed, faded line. */
const GRAPH_GAPS: ChartGaps = { days: CHANGE_DAYS, draw: 'dashed' };

/**
 * The reads a graph uses, and only those (sessions, exercises, preferences), so it doesn't wait on
 * or fail over the bodyweight log or records.
 */
function useGraphData() {
  const today = useToday();
  const sessions = useSessions();
  const exercises = useExercises();
  const preferences = usePreferences();
  // Only to offer Log weight in an empty chart; the screen never waits on it or fails over it.
  const weighIns = useBodyweight();
  const range = rangeStore.use();
  const list = exercises.data ?? NO_EXERCISES;
  const exercisesById = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
  const queries = [sessions, exercises, preferences];
  return {
    hasWeighIn: weighIns.data ? weighIns.data.length > 0 : undefined,
    today,
    range,
    from: rangeStart(range, today),
    units: (preferences.data ?? defaultPreferences).units,
    sessions: sessions.data ?? NO_SESSIONS,
    exercisesById,
    isLoading: queries.some((q) => q.isLoading),
    failed: queries.filter((q) => q.error),
  };
}

/**
 * Full graph. Opened from Your graphs it pages through every saved graph (swipe, spec 2.10);
 * opened from Key exercises or History it shows one exercise, with chips for the metrics that fit it.
 */
export default function GraphScreen() {
  const params = useLocalSearchParams<{ graph?: string; exercise?: string; metric?: string }>();
  const { colors, scheme } = useAppTheme();
  const toast = useToast();
  const data = useGraphData();
  const prefs = useProgressPrefs(data.exercisesById);
  // Kept while the screen closes after "Remove graph", so the pager doesn't jump to another graph.
  const [frozen, setFrozen] = useState<SavedGraph[] | undefined>();
  const graphs = frozen ?? prefs.graphs;
  const paging = Boolean(params.graph);
  const startIndex = graphs.findIndex((g) => g.id === params.graph);
  const [page, setPage] = useState<number | undefined>();
  const index = Math.min(page ?? Math.max(0, startIndex), Math.max(0, graphs.length - 1));

  const exerciseId = paging ? graphs[index]?.exerciseId : params.exercise;
  const exercise = exerciseId ? data.exercisesById.get(exerciseId) : undefined;
  const pinned = exercise ? prefs.isPinned(exercise.id) : false;

  const latest = useRef({ prefs, toast, scheme });
  latest.current = { prefs, toast, scheme };
  const removeGraph = useCallback((graph: SavedGraph, name: string) => {
    confirmRemoveGraph({
      title: `${name} · ${metricShort(graph.metric)}`,
      scheme: latest.current.scheme,
      onRemove: () => {
        // Close first and freeze the pager, so it doesn't flash the next graph on the way out.
        setFrozen(latest.current.prefs.graphs);
        router.back();
        latest.current.prefs.removeGraph(graph.id);
        latest.current.toast.show({ message: 'Graph removed.' });
      },
    });
  }, []);

  const header = (
    <Stack.Screen
      options={{
        title: paging && graphs.length > 1 ? `Graph ${index + 1} of ${graphs.length}` : 'Graph',
        headerRight: exercise
          ? () => (
              <Pressable
                onPress={() => {
                  prefs.togglePin(exercise.id);
                  toast.show({ message: pinned ? 'Unpinned from Key exercises.' : 'Pinned to Key exercises.' });
                }}
                accessibilityRole="button"
                accessibilityLabel={pinned ? 'Unpin from Key exercises' : 'Pin to Key exercises'}
                hitSlop={10}
              >
                <Icon name={pinned ? 'pin.fill' : 'pin'} color={colors.onChrome} size={18} />
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  if (paging) {
    if (!prefs.ready) {
      return (
        <>
          {header}
          <GraphSkeleton />
        </>
      );
    }
    if (startIndex < 0 && !frozen) return <NotFoundState thing="Graph" icon="chart.xyaxis.line" />;
    return (
      <>
        {header}
        <Pager graphs={graphs} startIndex={Math.max(0, startIndex)} onPage={setPage} onRemove={removeGraph} />
      </>
    );
  }

  if (!params.exercise) {
    return (
      <ScreenState>
        <EmptyState icon="chart.xyaxis.line" title="No graph selected" message="Go back and pick an exercise." actionLabel="Back" onAction={() => router.back()} />
      </ScreenState>
    );
  }
  return (
    <>
      {header}
      <GraphPage exerciseId={params.exercise} asked={params.metric} />
    </>
  );
}

/**
 * Swipes through Your graphs. Horizontal drags on a chart scrub it instead of paging. The page
 * stays in place when the width changes (iPad rotation, Split View).
 */
function Pager({ graphs, startIndex, onPage, onRemove }: { graphs: SavedGraph[]; startIndex: number; onPage: (page: number) => void; onRemove: (graph: SavedGraph, name: string) => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const [locked, setLocked] = useState(false);
  const list = useRef<FlatList<SavedGraph>>(null);
  const pageRef = useRef(startIndex);
  const resizing = useRef(false);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  const settle = useCallback((page: number) => {
    pageRef.current = page;
    onPageRef.current(page);
  }, []);

  // After a resize, scroll back to the page that was showing (the old offset now points elsewhere).
  // Not on mount: initialScrollIndex places the first page.
  const laidOut = useRef(width);
  useLayoutEffect(() => {
    if (laidOut.current === width) return;
    laidOut.current = width;
    list.current?.scrollToOffset({ offset: pageRef.current * width, animated: false });
    resizing.current = false;
  }, [width]);

  // VoiceOver can move to another page without a momentum scroll; this keeps the title and pin in step.
  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const shown = viewableItems.find((v) => v.isViewable && v.index != null);
    if (!resizing.current && shown?.index != null && shown.index !== pageRef.current) settle(shown.index);
  }).current;

  const renderItem = useCallback<ListRenderItem<SavedGraph>>(
    ({ item }) => (
      <View style={{ width }}>
        <GraphPage exerciseId={item.exerciseId} graph={item} onTouchChange={setLocked} onRemove={onRemove} />
      </View>
    ),
    [width, onRemove],
  );

  return (
    <View
      style={styles.flex}
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        if (Math.abs(next - width) < 0.5) return;
        resizing.current = true;
        setWidth(next);
      }}
    >
      <FlatList
        ref={list}
        data={graphs}
        extraData={width}
        keyExtractor={(g) => g.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        scrollEnabled={!locked}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        // One page, and its neighbours as you swipe: each page is a full screen with its own table.
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        onMomentumScrollEnd={(e) => settle(Math.round(e.nativeEvent.contentOffset.x / width))}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewability}
      />
    </View>
  );
}

type PageProps = {
  exerciseId: string;
  /** A saved graph: its metric is fixed, and it can be removed. */
  graph?: SavedGraph;
  /** The metric a link asked for (unchecked); it falls back to the exercise's first useful one. */
  asked?: string;
  onTouchChange?: (touching: boolean) => void;
  onRemove?: (graph: SavedGraph, name: string) => void;
};

/** One graph: readout, range, chart, metrics, actions, and a table of every session in the range. */
const GraphPage = memo(function GraphPage({ exerciseId, graph, asked, onTouchChange, onRemove }: PageProps) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const data = useGraphData();
  const { units, today, from } = data;
  const prefs = useProgressPrefs(data.exercisesById);
  const exercise = data.exercisesById.get(exerciseId);

  const logs = useMemo(() => exerciseLogs(data.sessions).get(exerciseId) ?? NO_LOGS, [data.sessions, exerciseId]);
  const availability = useMemo(() => (exercise ? availabilityFromLogs(exercise, logs) : undefined), [exercise, logs]);
  const [picked, setPicked] = useState<Metric | undefined>();
  const metric: Metric = graph ? graph.metric : (picked ?? graphMetric(asked, availability));
  const info = availability?.all.find((m) => m.metric === metric);
  const added = readsAdded(metric, availability);

  // Stored units, all time (the change reads the full history); the chart gets the range in display units.
  const history = useMemo(() => (exercise ? metricPoints(logs, exercise, metric) : NO_POINTS), [exercise, logs, metric]);
  const points = useMemo(() => history.filter((p) => !from || p.date >= from).map((p) => ({ ...p, value: toDisplay(p.value, metric, units) })), [history, from, metric, units]);
  const latest = useMemo(() => {
    const p = history[history.length - 1];
    return p && { ...p, value: toDisplay(p.value, metric, units) };
  }, [history, metric, units]);
  const change = useMemo(() => changeSince(history, today, loggedSpan(logs)), [history, today, logs]);

  const names = useMemo(() => new Map(data.sessions.map((s) => [s.id, s.name])), [data.sessions]);
  const nameOf = useCallback((id?: string) => (id ? names.get(id) : undefined), [names]);

  // The scrubbed point belongs to one metric and range: switching either clears it (VoiceOver steps too).
  const view = `${metric}|${data.range}`;
  const viewRef = useRef(view);
  viewRef.current = view;
  const [selection, setSelection] = useState<{ view: string; point: Point } | undefined>();
  const selected = selection?.view === view ? selection.point : undefined;
  const onSelect = useCallback((point: Point | undefined) => setSelection(point ? { view: viewRef.current, point } : undefined), []);
  const [scrubbing, setScrubbing] = useState(false);

  const name = exercise?.name ?? 'Exercise';
  const series = useMemo<ChartSeries[]>(
    () => [{ key: 'main', label: metricShort(metric), color: colors.chartPrimary, points, style: 'line', area: true, gaps: GRAPH_GAPS }],
    [metric, colors.chartPrimary, points],
  );
  const formatValue = useCallback((v: number) => formatMetric(v, metric, units, false, { added }), [metric, units, added]);
  const formatTick = useCallback((v: number) => compactTick(v, formatValue), [formatValue]);
  const ticks = useCallback((values: number[]) => valueTicks(values, metric), [metric]);
  const describePoint = useCallback((p: Point) => spokenPoint(p, metric, units, today, nameOf(p.sessionId)), [metric, units, today, nameOf]);
  const label = useMemo(() => chartLabel(name, metric, points, units), [name, metric, points, units]);
  const rows = useMemo(() => sessionRows(points, metric, units, today, nameOf), [points, metric, units, today, nameOf]);

  const renderRow = useCallback<ListRenderItem<SessionRow>>(({ item, index }) => <SessionRowView row={item} last={index === rows.length - 1} large={large} />, [rows.length, large]);

  if (data.failed.length) return <ErrorState fill title="Couldn't load this graph" onRetry={() => data.failed.forEach((q) => q.refetch())} />;
  if (data.isLoading) return <GraphSkeleton />;
  if (!exercise) {
    // A saved graph still opens so it can be removed; a link to an unknown exercise can't.
    if (!graph) return <NotFoundState thing="Exercise" icon="dumbbell" />;
    return (
      <ScreenState>
        <EmptyState
          icon="chart.xyaxis.line"
          title="Deleted exercise"
          message="The exercise this graph showed no longer exists."
          actionLabel="Remove graph"
          onAction={() => onRemove?.(graph, 'Deleted exercise')}
        />
      </ScreenState>
    );
  }

  const readout = graphReadout({ shown: selected ?? latest, selected: Boolean(selected), change, metric, units, today, name: nameOf((selected ?? latest)?.sessionId) });
  const empty = graphEmpty(info, points.length, data.hasWeighIn);
  const saved = prefs.graphs.some((g) => g.exerciseId === exerciseId && g.metric === metric);

  const top = (
    <View style={styles.top}>
      <View style={styles.readout}>
        <AppText variant="title2" accessibilityRole="header">
          {name}
        </AppText>
        <AppText variant="subhead" tone="secondary">
          {metricSubtitle(metric, added)}
        </AppText>
        <AppText variant="largeTitle" numeric accessibilityLabel={readout?.spokenValue}>
          {readout?.value ?? '—'}
        </AppText>
        {readout && (
          <AppText variant="footnote" tone="secondary" accessibilityLabel={readout.spokenLine}>
            {readout.line}
          </AppText>
        )}
        {readout?.change &&
          (readout.change.isChange ? (
            <Change text={readout.change.text} direction={readout.change.direction} accessibilityLabel={readout.change.spoken} />
          ) : (
            <AppText variant="footnote" tone="secondary" accessibilityLabel={readout.change.spoken}>
              {readout.change.text}
            </AppText>
          ))}
      </View>

      <RangeChips />

      <Card>
        {empty ? (
          <EmptyState
            icon="chart.xyaxis.line"
            title={empty.title}
            message={empty.message}
            actionLabel={empty.action === 'log_weight' ? 'Log weight' : empty.action === 'show_all' && data.range !== 'All' ? 'Show all time' : undefined}
            onAction={() => (empty.action === 'log_weight' ? router.push('/log-weight') : rangeStore.set('All'))}
          />
        ) : (
          <>
            <LineChart
              key={view}
              series={series}
              primaryKey="main"
              formatValue={formatValue}
              formatTick={formatTick}
              ticks={ticks}
              timeAxis={data.range === '1Y' || data.range === 'All' ? 'months' : 'ends'}
              today={today}
              bestIs={metric === 'sets' ? 'none' : 'max'}
              onSelect={onSelect}
              onScrubbingChange={setScrubbing}
              onTouchChange={onTouchChange}
              label={label}
              describePoint={describePoint}
              accessibilityHint="Swipe up or down to step through sessions."
            />
            {/* VoiceOver users step through the chart instead; its hint says how. */}
            <AppText variant="caption" tone="secondary" style={styles.hint} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              Drag across the chart to read any session.
            </AppText>
          </>
        )}
      </Card>

      {!graph && availability && availability.offered.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {availability.offered.map((m) => (
            <Chip key={m.metric} label={m.short} accessibilityLabel={m.hasData ? m.label : `${m.label}, no data yet`} role="radio" selected={metric === m.metric} onPress={() => setPicked(m.metric)} />
          ))}
        </ScrollView>
      )}

      <View style={styles.buttons}>
        {graph ? (
          <Button title="Remove graph" variant="ghost" size="sm" icon="trash" onPress={() => onRemove?.(graph, name)} />
        ) : (
          <Button
            title={saved ? 'In Your graphs' : 'Add to Your graphs'}
            variant="secondary"
            size="sm"
            icon={saved ? 'checkmark' : 'plus'}
            disabled={saved || !prefs.ready}
            onPress={() => {
              if (prefs.addGraph(exerciseId, metric)) toast.show({ message: 'Added to Your graphs.', tone: 'success' });
            }}
          />
        )}
        <Button title="History" variant="ghost" size="sm" icon="clock.arrow.circlepath" onPress={() => router.push({ pathname: '/progress/history', params: { id: exerciseId } })} />
      </View>

      {rows.length > 0 && (
        // Each row reads as one item ("date, session: value"), so the header is for sight only.
        <View style={[styles.tableHead, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppText variant="caption" weight="700" tone="secondary" style={styles.flex}>
            {large ? `SESSION · ${metricShort(metric).toUpperCase()}` : 'SESSION'}
          </AppText>
          {!large && (
            <AppText variant="caption" weight="700" tone="secondary">
              {metricShort(metric).toUpperCase()}
            </AppText>
          )}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderRow}
      ListHeaderComponent={top}
      contentContainerStyle={[styles.content, readable]}
      scrollEnabled={!scrubbing}
      initialNumToRender={12}
      maxToRenderPerBatch={20}
      windowSize={9}
    />
  );
});

/** A session in the table. Tapping it opens that workout's summary. */
const SessionRowView = memo(function SessionRowView({ row, last, large }: { row: SessionRow; last: boolean; large: boolean }) {
  const { colors } = useAppTheme();
  const sessionId = row.sessionId;
  return (
    <Pressable
      onPress={sessionId ? () => router.push({ pathname: '/summary', params: { session: sessionId } }) : undefined}
      disabled={!sessionId}
      accessibilityRole="button"
      accessibilityLabel={row.spoken}
      accessibilityHint={sessionId ? 'Opens the workout summary.' : undefined}
      style={({ pressed }) => [
        large ? styles.rowStacked : styles.row,
        { backgroundColor: pressed ? colors.input : colors.card, borderColor: colors.border },
        last && styles.rowLast,
      ]}
    >
      <AppText variant="subhead" style={large ? undefined : styles.flex} numberOfLines={large ? undefined : 2}>
        {row.title}
      </AppText>
      <View style={styles.rowValue}>
        <AppText variant="subhead" weight="700" numeric style={large ? undefined : styles.shrink}>
          {row.value}
        </AppText>
        {!large && <Icon name="chevron.right" color={colors.textTertiary} size={12} />}
      </View>
    </Pressable>
  );
});

function GraphSkeleton() {
  return (
    <View style={[styles.content, styles.top, readable]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <View style={[styles.readout, styles.readoutSkeleton]}>
        <Skeleton width="55%" height={26} />
        <Skeleton width="35%" height={16} />
        <Skeleton width="40%" height={40} />
      </View>
      <RangeChips />
      <Skeleton height={272} radius={radius.card} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },
  top: {
    gap: spacing.lg,
  },
  readout: {
    gap: 2,
    minHeight: 132,
  },
  readoutSkeleton: {
    gap: spacing.sm,
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
  // The table is a card in pieces (head, rows, a rounded last row), so its rows can be virtualized.
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Large text: the session on one line, its value under it.
  rowStacked: {
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLast: {
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  shrink: {
    flexShrink: 1,
    textAlign: 'right',
  },
  flex: {
    flex: 1,
  },
});
