import { useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, EmptyState, SectionHeader, Skeleton, useToast } from '@/components/ui';
import type { ISODate } from '@/data/types';
import { ComingUp } from '@/features/today/ComingUp';
import { MissedBanner } from '@/features/today/MissedBanner';
import { RestDayCard } from '@/features/today/RestDayCard';
import { useAgenda } from '@/features/today/useAgenda';
import { WeekStrip } from '@/features/today/WeekStrip';
import { WorkoutCard } from '@/features/today/WorkoutCard';
import { WorkoutPager } from '@/features/today/WorkoutPager';
import { latestMissed, summarizeSession, type Agenda, type DayItem } from '@/features/today/agenda';
import { formatMonthDay, formatShortDate, formatWeekday } from '@/lib/format';
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
  const toast = useToast();
  const { today, range, agenda, exercisesById, records, units, isLoading, error, retry } = useAgenda();
  const [selected, setSelected] = useState<ISODate>(today);

  const items = agenda.get(selected) ?? [];
  const missed = useMemo(() => latestMissed(agenda, today), [agenda, today]);
  const coming = useMemo(() => upcoming(agenda, selected < today ? today : selected, 3), [agenda, selected, today]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isLoading ? 'TODAY' : headerTitle(selected, items) });
  }, [navigation, selected, items, isLoading]);

  // Actions open screens built in later goals; until then, say so.
  const comingSoon = (what: string, goal: string) => () => toast.show({ message: `${what} arrives in ${goal}.` });

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
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
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
                  onStart={comingSoon('The workout screen', 'G2.2')}
                  onReopen={comingSoon('Reopening workouts', 'G2.2')}
                  onRepeat={comingSoon('Repeating workouts', 'G2.2')}
                  onViewSummary={comingSoon('The workout summary', 'G2.3')}
                />
              )}
            />
          ) : (
            <View style={styles.gutter}>
              <RestDayCard date={selected} today={today} next={coming[0]} onShowNext={() => coming[0] && setSelected(coming[0].date)} />
            </View>
          )}

          <View style={styles.gutter}>
            <ComingUp items={items.length ? coming : coming.slice(1)} onSelect={setSelected} />
          </View>
        </>
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
