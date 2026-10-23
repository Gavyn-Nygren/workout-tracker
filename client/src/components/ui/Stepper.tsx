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
  /** What VoiceOver says for a value, e.g. "3 minutes" for "3:00" or "4 weeks" for "4 wk". */
  spokenValue?: (value: number) => string;
};

function defaultFormat(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Minus/plus control for quick adjustments (weight by the rounding increment, reps by 1).
 * Round buttons sit either side of the value so they're easy to hit mid-set. For VoiceOver the
 * whole control is one adjustable element: swipe up or down to change the value.
 */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit, formatValue, spokenValue }: Props) {
  const { colors } = useAppTheme();
  const format = formatValue ?? defaultFormat;
  const speak = spokenValue ?? ((v: number) => `${format(v)}${unit ? ` ${unit}` : ''}`);
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
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: speak(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? value + step : value - step)}
      style={styles.row}
    >
      {button('minus')}
      <View style={styles.value}>
        <AppText variant="headline" numeric weight="700" maxFontSizeMultiplier={2}>
          {format(value)}
        </AppText>
        {unit && (
          <AppText variant="caption" tone="secondary" maxFontSizeMultiplier={2}>
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
