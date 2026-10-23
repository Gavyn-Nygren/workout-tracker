import Storage from 'expo-sqlite/kv-store';
import { createContext, useContext, useMemo, useState, type ReactNode, useLayoutEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { Appearance, useColorScheme } from 'react-native';

import { colors, elevation, type ColorScheme, type ThemeColors } from './tokens';

/** 'system' follows the device until the user explicitly picks light or dark. */
export type ThemePreference = 'system' | ColorScheme;

const STORAGE_KEY = 'settings.themePreference';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  scheme: ColorScheme;
  colors: ThemeColors;
  elevation: (typeof elevation)[ColorScheme];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = Storage.getItemSync(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage unavailable: fall back to following the device.
  }
  return 'system';
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const deviceScheme = useColorScheme();

  // Keep native UI (keyboard, alerts, pickers) in step with the chosen theme, before the first paint.
  useLayoutEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme = preference === 'system' ? (deviceScheme ?? 'light') : preference;
    return {
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        try {
          Storage.setItemSync(STORAGE_KEY, next);
        } catch {
          // Non-fatal: the choice still applies for this session.
        }
      },
      scheme,
      colors: colors[scheme],
      elevation: elevation[scheme],
    };
  }, [preference, deviceScheme]);

  // The window behind the app (seen during sheet and keyboard transitions) matches the page, so
  // dark mode never flashes white. The splash screen uses the same two colors (app.json).
  useLayoutEffect(() => {
    SystemUI.setBackgroundColorAsync(colors[value.scheme].background).catch(() => {});
  }, [value.scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}

/**
 * Renders children with one scheme's colors regardless of the app theme, e.g. the dark hero
 * card on Today, so every component inside picks up the right on-dark colors.
 */
export function SchemeOverride({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  const parent = useAppTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, scheme, colors: colors[scheme], elevation: elevation[scheme] }),
    [parent, scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
