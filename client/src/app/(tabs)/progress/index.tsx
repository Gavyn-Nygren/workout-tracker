import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Sparkline } from '@/components/charts/Sparkline';
import { AppText, Button, Card, EmptyState, Icon, ListRow, SectionHeader, Skeleton } from '@/components/ui';
import { addDays } from '@/data/dates';
import { formatMonthDay, formatShortDate, plural } from '@/lib/format';
import { Change, RangeChips } from '@/features/progress/ProgressParts';
import { graphsStore, pinnedStore, removeGraph, togglePinned } from '@/features/progress/progressPrefs';
import { bodyweightSeries, changeOverTime, exerciseSeries, metricShort, mostFrequent, toDisplay, type Metric } from '@/features/progress/series';
import { formatMetric, formatMetricDelta, useProgressData } from '@/features/progress/useProgressData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { Columns, dashboard } from '@/theme/layout';
import { spacing } from '@/theme/tokens';

const KEY_LIMIT = 6;

/**
 * Progress (roadmap G2.6), one scrolling page (user's pick): range, key exercises, your graphs,
 * bodyweight, and every exercise's history.
 */
export default function ProgressScreen() {
  const { colors, scheme } = useAppTheme();
  const data = useProgressData();
  const pinned = pinnedStore.use();
  const graphs = graphsStore.use();

  const keyIds = useMemo(() => {
    const frequent = mostFrequent(data.sessions, addDays(data.today, -56), new Set(pinned), KEY_LIMIT, data.exercisesById);
    return [...pinned, ...frequent].slice(0, KEY_LIMIT);
  }, [data.sessions, data.today, pinned, data.exercisesById]);

  const logged = useMemo(() => {
    const last = new Map<string, { date: string; count: number }>();
    for (const s of data.sessions) {
      if (s.status !== 'completed' || !s.completedDate) continue;
      for (const id of new Set(s.blocks.flatMap((b) => b.exercises).filter((e) => !e.skipped && e.sets.some((x) => x.completedAt)).map((e) => e.exerciseId))) {
        const prev = last.get(id);
        last.set(id, { date: !prev || s.completedDate > prev.date ? s.completedDate : prev.date, count: (prev?.count ?? 0) + 1 });
      }
    }
    return [...last].sort((a, b) => b[1].date.localeCompare(a[1].date));
  }, [data.sessions]);

  if (data.isLoading) {
    return (
      <View style={[styles.content, dashboard]}>
        <Skeleton height={36} radius={18} />
        <Skeleton height={96} radius={16} />
        <Skeleton height={96} radius={16} />
      </View>
    );
  }

  const series = (exerciseId: string, metric: Metric) =>
    exerciseSeries({ exerciseId, metric, sessions: data.sessions, exercisesById: data.exercisesById, from: data.from }).map((p) => ({ ...p, value: toDisplay(p.value, metric, data.units) }));
  const name = (id: string) => data.exercisesById.get(id)?.name ?? 'Exercise';
  const bw = bodyweightSeries(data.bodyweight, data.from);
  const bwTrend = bw.trend.map((p) => ({ ...p, value: toDisplay(p.value, 'bodyweight', data.units) }));
  const bwChange = bwTrend.length > 1 ? bwTrend[bwTrend.length - 1].value - bwTrend[0].value : undefined;

  const keyMenu = (exerciseId: string) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: name(exerciseId), options: [pinned.includes(exerciseId) ? 'Unpin from Key exercises' : 'Pin to Key exercises', 'View history', 'Cancel'], cancelButtonIndex: 2, userInterfaceStyle: scheme },
      (i) => {
        if (i === 0) togglePinned(exerciseId);
        if (i === 1) router.push({ pathname: '/progress/history', params: { id: exerciseId } });
      },
    );

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]}>
      <RangeChips />

      {/* iPad: key exercises on the left; graphs, bodyweight, and the exercise list on the right. */}
      <Columns
        left={
          <View style={styles.section}>
            <SectionHeader title="Key exercises · e1RM" />
            {keyIds.map((id) => {
              const points = series(id, 'e1rm');
              const latest = points[points.length - 1];
              const change = changeOverTime(points);
              return (
                <Pressable
                  key={id}
                  onPress={() => router.push({ pathname: '/progress/graph', params: { exercise: id, metric: 'e1rm' } })}
                  onLongPress={() => keyMenu(id)}
                  accessibilityRole="button"
                  accessibilityHint="Opens the full graph. Long press to pin or unpin."
                >
                  {({ pressed }) => (
                    <Card style={{ opacity: pressed ? 0.85 : 1 }}>
                      <View style={styles.keyRow}>
                        <View style={styles.keyText}>
                          <View style={styles.inline}>
                            {pinned.includes(id) && <Icon name="pin.fill" color={colors.accentText} size={11} />}
                            <AppText variant="subhead" weight="700" numberOfLines={1} style={styles.flex}>
                              {name(id)}
                            </AppText>
                          </View>
                          <AppText variant="title2" numeric>
                            {latest ? formatMetric(latest.value, 'e1rm', data.units) : '—'}
                          </AppText>
                          {change ? (
                            <Change text={`${formatMetricDelta(change.delta, 'e1rm', data.units)} since ${formatMonthDay(change.since)}`} delta={change.delta} />
                          ) : (
                            <AppText variant="footnote" tone="secondary">
                              {points.length ? 'Not enough sessions in range' : 'No sets in this range'}
                            </AppText>
                          )}
                        </View>
                        <View style={styles.spark}>
                          {points.length > 0 && <Sparkline points={points} height={64} label={`${name(id)} e1RM over ${plural(points.length, 'session')}`} />}
                        </View>
                      </View>
                    </Card>
                  )}
                </Pressable>
              );
            })}
            {!keyIds.length && (
              <Card>
                <EmptyState icon="chart.line.uptrend.xyaxis" title="Nothing to chart yet" message="Finish a few workouts and your most-trained lifts appear here." />
              </Card>
            )}
          </View>
        }
        right={
          <>
            <View style={styles.section}>
              <SectionHeader title="Your graphs" actionLabel="New" onAction={() => router.push('/graph-builder')} />
              <Card padding="none">
                {graphs.map((g, i) => {
                  const points = series(g.exerciseId, g.metric);
                  const latest = points[points.length - 1];
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => router.push({ pathname: '/progress/graph', params: { graph: g.id } })}
                      onLongPress={() =>
                        ActionSheetIOS.showActionSheetWithOptions(
                          { title: `${name(g.exerciseId)} · ${metricShort(g.metric)}`, options: ['Remove graph', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme },
                          (idx) => idx === 0 && removeGraph(g.id),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityHint="Opens the graph. Long press to remove it."
                      style={({ pressed }) => [styles.graphRow, i < graphs.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.input }]}
                    >
                      <View style={styles.flex}>
                        <AppText variant="subhead" weight="700" numberOfLines={1}>{`${name(g.exerciseId)} · ${metricShort(g.metric)}`}</AppText>
                        <AppText variant="footnote" tone="secondary" numeric>
                          {latest ? `${formatMetric(latest.value, g.metric, data.units)} · ${formatShortDate(latest.date)}` : 'No sets in this range'}
                        </AppText>
                      </View>
                      <View style={styles.miniSpark}>{points.length > 0 && <Sparkline points={points} height={36} label={`${name(g.exerciseId)} ${metricShort(g.metric)}`} />}</View>
                      <Icon name="chevron.right" color={colors.textTertiary} size={13} />
                    </Pressable>
                  );
                })}
                {!graphs.length && <EmptyState icon="plus.forwardslash.minus" title="No custom graphs" message="Build one: pick an exercise and a metric like volume or reps." actionLabel="New graph" onAction={() => router.push('/graph-builder')} />}
              </Card>
            </View>

            <View style={styles.section}>
              <SectionHeader title="Bodyweight" actionLabel="Log" onAction={() => router.push('/log-weight')} />
              <Pressable onPress={() => router.push('/progress/bodyweight')} accessibilityRole="button" accessibilityHint="Opens your bodyweight log">
                {({ pressed }) => (
                  <Card style={{ opacity: pressed ? 0.85 : 1 }}>
                    <View style={styles.keyRow}>
                      <View style={styles.keyText}>
                        <AppText variant="subhead" weight="700">
                          7-day trend
                        </AppText>
                        <AppText variant="title2" numeric>
                          {bwTrend.length ? formatMetric(bwTrend[bwTrend.length - 1].value, 'bodyweight', data.units) : '—'}
                        </AppText>
                        {bwChange !== undefined && <Change text={`${formatMetricDelta(bwChange, 'bodyweight', data.units)} in range`} delta={bwChange} neutral />}
                      </View>
                      <View style={styles.spark}>{bwTrend.length > 0 && <Sparkline points={bwTrend} height={64} label="Bodyweight trend" />}</View>
                    </View>
                  </Card>
                )}
              </Pressable>
            </View>

            <View style={styles.section}>
              <SectionHeader title={`All exercises · ${logged.length}`} />
              <Card padding="none">
                {logged.map(([id, info], i) => (
                  <ListRow
                    key={id}
                    title={name(id)}
                    subtitle={`${plural(info.count, 'session')} · last ${formatShortDate(info.date)}`}
                    onPress={() => router.push({ pathname: '/progress/history', params: { id } })}
                    separator={i < logged.length - 1}
                  />
                ))}
              </Card>
            </View>

            <Button title="Log bodyweight" variant="secondary" icon="scalemass" fullWidth onPress={() => router.push('/log-weight')} />
          </>
        }
      />
    </ScrollView>
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
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  keyText: {
    width: '46%',
    gap: 2,
  },
  spark: {
    flex: 1,
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
