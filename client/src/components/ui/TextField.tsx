import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typography } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown under the field in the error color, and announced by VoiceOver. */
  error?: string;
  hint?: string;
  /** Forwarded to the input, e.g. to move VoiceOver focus to it after a failed submit. */
  ref?: Ref<TextInputInstance>;
};

/** Labeled single-line text input: a filled box that gains a border on focus or error. */
export function TextField({ label, error, hint, onFocus, onBlur, ref, ...input }: Props) {
  const { colors, scheme } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.errorFill : focused ? colors.accentText : 'transparent';

  return (
    <View style={styles.wrap}>
      <AppText variant="footnote" tone="secondary" weight="600" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {label}
      </AppText>
      <TextInput
        {...input}
        ref={ref}
        accessibilityLabel={error ? `${label}, error: ${error}` : label}
        accessibilityHint={hint}
        keyboardAppearance={scheme}
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
          { color: colors.text, backgroundColor: colors.input, borderColor },
        ]}
      />
      {(error || hint) && (
        <AppText variant="footnote" tone={error ? 'error' : 'secondary'} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
