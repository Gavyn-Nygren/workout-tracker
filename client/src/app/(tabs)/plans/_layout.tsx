import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/ThemeProvider';

/** The Plans tab is its own stack so plan screens push with the tab bar still visible. */
export default function PlansLayout() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.chrome },
        headerTintColor: colors.onChrome,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'PLANS' }} />
      <Stack.Screen name="new" options={{ title: 'New plan' }} />
      <Stack.Screen name="plan" options={{ title: 'Plan' }} />
      <Stack.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Stack.Screen name="workout" options={{ title: 'Workout' }} />
      <Stack.Screen name="prescription" options={{ title: 'Sets & reps' }} />
      <Stack.Screen name="template" options={{ title: 'Template' }} />
      <Stack.Screen name="exercise" options={{ title: 'Exercise' }} />
      <Stack.Screen name="exercise-form" options={{ title: 'Custom exercise' }} />
    </Stack>
  );
}
