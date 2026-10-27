import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  /** Inner padding; 'none' for lists that run edge to edge inside the card. */
  padding?: 'none' | 'md' | 'lg';
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
};

/** Raised surface for one self-contained group of content. */
export function Card({ children, padding = 'lg', elevated, style, onLayout }: Props) {
  const { colors, elevation } = useAppTheme();
  return (
    // The shadow lives on the outer view; the inner view clips content (e.g. row highlights) to the corners.
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        { backgroundColor: elevated ? colors.cardElevated : colors.card, borderColor: colors.border, boxShadow: elevation.card },
        style,
      ]}
    >
      <View style={[styles.clip, { padding: padding === 'none' ? 0 : padding === 'md' ? spacing.md : spacing.lg }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clip: {
    borderRadius: radius.card,
    overflow: 'hidden',
  },
});
