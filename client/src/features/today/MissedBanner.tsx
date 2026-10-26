import { useMemo } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon } from '@/components/ui';
import { usePlans, usePlanShifts, usePreferences, usePushPlanForward, useUndoPlanShift } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { ID, ISODate } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { formatWeekday, plural } from '@/lib/format';
import { newId } from '@/lib/id';
import { createLocalStore } from '@/lib/localStore';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Agenda } from './agenda';
import {
  askingMessage,
  askingTitle,
  dismissMissed,
  missedBannerState,
  pruneDismissed,
  pushedMessage,
  undoneMessage,
  type DismissedMiss,
  type MissedBannerState,
} from './missed';

/** Missed workouts kept on their dates with "Keep schedule", remembered across restarts. */
const dismissedStore = createLocalStore<DismissedMiss[]>('today.keptMissed', []);

/**
 * What the missed-workout banner shows today, or undefined for none (see missed.ts).
 * `activeOccurrenceId` is the workout open right now, which counts as started.
 */
export function useMissedBanner(agenda: Agenda, today: ISODate, activeOccurrenceId?: ID): MissedBannerState | undefined {
  const shifts = usePlanShifts();
  const plans = usePlans();
  // A weekly plan's push stays within the week, so the wording depends on where the week starts.
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? defaultPreferences.weekStartsOn;
  const dismissed = dismissedStore.use();
  return useMemo(() => {
    if (!shifts.data || !plans.data) return undefined;
    const ids = new Set(pruneDismissed(dismissed, today).map((d) => d.id));
    return missedBannerState({ agenda, today, plans: plans.data, shifts: shifts.data, dismissed: ids, activeOccurrenceId, weekStartsOn });
  }, [agenda, today, plans.data, shifts.data, dismissed, activeOccurrenceId, weekStartsOn]);
}

type Props = {
  state: MissedBannerState;
  today: ISODate;
  /** Shows the missed day on the calendar. */
  onView: (date: ISODate) => void;
};

/**
 * Offers, never forces, a calendar shift after a missed workout (spec 2.5). The missed workout
 * stays on its date unless the user pushes. A push can be undone until the end of the day, or
 * until the moved workout is started.
 */
export function MissedBanner({ state, today, onView }: Props) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const haptics = useHaptics();
  const push = usePushPlanForward();
  const undo = useUndoPlanShift();

  // The pressed button disappears with the change, so VoiceOver confirms what happened, once it's
  // saved. A failure shows the save-error toast instead. (mutateAsync still settles if the banner
  // re-mounts while the calendar reloads.)
  const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);

  if (state.kind === 'pushed') {
    return (
      <Card>
        {/* Large text: Undo goes under the message instead of squeezing it into a narrow column. */}
        <View style={[styles.row, large && styles.stacked]}>
          <View style={[styles.row, styles.flexRow]}>
            <Icon name="checkmark.circle.fill" color={colors.successFill} size={22} />
            <AppText variant="subhead" style={styles.flex}>
              {pushedMessage(state)}
            </AppText>
          </View>
          <Button
            title="Undo"
            variant="ghost"
            size="sm"
            accessibilityLabel="Undo push"
            loading={undo.isPending}
            onPress={() => {
              const message = undoneMessage(state);
              undo
                .mutateAsync(state.shift.id)
                .then(() => announce(message))
                .catch(() => {});
            }}
            style={large && styles.indent}
          />
        </View>
      </Card>
    );
  }

  const weekday = formatWeekday(state.date);
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.row}>
          {/* warningText: raw amber is 1.8:1 on a white card (the same amber in dark mode). */}
          <Icon name="exclamationmark.triangle.fill" color={colors.warningText} size={22} />
          <View style={styles.flex}>
            <AppText variant="headline">{askingTitle(state)}</AppText>
            <AppText variant="subhead" tone="secondary">
              {askingMessage(state)}
            </AppText>
          </View>
        </View>
        <View style={[styles.buttons, !large && styles.indent]}>
          <Button
            title={`Push forward ${plural(state.days, 'day')}`}
            variant="secondary"
            size="sm"
            loading={push.isPending}
            onPress={() => {
              haptics.tap();
              const message = pushedMessage(state);
              push
                .mutateAsync({ occurrenceId: state.occurrenceId, shiftId: newId('shift') })
                .then(() => announce(message))
                .catch(() => {});
            }}
          />
          <Button
            title="Keep schedule"
            variant="ghost"
            size="sm"
            disabled={push.isPending}
            onPress={() => {
              dismissedStore.set((kept) => dismissMissed(kept, state.items, today));
              announce('Schedule kept.');
            }}
          />
          <Button title={`View ${weekday.slice(0, 3)}`} accessibilityLabel={`View ${weekday}`} variant="ghost" size="sm" onPress={() => onView(state.date)} />
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
