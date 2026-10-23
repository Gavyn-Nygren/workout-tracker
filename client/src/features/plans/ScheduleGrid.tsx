import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { daysBetween, isoWeekday } from '@/data/dates';
import { weekPattern } from '@/data/schedule';
import type { ISODate, PlanSchedule, PlanWorkout, Weekday } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { ALL_WEEKDAYS, abbreviate, WEEKDAY_LETTER, WEEKDAY_SHORT } from './describe';

type Props = {
  schedule: PlanSchedule;
  workouts: PlanWorkout[];
  /** Highlights today's column (weekly/fixed) or step (rotating) when the plan has started. */
  today?: ISODate;
  startDate?: ISODate;
  onPressDay?: (weekday: Weekday) => void;
};

/**
 * The plan's schedule at a glance (user's pick: week grid). Weekly and fixed plans show seven day
 * columns with workout chips; rotating plans show the cycle as a row of steps.
 */
export function ScheduleGrid({ schedule, workouts, today, startDate, onPressDay }: Props) {
  const { colors } = useAppTheme();
  const names = new Map(workouts.map((w) => [w.id, w.name]));

  if (schedule.type === 'rotating') {
    const step = today && startDate && schedule.sequence.length ? daysBetween(startDate, today) % schedule.sequence.length : -1;
    return (
      <View style={styles.cycle} accessibilityLabel={`Cycle: ${schedule.sequence.map((s) => (s === 'rest' ? 'rest' : names.get(s))).join(', then ')}, then repeat`}>
        {schedule.sequence.map((s, i) => (
          <Fragment key={`${s}-${i}`}>
            <View
              style={[
                styles.step,
                { backgroundColor: s === 'rest' ? colors.input : colors.accentSubtle },
                i === step && { borderColor: colors.accentText, borderWidth: 2 },
              ]}
            >
              <AppText variant="caption" tone="secondary" numeric>{`Day ${i + 1}`}</AppText>
              <AppText variant="subhead" weight="700" tone={s === 'rest' ? 'secondary' : 'accent'} numberOfLines={1}>
                {s === 'rest' ? 'Rest' : (names.get(s) ?? 'Workout')}
              </AppText>
            </View>
            <Icon name={i === schedule.sequence.length - 1 ? 'arrow.counterclockwise' : 'chevron.right'} color={colors.textTertiary} size={12} />
          </Fragment>
        ))}
      </View>
    );
  }

  const pattern = weekPattern(schedule);
  const todayWeekday = today ? isoWeekday(today) : undefined;

  return (
    <View style={styles.week}>
      {ALL_WEEKDAYS.map((weekday) => {
        const ids = pattern[weekday];
        const isToday = weekday === todayWeekday;
        const label = `${WEEKDAY_SHORT[weekday]}: ${ids.length ? ids.map((id) => names.get(id)).join(', ') : 'rest'}`;
        const cell = (
          <View style={styles.dayColumn}>
            <AppText variant="caption" weight="700" tone={isToday ? 'accent' : 'secondary'}>
              {WEEKDAY_LETTER[weekday]}
            </AppText>
            <View style={[styles.dayCell, { backgroundColor: colors.input }, isToday && { borderColor: colors.accentText, borderWidth: 1.5 }]}>
              {ids.length ? (
                ids.map((id) => (
                  <View key={id} style={[styles.chip, { backgroundColor: colors.accent }]}>
                    <AppText variant="caption" weight="800" tone="onAccent" numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {abbreviate(names.get(id) ?? '?')}
                    </AppText>
                  </View>
                ))
              ) : (
                <AppText variant="caption" tone="tertiary">
                  ·
                </AppText>
              )}
            </View>
          </View>
        );
        return onPressDay ? (
          <Pressable key={weekday} style={styles.flex} onPress={() => onPressDay(weekday)} accessibilityRole="button" accessibilityLabel={`${label}. Change`}>
            {cell}
          </Pressable>
        ) : (
          <View key={weekday} style={styles.flex} accessible accessibilityLabel={label}>
            {cell}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  week: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  dayColumn: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  dayCell: {
    alignSelf: 'stretch',
    minHeight: 56,
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  cycle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  step: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 72,
  },
});
