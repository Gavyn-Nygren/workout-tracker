import { Pressable, StyleSheet, View } from 'react-native';

import { useHaptics } from '@/hooks/useHaptics';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** `accessibilityLabel` is the spoken form when the label is abbreviated, e.g. "4 weeks" for "4 wk". */
type Option<T extends string> = { value: T; label: string; accessibilityLabel?: string };

type Props<T extends string> = {
  /** Read by VoiceOver for the group, e.g. "Appearance". */
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Pick one of 2-4 short options, e.g. lb/kg or System/Light/Dark. At accessibility text sizes
 * the options stack as full-width rows so labels never truncate. VoiceOver reads each option the
 * way iOS reads its own segmented controls: "Light, selected, 2 of 3".
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const { large } = useTextScale();

  return (
    <View style={[styles.track, large && styles.stacked, { backgroundColor: colors.input }]}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!selected) {
                haptics.selection();
                onChange(option.value);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityHint={label}
            accessibilityState={{ selected }}
            accessibilityValue={{ text: `${i + 1} of ${options.length}` }}
            style={[
              styles.segment,
              large && styles.row,
              // Light mode outlines the selected segment, since baby blue is pale on white (user's pick).
              { borderColor: selected ? colors.selectedOutline : 'transparent' },
              selected && { backgroundColor: colors.accent },
            ]}
          >
            <AppText variant="subhead" weight="700" tone={selected ? 'onAccent' : 'primary'} numberOfLines={large ? undefined : 1} style={large && styles.flex}>
              {option.label}
            </AppText>
            {large && selected && <Icon name="checkmark" color={colors.onAccent} size={15} weight="bold" />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  stacked: {
    flexDirection: 'column',
    borderRadius: radius.card,
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flex: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  flex: {
    flex: 1,
  },
});
