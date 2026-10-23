import { Pressable, StyleSheet, View } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { useAppTheme } from '@/theme/ThemeProvider';
import { opacity, radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  /** Read by VoiceOver, e.g. "Reps". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  /** Custom display, e.g. seconds shown as "3:00". */
  formatValue?: (value: number) => string;
};

function defaultFormat(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Minus/plus control for quick adjustments (weight by the rounding increment, reps by 1).
 * Round buttons sit either side of the value so they're easy to hit mid-set.
 */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit, formatValue }: Props) {
  const { colors } = useAppTheme();
  const format = formatValue ?? defaultFormat;
  const haptics = useHaptics();
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
    if (clamped !== value) {
      haptics.selection();
      onChange(clamped);
    }
  };

  const button = (kind: 'minus' | 'plus') => {
    const disabled = kind === 'minus' ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => set(kind === 'minus' ? value - step : value + step)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${kind === 'minus' ? 'Decrease' : 'Increase'} ${label} by ${format(step)}`}
        hitSlop={4}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accentSubtle, opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1 },
        ]}
      >
        <Icon name={kind} color={colors.accentText} size={16} weight="bold" />
      </Pressable>
    );
  };

  return (
    <View accessibilityLabel={`${label}: ${format(value)}${unit ? ` ${unit}` : ''}`} style={styles.row}>
      {button('minus')}
      <View style={styles.value}>
        <AppText variant="headline" numeric weight="700">
          {format(value)}
        </AppText>
        {unit && (
          <AppText variant="caption" tone="secondary">
            {unit}
          </AppText>
        )}
      </View>
      {button('plus')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
