import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Appear, AppText, Icon } from '@/components/ui';
import { formatClock, spokenDuration, useNow } from '@/hooks/useNow';
import { DENSE_TEXT_MAX } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { restRemainingMs, useActiveWorkout } from './ActiveWorkoutProvider';

// The bar's measured height (0 when hidden), so toasts can sit above it at any text size.
let height = 0;
const heightListeners = new Set<() => void>();
const setHeight = (next: number) => {
  if (next === height) return;
  height = next;
  heightListeners.forEach((l) => l());
};
export function useMiniBarHeight(): number {
  return useSyncExternalStore(
    (listener) => {
      heightListeners.add(listener);
      return () => heightListeners.delete(listener);
    },
    () => height,
  );
}

/** Sits above the tab bar while a workout is minimized; tap to slide the workout back up. */
export function MiniBar() {
  const { workout } = useActiveWorkout();
  const visible = Boolean(workout);
  useEffect(() => {
    if (!visible) setHeight(0);
  }, [visible]);
  if (!workout) return null;
  return (
    <SchemeOverride scheme="dark">
      <Appear offset={8}>
        <View onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
          <Body />
        </View>
      </Appear>
    </SchemeOverride>
  );
}

function Body() {
  const { colors } = useAppTheme();
  const { workout, counts, rest } = useActiveWorkout();
  const now = useNow(rest ? 500 : 1000);
  if (!workout) return null;

  const startedAt = workout.session.startedAt ? Date.parse(workout.session.startedAt) : now;
  const elapsedSec = (now - startedAt) / 1000;
  const elapsed = formatClock(elapsedSec);
  const restSec = rest ? Math.ceil(restRemainingMs(rest, now) / 1000) : undefined;
  const restLeft = restSec !== undefined ? formatClock(restSec) : undefined;

  return (
    <Pressable
      onPress={() => router.push('/workout')}
      accessibilityRole="button"
      accessibilityLabel={`${workout.session.name} in progress, ${spokenDuration(elapsedSec)} elapsed, ${counts.done} of ${counts.total} sets${restSec !== undefined ? `, rest ${spokenDuration(restSec)} remaining` : ''}. Open workout`}
      style={({ pressed }) => [styles.bar, { backgroundColor: colors.chrome, borderTopColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accent }]}>
        <Icon name="dumbbell.fill" color={colors.onAccent} size={15} />
      </View>
      <View style={styles.text}>
        {/* Persistent chrome above a tab bar that doesn't scale, so it stops at 1.5×. */}
        <AppText variant="subhead" weight="700" numberOfLines={1} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          {workout.session.name}
        </AppText>
        <AppText variant="caption" tone="secondary" numeric numberOfLines={1} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          {`${elapsed} · ${counts.done}/${counts.total} sets`}
        </AppText>
      </View>
      {restLeft ? (
        <View style={[styles.rest, { backgroundColor: colors.accentSubtle }]}>
          <AppText variant="footnote" weight="800" tone="accent" numeric maxFontSizeMultiplier={DENSE_TEXT_MAX}>
            {`Rest ${restLeft}`}
          </AppText>
        </View>
      ) : (
        <Icon name="chevron.up" color={colors.textSecondary} size={16} weight="bold" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  rest: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
