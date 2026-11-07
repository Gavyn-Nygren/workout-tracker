import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { isoWeekday } from '@/data/dates';
import { usePreferences } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { cycleSteps, weekPattern } from '@/data/schedule';
import type { ISODate, PlanSchedule, PlanShift, PlanWorkout, ScheduledOccurrence, Weekday } from '@/data/types';
import { WEEKDAY_LETTER, WEEKDAY_LONG, weekdayOrder } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { cycleDayNames, nameList } from './cycleLabels';
import { abbreviate } from './describe';
import { currentRotatingStep } from './position';

type Props = {
  schedule: PlanSchedule;
  workouts: PlanWorkout[];
  /** Highlights today's column (weekly/fixed) or step (rotating) when the plan has started. */
  today?: ISODate;
  startDate?: ISODate;
  /** This plan's pushes forward, so a rotating cycle's highlighted step matches Today. */
  shifts?: readonly PlanShift[];
  /** This plan's workouts on `today`, as Today shows them, for the same. */
  occurrences?: readonly ScheduledOccurrence[];
  onPressDay?: (weekday: Weekday) => void;
};

/**
 * The plan's schedule at a glance (user's pick: week grid). Weekly and fixed plans show seven day
 * columns with workout chips, starting on the user's week start; rotating plans show the cycle as
 * a row of day pills, each listing its workouts one per line ("Rest" when it has none), with
 * today's day ringed.
 */
export function ScheduleGrid({ schedule, workouts, today, startDate, shifts, occurrences, onPressDay }: Props) {
  const { colors } = useAppTheme();
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? defaultPreferences.weekStartsOn;
  const names = new Map(workouts.map((w) => [w.id, w.name]));

  if (schedule.type === 'rotating') {
    const step = today && startDate ? currentRotatingStep(schedule, startDate, today, shifts, occurrences) : undefined;
    const steps = cycleSteps(schedule).map((s) => cycleDayNames(s, names));
    return (
      <View
        style={styles.cycle}
        accessible
        accessibilityLabel={`${steps.length}-day cycle: ${steps
          .map((s, i) => `day ${i + 1}, ${s.length ? nameList(s) : 'rest'}${i === step ? ', today' : ''}`)
          .join('; ')}. Then it repeats.`}
      >
        {steps.map((s, i) => (
          <Fragment key={i}>
            <View
              style={[
                styles.step,
                { backgroundColor: s.length ? colors.accentSubtle : colors.input },
                i === step && { borderColor: colors.accentText, borderWidth: 2 },
              ]}
            >
              <AppText variant="caption" tone="secondary" numeric>{`Day ${i + 1}`}</AppText>
              {s.length ? (
                s.map((name, j) => (
                  <AppText key={j} variant="subhead" weight="700" tone="accent" numberOfLines={1}>
                    {name}
                  </AppText>
                ))
              ) : (
                <AppText variant="subhead" weight="700" tone="secondary" numberOfLines={1}>
                  Rest
                </AppText>
              )}
            </View>
            <Icon name={i === steps.length - 1 ? 'arrow.counterclockwise' : 'chevron.right'} color={colors.textTertiary} size={12} />
          </Fragment>
        ))}
      </View>
    );
  }

  const pattern = weekPattern(schedule);
  const todayWeekday = today ? isoWeekday(today) : undefined;

  return (
    <View style={styles.week}>
      {weekdayOrder(weekStartsOn).map((weekday) => {
        const ids = pattern[weekday];
        const isToday = weekday === todayWeekday;
        const label = `${WEEKDAY_LONG[weekday]}: ${ids.length ? ids.map((id) => names.get(id)).join(', ') : 'rest'}${isToday ? ', today' : ''}`;
        const cell = (
          <View style={styles.dayColumn}>
            {/* Narrow columns: letters grow only a little, like the week strip. */}
            <AppText variant="caption" weight="700" tone={isToday ? 'accent' : 'secondary'} maxFontSizeMultiplier={1.3}>
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
                <AppText variant="caption" tone="tertiary" maxFontSizeMultiplier={1.3}>
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
  // At most the row's width, so a long name is cut off instead of running off the card.
  step: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 72,
    maxWidth: '100%',
  },
});
