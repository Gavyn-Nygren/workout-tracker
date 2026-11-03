import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, ListRow, SectionHeader, SegmentedControl, Toggle, useToast } from '@/components/ui';
import { lockSubtitle, lockSupport, lockSwitchDisabled, type LockSupport } from '@/features/settings/lockSupport';
import { useSettings } from '@/features/settings/useSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/**
 * Face ID lock and data sharing (spec 2.3 and 2.2). Turning the lock on asks for Face ID once to
 * confirm it works; enforcing the lock on return to the app comes in G4.8.
 */
export default function PrivacyScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const { preferences, update } = useSettings();
  const lock = preferences.biometricLock;
  const [support, setSupport] = useState<LockSupport | undefined>(undefined);

  useEffect(() => {
    Promise.all([LocalAuthentication.getEnrolledLevelAsync(), LocalAuthentication.supportedAuthenticationTypesAsync(), LocalAuthentication.hasHardwareAsync()])
      .then(([level, types, hardware]) =>
        setSupport(lockSupport({ level, faceIdPhone: types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION), biometryAllowed: hardware })),
      )
      .catch(() => setSupport(undefined));
  }, []);

  const toggleLock = async (on: boolean) => {
    if (!on) {
      update({ biometricLock: { ...lock, enabled: false } });
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on Face ID lock', fallbackLabel: 'Use passcode' }).catch(() => undefined);
    if (!result) {
      toast.show({ message: "Couldn't check Face ID. The lock stays off.", tone: 'error' });
    } else if (result.success) {
      update({ biometricLock: { ...lock, enabled: true } });
      toast.show({ message: 'Face ID lock is on.', tone: 'success' });
    } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel' && result.error !== 'app_cancel') {
      toast.show({ message: "Face ID didn't confirm. The lock stays off.", tone: 'warning' });
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]}>
      <View style={styles.section}>
        <SectionHeader title="App lock" />
        <Card padding="none">
          <ListRow
            title="Face ID lock"
            subtitle={lockSubtitle(support)}
            icon="faceid"
            trailing={<Toggle label="Face ID lock" value={lock.enabled} onChange={toggleLock} disabled={lockSwitchDisabled(support, lock.enabled)} />}
            separator={false}
          />
        </Card>
        {lock.enabled && (
          <>
            <AppText variant="footnote" tone="secondary" style={styles.hint}>
              Lock after the app has been in the background for
            </AppText>
            <SegmentedControl
              label="Lock after"
              options={[
                { value: '0', label: 'Immediately' },
                { value: '300', label: '5 min' },
                { value: '3600', label: '1 hour' },
              ]}
              value={String(lock.afterSec) as '0' | '300' | '3600'}
              onChange={(v) => update({ biometricLock: { ...lock, afterSec: Number(v) as 0 | 300 | 3600 } })}
            />
          </>
        )}
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          The lock never interrupts a workout in progress or a running rest timer. The app never sees or stores your face; iOS handles Face ID.
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Sharing" />
        <Card padding="none">
          <ListRow
            title="Share anonymous usage data"
            subtitle="Crash reports and a few events like 'workout finished'. Never video, pose data, or health values."
            icon="chart.bar.doc.horizontal"
            trailing={<Toggle label="Share anonymous usage data" value={preferences.telemetry} onChange={(telemetry) => update({ telemetry })} />}
            separator={false}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your videos" />
        <Card>
          <View style={styles.info}>
            <Icon name="lock.iphone" color={colors.accentText} size={22} />
            <AppText variant="subhead" style={styles.flex}>
              Form recordings stay on this phone. They're analyzed here and never uploaded. Export or delete them from each form report.
            </AppText>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
