import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, tabularNums, typography } from '@/theme/tokens';
import { AppText } from './AppText';
import { formatNumber, parseNumber, shouldSyncText } from './numberText';

export { parseNumber };

type Props = {
  /** Read by VoiceOver, e.g. "Weight". */
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Unit suffix shown inside the field, e.g. "lb". */
  unit?: string;
  /** Allow decimals such as 2.5 lb or 1.25 kg. */
  decimal?: boolean;
  placeholder?: string;
  width?: number;
  /** How far the text (and the field with it) grows with Dynamic Type. Dense tables pass 1.5. */
  maxScale?: number;
  /** Called when the field gains (true) or loses (false) focus, e.g. to hold a message until typing ends. */
  onFocusChange?: (focused: boolean) => void;
};

const SPOKEN_UNITS: Record<string, string> = { s: 'seconds', sec: 'seconds', min: 'minutes', lb: 'pounds', lbs: 'pounds', kg: 'kilograms', in: 'inches', cm: 'centimeters', '%': 'percent', '°': 'degrees' };

/** Compact numeric input for weights, reps, and times. Uses the number or decimal keypad. */
/** Compact numeric input. Text grows up to `maxScale` with Dynamic Type and the field widens to match. */
export function NumberField({ label, value, onChange, unit, decimal = false, placeholder, width = 88, maxScale = 2, onFocusChange }: Props) {
  const { colors, scheme } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const [text, setText] = useState(formatNumber(value));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (e.g. a stepper, or PREVIOUS copied in while this field is focused)
  // without clobbering what the user is typing.
  useEffect(() => {
    setText((current) => (shouldSyncText(current, value, decimal, focused) ? formatNumber(value) : current));
  }, [value, focused, decimal]);

  return (
    <View
      style={[
        styles.field,
        { width: width * Math.min(Math.max(fontScale, 1), maxScale), backgroundColor: colors.input, borderColor: focused ? colors.accentText : 'transparent' },
      ]}
    >
      <TextInput
        value={text}
        onChangeText={(next) => {
          const cleaned = next.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, '');
          setText(cleaned);
          onChange(parseNumber(cleaned, decimal));
        }}
        onFocus={() => {
          setFocused(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocusChange?.(false);
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accentText}
        keyboardAppearance={scheme}
        maxFontSizeMultiplier={maxScale}
        accessibilityLabel={unit ? `${label}, ${SPOKEN_UNITS[unit] ?? unit}` : label}
        style={[typography.headline, tabularNums, styles.input, { color: colors.text }]}
      />
      {unit && (
        <AppText variant="footnote" tone="secondary" maxFontSizeMultiplier={maxScale} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {unit}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm + 2,
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    textAlign: 'right',
    paddingVertical: spacing.xs,
  },
});
