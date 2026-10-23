import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { ToastProvider, ToastViewport } from '@/components/ui';
import { DataProvider } from '@/data/DataProvider';
import { ActiveWorkoutProvider } from '@/features/workout/ActiveWorkoutProvider';
import { AppThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <DataProvider>
        <ActiveWorkoutProvider>
          <NavigationRoot />
        </ActiveWorkoutProvider>
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

  /** Native iOS sheet with a grabber, at the given heights (fractions of the screen). */
  const sheet = (detents: number[]) =>
    ({
      presentation: 'formSheet',
      headerShown: false,
      sheetAllowedDetents: detents,
      sheetGrabberVisible: true,
      sheetCornerRadius: radius.card,
      contentStyle: { backgroundColor: colors.cardElevated },
    }) as const;

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
          <Stack.Screen name="dev/sheet" options={sheet([0.6, 1])} />
          {/* Active workout: a page sheet you can swipe down to minimize to the mini bar. */}
          <Stack.Screen name="workout/index" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="workout/set" options={sheet([0.75, 1])} />
          <Stack.Screen name="workout/picker" options={sheet([0.85, 1])} />
          <Stack.Screen name="workout/reorder" options={sheet([0.7, 1])} />
          <Stack.Screen name="workout/timer" options={sheet([0.7])} />
        </Stack>
        <ToastViewport />
      </ToastProvider>
    </ThemeProvider>
  );
}
