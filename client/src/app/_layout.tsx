import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { AppThemeProvider, useAppTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <NavigationRoot />
    </AppThemeProvider>
  );
}

function NavigationRoot() {
  const { scheme, colors } = useAppTheme();

  const navigationTheme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.chrome,
        text: colors.onChrome,
        border: colors.chromeBorder,
      },
    };
  }, [scheme, colors]);

  return (
    <ThemeProvider value={navigationTheme}>
      {/* The header is dark in both themes, so the status bar is always light. */}
      <StatusBar style="light" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
