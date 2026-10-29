import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, memo, useCallback, useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, View, type SectionListRenderItem } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, ListRow, NotFoundState, PRBadge, ScreenSkeleton, SectionHeader } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { localDateOf } from '@/data/dates';
import { useExercises, useFormReports, usePreferences, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { Exercise, WorkoutSession } from '@/data/types';
import { formatMonthDayYear, formatShortDateYear, plural } from '@/lib/format';
import { reportAngle } from '@/features/home/goals';
import { cardSegment } from '@/features/progress/cardSegment';
import {
  exerciseRecords,
  hasPartialRepSets,
  historyMonths,
  historySessions,
  markLegend,
  recordRows,
  type HistoryMonth,
  type HistorySession,
} from '@/features/progress/exerciseHistory';
import { availabilityFromLogs } from '@/features/progress/metrics';
import { exerciseLogs, type ExerciseLog } from '@/features/progress/series';
import { loggedVariations } from '@/features/progress/variations';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

const NO_SESSIONS: WorkoutSession[] = [];
const NO_EXERCISES: Exercise[] = [];
const NO_LOGS: ExerciseLog[] = [];

/**
 * Everything logged for one exercise (spec 2.10): its records, its logged variations, and every
 * session's sets, newest first by month. The sessions are a virtualized list, so years of history
 * open quickly. Reopened workouts count as they were before the reopen.
 */
export default function ExerciseHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const sessionsQuery = useSessions();
  const exercisesQuery = useExercises();
  const preferences = usePreferences();
  const reportsQuery = useFormReports({ exerciseId: id });
  const units = (preferences.data ?? defaultPreferences).units;
  const sessions = sessionsQuery.data ?? NO_SESSIONS;
  const exercises = exercisesQuery.data ?? NO_EXERCISES;
  const exercisesById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const exercise = exercisesById.get(id);

  const logs = useMemo(() => exerciseLogs(sessions).get(id) ?? NO_LOGS, [sessions, id]);
  const model = useMemo(() => {
    if (!exercise) return undefined;
    const records = exerciseRecords(logs, exercise);
    const listed = historySessions(logs, exercise, units, today, records.bySession);
    return {
      records: recordRows(records.bests, units, today),
      months: historyMonths(listed),
      count: listed.length,
      legend: markLegend(logs),
      partials: hasPartialRepSets(logs),
      // "Open graph" opens on the first useful metric: e1RM, else the lift's own best.
      metric: availabilityFromLogs(exercise, logs).defaultMetric,
    };
  }, [logs, exercise, units, today]);
  const variations = useMemo(() => (exercise ? loggedVariations(id, exercisesById, sessions) : []), [exercise, id, exercisesById, sessions]);
  const reports = useMemo(() => [...(reportsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [reportsQuery.data]);

  const renderItem = useCallback<SectionListRenderItem<HistorySession, HistoryMonth>>(
    ({ item, index, section }) => <SessionRow item={item} first={index === 0} last={index === section.data.length - 1} />,
    [],
  );
  const renderSectionHeader = useCallback(({ section }: { section: HistoryMonth }) => <MonthHeader title={section.title} />, []);

  // Only the reads this screen uses; form recordings have their own error state below.
  const queries = [sessionsQuery, exercisesQuery, preferences];
  const failed = queries.filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this exercise" onRetry={() => failed.forEach((q) => q.refetch())} />;
  // Recordings too (a local read), so their section doesn't push the sessions down as it arrives.
  if (queries.some((q) => q.isLoading) || reportsQuery.isLoading) return <ScreenSkeleton />;
  if (!exercise || !model) return <NotFoundState thing="Exercise" icon="dumbbell" />;

  const header = (
    <View style={styles.header}>
      <RecordsCard rows={model.records} partials={model.partials} />

      <Button
        title="Open graph"
        variant="secondary"
        icon="chart.xyaxis.line"
        fullWidth
        onPress={() => router.push({ pathname: '/progress/graph', params: { exercise: id, metric: model.metric } })}
      />

      {variations.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Variations" />
          <Card padding="none">
            {variations.map((v, i) => (
              <ListRow
                key={v.exerciseId}
                title={v.exercise.name}
                subtitle={`${v.isBase ? 'Main movement · ' : ''}${plural(v.sessions, 'session')} · Last ${formatMonthDayYear(v.lastDate, today)}`}
                onPress={() => router.push({ pathname: '/progress/history', params: { id: v.exerciseId } })}
                accessibilityHint="Opens its history"
                separator={i < variations.length - 1}
              />
            ))}
          </Card>
        </View>
      )}

      {reportsQuery.error ? (
        <View style={styles.section}>
          <SectionHeader title="Form recordings" />
          <Card>
            <ErrorState title="Couldn't load your recordings" onRetry={() => reportsQuery.refetch()} />
          </Card>
        </View>
      ) : (
        reports.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={`Form recordings · ${reports.length}`} />
            <Card padding="none">
              {reports.map((r, i) => {
                const angle = reportAngle(r, r.primaryJoint);
                return (
                  <ListRow
                    key={r.id}
                    title={formatShortDateYear(localDateOf(r.createdAt), today)}
                    subtitle={`${angle !== undefined ? `${Math.round(angle)}° average ${r.primaryJoint} angle` : 'Analyzed'} · ${plural(r.detectedReps, 'rep')}${r.hasReplay ? '' : ' · video deleted'}`}
                    icon={r.hasReplay ? 'video.fill' : 'video.slash'}
                    onPress={() => router.push({ pathname: '/form/report', params: { id: r.id } })}
                    separator={i < reports.length - 1}
                  />
                );
              })}
            </Card>
          </View>
        )
      )}

      <View style={styles.section}>
        <SectionHeader title={`Sessions · ${model.count}`} />
        {model.legend && (
          <AppText variant="caption" tone="secondary" style={styles.legend}>
            {model.legend}
          </AppText>
        )}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: exercise.name }} />
      <SectionList
        sections={model.months}
        keyExtractor={(item) => item.sessionId}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Card style={styles.empty}>
            <EmptyState icon="clock" title="Not logged yet" message="Log a set of it in a workout and it shows up here." />
          </Card>
        }
        contentContainerStyle={[styles.content, readable]}
        initialNumToRender={10}
        windowSize={7}
      />
    </>
  );
}

/** The records card: the spec's records plus Most reps, each with the day it was set. */
function RecordsCard({ rows, partials }: { rows: ReturnType<typeof recordRows>; partials: boolean }) {
  const { colors } = useAppTheme();
  const { fontScale } = useTextScale();
  // The badge and the date crowd the record value out early, so record rows stack from XXXL.
  const stack = fontScale >= 1.3;
  return (
    <View style={styles.section}>
      <SectionHeader title="Personal records" />
      <Card padding="none">
        {rows.map((row, i) => {
          const value = (
            <AppText variant="subhead" weight="700" numeric style={stack ? styles.shrink : styles.flex}>
              {row.value}
            </AppText>
          );
          const date = (
            <AppText variant="footnote" tone="secondary" style={styles.shrink}>
              {row.dateText}
            </AppText>
          );
          return (
            <View
              key={row.type}
              accessible
              accessibilityLabel={row.accessibilityLabel}
              style={[stack ? styles.rowStacked : styles.row, i < rows.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <PRBadge label={row.label} />
              {stack ? (
                <View style={styles.wrapLine}>
                  {value}
                  {date}
                </View>
              ) : (
                <>
                  {value}
                  {date}
                </>
              )}
            </View>
          );
        })}
        {!rows.length && (
          <AppText variant="subhead" tone="secondary" style={styles.none}>
            Your bests show here once you log a working set.
          </AppText>
        )}
      </Card>
      {partials && (
        <AppText variant="footnote" tone="secondary" style={styles.legend}>
          Partial-rep sets don’t count toward records.
        </AppText>
      )}
    </View>
  );
}

function MonthHeader({ title }: { title: string }) {
  return (
    <AppText variant="footnote" weight="700" tone="secondary" accessibilityRole="header" style={styles.month}>
      {title}
    </AppText>
  );
}

/** One session: its date and name, every set (warm-ups dimmed, markers after), and its best set. */
const SessionRow = memo(function SessionRow({ item, first, last }: { item: HistorySession; first: boolean; last: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/summary', params: { session: item.sessionId } })}
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      accessibilityHint="Opens the workout summary"
      style={({ pressed }) => [styles.session, cardSegment(colors, first, last), pressed && { backgroundColor: colors.input }]}
    >
      <View style={styles.sessionTop}>
        <AppText variant="subhead" weight="700" style={styles.flex}>
          {item.title}
        </AppText>
        {item.records.length > 0 && <Icon name="star.fill" color={colors.prOnSurface} size={13} />}
        <Icon name="chevron.right" color={colors.textTertiary} size={12} />
      </View>
      <AppText variant="footnote" tone="secondary" numeric>
        {item.sets.map((s, i) => (
          <Fragment key={i}>
            {i > 0 ? '  ·  ' : ''}
            <AppText variant="footnote" tone={s.warmup ? 'tertiary' : 'secondary'} numeric>
              {s.text}
              {s.mark ? (
                <AppText variant="caption" weight="700" tone={s.warmup ? 'tertiary' : 'accent'}>
                  {s.mark}
                </AppText>
              ) : null}
            </AppText>
          </Fragment>
        ))}
      </AppText>
      {item.best && (
        <AppText variant="caption" tone="secondary" numeric>
          {item.best}
        </AppText>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
  },
  header: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  legend: {
    paddingHorizontal: spacing.xs,
  },
  empty: {
    marginTop: spacing.sm,
  },
  month: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // From XXXL: the badge on its own line, the value and date under it.
  rowStacked: {
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  wrapLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.md,
    rowGap: 2,
  },
  shrink: {
    flexShrink: 1,
  },
  session: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
  },
  sessionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  none: {
    padding: spacing.lg,
  },
});
