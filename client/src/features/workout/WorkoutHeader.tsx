import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, ProgressBar } from '@/components/ui';
import { formatClock, spokenDuration, useNow } from '@/hooks/useNow';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { elapsedSeconds, type WorkoutClock } from './elapsed';
import type { SetCounts } from './workoutReducer';

type Props = {
  title: string;
  /** The workout's mode and times, for the elapsed clock. */
  clock: WorkoutClock;
  counts: SetCounts;
  onMinimize: () => void;
  onFinish: () => void;
};

/** Like a native nav bar, the header text stops growing at 2× so the sets below keep the room. */
const HEADER_TEXT_MAX = 2;

/** Dark bar at the top of the workout sheet: minimize, name, elapsed time, set progress, Finish. */
export function WorkoutHeader(props: Props) {
  return (
    <SchemeOverride scheme="dark">
      <HeaderBody {...props} />
    </SchemeOverride>
  );
}

function HeaderBody({ title, clock, counts, onMinimize, onFinish }: Props) {
  const { colors } = useAppTheme();
  // A reopened workout's clock is frozen, so it needn't tick.
  const now = useNow(1000, clock.mode !== 'reopen');
  const elapsed = elapsedSeconds(clock, now);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.chrome, borderBottomColor: colors.border }]}>
      <View style={styles.grabber} />
      <View style={styles.row}>
        <Pressable
          onPress={onMinimize}
          accessibilityRole="button"
          accessibilityLabel="Minimize workout"
          accessibilityHint="Keeps the workout running so you can use other tabs"
          hitSlop={8}
          style={[styles.round, { backgroundColor: colors.input }]}
        >
          <Icon name="chevron.down" color={colors.text} size={16} weight="bold" />
        </Pressable>
        <View style={styles.titleBlock}>
          <AppText variant="headline" weight="800" numberOfLines={2} maxFontSizeMultiplier={HEADER_TEXT_MAX} accessibilityRole="header" style={styles.center}>
            {title}
          </AppText>
          <AppText
            variant="footnote"
            tone="secondary"
            numeric
            maxFontSizeMultiplier={HEADER_TEXT_MAX}
            style={styles.center}
            // "12 minutes 5 seconds elapsed, 3 of 18 sets done", not "12:05, 3/18".
            accessibilityLabel={`${spokenDuration(elapsed)} elapsed, ${counts.done} of ${counts.total} sets done`}
          >
            {`${formatClock(elapsed)}  ·  ${counts.done}/${counts.total} sets`}
          </AppText>
        </View>
        <Button title="Finish" size="sm" onPress={onFinish} />
      </View>
      <ProgressBar value={counts.total ? counts.done / counts.total : 0} label={`${counts.done} of ${counts.total} sets done`} height={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
