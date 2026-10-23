import { router } from 'expo-router';
import { View } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Card, ListRow, SectionHeader, SegmentedControl } from '@/components/ui';
import { useAppTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export default function ProfileScreen() {
  const { preference, setPreference } = useAppTheme();

  return (
    <PlaceholderScreen title="Profile" summary="Account, settings, data export, and account deletion." goal="G2.8">
      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Appearance" />
        <Card>
          <SegmentedControl label="Appearance" options={THEME_OPTIONS} value={preference} onChange={setPreference} />
        </Card>
      </View>
      {__DEV__ && (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Developer" />
          <Card padding="none">
            <ListRow
              title="Component gallery"
              subtitle="Every shared component, in the current theme"
              icon="square.grid.2x2"
              onPress={() => router.push('/dev/gallery')}
              separator={false}
            />
          </Card>
        </View>
      )}
    </PlaceholderScreen>
  );
}
