import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { designChoices, type ChipSelectedStyle } from '@/theme/choices';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: SFSymbol;
  /** Gallery only: compare selected styles before one is chosen. */
  selectedStyle?: ChipSelectedStyle;
};

/** Toggleable filter chip, e.g. muscle groups in the exercise picker or graph metrics. */
export function Chip({ label, selected = false, onPress, icon, selectedStyle = designChoices.chipSelected }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();

  const palette = !selected
    ? { background: colors.input, foreground: colors.text, border: 'transparent' }
    : selectedStyle === 'filled'
      ? { background: colors.accent, foreground: colors.onAccent, border: 'transparent' }
      : { background: colors.accentSubtle, foreground: colors.accentText, border: colors.accentText };

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
      style={[styles.chip, { backgroundColor: palette.background, borderColor: palette.border }]}
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
    borderWidth: 1.5,
  },
});
