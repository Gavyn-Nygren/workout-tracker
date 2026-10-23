import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/ThemeProvider';

/** Progress has its own stack so graphs and history push with the tab bar still visible. */
export default function ProgressLayout() {
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
      <Stack.Screen name="index" options={{ title: 'PROGRESS' }} />
      <Stack.Screen name="graph" options={{ title: 'Graph' }} />
      <Stack.Screen name="history" options={{ title: 'History' }} />
      <Stack.Screen name="bodyweight" options={{ title: 'Bodyweight' }} />
    </Stack>
  );
}
