import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { useAppTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ProfileScreen() {
  const { colors, preference, setPreference } = useAppTheme();

  return (
    <PlaceholderScreen
      title="Profile"
      summary="Account, settings, data export, and account deletion."
      goal="G2.8"
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.segmented, { backgroundColor: colors.background }]} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPreference(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.segment, selected && { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.segmentText, { color: selected ? colors.onAccent : colors.text }]}>
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
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
