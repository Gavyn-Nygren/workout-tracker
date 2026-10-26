import { useLayoutEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  /** Defaults to "PR". Longer labels like "Heaviest weight" also work. */
  label?: string;
  /**
   * Pop in with a success haptic when it mounts. Use where the PR was just set
   * (set completion, workout summary), not in history lists.
   */
  celebrate?: boolean;
  /**
   * With `celebrate`: when the set was completed. The badge only celebrates if that was moments
   * ago, so a badge that appears because of an edit, or when a screen opens, stays quiet.
   */
  completedAt?: string;
};

/** How recently a set must have been completed for its badge to celebrate. */
const JUST_COMPLETED_MS = 2000;

/** Gold personal-record marker: a filled pill with dark text so it reads on every surface. */
export function PRBadge({ label = 'PR', celebrate = false, completedAt }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(celebrate ? 0.4 : 1)).current;
  const fade = useRef(new Animated.Value(celebrate ? 0 : 1)).current;

  // Before the first frame shows, so a badge that doesn't celebrate never flickers.
  useLayoutEffect(() => {
    if (!celebrate) return;
    const justCompleted = !completedAt || Date.now() - Date.parse(completedAt) < JUST_COMPLETED_MS;
    if (justCompleted) haptics.success();
    if (!justCompleted || reducedMotion) {
      scale.setValue(1);
      fade.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    // Celebrate once per mount.
  }, []);

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label === 'PR' ? 'Personal record' : `Personal record: ${label}`}
      style={[styles.badge, { backgroundColor: colors.pr, opacity: fade, transform: [{ scale }] }]}
    >
      <Icon name="star.fill" color={colors.onPr} size={11} weight="bold" />
      <AppText variant="caption" weight="800" style={[styles.text, { color: colors.onPr }]} maxFontSizeMultiplier={1.4}>
        {label}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: {
    letterSpacing: 0.3,
  },
});
