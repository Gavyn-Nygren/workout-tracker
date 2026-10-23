import { useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon } from '@/components/ui';
import { daysBetween } from '@/data/dates';
import type { ISODate } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { formatWeekday, plural } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
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
  const { large } = useTextScale();
  const haptics = useHaptics();
  const [state, setState] = useState<'asking' | 'pushed' | 'dismissed'>('asking');
  const days = daysBetween(missed.date, today);
  const planName = missed.plan?.name ?? 'this plan';
  const weekday = formatWeekday(missed.date);
  const pushedText = `${missed.name} moved to today, and the rest of ${planName} moved ${plural(days, 'day')} later.`;

  // The pressed button disappears with the change, so VoiceOver confirms what happened.
  const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);

  if (state === 'dismissed') return null;

  if (state === 'pushed') {
    return (
      <Card>
        {/* Large text: Undo goes under the message instead of squeezing it into a narrow column. */}
        <View style={[styles.row, large && styles.stacked]}>
          <View style={[styles.row, styles.flexRow]}>
            <Icon name="checkmark.circle.fill" color={colors.successFill} size={22} />
            <AppText variant="subhead" style={styles.flex}>
              {pushedText}
            </AppText>
          </View>
          <Button
            title="Undo"
            variant="ghost"
            size="sm"
            accessibilityLabel="Undo push"
            onPress={() => {
              setState('asking');
              announce(`Push undone. ${missed.name} stays on ${weekday}.`);
            }}
            style={large && styles.indent}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.row}>
          {/* warningText: raw amber is 1.8:1 on a white card (the same amber in dark mode). */}
          <Icon name="exclamationmark.triangle.fill" color={colors.warningText} size={22} />
          <View style={styles.flex}>
            <AppText variant="headline">{`You missed ${missed.name} on ${weekday}`}</AppText>
            <AppText variant="subhead" tone="secondary">
              {`Push ${planName} forward ${plural(days, 'day')} so ${missed.name} lands on today? If you keep the schedule, you can still do it from ${weekday}.`}
            </AppText>
          </View>
        </View>
        <View style={[styles.buttons, !large && styles.indent]}>
          <Button
            title={`Push forward ${plural(days, 'day')}`}
            variant="secondary"
            size="sm"
            onPress={() => {
              haptics.tap();
              setState('pushed');
              announce(pushedText);
            }}
          />
          <Button
            title="Keep schedule"
            variant="ghost"
            size="sm"
            onPress={() => {
              setState('dismissed');
              announce('Schedule kept.');
            }}
          />
          <Button title={`View ${weekday.slice(0, 3)}`} accessibilityLabel={`View ${weekday}`} variant="ghost" size="sm" onPress={onView} />
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
  stacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  flexRow: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Lines up with the text, past the 22 pt icon.
  indent: {
    marginLeft: 22 + spacing.md,
  },
  flex: {
    flex: 1,
  },
});
