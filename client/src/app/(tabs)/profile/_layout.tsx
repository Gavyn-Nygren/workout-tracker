import { Stack } from 'expo-router';

import { useAppTheme } from '@/theme/ThemeProvider';

/** Profile and its settings pages (user's pick: grouped sub-pages, like iOS Settings). */
export default function ProfileLayout() {
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
      <Stack.Screen name="index" options={{ title: 'PROFILE' }} />
      <Stack.Screen name="units" options={{ title: 'Units & logging' }} />
      <Stack.Screen name="workout" options={{ title: 'Workout defaults' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy & security' }} />
      <Stack.Screen name="data" options={{ title: 'Data & account' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
    </Stack>
  );
}
