import { useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { opacity } from '@/theme/tokens';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  /** Placement in the parent (size, margins, flex). */
  style?: StyleProp<ViewStyle>;
  /** Layout of the children (alignment, gap). This is the part that shrinks. */
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * A tappable card. It eases down to 97% while pressed and springs back on release (user's pick).
 * With Reduce Motion on it dims instead. List rows keep the iOS gray highlight instead of this.
 */
export function PressableScale({ children, style, contentStyle, onPressIn, onPressOut, ...rest }: Props) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const animate = (pressed: boolean) => {
    if (reducedMotion) {
      fade.setValue(pressed ? opacity.cardPressed : 1);
      return;
    }
    scale.stopAnimation();
    (pressed
      ? Animated.timing(scale, { toValue: 0.97, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true })
      : Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true })
    ).start();
  };

  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={(e) => {
        animate(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(false);
        onPressOut?.(e);
      }}
    >
      {/* Only the content moves, so the touch area stays put. flexGrow lets cards fill an iPad grid cell. */}
      <Animated.View style={[{ flexGrow: 1 }, contentStyle, { opacity: fade, transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
