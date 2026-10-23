import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { useAppTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, spacing, typography } from '@/theme/tokens';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ProfileScreen() {
  const { colors, elevation, preference, setPreference } = useAppTheme();

  return (
    <PlaceholderScreen
      title="Profile"
      summary="Account, settings, data export, and account deletion."
      goal="G2.8"
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, boxShadow: elevation.card }]}>
        <Text style={[typography.label, { color: colors.textSecondary }]}>Appearance</Text>
        <View style={[styles.segmented, { backgroundColor: colors.input }]} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPreference(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[styles.segment, selected && { backgroundColor: colors.accent }]}
              >
                <Text style={[typography.subhead, styles.segmentText, { color: selected ? colors.onAccent : colors.text }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  segmentText: {
    fontWeight: '700',
  },
});
