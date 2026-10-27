import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, ToastViewport, useToast } from '@/components/ui';
import type { Preferences } from '@/data/types';
import { useSettings } from '@/features/settings/useSettings';
import { refreshNotificationPermission, requestNotificationPermission, useNotificationPermission } from '@/features/workout/useRestAlarm';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Key = Exclude<keyof Preferences['notifications'], 'quietHours' | 'reminderTime' | 'weeklySummaryAt'>;

const BENEFITS: { icon: 'timer' | 'calendar' | 'chart.bar' | 'moon'; text: string }[] = [
  { icon: 'timer', text: 'Know when rest is over, even with your phone locked' },
  { icon: 'calendar', text: "Reminders on training days, at a time you choose" },
  { icon: 'chart.bar', text: 'A weekly summary of your workouts and PRs' },
  { icon: 'moon', text: 'Quiet hours, and every type can be turned off' },
];

/**
 * Explains notifications before iOS asks (spec 2.11: ask at the first relevant moment, after a
 * short explanation). Opened when the user first turns a notification on, and with `from=rest`
 * by the first rest of a workout, to offer the rest alarm (decision A).
 */
export default function NotificationPermissionScreen() {
  const { colors } = useAppTheme();
  const { key, from } = useLocalSearchParams<{ key?: Key; from?: 'rest' }>();
  const toast = useToast();
  const { update } = useSettings();
  const permission = useNotificationPermission();
  const blocked = permission === 'denied';
  const forRest = from === 'rest' && key === 'restTimer';

  useEffect(() => {
    void refreshNotificationPermission();
  }, []);

  const enable = () => {
    if (key) update((p) => ({ ...p, notifications: { ...p.notifications, [key]: true } }));
  };

  const allow = async () => {
    try {
      // Already allowed: just turn it on, with no iOS prompt.
      const answer = permission === 'granted' ? permission : await requestNotificationPermission();
      if (answer === 'granted') {
        enable();
        // The sheet closes, so the change is said rather than shown. A running rest gets its alarm now.
        if (forRest) AccessibilityInfo.announceForAccessibilityWithOptions('Rest alarm on.', { queue: true });
      }
    } catch {
      // Carry on as if denied.
      toast.show({ message: "Couldn't ask for notification permission. You can turn it on in Settings." });
    }
    router.back();
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.cardElevated }]}>
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
        ) : (
          <Button title={forRest ? 'Turn on rest alarm' : 'Turn on notifications'} fullWidth onPress={allow} />
        )}
        <Button title="Not now" variant="ghost" onPress={() => router.back()} style={styles.centerSelf} />
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
