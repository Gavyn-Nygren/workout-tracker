import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, TAB_BAR_CLEARANCE, ToastProvider, ToastViewport } from '@/components/ui';
import { DataProvider } from '@/data/DataProvider';
import { SaveErrorToasts } from '@/data/SaveErrorToasts';
import { authStore } from '@/features/auth/authStore';
import { NotificationSync } from '@/features/notifications/NotificationSync';
import { NotificationTaps } from '@/features/notifications/NotificationTaps';
import { PlanReminderOffer } from '@/features/notifications/PlanReminderOffer';
import { ActiveWorkoutProvider } from '@/features/workout/ActiveWorkoutProvider';
import { useMiniBarHeight } from '@/features/workout/MiniBar';
import { setUpNotificationHandler } from '@/features/workout/useRestAlarm';
import { useTextScale } from '@/theme/layout';
import { AppThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

// Once, before anything can arrive: how notifications show while the app is open.
setUpNotificationHandler();

/**
 * Shown instead of the app when a screen throws while rendering, rather than closing the app. It
 * sits outside RootLayout, so it brings its own theme.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <AppThemeProvider>
      <ErrorScreen retry={retry} />
    </AppThemeProvider>
  );
}

function ErrorScreen({ retry }: Pick<ErrorBoundaryProps, 'retry'>) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ErrorState fill title="Something went wrong" onRetry={() => void retry()} />
    </View>
  );
}

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
  const miniBarHeight = useMiniBarHeight();
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
   * A sheet that scrolls must have its ScrollView as its top view (a fragment with a ToastViewport
   * beside it is fine). Wrapped in a View, the sheet draws blank in a native build on iOS 26
   * (react-native-screens 4.30), though not in Expo Go. tests/sheetLayout.test.ts checks this.
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
            {/* Active workout: a page sheet you can swipe down to minimize to the mini bar. */}
            <Stack.Screen name="workout/index" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="workout/set" options={sheet([0.75, 1])} />
            <Stack.Screen name="workout/picker" options={sheet([0.85, 1])} />
            <Stack.Screen name="workout/reorder" options={sheet([0.7, 1])} />
            <Stack.Screen name="workout/timer" options={sheet([0.7])} />
            <Stack.Screen name="summary" options={{ presentation: 'modal', headerShown: false }} />
            {/* "Your week": what the weekly summary notification opens (G3.12). */}
            <Stack.Screen name="weekly-summary" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="plan-picker" options={sheet([0.85, 1])} />
            <Stack.Screen name="goal" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="goals-completed" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="badge" options={sheet([0.6])} />
            <Stack.Screen name="graph-builder" options={sheet([0.85, 1])} />
            <Stack.Screen name="log-weight" options={sheet([0.55])} />
            <Stack.Screen name="notifications-permission" options={sheet([0.75])} />
            {/* Form analysis: setup and recording take the whole screen like the camera will. */}
            <Stack.Screen name="form/setup" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="form/record" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="form/report" options={{ presentation: 'modal', headerShown: false }} />
          </Stack.Protected>
          {/* Developer screens (Profile → Developer): development builds only, so a link can't open them in the real app. */}
          <Stack.Protected guard={auth.signedIn && auth.onboarded && __DEV__}>
            <Stack.Screen name="dev/gallery" options={{ title: 'Component gallery' }} />
            <Stack.Screen name="dev/sheet" options={sheet([0.6, 1])} />
          </Stack.Protected>
          {/* The tour opens from onboarding and from Profile → About. */}
          <Stack.Protected guard={auth.signedIn}>
            <Stack.Screen name="tutorial" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          </Stack.Protected>
        </Stack>
        {/* Clear the in-progress workout bar too, when it's showing above the tab bar. */}
        <ToastViewport bottomOffset={TAB_BAR_CLEARANCE + miniBarHeight} />
        <SaveErrorToasts />
        {/* Notifications (G3.12): small children rather than hooks here, so following the route
            doesn't re-render the Stack. Keeps iOS's pending ones in step with the data, opens the
            right screen for a tap, and offers reminders after the first plan. */}
        <NotificationSync />
        <NotificationTaps />
        <PlanReminderOffer />
      </ToastProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
