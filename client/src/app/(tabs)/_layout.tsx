import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

function tabIcon(outline: SFSymbol, filled: SFSymbol) {
  return ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <SymbolView name={focused ? filled : outline} tintColor={color} size={size} />
  );
}

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.chrome },
        headerTintColor: colors.onChrome,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.chrome, borderTopColor: colors.chromeBorder },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.chromeInactive,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('dumbbell', 'dumbbell.fill') }} />
      <Tabs.Screen name="plans" options={{ title: 'Plans', tabBarIcon: tabIcon('calendar', 'calendar') }} />
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('house', 'house.fill') }} />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: tabIcon('chart.line.uptrend.xyaxis', 'chart.line.uptrend.xyaxis') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person.crop.circle', 'person.crop.circle.fill') }}
      />
    </Tabs>
  );
}
