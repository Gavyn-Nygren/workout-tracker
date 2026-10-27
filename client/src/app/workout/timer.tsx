import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, ProgressRing } from '@/components/ui';
import { useLiveNow } from '@/hooks/useLiveNow';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { restRemainingMs, useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { describeNextUp, shownNextUp } from '@/features/workout/rest';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const PRESETS = [60, 90, 120, 180, 240, 300];
const RING = 200;

/** Expanded rest timer: pause, adjust, presets, skip. */
export default function RestTimerSheet() {
  const { colors } = useAppTheme();
  const { fontScale } = useTextScale();
  const { rest, pickRestPreset, adjustRest, togglePauseRest, skipRest } = useActiveWorkout();
  const now = useLiveNow(250, Boolean(rest));
  const next = rest ? shownNextUp(rest) : undefined;

  const remaining = rest ? restRemainingMs(rest, now) / 1000 : 0;
  const secondsLeft = Math.ceil(remaining);
  const paused = rest?.pausedRemainingMs !== undefined;
  // The ring grows a little with the text so the (capped) time stays inside it.
  const ringSize = RING * Math.min(Math.max(fontScale, 1), 1.3);

  return (
    <ScrollView
      style={{ backgroundColor: colors.cardElevated }}
      contentContainerStyle={styles.content}
      onAccessibilityEscape={() => router.back()}
    >
      <AppText variant="title2" accessibilityRole="header" style={styles.center}>
        Rest timer
      </AppText>
      <AppText variant="subhead" tone="secondary" style={styles.center}>
        {rest ? `After ${rest.label}` : 'No rest running. Pick a time to start one.'}
      </AppText>
      {next && (
        <AppText variant="subhead" weight="600" style={styles.center}>
          Next: {describeNextUp(next)}
        </AppText>
      )}

      {/* One adjustable element for VoiceOver: swipe up or down to add or take off 15 seconds. */}
      <View
        accessible
        accessibilityRole={rest ? 'adjustable' : 'text'}
        accessibilityLabel="Rest remaining"
        accessibilityValue={{ text: rest ? `${spokenDuration(secondsLeft)}${paused ? ', paused' : ''}` : 'Not running' }}
        accessibilityActions={rest ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
        onAccessibilityAction={(e) => adjustRest(e.nativeEvent.actionName === 'increment' ? 15 : -15)}
        style={styles.ring}
      >
        <ProgressRing value={rest ? remaining / rest.durationSec : 0} label="Rest remaining" size={ringSize} strokeWidth={12}>
          <AppText variant="display" numeric>
            {formatClock(secondsLeft)}
          </AppText>
          {paused && (
            <AppText variant="footnote" tone="secondary" weight="700" maxFontSizeMultiplier={1.3}>
              PAUSED
            </AppText>
          )}
        </ProgressRing>
      </View>

      {rest && (
        <View style={styles.row}>
          <Button title="−15 s" variant="secondary" onPress={() => adjustRest(-15)} accessibilityLabel="Subtract 15 seconds" />
          <Button title={paused ? 'Resume' : 'Pause'} icon={paused ? 'play.fill' : 'pause.fill'} onPress={togglePauseRest} />
          <Button title="+15 s" variant="secondary" onPress={() => adjustRest(15)} accessibilityLabel="Add 15 seconds" />
        </View>
      )}

      <View style={styles.presets}>
        {PRESETS.map((sec) => {
          const selected = rest?.durationSec === sec;
          return (
            <Chip
              key={sec}
              label={formatClock(sec)}
              selected={selected}
              // Starts a rest rather than toggling, so it reads as a button.
              role="button"
              accessibilityLabel={`Start ${spokenDuration(sec)} rest`}
              onPress={() => pickRestPreset(sec)}
            />
          );
        })}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.huge,
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
  // Wraps rather than running off both edges at larger text sizes.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
