import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppTheme } from '@/theme/ThemeProvider';
import { colors as palette } from '@/theme/tokens';

/** Brand confetti: baby blue, gold, white, and sky blue (user's pick for G2.3). Light pages swap the pale pieces for deeper shades. */
const COLORS = {
  dark: [palette.light.accent, palette.light.pr, '#FFFFFF', palette.light.chartPrimary],
  light: [palette.light.accentText, palette.light.pr, palette.light.successFill, palette.light.chartPrimary],
};
const PIECES = 42;
const DURATION = 2200;

type Piece = { x: number; drift: number; delay: number; spin: number; color: string; width: number; height: number };

/**
 * A one-off burst falling over the screen. Renders nothing with Reduce Motion on.
 * The caller decides when to show it (only for workouts with new PRs, spec 2.13).
 */
export function Confetti() {
  const { width, height } = useWindowDimensions();
  const { scheme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 0.25,
        spin: (Math.random() - 0.5) * 4,
        color: COLORS[scheme][i % COLORS[scheme].length],
        width: 6 + Math.random() * 4,
        height: 10 + Math.random() * 6,
      })),
    [width, scheme],
  );

  useEffect(() => {
    if (reducedMotion) return;
    Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [progress, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((piece, i) => {
        const local = progress.interpolate({ inputRange: [piece.delay, 1], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: piece.x,
              top: -20,
              width: piece.width,
              height: piece.height,
              borderRadius: 2,
              backgroundColor: piece.color,
              boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.15)',
              opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
                { translateX: local.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] }) },
                { rotate: local.interpolate({ inputRange: [0, 1], outputRange: ['0rad', `${piece.spin * Math.PI}rad`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
