import { Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { tabularNums, typography, type ThemeColors, type TypographyVariant } from '@/theme/tokens';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'warning' | 'error' | 'onAccent' | 'onChrome';

const toneToColor: Record<TextTone, keyof ThemeColors> = {
  primary: 'text',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accentText',
  success: 'successText',
  warning: 'warningText',
  error: 'errorText',
  onAccent: 'onAccent',
  onChrome: 'onChrome',
};

type Props = TextProps & {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Tabular digits for numbers that line up in columns. */
  numeric?: boolean;
  weight?: '400' | '600' | '700' | '800';
};

/** Text in the app's type scale and theme colors. Scales with the user's Dynamic Type setting. */
export function AppText({ variant = 'body', tone = 'primary', numeric, weight, style, ...rest }: Props) {
  const { colors } = useAppTheme();
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: colors[toneToColor[tone]] as string },
        numeric && tabularNums,
        weight && { fontWeight: weight },
        style,
      ]}
    />
  );
}
