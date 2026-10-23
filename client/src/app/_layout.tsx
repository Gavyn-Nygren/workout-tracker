import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { ToastProvider } from '@/components/ui';
import { DataProvider } from '@/data/DataProvider';
import { AppThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <DataProvider>
        <NavigationRoot />
      </DataProvider>
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
      <ToastProvider>
        {/* The header is dark in both themes, so the status bar is always light. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.chrome },
            headerTintColor: colors.onChrome,
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="dev/gallery" options={{ title: 'Component gallery' }} />
          <Stack.Screen
            name="dev/sheet"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetAllowedDetents: [0.6, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: radius.card,
              contentStyle: { backgroundColor: colors.cardElevated },
            }}
          />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
