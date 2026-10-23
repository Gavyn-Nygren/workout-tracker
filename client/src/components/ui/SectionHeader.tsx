import { Pressable, StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Spoken label for the action when "Add" or "Edit" alone is ambiguous, e.g. "Add goal". */
  actionAccessibilityLabel?: string;
};

/** Uppercase label above a group of content, with an optional trailing action. */
export function SectionHeader({ title, actionLabel, onAction, actionAccessibilityLabel }: Props) {
  return (
    <View style={styles.row}>
      <AppText variant="label" tone="secondary" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionAccessibilityLabel ?? actionLabel} hitSlop={8} style={styles.action}>
          <AppText variant="subhead" tone="accent" weight="600">
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  // Long titles wrap instead of pushing the action off screen at large text sizes.
  title: {
    flexShrink: 1,
  },
  action: {
    flexShrink: 0,
  },
});
