import { StyleSheet, View } from 'react-native';

import { AppText, Icon, PressableScale, ProgressRing } from '@/components/ui';
import { daysBetween } from '@/data/dates';
import type { ISODate, StreakState } from '@/data/types';
import { plural } from '@/lib/format';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { DayItem } from '../today/agenda';

type Props = {
  streak: StreakState;
  week: { date: ISODate; items: DayItem[] }[];
  today: ISODate;
  onPress: () => void;
};

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Home's top card (user's pick): this week's ring, the week streak, and the days at a glance. */
export function WeeklySnapshot(props: Props) {
  const { scheme } = useAppTheme();
  return (
    <SchemeOverride scheme="dark">
      <Body {...props} outerScheme={scheme} />
    </SchemeOverride>
  );
}

function message(streak: StreakState, daysLeft: number): string {
  const left = streak.thisWeekTarget - streak.thisWeekCompleted;
  if (left <= 0) return 'Week target hit. Your streak is safe.';
  const goal = streak.currentWeeks > 0 ? 'keep your streak' : 'start a streak';
  return `${plural(left, 'more workout')} in ${plural(daysLeft, 'day')} to ${goal}.`;
}

function Body({ streak, week, today, onPress, outerScheme }: Props & { outerScheme: 'light' | 'dark' }) {
  const { colors } = useAppTheme();
  const daysLeft = Math.max(1, daysBetween(today, week[6].date) + 1);

  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityHint="Opens Today">
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.chrome,
            borderColor: outerScheme === 'dark' ? colors.border : colors.chrome,
            boxShadow: outerScheme === 'light' ? '0px 10px 28px rgba(11, 15, 20, 0.22)' : undefined,
          },
        ]}
      >
        <View style={styles.top}>
          <ProgressRing value={streak.thisWeekCompleted / Math.max(1, streak.thisWeekTarget)} label={`${streak.thisWeekCompleted} of ${streak.thisWeekTarget} workouts this week`} size={104} strokeWidth={10}>
            <AppText variant="title1" numeric>{`${streak.thisWeekCompleted}/${streak.thisWeekTarget}`}</AppText>
            <AppText variant="caption" tone="secondary">
              this week
            </AppText>
          </ProgressRing>
          <View style={styles.streak}>
            <View style={styles.streakRow}>
              <Icon name="flame.fill" color={streak.currentWeeks ? colors.pr : colors.textTertiary} size={26} />
              <AppText variant="display" numeric>
                {streak.currentWeeks}
              </AppText>
            </View>
            <AppText variant="subhead" weight="700">
              week streak
            </AppText>
            <AppText variant="footnote" tone="secondary">
              {message(streak, daysLeft)}
            </AppText>
          </View>
        </View>

        <View style={[styles.days, { borderTopColor: colors.border }]}>
          {week.map(({ date, items }, i) => {
            const isToday = date === today;
            const done = items.some((x) => x.status === 'completed');
            const partial = !done && items.some((x) => x.status === 'partial');
            const missed = items.some((x) => x.status === 'missed');
            const planned = items.some((x) => x.status === 'planned' || x.status === 'in_progress');
            const dotStyle = done
              ? { backgroundColor: colors.successFill }
              : partial
                ? { backgroundColor: colors.warningFill }
                : missed
                  ? { borderColor: colors.warningFill, borderWidth: 2 }
                  : planned
                    ? { borderColor: colors.accentText, borderWidth: 2 }
                    : { backgroundColor: colors.input, transform: [{ scale: 0.5 }] };
            return (
              <View key={date} style={styles.day}>
                <AppText variant="caption" weight="700" tone={isToday ? 'accent' : 'secondary'}>
                  {LETTERS[i]}
                </AppText>
                <View style={[styles.dot, dotStyle]} />
                <View style={[styles.todayBar, { backgroundColor: isToday ? colors.accent : 'transparent' }]} />
              </View>
            );
          })}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card + 4,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  streak: {
    flex: 1,
    gap: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  days: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  todayBar: {
    width: 14,
    height: 3,
    borderRadius: 2,
  },
});
