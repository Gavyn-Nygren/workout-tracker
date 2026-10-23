import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  title: string;
  subtitle?: string;
  icon?: SFSymbol;
  /** Text value shown at the trailing edge, e.g. "lb". */
  value?: string;
  /** Custom trailing content (toggle, badge). Replaces the chevron. */
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  /** Draws a separator under the row; turn off for the last row in a group. */
  separator?: boolean;
};

/** One row in a settings-style list inside a Card with padding="none". */
export function ListRow({ title, subtitle, icon, value, trailing, onPress, destructive, separator = true }: Props) {
  const { colors } = useAppTheme();
  const tint = destructive ? colors.errorText : colors.accentText;

  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.iconWell, { backgroundColor: destructive ? colors.input : colors.accentSubtle }]}>
          <Icon name={icon} color={tint} size={16} />
        </View>
      )}
      <View style={[styles.body, separator && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={styles.text}>
          <AppText variant="body" tone={destructive ? 'error' : 'primary'}>
            {title}
          </AppText>
          {subtitle && (
            <AppText variant="footnote" tone="secondary">
              {subtitle}
            </AppText>
          )}
        </View>
        {value && (
          <AppText variant="body" tone="secondary" numeric>
            {value}
          </AppText>
        )}
        {trailing ?? (onPress && <Icon name="chevron.right" color={colors.textTertiary} size={14} />)}
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      style={({ pressed }) => pressed && { backgroundColor: colors.input }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    gap: spacing.md,
  },
  iconWell: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.lg,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
