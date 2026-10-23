import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, ProgressRing } from '@/components/ui';
import { formatClock, useNow } from '@/hooks/useNow';
import { restRemainingMs, useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const PRESETS = [60, 90, 120, 180, 240, 300];

/** Expanded rest timer: pause, adjust, presets, skip. */
export default function RestTimerSheet() {
  const { colors } = useAppTheme();
  const { rest, startRest, adjustRest, togglePauseRest, skipRest } = useActiveWorkout();
  const now = useNow(250, Boolean(rest));

  const remaining = rest ? restRemainingMs(rest, now) / 1000 : 0;
  const paused = rest?.pausedRemainingMs !== undefined;

  return (
    <View style={[styles.screen, { backgroundColor: colors.cardElevated }]}>
      <AppText variant="title2" style={styles.center}>
        Rest timer
      </AppText>
      <AppText variant="subhead" tone="secondary" style={styles.center} numberOfLines={1}>
        {rest ? `After ${rest.label}` : 'No rest running. Pick a time to start one.'}
      </AppText>

      <View style={styles.ring}>
        <ProgressRing value={rest ? remaining / rest.durationSec : 0} label={`${formatClock(remaining)} remaining`} size={200} strokeWidth={12}>
          <AppText variant="display" numeric>
            {formatClock(Math.ceil(remaining))}
          </AppText>
          {paused && (
            <AppText variant="footnote" tone="secondary" weight="700">
              PAUSED
            </AppText>
          )}
        </ProgressRing>
      </View>

      {rest && (
        <View style={styles.row}>
          <Button title="−15 s" variant="secondary" onPress={() => adjustRest(-15)} />
          <Button title={paused ? 'Resume' : 'Pause'} icon={paused ? 'play.fill' : 'pause.fill'} onPress={togglePauseRest} />
          <Button title="+15 s" variant="secondary" onPress={() => adjustRest(15)} />
        </View>
      )}

      <View style={styles.presets}>
        {PRESETS.map((sec) => (
          <Chip key={sec} label={formatClock(sec)} selected={rest?.durationSec === sec} onPress={() => startRest(sec, rest?.label ?? 'manual timer')} />
        ))}
      </View>

      {rest && (
        <Button
          title="Skip rest"
          variant="ghost"
          onPress={() => {
            skipRest();
            router.back();
          }}
          style={styles.centerSelf}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  center: {
    textAlign: 'center',
  },
  centerSelf: {
    alignSelf: 'center',
  },
  ring: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
