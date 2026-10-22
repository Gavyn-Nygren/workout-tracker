// Color tokens from spec section 2.13. G1.1 expands this into the full
// design system (status colors, chart series, type scale, spacing).

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  /** Baby-blue primary accent: CTAs and the active tab. */
  accent: string;
  /** Text and icons placed on an accent fill. */
  onAccent: string;
  /** Screen background. */
  background: string;
  /** Card and raised-surface background. */
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  /** Persistent dark header and tab bar (dark in both themes). */
  chrome: string;
  onChrome: string;
  chromeInactive: string;
  chromeBorder: string;
};

const accent = '#89CFF0';
const onAccent = '#0B1520';

export const colors: Record<ColorScheme, ThemeColors> = {
  light: {
    accent,
    onAccent,
    background: '#F2F4F7',
    card: '#FFFFFF',
    text: '#0B0F14',
    textSecondary: '#5B6470',
    border: '#E4E7EC',
    chrome: '#0B0F14',
    onChrome: '#FFFFFF',
    chromeInactive: '#8A94A0',
    chromeBorder: '#0B0F14',
  },
  dark: {
    accent,
    onAccent,
    background: '#0B0D10',
    card: '#171A1F',
    text: '#F5F7FA',
    textSecondary: '#9AA4AF',
    border: '#262B33',
    chrome: '#0B0F14',
    onChrome: '#FFFFFF',
    chromeInactive: '#8A94A0',
    chromeBorder: '#262B33',
  },
};

export const radius = {
  card: 14,
  pill: 999,
} as const;
