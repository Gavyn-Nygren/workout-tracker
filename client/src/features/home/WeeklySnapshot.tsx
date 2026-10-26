import { StyleSheet, View } from 'react-native';

import { AppText, Icon, PressableScale, ProgressRing } from '@/components/ui';
import { daysBetween, isoWeekday } from '@/data/dates';
import type { ISODate, StreakState } from '@/data/types';
import { formatWeekday, plural, WEEKDAY_LETTER } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { DayItem } from '../today/agenda';

type Props = {
  streak: StreakState;
  /** The streak's current week, first day first (it follows the week-start setting). */
  week: { date: ISODate; items: DayItem[] }[];
  today: ISODate;
  onPress: () => void;
};

/** Text inside the ring and under the narrow day columns stops growing here, like WeekStrip. */
const COMPACT_TEXT_MAX = 1.3;

type DayStatus = 'done' | 'partial' | 'missed' | 'planned' | 'rest';
const DAY_WORDS: Record<Exclude<DayStatus, 'rest'>, string> = { done: 'done', partial: 'partly done', missed: 'missed', planned: 'planned' };

function dayStatus(items: DayItem[]): DayStatus {
  if (items.some((x) => x.status === 'completed')) return 'done';
  if (items.some((x) => x.status === 'partial')) return 'partial';
  if (items.some((x) => x.status === 'missed')) return 'missed';
  if (items.some((x) => x.status === 'planned' || x.status === 'in_progress')) return 'planned';
  return 'rest';
}

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
  const { large } = useTextScale();
  const daysLeft = Math.max(1, daysBetween(today, week[6].date) + 1);
  const days = week.map(({ date, items }) => ({ date, status: dayStatus(items) }));

  // One VoiceOver stop that says what the ring, the streak, and the day dots show.
  const dayList = days
    .filter((d) => d.status !== 'rest')
    .map((d) => `${formatWeekday(d.date)} ${DAY_WORDS[d.status as Exclude<DayStatus, 'rest'>]}`)
    .join(', ');
  const spoken = [
    `This week: ${streak.thisWeekCompleted} of ${plural(streak.thisWeekTarget, 'workout')}.`,
    `${streak.currentWeeks}-week streak.`,
    message(streak, daysLeft),
    dayList && `${dayList}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint="Opens Today">
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.chrome,
            // Dark mode: a thin blue edge lifts the card off the near-black page (user's pick). Light keeps the shadow.
            borderColor: outerScheme === 'dark' ? colors.heroBorder : colors.chrome,
            boxShadow: outerScheme === 'light' ? '0px 10px 28px rgba(11, 15, 20, 0.22)' : undefined,
          },
        ]}
      >
        {/* Large text: the streak text gets the card's full width under the ring. */}
        <View style={[styles.top, large && styles.topStacked]}>
          <ProgressRing value={streak.thisWeekCompleted / Math.max(1, streak.thisWeekTarget)} label={`${streak.thisWeekCompleted} of ${streak.thisWeekTarget} workouts this week`} size={104} strokeWidth={10}>
            <AppText variant="title1" numeric maxFontSizeMultiplier={COMPACT_TEXT_MAX}>{`${streak.thisWeekCompleted}/${streak.thisWeekTarget}`}</AppText>
            <AppText variant="caption" tone="secondary" maxFontSizeMultiplier={COMPACT_TEXT_MAX}>
              this week
            </AppText>
          </ProgressRing>
          <View style={[styles.streak, large && styles.streakStacked]}>
            <View style={styles.streakRow}>
              <Icon name="flame.fill" color={streak.currentWeeks ? colors.pr : colors.textSecondary} size={26} />
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
          {days.map(({ date, status }) => {
            const isToday = date === today;
            const dotStyle = {
              done: { backgroundColor: colors.successFill },
              partial: { backgroundColor: colors.warningFill },
              missed: { borderColor: colors.warningFill, borderWidth: 2 },
              planned: { borderColor: colors.accentText, borderWidth: 2 },
              rest: { backgroundColor: colors.input, transform: [{ scale: 0.5 }] },
            }[status];
            return (
              <View key={date} style={styles.day}>
                <AppText variant="caption" weight="700" tone={isToday ? 'accent' : 'secondary'} maxFontSizeMultiplier={COMPACT_TEXT_MAX}>
                  {WEEKDAY_LETTER[isoWeekday(date)]}
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
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  topStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  streak: {
    flex: 1,
    gap: 2,
  },
  streakStacked: {
    flex: 0,
    alignSelf: 'stretch',
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
