import { router } from 'expo-router';
import { useMemo, type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { cameraStackAvailable } from '@/features/form/spike/nativeCamera';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * Developer → Camera spike (roadmap G4.2): the live camera, pose detection and skeleton overlay,
 * with the frame rate, latency, heat and battery readings, and timed runs to export.
 *
 * Expo Router loads every route file when a development bundle starts, so nothing here imports
 * camera code: the screen loads it only once the build is known to include it.
 */
export default function CameraSpikeRoute() {
  const Spike = useMemo((): ComponentType | null => {
    if (!cameraStackAvailable()) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@/features/form/spike/CameraSpike') as typeof import('@/features/form/spike/CameraSpike')).CameraSpike;
  }, []);
  return Spike ? <Spike /> : <NeedsNewBuild />;
}

function NeedsNewBuild() {
  const insets = useSafeAreaInsets();
  return (
    <SchemeOverride scheme="dark">
      <NeedsNewBuildBody top={insets.top} bottom={insets.bottom} />
    </SchemeOverride>
  );
}

function NeedsNewBuildBody({ top, bottom }: { top: number; bottom: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: top + spacing.xl, paddingBottom: bottom + spacing.lg }]}>
      <View style={styles.body}>
        <AppText variant="title2">Needs the new Tracker Dev build</AppText>
        <AppText tone="secondary">
          The camera spike runs native camera and pose code that this build doesn&apos;t have. Install the Tracker Dev build made for G4.2 (see DEV_BUILD.md), then open this again.
        </AppText>
      </View>
      <Button title="Close" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'space-between' },
  body: { gap: spacing.md },
});
