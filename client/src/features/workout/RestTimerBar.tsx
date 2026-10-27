import { useEffect } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, useAnimatedValue, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear, AppText, Button, Icon } from '@/components/ui';
import { useKeyboardFrame } from '@/hooks/useKeyboardFrame';
import { useLiveNow } from '@/hooks/useLiveNow';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { restRemainingMs, useActiveWorkout } from './ActiveWorkoutProvider';
import { describeNextUp, shownNextUp } from './rest';

type Props = {
  onExpand: () => void;
  /**
   * The space the bar covers above the bottom safe area, or above the keyboard while it's up (0
   * while hidden), so the screen can keep its last rows and its toasts clear of it. The bar grows
   * with the text size.
   */
  onHeightChange?: (height: number) => void;
};

/** Gap between the bar and the bottom safe area. */
const BAR_OFFSET = spacing.sm;

/**
 * Floating rest countdown docked at the bottom of the workout sheet (user's pick for G2.2). The same
 * slot briefly shows "Rest over" when a rest ends, and "Next: …" after a superset set that moves
 * straight on to the next exercise (G3.8).
 */
export function RestTimerBar(props: Props) {
  return (
    <SchemeOverride scheme="dark">
      <Bar {...props} />
    </SchemeOverride>
  );
}

function Bar({ onExpand, onHeightChange }: Props) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { rest, restJustEnded, upNext, adjustRest, skipRest } = useActiveWorkout();
  // Refreshed the moment the app comes back, so the countdown never shows a time from before the lock.
  const now = useLiveNow(250, Boolean(rest));
  const cue = !rest && upNext?.cue ? upNext : null;
  const visible = Boolean(rest || cue || restJustEnded);

  // While the number pad is up (typing a set), the bar rides on top of it, so the countdown and
  // "Next: …" stay in sight. It moves with the keyboard; with Reduce Motion it just jumps.
  const keyboard = useKeyboardFrame();
  const raise = Math.max(0, keyboard.height - insets.bottom);
  const lift = useAnimatedValue(-raise);
  useEffect(() => {
    Animated.timing(lift, { toValue: -raise, duration: reducedMotion ? 0 : keyboard.durationMs, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [lift, raise, keyboard.durationMs, reducedMotion]);

  useEffect(() => {
    if (!visible) onHeightChange?.(0);
  }, [visible, onHeightChange]);

  if (!visible) return null;

  const position = [styles.host, { bottom: insets.bottom + BAR_OFFSET, transform: [{ translateY: lift }] }];
  const measure = (e: LayoutChangeEvent) => onHeightChange?.(Math.ceil(e.nativeEvent.layout.height) + BAR_OFFSET);
  // The raised dark surface with an edge reads on light pages and on the near-black dark page.
  const surface = { backgroundColor: colors.cardElevated, borderColor: colors.input };

  if (cue) {
    // ActiveWorkoutProvider announces "Next: …" for VoiceOver along with the set's completion.
    return (
      <Animated.View pointerEvents="none" style={position}>
        <Appear key={`next-${cue.key}`}>
          <View onLayout={measure} style={[styles.bar, styles.ended, surface]}>
            <Icon name="arrow.turn.down.right" color={colors.accentText} size={18} />
            <AppText variant="headline" weight="800" maxFontSizeMultiplier={2} style={styles.shrink}>
              Next: {describeNextUp(cue.next)}
            </AppText>
          </View>
        </Appear>
      </Animated.View>
    );
  }

  if (!rest) {
    // ActiveWorkoutProvider announces "Rest over" for VoiceOver, also while minimized.
    return (
      <Animated.View pointerEvents="none" style={position}>
        <Appear key="ended">
          <View onLayout={measure} style={[styles.bar, styles.ended, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            <Icon name="bell.fill" color={colors.onAccent} size={18} />
            <AppText variant="headline" weight="800" tone="onAccent" maxFontSizeMultiplier={2} style={styles.shrink}>
              {restJustEnded?.lastSet ? 'Rest over. All sets done!' : 'Rest over. Next set!'}
            </AppText>
          </View>
        </Appear>
      </Animated.View>
    );
  }

  const remainingMs = restRemainingMs(rest, now);
  // Rounded up, as shown, so the spoken and visible times agree.
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const paused = rest.pausedRemainingMs !== undefined;
  const progress = Math.min(1, remainingMs / (rest.durationSec * 1000));
  // Superset and circuit rests say where to go next; straight-set rests don't need to.
  const next = shownNextUp(rest);

  const adjust = (delta: number) => {
    adjustRest(delta);
    AccessibilityInfo.announceForAccessibility(`Rest ${spokenDuration(Math.max(0, secondsLeft + delta))} remaining`);
  };

  return (
    // Keys make the bar animate in again when it switches between counting and "Rest over".
    <Animated.View pointerEvents="box-none" style={position}>
      <Appear key="rest">
        {/* Large text: the time sits above the buttons instead of being squeezed beside them. */}
        <View onLayout={measure} style={[styles.bar, large && styles.barStacked, surface]}>
          <Pressable
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel={`Rest, ${spokenDuration(secondsLeft)} remaining${paused ? ', paused' : ''}${next ? `. Next: ${describeNextUp(next)}` : ''}`}
            accessibilityHint="Opens the rest timer"
            // In the Actions rotor too; no 'activate', so double-tap still opens the timer.
            accessibilityActions={[
              { name: 'add', label: 'Add 15 seconds' },
              { name: 'subtract', label: 'Subtract 15 seconds' },
              { name: 'skip', label: 'Skip rest' },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'add') adjust(15);
              if (e.nativeEvent.actionName === 'subtract') adjust(-15);
              if (e.nativeEvent.actionName === 'skip') {
                skipRest();
                AccessibilityInfo.announceForAccessibility('Rest skipped');
              }
            }}
            style={!large && styles.time}
          >
            <AppText variant="caption" weight="700" tone="secondary" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {paused ? 'PAUSED' : 'REST'}
            </AppText>
            <AppText variant="title2" weight="800" numeric maxFontSizeMultiplier={2}>
              {formatClock(secondsLeft)}
            </AppText>
            {next && (
              <AppText variant="footnote" weight="600" tone="secondary" numberOfLines={2} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                Next: {describeNextUp(next)}
              </AppText>
            )}
          </Pressable>
          <View style={styles.buttons}>
            <Button title="−15" variant="secondary" size="sm" onPress={() => adjustRest(-15)} accessibilityLabel="Subtract 15 seconds" />
            <Button title="+15" variant="secondary" size="sm" onPress={() => adjustRest(15)} accessibilityLabel="Add 15 seconds" />
            <Button title="Skip" variant="ghost" size="sm" onPress={skipRest} accessibilityLabel="Skip rest" />
          </View>
          <View style={[styles.track, { backgroundColor: colors.input }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>
      </Appear>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.3)',
  },
  barStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingRight: spacing.lg,
    paddingBottom: spacing.md,
  },
  ended: {
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingRight: spacing.lg,
  },
  shrink: {
    flexShrink: 1,
  },
  time: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
  fill: {
    height: '100%',
  },
});
