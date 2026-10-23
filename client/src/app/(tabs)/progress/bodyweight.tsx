import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/LineChart';
import { AppText, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '@/components/ui';
import { succeeded, useBodyweight, useDeleteBodyweight } from '@/data/hooks';
import type { BodyweightEntry } from '@/data/types';
import { formatLongDate, formatShortDate, plural } from '@/lib/format';
import { Change, Legend, RangeChips } from '@/features/progress/ProgressParts';
import { bodyweightSeries, describeTrend, toDisplay, type Point } from '@/features/progress/series';
import { formatMetric, formatMetricDelta, spokenMetric, spokenMetricDelta, useProgressData } from '@/features/progress/useProgressData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

/** Bodyweight (spec 2.10): weigh-ins as dots plus a 7-day trend line (user's pick), and the log. */
export default function BodyweightScreen() {
  const { colors, scheme } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const data = useProgressData();
  const bodyweight = useBodyweight();
  const deleteEntry = useDeleteBodyweight();
  const [selected, setSelected] = useState<Point | undefined>();
  const [scrubbing, setScrubbing] = useState(false);

  const display = (p: Point) => ({ ...p, value: toDisplay(p.value, 'bodyweight', data.units) });
  const { points: raw, trend: rawTrend } = bodyweightSeries(data.bodyweight, data.from);
  const points = raw.map(display);
  const trend = rawTrend.map(display);
  const latest = points[points.length - 1];
  const shown = selected ?? latest;
  const trendAt = (date: string) => trend.find((t) => t.date === date)?.value;
  const change = trend.length > 1 ? trend[trend.length - 1].value - trend[0].value : undefined;
  const values = points.map((p) => p.value);

  const entries = [...data.bodyweight].sort((a, b) => b.date.localeCompare(a.date));
  const speak = (v: number) => spokenMetric(v, 'bodyweight', data.units);
  const spokenPoint = (p: Point) => {
    const t = trendAt(p.date);
    return `${formatLongDate(p.date)}: ${speak(p.value)}${t !== undefined ? `, 7-day trend ${speak(t)}` : ''}`;
  };
  const chartLabel = latest
    ? `Bodyweight, ${plural(points.length, 'weigh-in')}. Latest ${speak(latest.value)}, lowest ${speak(Math.min(...values))}, highest ${speak(Math.max(...values))}. 7-day trend ${describeTrend(trend, speak, 'weigh-in')}. Every entry is listed below.`
    : 'Bodyweight chart';

  const remove = async (entry: BodyweightEntry) => {
    if (!(await succeeded(deleteEntry.mutateAsync(entry.id)))) return;
    toast.show({ message: 'Weigh-in deleted.' });
  };

  if (bodyweight.error) return <ErrorState fill title="Couldn't load your weigh-ins" onRetry={() => bodyweight.refetch()} />;
  if (bodyweight.isLoading) {
    return (
      <View style={[styles.content, readable]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
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

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} scrollEnabled={!scrubbing}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <AppText variant="subhead" tone="secondary">
          {selected ? `Weigh-in · ${formatShortDate(selected.date)}` : latest ? `Latest · ${formatShortDate(latest.date)}` : entries.length ? 'No weigh-ins in this range' : 'No weigh-ins yet'}
        </AppText>
        <AppText variant="largeTitle" numeric>
          {shown ? formatMetric(shown.value, 'bodyweight', data.units) : '—'}
        </AppText>
        {shown && trendAt(shown.date) !== undefined && (
          <AppText variant="footnote" tone="secondary" numeric>{`7-day trend ${formatMetric(trendAt(shown.date)!, 'bodyweight', data.units)}`}</AppText>
        )}
        {!selected && change !== undefined && (
          <Change
            text={`${formatMetricDelta(change, 'bodyweight', data.units)} trend in range`}
            accessibilityLabel={`7-day trend ${spokenMetricDelta(change, 'bodyweight', data.units)} in range`}
            delta={change}
            neutral
          />
        )}
      </View>

      <RangeChips />

      <Card>
        {points.length ? (
          <View style={styles.stack}>
            <LineChart
              series={[
                // Raw weigh-ins in grey so the blue trend line carries the story (and pale blue fails on white).
                { key: 'weighins', label: 'Weigh-ins', color: colors.textSecondary, points, style: 'dots' },
                { key: 'trend', label: '7-day trend', color: colors.chartPrimary, points: trend, style: 'line' },
              ]}
              primaryKey="weighins"
              formatValue={(v) => formatMetric(v, 'bodyweight', data.units, false)}
              onSelect={setSelected}
              onScrubbingChange={setScrubbing}
              label={chartLabel}
              describePoint={spokenPoint}
              accessibilityHint="Swipe up or down to step through weigh-ins."
            />
            <Legend
              items={[
                { label: 'Weigh-ins', color: colors.textSecondary, kind: 'dot' },
                { label: '7-day trend', color: colors.chartPrimary, kind: 'line' },
              ]}
            />
          </View>
        ) : entries.length ? (
          <EmptyState icon="scalemass" title="No weigh-ins in this range" message="Try a longer range, or log today's weight." />
        ) : (
          <EmptyState icon="scalemass" title="No weigh-ins yet" message="Your weigh-ins and a 7-day trend line show up here. Log your weight to add the first one." />
        )}
      </Card>

      {values.length > 0 && (
        <Card>
          <View style={large ? styles.statsStacked : styles.stats}>
            {(
              [
                ['Lowest', Math.min(...values)],
                ['Highest', Math.max(...values)],
                ['Average', values.reduce((a, b) => a + b, 0) / values.length],
              ] as const
            ).map(([label, value]) => (
              <Stat key={label} label={label} value={formatMetric(value, 'bodyweight', data.units)} spoken={`${label}: ${speak(value)}`} />
            ))}
          </View>
        </Card>
      )}

      <Button title="Log weight" icon="plus" fullWidth onPress={() => router.push('/log-weight')} />

      {entries.length > 0 && (
        <Card padding="none">
          {entries.map((entry, i) => {
            const previous = entries[i + 1];
            const value = toDisplay(entry.weightKg, 'bodyweight', data.units);
            const delta = previous ? value - toDisplay(previous.weightKg, 'bodyweight', data.units) : undefined;
            const deltaText = delta !== undefined && (
              <AppText variant="footnote" tone="secondary" numeric style={styles.shrink}>
                {formatMetricDelta(delta, 'bodyweight', data.units)}
              </AppText>
            );
            const valueText = (
              <AppText variant="body" weight="700" numeric style={large ? undefined : styles.value}>
                {formatMetric(value, 'bodyweight', data.units)}
              </AppText>
            );
            return (
              <Pressable
                key={entry.id}
                onLongPress={() =>
                  ActionSheetIOS.showActionSheetWithOptions(
                    { title: formatShortDate(entry.date), options: ['Delete weigh-in', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme },
                    (idx) => idx === 0 && remove(entry),
                  )
                }
                accessibilityLabel={`${formatLongDate(entry.date)}: ${speak(value)}${delta !== undefined ? `, ${spokenMetricDelta(delta, 'bodyweight', data.units)} from the previous weigh-in` : ''}`}
                accessibilityActions={[{ name: 'delete', label: 'Delete weigh-in' }]}
                onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && remove(entry)}
                style={[large ? styles.entryStacked : styles.entry, i < entries.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <AppText variant="body" style={large ? undefined : styles.flex}>
                  {formatShortDate(entry.date)}
                </AppText>
                {large ? (
                  // Large text: the date on its own line, the weight and change under it.
                  <View style={styles.entryLine}>
                    {valueText}
                    {deltaText}
                  </View>
                ) : (
                  <>
                    {deltaText}
                    {valueText}
                  </>
                )}
              </Pressable>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

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
    gap: spacing.lg,
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
