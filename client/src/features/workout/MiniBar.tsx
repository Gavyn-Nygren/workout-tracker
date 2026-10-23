import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { formatClock, useNow } from '@/hooks/useNow';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { restRemainingMs, useActiveWorkout } from './ActiveWorkoutProvider';

/** Sits above the tab bar while a workout is minimized; tap to slide the workout back up. */
export function MiniBar() {
  const { workout } = useActiveWorkout();
  if (!workout) return null;
  return (
    <SchemeOverride scheme="dark">
      <Body />
    </SchemeOverride>
  );
}

function Body() {
  const { colors } = useAppTheme();
  const { workout, counts, rest } = useActiveWorkout();
  const now = useNow(rest ? 500 : 1000);
  if (!workout) return null;

  const startedAt = workout.session.startedAt ? Date.parse(workout.session.startedAt) : now;
  const elapsed = formatClock((now - startedAt) / 1000);
  const restLeft = rest ? formatClock(Math.ceil(restRemainingMs(rest, now) / 1000)) : undefined;

  return (
    <Pressable
      onPress={() => router.push('/workout')}
      accessibilityRole="button"
      accessibilityLabel={`${workout.session.name} in progress, ${elapsed} elapsed, ${counts.done} of ${counts.total} sets${restLeft ? `, rest ${restLeft}` : ''}. Open workout`}
      style={({ pressed }) => [styles.bar, { backgroundColor: colors.chrome, borderTopColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accent }]}>
        <Icon name="dumbbell.fill" color={colors.onAccent} size={15} />
      </View>
      <View style={styles.text}>
        <AppText variant="subhead" weight="700" numberOfLines={1}>
          {workout.session.name}
        </AppText>
        <AppText variant="caption" tone="secondary" numeric>
          {`${elapsed} · ${counts.done}/${counts.total} sets`}
        </AppText>
      </View>
      {restLeft ? (
        <View style={[styles.rest, { backgroundColor: colors.accentSubtle }]}>
          <AppText variant="footnote" weight="800" tone="accent" numeric>
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
