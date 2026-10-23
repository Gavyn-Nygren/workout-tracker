import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, ListRow, NotFoundState, PRBadge, ScreenSkeleton, SectionHeader } from '@/components/ui';
import { useExercises, useFormReports, usePersonalRecords, useSessions } from '@/data/hooks';
import { countsForPRs } from '@/data/calculations';
import type { LoggedSet, PRType } from '@/data/types';
import { spokenDuration } from '@/hooks/useNow';
import { formatLoad, formatLoadValue, formatLongDate, formatShortDate, plural } from '@/lib/format';
import { reportAngle } from '@/features/home/goals';
import { useProgressData } from '@/features/progress/useProgressData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

const RECORD_ROWS: { type: PRType; label: string; spoken: string }[] = [
  { type: 'heaviest_weight', label: 'Heaviest weight', spoken: 'Heaviest weight' },
  { type: 'e1rm', label: 'Est. 1RM', spoken: 'Estimated one-rep max' },
  { type: 'volume', label: 'Best session volume', spoken: 'Best session volume' },
  { type: 'longest_hold', label: 'Longest hold', spoken: 'Longest hold' },
];

/** Everything logged for one exercise: personal records and every session's sets. */
export default function ExerciseHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const { fontScale } = useTextScale();
  // The badge and the date crowd the record value out early, so record rows stack from XXXL.
  const stackRecords = fontScale >= 1.3;
  const data = useProgressData();
  // Same queries as useProgressData (shared cache), read here for their loading and error state.
  const sessionsQuery = useSessions();
  const exercisesQuery = useExercises();
  const recordsQuery = usePersonalRecords();
  const exercise = data.exercisesById.get(id);

  const sessions = useMemo(
    () =>
      data.sessions
        .filter((s) => s.status === 'completed' && s.completedDate)
        .map((s) => ({ session: s, sets: s.blocks.flatMap((b) => b.exercises).filter((e) => e.exerciseId === id && !e.skipped).flatMap((e) => e.sets).filter((x) => x.completedAt) }))
        .filter((x) => x.sets.length)
        .sort((a, b) => (b.session.completedAt ?? '').localeCompare(a.session.completedAt ?? '')),
    [data.sessions, id],
  );

  const reportsQuery = useFormReports({ exerciseId: id });
  const reports = [...(reportsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const records = data.records.filter((r) => r.exerciseId === id);
  const best = (type: PRType) => records.filter((r) => r.type === type).sort((a, b) => b.value - a.value)[0];
  const prSessions = new Set(records.map((r) => r.sessionId));

  const queries = [sessionsQuery, exercisesQuery, recordsQuery, reportsQuery];
  const failed = queries.filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this exercise" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (queries.some((q) => q.isLoading)) return <ScreenSkeleton />;
  if (!exercise) return <NotFoundState thing="Exercise" icon="dumbbell" />;

  const setText = (s: LoggedSet) => {
    if (s.kind === 'timed_hold') return `${s.durationSec ?? 0} s`;
    const load = exercise.isBodyweight ? (s.addedLoadKg ? `+${formatLoadValue(s.addedLoadKg, data.units)}` : 'BW') : formatLoadValue(s.loadKg ?? 0, data.units);
    return `${load}×${s.reps ?? 0}${s.kind === 'warmup' ? 'w' : ''}`;
  };

  // VoiceOver versions: "185 pounds for 5 reps", and repeats read once with a count.
  const unitWord = data.units === 'imperial' ? 'pounds' : 'kilograms';
  const spokenLoad = (kg: number) => `${formatLoadValue(kg, data.units)} ${unitWord}`;
  const spokenSet = (s: LoggedSet) => {
    if (s.kind === 'timed_hold') return `a ${spokenDuration(s.durationSec ?? 0)} hold`;
    const load = exercise.isBodyweight ? (s.addedLoadKg ? `bodyweight plus ${spokenLoad(s.addedLoadKg)}` : 'bodyweight') : spokenLoad(s.loadKg ?? 0);
    return `${load} for ${plural(s.reps ?? 0, 'rep')}`;
  };
  const spokenSets = (sets: LoggedSet[]) => {
    const groups: { text: string; count: number }[] = [];
    for (const text of sets.map(spokenSet)) {
      const last = groups[groups.length - 1];
      if (last?.text === text) last.count += 1;
      else groups.push({ text, count: 1 });
    }
    return groups.map((g) => (g.count > 1 ? `${g.count} sets of ${g.text}` : g.text)).join(', ');
  };

  return (
    <>
      <Stack.Screen options={{ title: exercise.name }} />
      <ScrollView contentContainerStyle={[styles.content, readable]}>
        <View style={styles.section}>
          <SectionHeader title="Personal records" />
          <Card padding="none">
            {RECORD_ROWS.filter((row) => best(row.type)).map((row, i, arr) => {
              const r = best(row.type)!;
              const hold = row.type === 'longest_hold';
              const value = (
                <AppText variant="subhead" weight="700" numeric style={stackRecords ? styles.shrink : styles.flex}>
                  {hold ? `${r.value} s` : formatLoad(r.value, data.units)}
                </AppText>
              );
              const date = (
                <AppText variant="footnote" tone="secondary" style={styles.shrink}>
                  {formatShortDate(r.achievedDate)}
                </AppText>
              );
              return (
                <View
                  key={row.type}
                  accessible
                  accessibilityLabel={`${row.spoken}: ${hold ? spokenDuration(r.value) : spokenLoad(r.value)}, ${formatLongDate(r.achievedDate)}`}
                  style={[stackRecords ? styles.rowStacked : styles.row, i < arr.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                >
                  <PRBadge label={row.label} />
                  {stackRecords ? (
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
            {!records.length && (
              <AppText variant="subhead" tone="secondary" style={styles.none}>
                Records appear after you beat your first logged session.
              </AppText>
            )}
          </Card>
        </View>

        <Button title="Open graph" variant="secondary" icon="chart.xyaxis.line" fullWidth onPress={() => router.push({ pathname: '/progress/graph', params: { exercise: id, metric: 'e1rm' } })} />

        {reports.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={`Form recordings · ${reports.length}`} />
            <Card padding="none">
              {reports.map((r, i) => {
                const angle = reportAngle(r, r.primaryJoint);
                return (
                  <ListRow
                    key={r.id}
                    title={formatShortDate(r.createdAt.slice(0, 10))}
                    subtitle={`${angle !== undefined ? `${Math.round(angle)}° average ${r.primaryJoint} angle` : 'Analyzed'} · ${r.detectedReps} reps${r.hasReplay ? '' : ' · video deleted'}`}
                    icon={r.hasReplay ? 'video.fill' : 'video.slash'}
                    onPress={() => router.push({ pathname: '/form/report', params: { id: r.id } })}
                    separator={i < reports.length - 1}
                  />
                );
              })}
            </Card>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title={`Sessions · ${sessions.length}`} />
          <Card padding="none">
            {sessions.map(({ session, sets }, i) => {
              const working = sets.filter((s) => s.kind !== 'warmup');
              const top = working.filter(countsForPRs).sort((a, b) => (b.loadKg ?? b.addedLoadKg ?? 0) - (a.loadKg ?? a.addedLoadKg ?? 0))[0];
              const pr = prSessions.has(session.id);
              return (
                <Pressable
                  key={session.id}
                  onPress={() => router.push({ pathname: '/summary', params: { session: session.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatLongDate(session.completedDate!)}, ${session.name}${pr ? ', personal record' : ''}. ${plural(working.length, 'set')}: ${spokenSets(working)}.`}
                  accessibilityHint="Opens the workout summary"
                  style={({ pressed }) => [styles.session, i < sessions.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.input }]}
                >
                  <View style={styles.sessionTop}>
                    <AppText variant="subhead" weight="700" style={styles.flex}>
                      {`${formatShortDate(session.completedDate!)} · ${session.name}`}
                    </AppText>
                    {pr && <Icon name="star.fill" color={colors.prOnSurface} size={13} />}
                    <Icon name="chevron.right" color={colors.textTertiary} size={12} />
                  </View>
                  <AppText variant="footnote" tone="secondary" numeric>
                    {working.map(setText).join('  ·  ')}
                  </AppText>
                  {top && !exercise.isBodyweight && top.kind !== 'timed_hold' && (
                    <AppText variant="caption" tone="secondary" numeric>
                      {`Top set ${formatLoad(top.loadKg ?? 0, data.units)} × ${top.reps}`}
                    </AppText>
                  )}
                </Pressable>
              );
            })}
            {!sessions.length && <EmptyState icon="clock" title="Not logged yet" message="Log a set of it in a workout and it shows up here." />}
          </Card>
        </View>
      </ScrollView>
    </>
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
