import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Card, EmptyState, SectionHeader, Skeleton } from '@/components/ui';
import type { ISODate } from '@/data/types';
import { ComingUp } from '@/features/today/ComingUp';
import { MissedBanner } from '@/features/today/MissedBanner';
import { RestDayCard } from '@/features/today/RestDayCard';
import { useAgenda } from '@/features/today/useAgenda';
import { WeekStrip } from '@/features/today/WeekStrip';
import { WorkoutCard } from '@/features/today/WorkoutCard';
import { WorkoutPager } from '@/features/today/WorkoutPager';
import { latestMissed, summarizeSession, type Agenda, type DayItem } from '@/features/today/agenda';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { formatMonthDay, formatShortDate, formatWeekday } from '@/lib/format';
import { Columns, dashboard } from '@/theme/layout';
import { spacing } from '@/theme/tokens';

function headerTitle(date: ISODate, items: DayItem[]): string {
  const day = formatWeekday(date).toUpperCase();
  if (!items.length) return `${day} · REST DAY`;
  const more = items.length > 1 ? ` +${items.length - 1}` : '';
  return `${day} · ${items[0].name.toUpperCase()}${more}`;
}

function upcoming(agenda: Agenda, after: ISODate, limit: number): DayItem[] {
  return [...agenda.entries()]
    .filter(([date]) => date > after)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, items]) => items.filter((i) => i.status === 'planned'))
    .slice(0, limit);
}

export default function TodayScreen() {
  const navigation = useNavigation();
  const { today, range, agenda, exercisesById, records, units, isLoading, error, retry } = useAgenda();
  const active = useActiveWorkout();
  const [selected, setSelected] = useState<ISODate>(today);

  // The workout in progress shows as "In progress" with a Resume button.
  const activeSession = active.workout?.session;
  const items = useMemo(
    () =>
      (agenda.get(selected) ?? []).map((item) =>
        activeSession &&
        ((item.occurrence && activeSession.occurrenceId === item.occurrence.id) || (active.workout?.mode === 'reopen' && item.session?.id === activeSession.id))
          ? { ...item, status: 'in_progress' as const }
          : item,
      ),
    [agenda, selected, activeSession, active.workout?.mode],
  );
  const missed = useMemo(() => latestMissed(agenda, today), [agenda, today]);
  const coming = useMemo(() => upcoming(agenda, selected < today ? today : selected, 3), [agenda, selected, today]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isLoading ? 'TODAY' : headerTitle(selected, items) });
  }, [navigation, selected, items, isLoading]);

  /** Only one workout runs at a time; offer to resume or discard the current one first. */
  const begin = (item: DayItem, start: () => void) => {
    if (item.status === 'in_progress' || !activeSession) {
      if (item.status !== 'in_progress') start();
      router.push('/workout');
      return;
    }
    Alert.alert(`${activeSession.name} is still in progress`, 'Finish or discard it before starting another workout.', [
      { text: `Resume ${activeSession.name}`, onPress: () => router.push('/workout') },
      {
        text: 'Discard it and start',
        style: 'destructive',
        onPress: () => {
          active.end();
          start();
          router.push('/workout');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (error) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="exclamationmark.triangle"
          title="Couldn't load your schedule"
          message="Your workouts are still saved on this phone. Try again."
          actionLabel="Try again"
          onAction={retry}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]} contentInsetAdjustmentBehavior="automatic">
      <WeekStrip agenda={agenda} today={today} selected={selected} onSelect={setSelected} range={range} />

      {isLoading ? (
        <View style={styles.gutter}>
          <Card>
            <View style={styles.skeleton}>
              <Skeleton width="40%" />
              <Skeleton width="70%" height={28} />
              <Skeleton height={12} />
              <Skeleton width="85%" height={12} />
            </View>
          </Card>
        </View>
      ) : (
        // iPad: the day's workouts on the left, Coming up beside them. Each section keeps its own gutter.
        <Columns
          gap={spacing.lg}
          columnGap={0}
          leftFlex={1.4}
          left={
            <>
              {selected === today && missed && (
                <View style={styles.gutter}>
                  <MissedBanner key={missed.key} missed={missed} today={today} onView={() => setSelected(missed.date)} />
                </View>
              )}

              <View style={styles.gutter}>
                <SectionHeader title={selected === today ? `Today · ${formatMonthDay(selected)}` : formatShortDate(selected)} />
              </View>

              {items.length ? (
                <WorkoutPager
                  key={selected}
                  items={items}
                  renderCard={(item, index) => (
                    <WorkoutCard
                      item={item}
                      index={index}
                      total={items.length}
                      today={today}
                      summary={item.session && item.session.status === 'completed' ? summarizeSession(item.session, exercisesById, records) : undefined}
                      exercisesById={exercisesById}
                      units={units}
                      onStart={() => begin(item, () => active.startFromItem(item, { index, total: items.length }))}
                      onReopen={() => item.session && begin(item, () => active.reopen(item.session!, { index, total: items.length }))}
                      onRepeat={() => item.session && begin({ ...item, status: 'planned' }, () => active.repeat(item, item.session!))}
                      onViewSummary={() => item.session && router.push({ pathname: '/summary', params: { session: item.session.id } })}
                    />
                  )}
                />
              ) : (
                <View style={styles.gutter}>
                  <RestDayCard date={selected} today={today} next={coming[0]} onShowNext={() => coming[0] && setSelected(coming[0].date)} />
                </View>
              )}
            </>
          }
          right={
            <View style={styles.gutter}>
              <ComingUp items={items.length ? coming : coming.slice(1)} onSelect={setSelected} />
            </View>
          }
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  gutter: {
    paddingHorizontal: spacing.lg,
  },
  skeleton: {
    gap: spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
