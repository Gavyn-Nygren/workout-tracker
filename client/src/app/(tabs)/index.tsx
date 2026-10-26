import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorState, SectionHeader, Skeleton, useToast } from '@/components/ui';
import { useDeleteSession, useSaveSession } from '@/data/hooks';
import type { ISODate } from '@/data/types';
import { ComingUp } from '@/features/today/ComingUp';
import { MissedBanner, useMissedBanner } from '@/features/today/MissedBanner';
import { RestDayCard } from '@/features/today/RestDayCard';
import { useAgenda } from '@/features/today/useAgenda';
import { WeekStrip } from '@/features/today/WeekStrip';
import { WorkoutCard } from '@/features/today/WorkoutCard';
import { WorkoutPager } from '@/features/today/WorkoutPager';
import { summarizeSession, type Agenda, type DayItem } from '@/features/today/agenda';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { formatMonthDay, formatShortDate, formatWeekday } from '@/lib/format';
import { newId } from '@/lib/id';
import { useAppTheme } from '@/theme/ThemeProvider';
import { Columns, dashboard } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

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
  const { scheme } = useAppTheme();
  const toast = useToast();
  const saveSession = useSaveSession();
  const deleteSession = useDeleteSession();

  /** The card's ⋯ menu: skip a planned or missed workout, or undo a skip (user's pick). */
  const menuFor = (item: DayItem) => {
    const skippable = item.status === 'planned' || item.status === 'missed';
    if (!item.occurrence || !(skippable || item.status === 'skipped')) return undefined;
    return () =>
      ActionSheetIOS.showActionSheetWithOptions(
        { title: item.name, options: [item.status === 'skipped' ? 'Unskip workout' : 'Skip workout', 'Cancel'], cancelButtonIndex: 1, userInterfaceStyle: scheme },
        (choice) => {
          if (choice !== 0 || !item.occurrence) return;
          if (item.status === 'skipped' && item.session) {
            deleteSession.mutate(item.session.id, { onSuccess: () => toast.show({ message: `${item.name} is back on your plan.` }) });
            return;
          }
          const now = new Date().toISOString();
          saveSession.mutate(
            {
              id: newId('sess'),
              name: item.name,
              occurrenceId: item.occurrence.id,
              planId: item.plan?.id,
              planWorkoutId: item.occurrence.planWorkoutId,
              status: 'skipped',
              scheduledDate: item.occurrence.scheduledDate,
              blocks: [],
              createdAt: now,
              updatedAt: now,
            },
            { onSuccess: () => toast.show({ message: `${item.name} skipped.` }) },
          );
        },
      );
  };
  const [selected, setSelected] = useState<ISODate>(today);
  // A new day while the app is open: if the old today was selected, move to the new one.
  const [shownToday, setShownToday] = useState<ISODate>(today);
  if (shownToday !== today) {
    setShownToday(today);
    if (selected === shownToday) setSelected(today);
  }

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
  // The "push plan forward?" prompt, or its Undo after a push (spec 2.5).
  const missedBanner = useMissedBanner(agenda, today, activeSession?.occurrenceId);
  const coming = useMemo(() => upcoming(agenda, selected < today ? today : selected, 3), [agenda, selected, today]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: isLoading ? 'TODAY' : headerTitle(selected, items) });
  }, [navigation, selected, items, isLoading]);

  /** Only one workout runs at a time; offer to resume or discard the current one first. */
  /** Whether this card is the workout currently open (not just one saved as unfinished). */
  const isOpen = (item: DayItem) =>
    !!activeSession && (item.session?.id === activeSession.id || (!!item.occurrence && activeSession.occurrenceId === item.occurrence.id));

  const begin = (item: DayItem, start: () => void) => {
    if (isOpen(item)) {
      router.push('/workout');
      return;
    }
    if (!activeSession) {
      start();
      router.push('/workout');
      return;
    }
    Alert.alert(`${activeSession.name} is still in progress`, 'Finish or discard it before starting another workout.', [
      { text: `Resume ${activeSession.name}`, onPress: () => router.push('/workout') },
      {
        text: 'Discard it and start',
        style: 'destructive',
        onPress: async () => {
          // If the discard can't be saved, the old workout stays open (the error toast says so).
          if (!(await active.end())) return;
          start();
          router.push('/workout');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (error) return <ErrorState fill title="Couldn't load your schedule" message="Your workouts are still saved on this phone." onRetry={retry} />;

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]} contentInsetAdjustmentBehavior="automatic">
      <WeekStrip agenda={agenda} today={today} selected={selected} onSelect={setSelected} range={range} />

      {isLoading ? (
        // Shaped like the day header and the workout card it stands in for.
        <View style={[styles.gutter, styles.skeleton]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
          <Skeleton width="45%" height={18} />
          <Skeleton height={280} radius={radius.card + 4} />
        </View>
      ) : (
        // iPad: the day's workouts on the left, Coming up beside them. Each section keeps its own gutter.
        <Columns
          gap={spacing.lg}
          columnGap={0}
          leftFlex={1.4}
          left={
            <>
              {selected === today && missedBanner && (
                <View style={styles.gutter}>
                  <MissedBanner state={missedBanner} today={today} onView={setSelected} />
                </View>
              )}

              <View style={styles.gutter}>
                <SectionHeader title={selected === today ? `Today · ${formatMonthDay(selected)}` : formatShortDate(selected)} />
              </View>

              {items.length ? (
                <WorkoutPager
                  // A push or its undo adds or removes a workout: start over on the first page so
                  // the pager never points past the end.
                  key={`${selected}:${items.length}`}
                  items={items}
                  // After a push, the workout it moved to today, so it's the card in view.
                  focusKey={selected === today && missedBanner?.kind === 'pushed' ? missedBanner.items[0]?.key : undefined}
                  renderCard={(item, index) => (
                    <WorkoutCard
                      item={item}
                      index={index}
                      total={items.length}
                      today={today}
                      summary={item.session && item.session.status === 'completed' ? summarizeSession(item.session, exercisesById, records) : undefined}
                      exercisesById={exercisesById}
                      units={units}
                      onStart={() =>
                        begin(item, () =>
                          // An unfinished workout saved earlier carries on where it left off; anything else starts fresh.
                          item.session?.status === 'in_progress'
                            ? active.continueSession(item.session, { index, total: items.length })
                            : active.startFromItem(item, { index, total: items.length }),
                        )
                      }
                      onReopen={() => item.session && begin(item, () => active.reopen(item.session!, { index, total: items.length }))}
                      onRepeat={() => item.session && begin({ ...item, status: 'planned' }, () => active.repeat(item, item.session!))}
                      onViewSummary={() => item.session && router.push({ pathname: '/summary', params: { session: item.session.id } })}
                      onMenu={menuFor(item)}
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
});
