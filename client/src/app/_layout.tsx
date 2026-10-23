import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { TAB_BAR_CLEARANCE, ToastProvider, ToastViewport } from '@/components/ui';
import { DataProvider } from '@/data/DataProvider';
import { SaveErrorToasts } from '@/data/SaveErrorToasts';
import { authStore } from '@/features/auth/authStore';
import { ActiveWorkoutProvider, useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { MINI_BAR_HEIGHT } from '@/features/workout/MiniBar';
import { useTextScale } from '@/theme/layout';
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
  const auth = authStore.use();
  const { workout } = useActiveWorkout();
  const { large } = useTextScale();

  const navigationTheme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.chrome,
        text: colors.text,
        border: colors.chromeBorder,
      },
    };
  }, [scheme, colors]);

  /**
   * Native iOS sheet with a grabber, at the given heights (fractions of the screen). At
   * accessibility text sizes sheets open full height so their buttons stay on screen.
   */
  const sheet = (detents: number[]) =>
    ({
      presentation: 'formSheet',
      headerShown: false,
      sheetAllowedDetents: large ? [1] : detents,
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
          {/* An account is required (spec 2.3): signed out, only the welcome and sign-in screens exist. */}
          <Stack.Protected guard={!auth.signedIn}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>
          {/* New accounts get the optional onboarding first; skipping it counts as finishing it. */}
          <Stack.Protected guard={auth.signedIn && !auth.onboarded}>
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={auth.signedIn && auth.onboarded}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="dev/gallery" options={{ title: 'Component gallery' }} />
            <Stack.Screen name="dev/sheet" options={sheet([0.6, 1])} />
            {/* Active workout: a page sheet you can swipe down to minimize to the mini bar. */}
            <Stack.Screen name="workout/index" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="workout/set" options={sheet([0.75, 1])} />
            <Stack.Screen name="workout/picker" options={sheet([0.85, 1])} />
            <Stack.Screen name="workout/reorder" options={sheet([0.7, 1])} />
            <Stack.Screen name="workout/timer" options={sheet([0.7])} />
            <Stack.Screen name="summary" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="plan-picker" options={sheet([0.85, 1])} />
            <Stack.Screen name="goal" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="badge" options={sheet([0.6])} />
            <Stack.Screen name="graph-builder" options={sheet([0.85, 1])} />
            <Stack.Screen name="log-weight" options={sheet([0.55])} />
            <Stack.Screen name="notifications-permission" options={sheet([0.75])} />
            {/* Form analysis: setup and recording take the whole screen like the camera will. */}
            <Stack.Screen name="form/setup" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="form/record" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="form/report" options={{ presentation: 'modal', headerShown: false }} />
          </Stack.Protected>
          {/* The tour opens from onboarding and from Profile → About. */}
          <Stack.Protected guard={auth.signedIn}>
            <Stack.Screen name="tutorial" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          </Stack.Protected>
        </Stack>
        {/* Clear the in-progress workout bar too, when it's showing above the tab bar. */}
        <ToastViewport bottomOffset={TAB_BAR_CLEARANCE + (workout ? MINI_BAR_HEIGHT : 0)} />
        <SaveErrorToasts />
      </ToastProvider>
    </ThemeProvider>
  );
}
