import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { designChoices, type TextFieldStyle } from '@/theme/choices';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typography } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown under the field in the error color, and announced by VoiceOver. */
  error?: string;
  hint?: string;
  /** Gallery only: compare field styles before one is chosen. */
  fieldStyle?: TextFieldStyle;
};

/** Labeled single-line text input. */
export function TextField({ label, error, hint, fieldStyle = designChoices.textField, onFocus, onBlur, ...input }: Props) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.errorFill : focused ? colors.accentText : fieldStyle === 'outlined' ? colors.border : 'transparent';

  return (
    <View style={styles.wrap}>
      <AppText variant="footnote" tone="secondary" weight="600">
        {label}
      </AppText>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accentText}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          typography.body,
          styles.input,
          {
            color: colors.text,
            backgroundColor: fieldStyle === 'filled' ? colors.input : colors.card,
            borderColor,
          },
        ]}
      />
      {(error || hint) && (
        <AppText variant="footnote" tone={error ? 'error' : 'secondary'}>
          {error ?? hint}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs + 2,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
});
