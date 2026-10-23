import { Pressable, StyleSheet, View } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { designChoices, type StepperStyle } from '@/theme/choices';
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
  /** Gallery only: compare stepper styles before one is chosen. */
  stepperStyle?: StepperStyle;
};

function format(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Minus/plus control for quick adjustments (weight by the rounding increment, reps by 1). */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit, stepperStyle = designChoices.stepper }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
    if (clamped !== value) {
      haptics.selection();
      onChange(clamped);
    }
  };

  const joined = stepperStyle === 'joined';
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
          joined ? styles.joinedButton : [styles.splitButton, { backgroundColor: colors.accentSubtle }],
          { opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1 },
        ]}
      >
        <Icon name={kind} color={colors.accentText} size={16} weight="bold" />
      </Pressable>
    );
  };

  return (
    <View
      accessibilityLabel={`${label}: ${format(value)}${unit ? ` ${unit}` : ''}`}
      style={[styles.row, joined && [styles.joined, { backgroundColor: colors.input }]]}
    >
      {button('minus')}
      <View style={[styles.value, joined && { borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1 }]}>
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
  splitButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joined: {
    gap: 0,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  joinedButton: {
    width: 48,
    height: 40,
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
