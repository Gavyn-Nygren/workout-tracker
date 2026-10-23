import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motion } from '@/theme/tokens';

type Props = Pick<ViewProps, 'pointerEvents'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it rises while fading in, in points. With Reduce Motion it only fades. */
  offset?: number;
};

/** Fades and rises into place when it mounts. Use it for bars and banners that pop into view. */
export function Appear({ children, style, offset = 12, pointerEvents }: Props) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: motion.normal, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress]);

  const translateY = reducedMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] });
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
