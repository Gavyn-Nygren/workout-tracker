import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, SectionHeader, SegmentedControl, useToast } from '@/components/ui';
import { useDevData } from '@/data/DataProvider';
import { useBodyweight, usePersonalRecords, useSessions, useStreak } from '@/data/hooks';
import { NOTIFICATION_TOGGLES } from '@/data/preferences';
import { workoutCount } from '@/data/progress';
import { beforeReopens } from '@/data/reopen';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { formatLoad } from '@/lib/format';
import { authStore, resetFirstRun } from '@/features/auth/authStore';
import { useNotificationDevTools } from '@/features/notifications/notificationsApi';
import { resetPlanOffer } from '@/features/notifications/planOfferStore';
import { swapData } from '@/features/settings/devData';
import { useSettings } from '@/features/settings/useSettings';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { useNotificationPermission } from '@/features/workout/useRestAlarm';
import { useAppTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { Columns, dashboard, DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

/** The toggles the Notifications row counts: form-analysis alerts aren't sent until form analysis is real (G4.5). */
const COUNTED_NOTIFICATIONS = NOTIFICATION_TOGGLES.filter((key) => key !== 'formAnalysisComplete');

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

/** Profile (roadmap G2.8): account card with lifetime stats, then settings groups. */
export default function ProfileScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { preferences } = useSettings();
  const { large } = useTextScale();
  const toast = useToast();
  const devData = useDevData();
  const { workout } = useActiveWorkout();
  const notificationPermission = useNotificationPermission();
  const notificationTools = useNotificationDevTools();
  const auth = authStore.use();
  const account = { name: auth.name, method: auth.method === 'apple' ? 'Signed in with Apple' : auth.email ?? 'Signed in with email' };
  const { data: sessions } = useSessions();
  const { data: streak } = useStreak();
  // Bodyweight can always be added here (it's asked once at first sign-in, never during workouts).
  const { data: weighIns } = useBodyweight();
  const latestWeight = weighIns?.length ? [...weighIns].sort((x, y) => x.date.localeCompare(y.date))[weighIns.length - 1] : undefined;
  const { data: records } = usePersonalRecords();

  // Workouts with at least one completed working set (a reopened one as it was); every record
  // counts, as on the summary.
  const workouts = workoutCount(beforeReopens(sessions ?? []));
  const prCount = records?.length ?? 0;
  const rest = preferences.restDefaultsSec;
  const notificationsOn = COUNTED_NOTIFICATIONS.filter((key) => preferences.notifications[key]).length;
  // With iOS notifications off, the saved toggles don't send anything, so the row says so.
  const offInIOS = notificationsOn > 0 && notificationPermission === 'denied';
  const notificationsValue = offInIOS ? 'Off in iOS' : notificationsOn ? `${notificationsOn} on` : 'Off';
  // Developer: one of each notification, to check the wording and the taps on the phone.
  const previewNotifications = async () => {
    if (notificationPermission === 'denied') {
      toast.show({ message: 'Notifications are off in iOS Settings.', tone: 'warning' });
      return;
    }
    if (notificationPermission === 'undetermined') {
      toast.show({ message: 'Allow notifications first: turn one on in Notifications.', tone: 'warning' });
      return;
    }
    try {
      await notificationTools.preview();
      toast.show({ message: 'One of each kind arrives in about 5 seconds.', tone: 'success' });
    } catch {
      toast.show({ message: "Couldn't send the previews. Try again.", tone: 'error' });
    }
  };
  const showPendingNotifications = async () => {
    try {
      Alert.alert('Pending notifications', await notificationTools.pendingSummary());
    } catch {
      toast.show({ message: "Couldn't read the pending notifications. Try again.", tone: 'error' });
    }
  };
  // Developer: Load sample data and Erase all data. An open workout would save itself back into
  // the new data, so it has to be finished or discarded first.
  const swap = async ({ title, message, action, run, failed }: { title: string; message: string; action: string; run: () => Promise<void>; failed: string }) => {
    const confirm = () =>
      new Promise<boolean>((resolve) =>
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: action, style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
    const result = await swapData({ workoutOpen: workout !== null, confirm, swap: run });
    if (result === 'workout-open') Alert.alert('Finish or discard your workout first', 'An open workout would be saved back into the new data.');
    if (result === 'failed') toast.show({ message: failed, tone: 'error' });
    return result === 'done';
  };
  const loadSample = async () => {
    const loaded = await swap({
      title: 'Load sample data?',
      message: devData.holdsSampleData()
        ? 'The sample data starts over, ending today. Weigh-ins you entered yourself stay. Settings stay, but Progress gets the sample’s pins and graphs again.'
        : 'Every workout, plan, goal, and recording is replaced with sample data, and so is every weigh-in except the one from setup. Settings stay, but Progress gets the sample’s pins and graphs.',
      action: 'Load sample data',
      run: devData.loadSample,
      failed: "Couldn't load the sample data. Try again.",
    });
    if (loaded) toast.show({ message: 'Sample data loaded.', tone: 'success' });
  };
  const eraseAll = async () => {
    const erased = await swap({
      title: 'Erase all data?',
      message: devData.holdsSampleData()
        ? 'The sample workouts, plans, weigh-ins, goals, and recordings are deleted from this phone. Weigh-ins you entered yourself stay. Settings stay, but Progress goes back to its default pins and graphs.'
        : 'Every workout, plan, goal, and recording is deleted from this phone, and so is every weigh-in except the one from setup. Settings stay, but Progress goes back to its default pins and graphs. This can’t be undone.',
      action: 'Erase',
      run: devData.eraseAll,
      failed: "Couldn't erase the data. Try again.",
    });
    if (erased) toast.show({ message: 'All data erased.' });
  };
  const go = (pathname: '/profile/units' | '/profile/workout' | '/profile/notifications' | '/profile/privacy' | '/profile/data' | '/profile/about') => router.push(pathname);

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]}>
      {/* iPad: account and appearance on the left, settings on the right. */}
      <Columns
        leftFlex={1}
        left={
          <>
            <Card>
              {/* At accessibility sizes the avatar sits above the name so the name gets the full width. */}
              <View style={large ? styles.accountStacked : styles.account}>
                {/* Decorative: the name is right beside it. */}
                <View style={[styles.avatar, { backgroundColor: colors.accent }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <AppText variant="title2" tone="onAccent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                    {account.name.slice(0, 1)}
                  </AppText>
                </View>
                <View style={!large && styles.flex}>
                  <AppText variant="title2">{account.name}</AppText>
                  <AppText variant="footnote" tone="secondary">
                    {account.method}
                  </AppText>
                </View>
              </View>
              {/* Four narrow columns can't hold the words at accessibility sizes, so the stats become lines. */}
              <View style={[large ? styles.statsStacked : styles.stats, { borderTopColor: colors.border }]}>
                <Stat value={sessions ? String(workouts) : '—'} label="workouts" spoken={sessions ? `${workouts} ${workouts === 1 ? 'workout' : 'workouts'}` : 'Workouts, loading'} inline={large} />
                <Stat value={streak ? `${streak.currentWeeks} wk` : '—'} label="streak" spoken={streak ? `${streak.currentWeeks}-week streak` : 'Streak, loading'} inline={large} />
                <Stat
                  value={streak ? `${streak.longestWeeks} wk` : '—'}
                  label="best streak"
                  spoken={streak ? `Longest streak: ${streak.longestWeeks} ${streak.longestWeeks === 1 ? 'week' : 'weeks'}` : 'Longest streak, loading'}
                  inline={large}
                />
                <Stat value={records ? String(prCount) : '—'} label="PRs set" spoken={records ? `${prCount} ${prCount === 1 ? 'PR' : 'PRs'} set` : 'PRs, loading'} inline={large} />
              </View>
            </Card>

            <View style={styles.section}>
              <SectionHeader title="Appearance" />
              <Card>
                <SegmentedControl label="Appearance" options={THEME_OPTIONS} value={preference} onChange={setPreference} />
              </Card>
            </View>
          </>
        }
        right={
          <>
            <View style={styles.section}>
              <SectionHeader title="Settings" />
              <Card padding="none">
                <ListRow
                  title="Bodyweight"
                  icon="figure.stand"
                  value={latestWeight ? formatLoad(latestWeight.weightKg, preferences.units) : 'Add'}
                  accessibilityHint="Logs today's bodyweight"
                  onPress={() => router.push('/log-weight')}
                />
                <ListRow
                  title="Units & logging"
                  icon="scalemass"
                  value={`${preferences.units === 'imperial' ? 'lb' : 'kg'} · ${preferences.effortScale.toUpperCase()}`}
                  accessibilityLabel={`Units & logging, ${preferences.units === 'imperial' ? 'pounds' : 'kilograms'}, ${preferences.effortScale === 'rpe' ? 'RPE' : 'reps in reserve'}`}
                  onPress={() => go('/profile/units')}
                />
                <ListRow
                  title="Workout defaults"
                  icon="timer"
                  value={`${formatClock(rest.compound)} · ${formatClock(rest.isolation)}`}
                  accessibilityLabel={`Workout defaults, compound rest ${spokenDuration(rest.compound)}, isolation rest ${spokenDuration(rest.isolation)}`}
                  onPress={() => go('/profile/workout')}
                />
                <ListRow
                  title="Notifications"
                  icon="bell"
                  value={notificationsValue}
                  accessibilityLabel={offInIOS ? 'Notifications, off in iOS Settings' : undefined}
                  onPress={() => go('/profile/notifications')}
                />
                <ListRow title="Privacy & security" icon="lock" value={preferences.biometricLock.enabled ? 'Face ID on' : undefined} onPress={() => go('/profile/privacy')} />
                <ListRow title="Data & account" icon="person.crop.circle" onPress={() => go('/profile/data')} />
                <ListRow title="About" icon="info.circle" onPress={() => go('/profile/about')} separator={false} />
              </Card>
            </View>

            {__DEV__ && (
              <View style={styles.section}>
                <SectionHeader title="Developer" />
                <Card padding="none">
                  <ListRow title="Component gallery" subtitle="Every shared component, in the current theme" icon="square.grid.2x2" onPress={() => router.push('/dev/gallery')} />
                  <ListRow
                    title="Preview notifications"
                    subtitle="A reminder, a missed workout, and a weekly summary in about 5 seconds"
                    icon="bell.badge"
                    accessibilityHint="Sends one of each with your real workouts. The scheduled ones stay as they are."
                    onPress={() => void previewNotifications()}
                  />
                  <ListRow
                    title="Pending notifications"
                    subtitle="What's scheduled on this phone"
                    icon="list.bullet.rectangle"
                    accessibilityHint="Lists the scheduled reminders, missed-workout alerts, and summaries"
                    onPress={() => void showPendingNotifications()}
                  />
                  <ListRow
                    title="Open weekly summary"
                    subtitle="Your week, as the summary notification opens it"
                    icon="chart.bar.xaxis"
                    onPress={() => router.push('/weekly-summary')}
                  />
                  <ListRow
                    title="Load sample data"
                    subtitle="Replace everything with eight weeks of sample workouts ending today"
                    icon="tray.and.arrow.down"
                    onPress={() => void loadSample()}
                  />
                  <ListRow
                    title="Erase all data"
                    subtitle={devData.holdsSampleData() ? 'Remove the sample data and start using the app for real' : 'Remove your workouts, plans, goals, recordings, and weigh-ins'}
                    icon="trash"
                    destructive
                    onPress={() => void eraseAll()}
                  />
                  <ListRow
                    title="Restart first-run setup"
                    subtitle="Sign out and see welcome, sign-up, and onboarding as a new user"
                    icon="arrow.counterclockwise"
                    onPress={() =>
                      Alert.alert('Restart first-run setup?', 'You will be signed out and taken through sign-up and onboarding. Your data stays.', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Restart',
                          onPress: () => {
                            // The next plan started in onboarding offers reminders again.
                            resetPlanOffer();
                            resetFirstRun();
                          },
                        },
                      ])
                    }
                    separator={false}
                  />
                </Card>
              </View>
            )}
          </>
        }
      />
    </ScrollView>
  );
}

/** One VoiceOver stop per stat, e.g. "3-week streak". `inline` puts the label after the value on one line. */
function Stat({ value, label, spoken, inline }: { value: string; label: string; spoken: string; inline?: boolean }) {
  return (
    <View style={inline ? styles.statInline : styles.stat} accessible accessibilityLabel={spoken}>
      <AppText variant="title3" weight="800" numeric>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary" style={inline && styles.flex}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  accountStacked: {
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  statsStacked: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
