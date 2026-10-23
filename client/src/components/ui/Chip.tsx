import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: SFSymbol;
  /**
   * How VoiceOver reads it: `checkbox` for multi-select (muscles, modifiers), `radio` for pick-one
   * (date range, metric), `button` for chips that act instead of select.
   */
  role?: 'checkbox' | 'radio' | 'button';
  /** Spoken label when the visible one is an abbreviation, e.g. "3 months" for "3M". */
  accessibilityLabel?: string;
};

/** Toggleable filter chip, e.g. muscle groups in the exercise picker or graph metrics. Selected chips fill with the accent. */
export function Chip({ label, selected = false, onPress, icon, role = 'checkbox', accessibilityLabel }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const { large } = useTextScale();

  const palette = selected
    ? { background: colors.accent, foreground: colors.onAccent }
    : { background: colors.input, foreground: colors.text };

  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === 'button' ? { selected } : { checked: selected }}
      hitSlop={4}
      style={[
        styles.chip,
        // Light mode outlines selected chips, since baby blue is pale on white (user's pick).
        { backgroundColor: palette.background, borderColor: selected ? colors.selectedOutline : 'transparent' },
      ]}
    >
      {icon && <Icon name={icon} color={palette.foreground} size={14} />}
      <AppText variant="subhead" weight="600" style={[styles.label, { color: palette.foreground }]} numberOfLines={large ? 2 : 1}>
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
  label: {
    flexShrink: 1,
  },
});
