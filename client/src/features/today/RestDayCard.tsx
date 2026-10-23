import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon } from '@/components/ui';
import type { ISODate } from '@/data/types';
import { formatLongDate, formatShortDate } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { DayItem } from './agenda';

type Props = {
  date: ISODate;
  today: ISODate;
  next?: DayItem;
  onShowNext: () => void;
};

/** Shown for a day with nothing scheduled or completed. */
export function RestDayCard({ date, today, next, onShowNext }: Props) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const isPast = date < today;

  return (
    <Card>
      <View style={styles.stack}>
        <View style={[styles.iconWell, { backgroundColor: colors.accentSubtle }]}>
          <Icon name="bed.double.fill" color={colors.accentText} size={24} />
        </View>
        <AppText variant="title2" accessibilityRole="header">
          Rest day
        </AppText>
        <AppText variant="subhead" tone="secondary">
          {isPast ? 'No workouts were scheduled or logged on this day.' : 'Nothing scheduled. Recovery is part of the plan.'}
        </AppText>
        {next && (
          // Large text: View goes under the text instead of squeezing it into a narrow column.
          <View style={[styles.next, large && styles.nextStacked, { borderColor: colors.border }]}>
            <View style={!large && styles.flex}>
              <AppText variant="footnote" tone="secondary">
                Next up
              </AppText>
              <AppText variant="headline">{`${next.name} · ${formatShortDate(next.date)}`}</AppText>
            </View>
            <Button title="View" accessibilityLabel={`View ${next.name}, ${formatLongDate(next.date)}`} variant="secondary" size="sm" onPress={onShowNext} />
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  nextStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
});
