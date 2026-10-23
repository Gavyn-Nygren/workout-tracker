import { router } from 'expo-router';
import { ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, ScreenState, SectionHeader, Skeleton, useToast } from '@/components/ui';
import { succeeded, useDeleteGoal } from '@/data/hooks';
import type { Goal } from '@/data/types';
import { EarnedRow, GoalRow, NextUpList, WinsFeed } from '@/features/home/HomeParts';
import { useHomeData } from '@/features/home/useHomeData';
import { WeeklySnapshot } from '@/features/home/WeeklySnapshot';
import { useAppTheme } from '@/theme/ThemeProvider';
import { Columns, dashboard } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

/**
 * Home (roadmap G2.5): a personal dashboard, not another analytics screen. Weekly snapshot,
 * goals, recent wins, then badges.
 */
export default function HomeScreen() {
  const { scheme } = useAppTheme();
  const toast = useToast();
  const deleteGoal = useDeleteGoal();
  const { isLoading, error, retry, today, units, streak, week, goals, wins, earned, upcoming } = useHomeData();

  if (error) {
    return (
      <ScreenState>
        <ErrorState title="Couldn't load your dashboard" onRetry={retry} />
      </ScreenState>
    );
  }

  if (isLoading || !streak) {
    return (
      <View style={[styles.content, dashboard]}>
        <Skeleton height={190} radius={radius.card + 4} />
        <Skeleton height={140} radius={radius.card} />
        <Skeleton height={140} radius={radius.card} />
      </View>
    );
  }

  const openGoal = (goal: Goal) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: goal.title, options: ['Edit goal', 'Delete goal', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2, userInterfaceStyle: scheme },
      (i) => {
        if (i === 0) router.push({ pathname: '/goal', params: { id: goal.id } });
        if (i === 1) {
          Alert.alert(`Delete "${goal.title}"?`, undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                if (!(await succeeded(deleteGoal.mutateAsync(goal.id)))) return;
                toast.show({ message: 'Goal deleted.' });
              },
            },
          ]);
        }
      },
    );

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]}>
      {/* iPad: this week and goals on the left, wins and badges on the right. */}
      <Columns
        left={
          <>
            <WeeklySnapshot streak={streak} week={week} today={today} onPress={() => router.navigate('/')} />

            <View style={styles.section}>
              <SectionHeader title="Goals" actionLabel="Add" onAction={() => router.push('/goal')} />
              {goals.length ? (
                <Card padding="none">
                  {goals.map(({ goal, progress }, i) => (
                    <GoalRow key={goal.id} goal={goal} progress={progress} units={units} separator={i < goals.length - 1} onPress={() => openGoal(goal)} />
                  ))}
                </Card>
              ) : (
                <Card>
                  <EmptyState icon="target" title="No goals yet" message="Set a lift, frequency, bodyweight, or form goal and track it here." actionLabel="Add a goal" onAction={() => router.push('/goal')} />
                </Card>
              )}
            </View>
          </>
        }
        right={
          <>
            <View style={styles.section}>
              <SectionHeader title="Recent wins" />
              {wins.length ? (
                <WinsFeed wins={wins} />
              ) : (
                <Card>
                  <EmptyState icon="star" title="Wins show up here" message="New PRs, form improvements, and badges from the last three weeks. Finish a workout to get your first." />
                </Card>
              )}
            </View>

            <View style={styles.section}>
              <SectionHeader title={`Badges · ${earned.length} earned`} />
              {earned.length > 0 && <EarnedRow badges={earned} onPress={(b) => router.push({ pathname: '/badge', params: { key: b.badgeKey } })} />}
              {upcoming.length > 0 && (
                <>
                  <SectionHeader title="Next up" />
                  <NextUpList badges={upcoming.slice(0, 3)} onPress={(b) => router.push({ pathname: '/badge', params: { key: b.badgeKey } })} />
          </>
              )}
            </View>

            <Button title="Start today's workout" variant="secondary" icon="play.fill" fullWidth onPress={() => router.navigate('/')} />
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
});
