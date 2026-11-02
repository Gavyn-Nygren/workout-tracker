import type { SFSymbol } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, ListRow, ToastViewport, Toggle, useToast } from '@/components/ui';
import { isNotificationToggle } from '@/data/preferences';
import type { NotificationToggle, Preferences } from '@/data/types';
import { WEEKDAY_LONG } from '@/lib/format';
import { PLAN_OFFER_KINDS, type PlanOfferKind } from '@/features/notifications/planOffer';
import { markPlanOfferAsked } from '@/features/notifications/planOfferStore';
import { formatTime, useSettings } from '@/features/settings/useSettings';
import type { AlarmPermission } from '@/features/workout/restAlarm';
import { refreshNotificationPermission, requestNotificationPermission, useNotificationPermission } from '@/features/workout/useRestAlarm';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const BENEFITS: { icon: SFSymbol; text: string }[] = [
  { icon: 'timer', text: 'Know when rest is over, even with your phone locked' },
  { icon: 'calendar', text: 'Reminders on training days, at a time you choose' },
  { icon: 'calendar.badge.exclamationmark', text: 'A heads-up the morning after a missed workout' },
  { icon: 'chart.bar', text: 'A weekly summary of your workouts and PRs' },
  { icon: 'moon', text: 'Quiet hours, and every type can be turned off' },
];

/** The first-plan offer's three switches, worded like Profile → Notifications. */
const PLAN_ROWS: { key: PlanOfferKind; title: string; icon: SFSymbol; subtitle: (n: Preferences['notifications']) => string }[] = [
  { key: 'workoutReminders', title: 'Workout reminders', icon: 'calendar', subtitle: (n) => `At ${formatTime(n.reminderTime)} on days with a planned workout` },
  { key: 'missedWorkout', title: 'Missed workout', icon: 'calendar.badge.exclamationmark', subtitle: () => 'The morning after, with the option to shift your plan' },
  { key: 'weeklySummary', title: 'Weekly summary', icon: 'chart.bar', subtitle: (n) => `${WEEKDAY_LONG[n.weeklySummaryAt.weekday]}s at ${formatTime(n.weeklySummaryAt.time)}` },
];

const ALL_CHOSEN: Record<PlanOfferKind, boolean> = { workoutReminders: true, missedWorkout: true, weeklySummary: true };

/**
 * Explains notifications before iOS asks (spec 2.11: ask at the first relevant moment, after a
 * short explanation). Opened when the user first turns a notification on (`key`, one of the five
 * toggles; anything else is ignored), with `from=rest` by the first rest of a workout to offer the
 * rest alarm (decision A), and with `from=plan` once after the first plan is scheduled, to offer
 * reminders, missed-workout prompts and the weekly summary, each its own switch, all on.
 */
export default function NotificationPermissionScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ key?: string; from?: string }>();
  // Typed routes only check links at compile time: a link can carry any key, and only a toggle may be written.
  const key = isNotificationToggle(params.key) ? params.key : undefined;
  const forPlan = params.from === 'plan';
  const forRest = !forPlan && params.from === 'rest' && key === 'restTimer';
  const toast = useToast();
  const { preferences, update } = useSettings();
  const permission = useNotificationPermission();
  const blocked = permission === 'denied';
  const [chosen, setChosen] = useState(ALL_CHOSEN);
  const chosenKinds = PLAN_OFFER_KINDS.filter((kind) => chosen[kind]);

  useEffect(() => {
    void refreshNotificationPermission();
  }, []);

  const enable = () => {
    const keys: NotificationToggle[] = forPlan ? chosenKinds : key ? [key] : [];
    if (!keys.length) return;
    update((p) => {
      const notifications = { ...p.notifications };
      for (const k of keys) notifications[k] = true;
      return { ...p, notifications };
    });
  };

  const close = () => {
    if (forPlan) markPlanOfferAsked();
    router.back();
  };

  const allow = async () => {
    let answer: AlarmPermission;
    try {
      // Already allowed: just turn it on, with no iOS prompt.
      answer = permission === 'granted' ? permission : await requestNotificationPermission();
    } catch {
      // Carry on as if denied.
      toast.show({ message: "Couldn't ask for notification permission. You can turn it on in Settings." });
      close();
      return;
    }
    if (answer === 'granted') {
      enable();
      // The sheet closes, so the change is said rather than shown. A running rest gets its alarm now.
      if (forRest) AccessibilityInfo.announceForAccessibilityWithOptions('Rest alarm on.', { queue: true });
      // From a plan nothing on screen changes, so say where to change them.
      if (forPlan) toast.show({ message: 'Notifications on. You can change them in Profile.', tone: 'success' });
    } else {
      toast.show({ message: 'Notifications stay off. You can allow them in iOS Settings.' });
    }
    close();
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.cardElevated }]} onAccessibilityEscape={close}>
      {/* The sheet opens full height at large text sizes; the content scrolls so the buttons stay reachable. */}
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={[styles.icon, { backgroundColor: colors.accentSubtle }]}>
          <Icon name={forRest ? 'timer' : 'bell.badge.fill'} color={colors.accentText} size={32} />
        </View>
        {forRest ? (
          <>
            <AppText variant="title2" accessibilityRole="header" style={styles.center}>
              Know when rest is over
            </AppText>
            <AppText variant="body" style={[styles.center, styles.lead]}>
              Get a notification when your rest ends, even with your phone locked or while you’re in another app. It says what’s next, like “Squat, set 3”.
            </AppText>
            <AppText variant="footnote" tone="secondary" style={styles.center}>
              You can turn it off anytime in Profile → Notifications.
            </AppText>
          </>
        ) : forPlan ? (
          <>
            <AppText variant="title2" accessibilityRole="header" style={styles.center}>
              Stay on track with your plan
            </AppText>
            <AppText variant="body" style={[styles.center, styles.lead]}>
              Pick what you’d like. You can change these anytime in Profile → Notifications.
            </AppText>
            {!blocked && (
              <Card padding="none" style={styles.choices}>
                {PLAN_ROWS.map((row, i) => (
                  <ListRow
                    key={row.key}
                    title={row.title}
                    subtitle={row.subtitle(preferences.notifications)}
                    icon={row.icon}
                    trailing={<Toggle label={row.title} value={chosen[row.key]} onChange={(on) => setChosen((c) => ({ ...c, [row.key]: on }))} />}
                    separator={i < PLAN_ROWS.length - 1}
                  />
                ))}
              </Card>
            )}
          </>
        ) : (
          <>
            <AppText variant="title2" accessibilityRole="header" style={styles.center}>
              Stay on track without checking the app
            </AppText>
            <View style={styles.list}>
              {BENEFITS.map((b) => (
                <View key={b.text} style={styles.item}>
                  <Icon name={b.icon} color={colors.accentText} size={18} />
                  <AppText variant="subhead" style={styles.flex}>
                    {b.text}
                  </AppText>
                </View>
              ))}
            </View>
          </>
        )}
        {blocked ? (
          <>
            <AppText variant="footnote" tone="secondary" style={styles.center}>
              Notifications are turned off for this app in iOS Settings.
            </AppText>
            <Button title="Open iOS Settings" fullWidth onPress={() => Linking.openSettings()} />
          </>
        ) : forPlan ? (
          <Button
            title="Turn on"
            fullWidth
            disabled={chosenKinds.length === 0}
            accessibilityHint={chosenKinds.length ? 'Turns on the notifications switched on above' : 'Switch one on above first'}
            onPress={allow}
          />
        ) : (
          <Button title={forRest ? 'Turn on rest alarm' : 'Turn on notifications'} fullWidth onPress={allow} />
        )}
        <Button title="Not now" variant="ghost" onPress={close} style={styles.centerSelf} />
      </ScrollView>
      <ToastViewport bottomOffset={spacing.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  center: {
    textAlign: 'center',
  },
  lead: {
    marginTop: spacing.xs,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  choices: {
    marginVertical: spacing.sm,
  },
  list: {
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
