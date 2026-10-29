import { router } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import { LineChart, type ChartSeries } from '@/components/charts/LineChart';
import { AppText, Button, Card, EmptyState, ErrorState, Icon, SectionHeader, Skeleton, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { succeeded, useBodyweight, useDeleteBodyweight, usePreferences } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { BodyweightEntry } from '@/data/types';
import { formatLongDateYear, formatShortDateYear, plural } from '@/lib/format';
import { bodyweightSeries, TREND_DAYS } from '@/features/progress/bodyweight';
import { cardSegment } from '@/features/progress/cardSegment';
import { weighInRows, type WeighInRow } from '@/features/progress/logWeight';
import { Change, Legend, RangeChips } from '@/features/progress/ProgressParts';
import { deltaDirection, formatMetric, formatMetricDelta, spokenMetric, spokenMetricDelta, valueTicks } from '@/features/progress/progressFormat';
import { describeTrend, rangeStart, type Point } from '@/features/progress/series';
import { rangeStore } from '@/features/progress/useProgressPrefs';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

const NO_ENTRIES: BodyweightEntry[] = [];
/** Y-axis ticks at bodyweight's precision (0.1), so no two labels repeat. */
const bodyweightTicks = (values: number[]) => valueTicks(values, 'bodyweight');

/**
 * Bodyweight (spec 2.10): weigh-ins as dots plus a 7-day trend line (user's pick) that breaks where
 * weigh-ins are more than a week apart, the range's lowest, highest and average, and the full log
 * (virtualized). Tap a weigh-in to fix it; long-press to delete it.
 */
export default function BodyweightScreen() {
  const { colors, scheme } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const today = useToday();
  const bodyweight = useBodyweight();
  const preferences = usePreferences();
  const deleteEntry = useDeleteBodyweight();
  const range = rangeStore.use();
  const from = rangeStart(range, today);
  const longRange = range === '1Y' || range === 'All';
  const units = (preferences.data ?? defaultPreferences).units;
  const entries = bodyweight.data ?? NO_ENTRIES;
  const [selected, setSelected] = useState<Point | undefined>();
  const [scrubbing, setScrubbing] = useState(false);

  // Worked out once per list of weigh-ins and range (cached in bodyweight.ts), not per scrub step.
  const { points, trend, runs, trendByDate } = bodyweightSeries(entries, { from, units });
  const rows = useMemo(() => weighInRows(entries, units, today), [entries, units, today]);
  const stats = useMemo(() => {
    if (!points.length) return undefined;
    let low = Infinity;
    let high = -Infinity;
    let sum = 0;
    for (const p of points) {
      low = Math.min(low, p.value);
      high = Math.max(high, p.value);
      sum += p.value;
    }
    return { low, high, average: sum / points.length };
  }, [points]);

  const latest = points[points.length - 1];
  const shown = selected ?? latest;
  const shownTrend = shown ? trendByDate.get(shown.date) : undefined;
  const change = trend.length > 1 ? trend[trend.length - 1].value - trend[0].value : undefined;
  const speak = useCallback((v: number) => spokenMetric(v, 'bodyweight', units), [units]);
  const formatValue = useCallback((v: number) => formatMetric(v, 'bodyweight', units, false), [units]);
  const describePoint = useCallback(
    (p: Point) => {
      const t = trendByDate.get(p.date);
      return `${formatLongDateYear(p.date, today)}: ${speak(p.value)}${t !== undefined ? `, 7-day trend ${speak(t)}` : ''}`;
    },
    [trendByDate, today, speak],
  );

  // The chart is kept as is between scrub steps; it moves its own crosshair.
  const chart = useMemo(() => {
    if (!points.length || !stats) return null;
    const series: ChartSeries[] = [
      // Raw weigh-ins in grey so the blue trend line carries the story (and pale blue fails on white).
      { key: 'weighins', label: 'Weigh-ins', color: colors.textSecondary, points, style: 'dots' },
      // The trend breaks where weigh-ins are more than 7 days apart (the same rule as bodyweight.ts's runs).
      { key: 'trend', label: '7-day trend', color: colors.chartPrimary, points: trend, style: 'line', gaps: { days: TREND_DAYS, draw: 'none' } },
    ];
    const last = points[points.length - 1];
    const label = `Bodyweight, ${plural(points.length, 'weigh-in')}. Latest ${speak(last.value)}, lowest ${speak(stats.low)}, highest ${speak(stats.high)}. 7-day trend ${describeTrend(trend, speak, 'weigh-in')}${
      runs.length > 1 ? ', with breaks where weigh-ins are more than a week apart' : ''
    }. Every entry is listed below.`;
    return (
      <View style={styles.stack}>
        <LineChart
          series={series}
          primaryKey="weighins"
          // Neither way is better for bodyweight, so no extreme is labelled "Best".
          bestIs="none"
          formatValue={formatValue}
          ticks={bodyweightTicks}
          timeAxis={longRange ? 'months' : 'ends'}
          today={today}
          onSelect={setSelected}
          onScrubbingChange={setScrubbing}
          label={label}
          describePoint={describePoint}
          accessibilityHint="Swipe up or down to step through weigh-ins."
        />
        <Legend
          items={[
            { label: 'Weigh-ins', color: colors.textSecondary, kind: 'dot' },
            { label: '7-day trend', color: colors.chartPrimary, kind: 'line' },
          ]}
        />
      </View>
    );
  }, [points, runs, trend, stats, colors, speak, formatValue, describePoint, longRange, today]);

  const remove = async (entry: BodyweightEntry) => {
    if (!(await succeeded(deleteEntry.mutateAsync(entry.id)))) return;
    toast.show({ message: 'Weigh-in deleted.' });
  };
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const confirmDelete = useCallback(
    (entry: BodyweightEntry) =>
      ActionSheetIOS.showActionSheetWithOptions(
        { title: formatShortDateYear(entry.date, today), options: ['Delete weigh-in', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme },
        (idx) => idx === 0 && removeRef.current(entry),
      ),
    [today, scheme],
  );
  const deleteNow = useCallback((entry: BodyweightEntry) => removeRef.current(entry), []);
  const renderItem = useCallback<ListRenderItem<WeighInRow>>(
    ({ item, index }) => <WeighInRowView row={item} first={index === 0} last={index === rows.length - 1} large={large} onLongPress={confirmDelete} onDelete={deleteNow} />,
    [rows.length, large, confirmDelete, deleteNow],
  );

  const failed = [bodyweight, preferences].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load your weigh-ins" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (bodyweight.isLoading || preferences.isLoading) {
    return (
      <View style={[styles.content, styles.header, readable]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        <View style={[styles.readout, styles.readoutSkeleton]}>
          <Skeleton width="40%" height={16} />
          <Skeleton width="45%" height={40} />
          <Skeleton width="35%" height={16} />
        </View>
        <RangeChips />
        <Skeleton height={280} radius={radius.card} />
      </View>
    );
  }

  const direction = change === undefined ? 'none' : deltaDirection(change, 'bodyweight');
  const header = (
    <View style={styles.header}>
      <View style={styles.readout}>
        <AppText variant="subhead" tone="secondary">
          {selected
            ? `Weigh-in · ${formatShortDateYear(selected.date, today)}`
            : latest
              ? `Latest · ${formatShortDateYear(latest.date, today)}`
              : entries.length
                ? 'No weigh-ins in this range'
                : 'No weigh-ins yet'}
        </AppText>
        <AppText variant="largeTitle" numeric>
          {shown ? formatMetric(shown.value, 'bodyweight', units) : '—'}
        </AppText>
        {shownTrend !== undefined && <AppText variant="footnote" tone="secondary" numeric>{`7-day trend ${formatMetric(shownTrend, 'bodyweight', units)}`}</AppText>}
        {!selected && change !== undefined && (
          <Change
            text={direction === 'none' ? 'Trend steady in range' : `${formatMetricDelta(change, 'bodyweight', units)} trend in range`}
            accessibilityLabel={direction === 'none' ? '7-day trend steady in range' : `7-day trend ${spokenMetricDelta(change, 'bodyweight', units)} in range`}
            direction={direction}
            neutral
          />
        )}
      </View>

      <RangeChips />

      <Card>
        {chart ??
          (entries.length ? (
            <EmptyState icon="scalemass" title="No weigh-ins in this range" message="Try a longer range, or log today's weight." />
          ) : (
            <EmptyState icon="scalemass" title="No weigh-ins yet" message="Your weigh-ins and a 7-day trend line show up here. Log your weight to add the first one." />
          ))}
      </Card>

      {stats && (
        <Card>
          <View style={large ? styles.statsStacked : styles.stats}>
            {(
              [
                ['Lowest', stats.low],
                ['Highest', stats.high],
                ['Average', stats.average],
              ] as const
            ).map(([label, value]) => (
              <Stat key={label} label={label} value={formatMetric(value, 'bodyweight', units)} spoken={`${label}: ${speak(value)}`} />
            ))}
          </View>
        </Card>
      )}

      <Button title="Log weight" icon="plus" fullWidth onPress={() => router.push('/log-weight')} />

      {rows.length > 0 && <SectionHeader title={`Weigh-ins · ${rows.length}`} />}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.entry.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.listHeader}
      contentContainerStyle={[styles.content, readable]}
      scrollEnabled={!scrubbing}
      initialNumToRender={12}
      windowSize={7}
    />
  );
}

/** One weigh-in in the log: tap to fix it, long-press (or the VoiceOver action) to delete it. */
const WeighInRowView = memo(function WeighInRowView({
  row,
  first,
  last,
  large,
  onLongPress,
  onDelete,
}: {
  row: WeighInRow;
  first: boolean;
  last: boolean;
  large: boolean;
  onLongPress: (entry: BodyweightEntry) => void;
  onDelete: (entry: BodyweightEntry) => void;
}) {
  const { colors } = useAppTheme();
  const deltaText = row.deltaText !== undefined && (
    <AppText variant="footnote" tone="secondary" numeric style={styles.shrink}>
      {row.deltaText}
    </AppText>
  );
  const valueText = (
    <AppText variant="body" weight="700" numeric style={large ? undefined : styles.value}>
      {row.valueText}
    </AppText>
  );
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/log-weight', params: { entry: row.entry.id } })}
      onLongPress={() => onLongPress(row.entry)}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint="Opens the weigh-in to edit it"
      accessibilityActions={[{ name: 'delete', label: 'Delete weigh-in' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete(row.entry)}
      style={({ pressed }) => [large ? styles.entryStacked : styles.entry, cardSegment(colors, first, last), pressed && { backgroundColor: colors.input }]}
    >
      {large ? (
        // Large text: the date on its own line, the weight and change under it.
        <>
          <View style={styles.entryTop}>
            <AppText variant="body" style={styles.flex}>
              {row.dateText}
            </AppText>
            <Icon name="chevron.right" color={colors.textTertiary} size={12} />
          </View>
          <View style={styles.entryLine}>
            {valueText}
            {deltaText}
          </View>
        </>
      ) : (
        <>
          <AppText variant="body" style={styles.flex}>
            {row.dateText}
          </AppText>
          {deltaText}
          {valueText}
          <Icon name="chevron.right" color={colors.textTertiary} size={12} />
        </>
      )}
    </Pressable>
  );
});

function Stat({ label, value, spoken }: { label: string; value: string; spoken: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={spoken}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" numeric>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },
  header: {
    gap: spacing.lg,
  },
  listHeader: {
    marginBottom: spacing.sm,
  },
  readout: {
    gap: 2,
    minHeight: 112,
  },
  readoutSkeleton: {
    gap: spacing.sm,
  },
  stack: {
    gap: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  // Large text: one stat per line, so long values don't wrap digit by digit.
  statsStacked: {
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryStacked: {
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.md,
  },
  value: {
    minWidth: 84,
    textAlign: 'right',
  },
  shrink: {
    flexShrink: 1,
  },
  flex: {
    flex: 1,
  },
});
