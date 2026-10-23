import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

type Props = {
  icon: SFSymbol;
  title: string;
  /** Say what will appear here and how to add the first one. */
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Placeholder for a list or screen with nothing in it yet. */
export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWell, { backgroundColor: colors.accentSubtle }]}>
        <Icon name={icon} color={colors.accentText} size={26} />
      </View>
      <AppText variant="title3" weight="700" style={styles.center}>
        {title}
      </AppText>
      <AppText variant="subhead" tone="secondary" style={[styles.center, styles.message]}>
        {message}
      </AppText>
      {actionLabel && onAction && <Button title={actionLabel} onPress={onAction} size="sm" style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: {
    textAlign: 'center',
  },
  message: {
    maxWidth: 300,
  },
  action: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
});
