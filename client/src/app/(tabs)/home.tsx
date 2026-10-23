import { router } from 'expo-router';
import { ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, SectionHeader, Skeleton, useToast } from '@/components/ui';
import { useDeleteGoal } from '@/data/hooks';
import type { Goal } from '@/data/types';
import { EarnedRow, GoalRow, NextUpList, WinsFeed } from '@/features/home/HomeParts';
import { useHomeData } from '@/features/home/useHomeData';
import { WeeklySnapshot } from '@/features/home/WeeklySnapshot';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * Home (roadmap G2.5): a personal dashboard, not another analytics screen. Weekly snapshot,
 * goals, recent wins, then badges.
 */
export default function HomeScreen() {
  const { scheme } = useAppTheme();
  const toast = useToast();
  const deleteGoal = useDeleteGoal();
  const { isLoading, today, units, streak, week, goals, wins, earned, upcoming } = useHomeData();

  if (isLoading || !streak) {
    return (
      <View style={styles.content}>
        <Skeleton height={190} radius={20} />
        <Skeleton height={140} radius={16} />
        <Skeleton height={140} radius={16} />
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
                await deleteGoal.mutateAsync(goal.id);
                toast.show({ message: 'Goal deleted.' });
              },
            },
          ]);
        }
      },
    );

  return (
    <ScrollView contentContainerStyle={styles.content}>
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

      <View style={styles.section}>
        <SectionHeader title="Recent wins" />
        {wins.length ? (
          <WinsFeed wins={wins} />
        ) : (
          <Card>
            <EmptyState icon="star" title="Wins show up here" message="New PRs, form improvements, and badges from the last three weeks." />
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
