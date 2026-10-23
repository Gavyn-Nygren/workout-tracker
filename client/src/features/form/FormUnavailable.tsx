import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Shown instead of the camera on phones older than iPhone 12 (spec 2.2). */
export function FormUnavailable({ onClose }: { onClose: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: colors.input }]}>
        <Icon name="video.slash.fill" color={colors.textSecondary} size={30} />
      </View>
      <AppText variant="title2" style={styles.center}>
        Form analysis needs a newer iPhone
      </AppText>
      <AppText variant="body" tone="secondary" style={styles.center}>
        Analyzing video on the phone needs an iPhone 12 or newer, so the camera stays off on this device. Everything else works as usual, including logging every set.
      </AppText>
      <Button title="Got it" onPress={onClose} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
  button: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
});
