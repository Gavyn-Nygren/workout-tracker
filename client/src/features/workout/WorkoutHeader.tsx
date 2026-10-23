import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, ProgressBar } from '@/components/ui';
import { formatClock, useNow } from '@/hooks/useNow';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { SetCounts } from './workoutReducer';

type Props = {
  title: string;
  startedAt?: string;
  counts: SetCounts;
  onMinimize: () => void;
  onFinish: () => void;
};

/** Dark bar at the top of the workout sheet: minimize, name, elapsed time, set progress, Finish. */
export function WorkoutHeader(props: Props) {
  return (
    <SchemeOverride scheme="dark">
      <HeaderBody {...props} />
    </SchemeOverride>
  );
}

function HeaderBody({ title, startedAt, counts, onMinimize, onFinish }: Props) {
  const { colors } = useAppTheme();
  const now = useNow(1000);
  const elapsed = startedAt ? (now - Date.parse(startedAt)) / 1000 : 0;

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
          <AppText variant="headline" weight="800" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="footnote" tone="secondary" numeric>
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
});
