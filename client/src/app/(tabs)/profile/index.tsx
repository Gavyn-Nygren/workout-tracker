import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, SectionHeader, SegmentedControl } from '@/components/ui';
import { usePersonalRecords, useSessions, useStreak } from '@/data/hooks';
import { formatClock } from '@/hooks/useNow';
import { authStore, resetFirstRun } from '@/features/auth/authStore';
import { useSettings } from '@/features/settings/useSettings';
import { useAppTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { Columns, dashboard } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

/** Profile (roadmap G2.8): account card with lifetime stats, then settings groups. */
export default function ProfileScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { preferences } = useSettings();
  const auth = authStore.use();
  const account = { name: auth.name, method: auth.method === 'apple' ? 'Signed in with Apple' : auth.email ?? 'Signed in with email' };
  const { data: sessions } = useSessions();
  const { data: streak } = useStreak();
  const { data: records } = usePersonalRecords();

  const workouts = (sessions ?? []).filter((s) => s.status === 'completed').length;
  const notificationsOn = Object.entries(preferences.notifications).filter(([k, v]) => typeof v === 'boolean' && v && k !== 'quietHours').length;
  const go = (pathname: '/profile/units' | '/profile/workout' | '/profile/notifications' | '/profile/privacy' | '/profile/data' | '/profile/about') => router.push(pathname);

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]}>
      {/* iPad: account and appearance on the left, settings on the right. */}
      <Columns
        leftFlex={1}
        left={
          <>
            <Card>
              <View style={styles.account}>
                <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                  <AppText variant="title2" tone="onAccent">
                    {account.name.slice(0, 1)}
                  </AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="title2">{account.name}</AppText>
                  <AppText variant="footnote" tone="secondary">
                    {account.method}
                  </AppText>
                </View>
              </View>
              <View style={[styles.stats, { borderTopColor: colors.border }]}>
                <Stat value={String(workouts)} label="workouts" />
                <Stat value={`${streak?.currentWeeks ?? 0} wk`} label="streak" />
                <Stat value={String(new Set((records ?? []).map((r) => r.setId)).size)} label="PRs set" />
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
                <ListRow title="Units & logging" icon="scalemass" value={`${preferences.units === 'imperial' ? 'lb' : 'kg'} · ${preferences.effortScale.toUpperCase()}`} onPress={() => go('/profile/units')} />
                <ListRow
                  title="Workout defaults"
                  icon="timer"
                  value={`${formatClock(preferences.restDefaultsSec.compound)} · ${formatClock(preferences.restDefaultsSec.isolation)}`}
                  onPress={() => go('/profile/workout')}
                />
                <ListRow title="Notifications" icon="bell" value={notificationsOn ? `${notificationsOn} on` : 'Off'} onPress={() => go('/profile/notifications')} />
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
                    title="Restart first-run setup"
                    subtitle="Sign out and see welcome, sign-up, and onboarding as a new user"
                    icon="arrow.counterclockwise"
                    onPress={() =>
                      Alert.alert('Restart first-run setup?', 'You will be signed out and taken through sign-up and onboarding. Your sample data stays.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Restart', onPress: resetFirstRun },
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title3" weight="800" numeric>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
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
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  section: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
