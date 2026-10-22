import Storage from 'expo-sqlite/kv-store';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { colors, type ColorScheme, type ThemeColors } from './tokens';

/** 'system' follows the device until the user explicitly picks light or dark. */
export type ThemePreference = 'system' | ColorScheme;

const STORAGE_KEY = 'settings.themePreference';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  scheme: ColorScheme;
  colors: ThemeColors;
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

  // Keep native UI (keyboard, alerts, pickers) in step with the chosen theme.
  useEffect(() => {
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
    };
  }, [preference, deviceScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}
