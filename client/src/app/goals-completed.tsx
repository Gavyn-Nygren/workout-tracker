import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, ErrorState, Icon, ScreenState, Skeleton, ToastViewport, useToast } from '@/components/ui';
import { succeeded, useDeleteGoal } from '@/data/hooks';
import type { Goal, ISODate } from '@/data/types';
import type { GoalWithStatus } from '@/features/home/goals';
import { useHomeData } from '@/features/home/useHomeData';
import { formatMonthDay } from '@/lib/format';
import { DENSE_TEXT_MAX, readable } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** "Oct 19", or "Oct 19, 2025" in an earlier year. */
function reachedOn(date: ISODate, today: ISODate): string {
  const year = date.slice(0, 4);
  return year === today.slice(0, 4) ? formatMonthDay(date) : `${formatMonthDay(date)}, ${year}`;
}

/** Goals reached a week or more ago (G3.10): they leave Home's list and wait here. Tapping one offers Delete. */
export default function CompletedGoalsScreen() {
  const { colors, scheme } = useAppTheme();
  const toast = useToast();
  const deleteGoal = useDeleteGoal();
  const { isLoading, error, retry, today, completedGoals } = useHomeData();

  const shell = (body: ReactNode) => (
    <View style={[styles.screen, { backgroundColor: colors.background }]} onAccessibilityEscape={() => router.back()}>
      <Bar />
      {body}
      {/* Modals draw above the root toast, so this screen shows its own. */}
      <ToastViewport bottomOffset={spacing.lg} />
    </View>
  );

  if (error) return shell(<ErrorState fill title="Couldn't load your goals" onRetry={retry} />);
  if (isLoading) {
    return shell(
      <View style={[styles.content, readable]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        <Skeleton height={160} radius={radius.card} />
      </View>,
    );
  }
  if (!completedGoals.length) {
    return shell(
      <ScreenState>
        <EmptyState icon="checkmark.circle" title="No completed goals" message="Goals you reach move here a week later." />
      </ScreenState>,
    );
  }

  const offerDelete = (goal: Goal) =>
    ActionSheetIOS.showActionSheetWithOptions({ title: goal.title, options: ['Delete goal', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme }, (i) => {
      if (i !== 0) return;
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
    });

  return shell(
    <ScrollView contentContainerStyle={[styles.content, readable]}>
      <Card padding="none">
        {completedGoals.map((item, i) => (
          <CompletedGoalRow key={item.goal.id} item={item} today={today} separator={i < completedGoals.length - 1} onPress={() => offerDelete(item.goal)} />
        ))}
      </Card>
      <AppText variant="footnote" tone="secondary" style={styles.footer}>
        Goals move here a week after you reach them.
      </AppText>
    </ScrollView>,
  );
}

function CompletedGoalRow({ item, today, separator, onPress }: { item: GoalWithStatus; today: ISODate; separator: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { goal, progress } = item;
  const reached = progress.reachedDate ? `Reached ${reachedOn(progress.reachedDate, today)}` : 'Reached';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${reached}`}
      accessibilityHint="Offers to delete this goal"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.input }]}
    >
      <View style={[styles.iconWell, { backgroundColor: colors.successSubtle }]}>
        <Icon name="checkmark" color={colors.successText} size={14} weight="bold" />
      </View>
      <View style={[styles.body, separator && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <AppText variant="body">{goal.title}</AppText>
        <AppText variant="footnote" tone="success" weight="600" numeric>
          {reached}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Close / title, like the other modals' bars; its text stops growing at the dense cap. */
function Bar() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10} style={styles.barSide}>
        <AppText variant="body" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          Close
        </AppText>
      </Pressable>
      <AppText variant="headline" accessibilityRole="header" maxFontSizeMultiplier={DENSE_TEXT_MAX} numberOfLines={1} style={styles.barTitle}>
        Completed goals
      </AppText>
      <View style={styles.barSide} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Equal sides keep the title centered.
  barSide: {
    minWidth: 64,
  },
  barTitle: {
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    gap: spacing.md,
  },
  iconWell: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.xs,
  },
});
