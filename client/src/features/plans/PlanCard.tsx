import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, PressableScale } from '@/components/ui';
import { addDays } from '@/data/dates';
import { programWeek, workoutsOn } from '@/data/schedule';
import type { ISODate, Plan } from '@/data/types';
import { formatShortDate } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { describeSchedule, PLAN_TYPE_LABEL } from './describe';
import { ScheduleGrid } from './ScheduleGrid';

/** The next scheduled workout from `today` within two weeks. */
export function nextWorkout(plan: Plan, today: ISODate): { date: ISODate; name: string } | undefined {
  if (plan.status !== 'active') return undefined;
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i);
    const [id] = workoutsOn(plan.schedule, plan.startDate, date);
    const workout = id ? plan.workouts.find((w) => w.id === id) : undefined;
    if (workout) return { date, name: workout.name };
  }
  return undefined;
}

export function StatusPill({ status }: { status: Plan['status'] }) {
  const { colors } = useAppTheme();
  const active = status === 'active';
  return (
    <View style={[styles.pill, { backgroundColor: active ? colors.successSubtle : colors.input }]}>
      <View style={[styles.dot, { backgroundColor: active ? colors.successFill : colors.textTertiary }]} />
      <AppText variant="caption" weight="700" tone={active ? 'success' : 'secondary'}>
        {status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Archived'}
      </AppText>
    </View>
  );
}

/** One plan in the My plans list. */
export function PlanCard({ plan, today, onPress }: { plan: Plan; today: ISODate; onPress: () => void }) {
  const { colors } = useAppTheme();
  const next = nextWorkout(plan, today);
  const week = programWeek(plan, today);

  return (
    <PressableScale onPress={onPress} style={styles.fill} accessibilityRole="button" accessibilityLabel={`${plan.name}, ${plan.status}, ${describeSchedule(plan.schedule)}`}>
      <Card style={styles.fill}>
        <View style={styles.stack}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="title3" weight="700" numberOfLines={1}>
                {plan.name}
              </AppText>
              <AppText variant="footnote" tone="secondary">
                {`${PLAN_TYPE_LABEL[plan.schedule.type]}  ·  ${describeSchedule(plan.schedule)}${week ? `  ·  week ${week}` : ''}`}
              </AppText>
            </View>
            <StatusPill status={plan.status} />
          </View>
          <ScheduleGrid schedule={plan.schedule} workouts={plan.workouts} today={plan.status === 'active' ? today : undefined} startDate={plan.startDate} />
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
