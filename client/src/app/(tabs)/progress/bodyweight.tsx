import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/LineChart';
import { AppText, Button, Card, EmptyState, useToast } from '@/components/ui';
import { useDeleteBodyweight } from '@/data/hooks';
import { formatShortDate, plural } from '@/lib/format';
import { Change, Legend, RangeChips } from '@/features/progress/ProgressParts';
import { bodyweightSeries, toDisplay, type Point } from '@/features/progress/series';
import { formatMetric, formatMetricDelta, useProgressData } from '@/features/progress/useProgressData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Bodyweight (spec 2.10): weigh-ins as dots plus a 7-day trend line (user's pick), and the log. */
export default function BodyweightScreen() {
  const { colors, scheme } = useAppTheme();
  const toast = useToast();
  const data = useProgressData();
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

  return (
    <ScrollView contentContainerStyle={styles.content} scrollEnabled={!scrubbing}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <AppText variant="subhead" tone="secondary">
          {selected ? `Weigh-in · ${formatShortDate(selected.date)}` : latest ? `Latest · ${formatShortDate(latest.date)}` : 'No weigh-ins yet'}
        </AppText>
        <AppText variant="largeTitle" numeric>
          {shown ? formatMetric(shown.value, 'bodyweight', data.units) : '—'}
        </AppText>
        {shown && trendAt(shown.date) !== undefined && (
          <AppText variant="footnote" tone="secondary" numeric>{`7-day trend ${formatMetric(trendAt(shown.date)!, 'bodyweight', data.units)}`}</AppText>
        )}
        {!selected && change !== undefined && <Change text={`${formatMetricDelta(change, 'bodyweight', data.units)} trend in range`} delta={change} neutral />}
      </View>

      <RangeChips />

      <Card>
        {points.length ? (
          <View style={styles.stack}>
            <LineChart
              series={[
                { key: 'weighins', label: 'Weigh-ins', color: colors.chartCompare[2], points, style: 'dots' },
                { key: 'trend', label: '7-day trend', color: colors.chartPrimary, points: trend, style: 'line' },
              ]}
              primaryKey="weighins"
              formatValue={(v) => formatMetric(v, 'bodyweight', data.units, false)}
              onSelect={setSelected}
              onScrubbingChange={setScrubbing}
              label={`Bodyweight, ${plural(points.length, 'weigh-in')}. Every entry is listed below.`}
            />
            <Legend
              items={[
                { label: 'Weigh-ins', color: colors.chartCompare[2], kind: 'dot' },
                { label: '7-day trend', color: colors.chartPrimary, kind: 'line' },
              ]}
            />
          </View>
        ) : (
          <EmptyState icon="scalemass" title="No weigh-ins in this range" message="Log your weight to start a trend." />
        )}
      </Card>

      {values.length > 0 && (
        <Card>
          <View style={styles.stats}>
            <Stat label="Lowest" value={formatMetric(Math.min(...values), 'bodyweight', data.units)} />
            <Stat label="Highest" value={formatMetric(Math.max(...values), 'bodyweight', data.units)} />
            <Stat label="Average" value={formatMetric(values.reduce((a, b) => a + b, 0) / values.length, 'bodyweight', data.units)} />
          </View>
        </Card>
      )}

      <Button title="Log weight" icon="plus" fullWidth onPress={() => router.push('/log-weight')} />

      <Card padding="none">
        {entries.map((entry, i) => {
          const previous = entries[i + 1];
          const value = toDisplay(entry.weightKg, 'bodyweight', data.units);
          const delta = previous ? value - toDisplay(previous.weightKg, 'bodyweight', data.units) : undefined;
          return (
            <Pressable
              key={entry.id}
              onLongPress={() =>
                ActionSheetIOS.showActionSheetWithOptions(
                  { title: formatShortDate(entry.date), options: ['Delete weigh-in', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme },
                  async (idx) => {
                    if (idx !== 0) return;
                    await deleteEntry.mutateAsync(entry.id);
                    toast.show({ message: 'Weigh-in deleted.' });
                  },
                )
              }
              accessibilityHint="Long press to delete"
              style={[styles.entry, i < entries.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <AppText variant="body" style={styles.flex}>
                {formatShortDate(entry.date)}
              </AppText>
              {delta !== undefined && (
                <AppText variant="footnote" tone="secondary" numeric>
                  {formatMetricDelta(delta, 'bodyweight', data.units)}
                </AppText>
              )}
              <AppText variant="body" weight="700" numeric style={styles.value}>
                {formatMetric(value, 'bodyweight', data.units)}
              </AppText>
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
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
  stack: {
    gap: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
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
  value: {
    minWidth: 84,
    textAlign: 'right',
  },
  flex: {
    flex: 1,
  },
});
