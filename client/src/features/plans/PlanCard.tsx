import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, PressableScale } from '@/components/ui';
import { usePlanShifts } from '@/data/hooks';
import type { ISODate, Plan, PlanShift } from '@/data/types';
import { formatLongDate, formatShortDate } from '@/lib/format';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { describeSchedule } from './describe';
import { currentProgramWeek, nextWorkout, shiftsOf } from './position';
import { ScheduleGrid } from './ScheduleGrid';

const NO_SHIFTS: PlanShift[] = [];

export function StatusPill({ status }: { status: Plan['status'] }) {
  const { colors } = useAppTheme();
  const active = status === 'active';
  return (
    <View style={[styles.pill, { backgroundColor: active ? colors.successSubtle : colors.input }]}>
      <View style={[styles.dot, { backgroundColor: active ? colors.successFill : colors.textTertiary }]} />
      <AppText variant="caption" weight="700" tone={active ? 'success' : 'secondary'} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
        {status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Archived'}
      </AppText>
    </View>
  );
}

/** One plan in the My plans list. */
export function PlanCard({ plan, today, onPress }: { plan: Plan; today: ISODate; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  // After a push forward, "Next", the week and the cycle step follow the moved workouts, like Today.
  const shifts = shiftsOf(plan.id, usePlanShifts().data ?? NO_SHIFTS);
  const next = nextWorkout(plan, today, shifts);
  const week = currentProgramWeek(plan, today, shifts);
  const spoken = [
    `${plan.name}, ${plan.status}`,
    `${describeSchedule(plan.schedule)}${week ? `, week ${week}` : ''}`,
    next && `Next: ${next.name}, ${next.date === today ? 'today' : formatLongDate(next.date)}`,
  ];

  return (
    <PressableScale onPress={onPress} style={styles.fill} accessibilityRole="button" accessibilityLabel={spoken.filter(Boolean).join('. ')}>
      <Card style={styles.fill}>
        <View style={styles.stack}>
          {/* Large text: the status pill drops under the name instead of squeezing it. */}
          <View style={large ? styles.rowStacked : styles.row}>
            <View style={large ? undefined : styles.flex}>
              <AppText variant="title3" weight="700" numberOfLines={large ? undefined : 2}>
                {plan.name}
              </AppText>
              <AppText variant="footnote" tone="secondary">
                {`${describeSchedule(plan.schedule)}${week ? `  ·  week ${week}` : ''}`}
              </AppText>
            </View>
            <StatusPill status={plan.status} />
          </View>
          <ScheduleGrid schedule={plan.schedule} workouts={plan.workouts} today={plan.status === 'active' ? today : undefined} startDate={plan.startDate} shifts={shifts} />
          {next && (
            <View style={styles.next}>
              <Icon name="calendar" color={colors.accentText} size={14} />
              <AppText variant="footnote" tone="secondary" style={styles.flex}>
                {`Next: ${next.name} · ${next.date === today ? 'today' : formatShortDate(next.date)}`}
              </AppText>
              <Icon name="chevron.right" color={colors.textTertiary} size={13} />
            </View>
          )}
        </View>
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Fills a grid cell on iPad so cards in a row match heights.
  fill: {
    flexGrow: 1,
  },
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rowStacked: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
