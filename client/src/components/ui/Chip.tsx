import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: SFSymbol;
};

/** Toggleable filter chip, e.g. muscle groups in the exercise picker or graph metrics. Selected chips fill with the accent. */
export function Chip({ label, selected = false, onPress, icon }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();

  const palette = selected
    ? { background: colors.accent, foreground: colors.onAccent }
    : { background: colors.input, foreground: colors.text };

  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      hitSlop={4}
      style={[styles.chip, { backgroundColor: palette.background }]}
    >
      {icon && <Icon name={icon} color={palette.foreground} size={14} />}
      <AppText variant="subhead" weight="600" style={{ color: palette.foreground }} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 34,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
  },
});
