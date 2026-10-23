import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon } from '@/components/ui';
import { daysBetween } from '@/data/dates';
import type { ISODate } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { formatWeekday, plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { DayItem } from './agenda';

type Props = {
  missed: DayItem;
  today: ISODate;
  onView: () => void;
};

/**
 * Offers, never forces, a calendar shift after a missed workout (spec 2.5). The missed workout
 * stays on its date either way. Pushing is visual only until G3.7 implements the shift.
 */
export function MissedBanner({ missed, today, onView }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const [state, setState] = useState<'asking' | 'pushed' | 'dismissed'>('asking');
  const days = daysBetween(missed.date, today);
  const planName = missed.plan?.name ?? 'this plan';

  if (state === 'dismissed') return null;

  if (state === 'pushed') {
    return (
      <Card>
        <View style={styles.row}>
          <Icon name="checkmark.circle.fill" color={colors.successFill} size={22} />
          <AppText variant="subhead" style={styles.flex}>
            {`${missed.name} moved to today, and the rest of ${planName} moved ${plural(days, 'day')} later.`}
          </AppText>
          <Button title="Undo" variant="ghost" size="sm" onPress={() => setState('asking')} />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.row}>
          <Icon name="exclamationmark.triangle.fill" color={colors.warningFill} size={22} />
          <View style={styles.flex}>
            <AppText variant="headline">{`You missed ${missed.name} on ${formatWeekday(missed.date)}`}</AppText>
            <AppText variant="subhead" tone="secondary">
              {`Push ${planName} forward ${plural(days, 'day')} so ${missed.name} lands on today? If you keep the schedule, you can still do it from ${formatWeekday(missed.date)}.`}
            </AppText>
          </View>
        </View>
        <View style={styles.buttons}>
          <Button
            title={`Push forward ${plural(days, 'day')}`}
            variant="secondary"
            size="sm"
            onPress={() => {
              haptics.tap();
              setState('pushed');
            }}
          />
          <Button title="Keep schedule" variant="ghost" size="sm" onPress={() => setState('dismissed')} />
          <Button title={`View ${formatWeekday(missed.date).slice(0, 3)}`} variant="ghost" size="sm" onPress={onView} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 22 + spacing.md,
  },
  flex: {
    flex: 1,
  },
});
