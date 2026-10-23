import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear, AppText, Button, Icon } from '@/components/ui';
import { formatClock, useNow } from '@/hooks/useNow';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { restRemainingMs, useActiveWorkout } from './ActiveWorkoutProvider';

type Props = {
  onExpand: () => void;
};

/** Floating rest countdown docked at the bottom of the workout sheet (user's pick for G2.2). */
export function RestTimerBar({ onExpand }: Props) {
  return (
    <SchemeOverride scheme="dark">
      <Bar onExpand={onExpand} />
    </SchemeOverride>
  );
}

function Bar({ onExpand }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { rest, restJustEnded, adjustRest, skipRest } = useActiveWorkout();
  const now = useNow(250, Boolean(rest));

  if (!rest && !restJustEnded) return null;

  const position = [styles.host, { bottom: insets.bottom + spacing.sm }];

  if (!rest) {
    return (
      <Appear key="ended" pointerEvents="none" style={position}>
        <View style={[styles.bar, styles.ended, { backgroundColor: colors.accent }]} accessibilityLiveRegion="polite">
          <Icon name="bell.fill" color={colors.onAccent} size={18} />
          <AppText variant="headline" weight="800" tone="onAccent">
            Rest over. Next set!
          </AppText>
        </View>
      </Appear>
    );
  }

  const remainingMs = restRemainingMs(rest, now);
  const paused = rest.pausedRemainingMs !== undefined;
  const progress = Math.min(1, remainingMs / (rest.durationSec * 1000));

  return (
    // Keys make the bar animate in again when it switches between counting and "Rest over".
    <Appear key="rest" style={position}>
      <View style={[styles.bar, { backgroundColor: colors.chrome, borderColor: colors.border }]}>
        <Pressable
          onPress={onExpand}
          accessibilityRole="button"
          accessibilityLabel={`Rest ${formatClock(remainingMs / 1000)} remaining${paused ? ', paused' : ''}. Open timer`}
          style={styles.time}
        >
          <AppText variant="caption" weight="700" tone="secondary">
            {paused ? 'PAUSED' : 'REST'}
          </AppText>
          <AppText variant="title2" weight="800" numeric>
            {formatClock(Math.ceil(remainingMs / 1000))}
          </AppText>
        </Pressable>
        <View style={styles.buttons}>
          <Button title="−15" variant="secondary" size="sm" onPress={() => adjustRest(-15)} accessibilityHint="Shortens rest by 15 seconds" />
          <Button title="+15" variant="secondary" size="sm" onPress={() => adjustRest(15)} accessibilityHint="Adds 15 seconds of rest" />
          <Button title="Skip" variant="ghost" size="sm" onPress={skipRest} />
        </View>
        <View style={[styles.track, { backgroundColor: colors.input }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
        </View>
      </View>
    </Appear>
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
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.3)',
  },
  ended: {
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  time: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
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
