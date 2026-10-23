import type { SFSymbol } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { designChoices, type SecondaryButtonStyle } from '@/theme/choices';
import { useAppTheme } from '@/theme/ThemeProvider';
import { opacity, radius, spacing, type ThemeColors } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: SFSymbol;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Gallery only: compare secondary styles before one is chosen. */
  secondaryStyle?: SecondaryButtonStyle;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

function variantColors(
  variant: ButtonVariant,
  secondaryStyle: SecondaryButtonStyle,
  colors: ThemeColors,
): { background: string; foreground: string; border?: string } {
  switch (variant) {
    case 'primary':
      return { background: colors.accent, foreground: colors.onAccent };
    case 'destructive':
      return { background: colors.destructive, foreground: colors.onDestructive };
    case 'ghost':
      return { background: 'transparent', foreground: colors.accentText };
    case 'secondary':
      if (secondaryStyle === 'outlined') return { background: 'transparent', foreground: colors.text, border: colors.border };
      if (secondaryStyle === 'gray') return { background: colors.input, foreground: colors.text };
      return { background: colors.accentSubtle, foreground: colors.accentText };
  }
}

/** Pill button. Primary is the baby-blue call to action; use one per screen. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  fullWidth,
  secondaryStyle = designChoices.secondaryButton,
  style,
  accessibilityHint,
}: Props) {
  const { colors } = useAppTheme();
  const palette = variantColors(variant, secondaryStyle, colors);
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {
          backgroundColor: palette.background,
          borderColor: palette.border ?? 'transparent',
          borderWidth: palette.border ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <View style={[styles.content, loading && styles.hidden]}>
        {icon && <Icon name={icon} color={palette.foreground} size={size === 'sm' ? 15 : 18} />}
        <AppText
          variant={size === 'sm' ? 'subhead' : 'headline'}
          weight="700"
          style={{ color: palette.foreground }}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </AppText>
      </View>
      {loading && <ActivityIndicator color={palette.foreground} style={StyleSheet.absoluteFill} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  md: {
    minHeight: 50,
    paddingHorizontal: spacing.xxl,
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hidden: {
    opacity: 0,
  },
});
