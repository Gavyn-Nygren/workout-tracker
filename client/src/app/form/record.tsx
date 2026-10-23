import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Icon, Stepper, useToast } from '@/components/ui';
import { useExercises, useFormReports } from '@/data/hooks';
import { useHaptics } from '@/hooks/useHaptics';
import { formatClock } from '@/hooks/useNow';
import { formatShortDate } from '@/lib/format';
import { SkeletonFigure, useRepLoop } from '@/features/form/SkeletonFigure';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Phase = 'countdown' | 'recording' | 'analyzing' | 'review';
const REP_SECONDS = 2.8;
const ANALYSIS_STEPS = ['Finding body landmarks', 'Measuring joint angles', 'Splitting reps', 'Comparing with your last recording'];

/**
 * Countdown → recording (framing guidance and rep count only, no live corrections; spec 2.8)
 * → on-device analysis → confirm reps. Mocked with the animated skeleton until G4.3.
 */
export default function FormRecordScreen() {
  return (
    <SchemeOverride scheme="dark">
      <Recorder />
    </SchemeOverride>
  );
}

function Recorder() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const haptics = useHaptics();
  const toast = useToast();
  const params = useLocalSearchParams<{ exercise: string; entry?: string; set?: string; countdown?: string }>();
  const { data: exercises } = useExercises();
  const { data: reports } = useFormReports();
  const { workout, dispatch } = useActiveWorkout();

  const exercise = exercises?.find((e) => e.id === params.exercise);
  const family = exercise?.formAnalysis ?? 'squat';
  const entry = workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === params.entry);
  const set = entry?.sets.find((s) => s.id === params.set);
  const targetReps = set?.reps ?? 6;

  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(Number(params.countdown ?? 5));
  const [step, setStep] = useState(0);
  const [reps, setReps] = useState(targetReps);
  const loop = useRepLoop({ playing: phase === 'recording', repSeconds: REP_SECONDS, maxReps: targetReps });
  const lastRep = useRef(0);

  // Countdown with a tick each second.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      haptics.success();
      setPhase('recording');
      return;
    }
    haptics.selection();
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, haptics]);

  // A tap per counted rep; auto-stop a couple of seconds after the last one (spec 2.8).
  useEffect(() => {
    if (phase !== 'recording') return;
    if (loop.reps > lastRep.current) {
      lastRep.current = loop.reps;
      haptics.tap();
    }
    if (loop.seconds > targetReps * REP_SECONDS + 2) stop();
  }, [loop.reps, loop.seconds, phase]);

  // Analysis steps tick through, then review.
  useEffect(() => {
    if (phase !== 'analyzing') return;
    if (step >= ANALYSIS_STEPS.length) {
      setPhase('review');
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 650);
    return () => clearTimeout(t);
  }, [phase, step]);

  function stop() {
    setReps(Math.max(1, loop.reps));
    setPhase('analyzing');
  }

  // The mock links to the latest real sample report for this exercise (or any sample).
  const sample = [...(reports ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((r) => r.exerciseId === params.exercise) ?? reports?.[reports.length - 1];
  const previous = [...(reports ?? [])].filter((r) => r.exerciseId === params.exercise).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const previewHeight = Math.min(height * 0.55, 460);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      {(phase === 'countdown' || phase === 'recording') && (
        <>
          <View style={styles.topBar}>
            {phase === 'recording' ? (
              <View style={[styles.rec, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                <View style={[styles.recDot, { backgroundColor: '#E66767' }]} />
                <AppText variant="footnote" weight="800" numeric>{`REC ${formatClock(loop.seconds)}`}</AppText>
              </View>
            ) : (
              <AppText variant="headline">{exercise?.name ?? 'Recording'}</AppText>
            )}
            <View style={[styles.rec, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <Icon name="checkmark.circle.fill" color={colors.successFill} size={13} />
              <AppText variant="footnote" weight="700">
                Framing OK
              </AppText>
            </View>
          </View>

          <View style={[styles.preview, { height: previewHeight }]}>
            <SkeletonFigure family={family} depth={loop.depth} withBar={exercise?.equipment === 'barbell'} width={width - spacing.lg * 2} height={previewHeight} />
            {phase === 'countdown' && (
              <View style={[StyleSheet.absoluteFill, styles.countOverlay]} accessibilityLiveRegion="assertive">
                <AppText style={styles.countText} numeric>
                  {String(count)}
                </AppText>
                <AppText variant="headline">Get into position</AppText>
              </View>
            )}
          </View>

          <View style={styles.bottomBar}>
            <View accessibilityLiveRegion="polite" accessibilityLabel={`${loop.reps} reps counted`}>
              <AppText variant="display" numeric>
                {phase === 'recording' ? loop.reps : 0}
              </AppText>
              <AppText variant="footnote" tone="secondary">{`reps · target ${targetReps}`}</AppText>
            </View>
            {phase === 'recording' ? (
              <Pressable onPress={stop} accessibilityRole="button" accessibilityLabel="Stop recording" style={[styles.stop, { borderColor: '#FFFFFF' }]}>
                <View style={[styles.stopInner, { backgroundColor: '#E66767' }]} />
              </Pressable>
            ) : (
              <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
            )}
          </View>
          <AppText variant="caption" tone="tertiary" style={styles.center}>
            {phase === 'recording' ? 'Stops on its own a couple of seconds after your last rep.' : 'Recording starts after the countdown.'}
          </AppText>
        </>
      )}

      {phase === 'analyzing' && (
        <View style={styles.middle}>
          <AppText variant="title2" style={styles.center}>
            Analyzing on your phone
          </AppText>
          <AppText variant="subhead" tone="secondary" style={styles.center}>
            Your video never leaves this device.
          </AppText>
          <Card>
            <View style={styles.steps}>
              {ANALYSIS_STEPS.map((label, i) => (
                <View key={label} style={styles.stepRow}>
                  <Icon name={i < step ? 'checkmark.circle.fill' : i === step ? 'circle.dotted' : 'circle'} color={i < step ? colors.successFill : colors.textTertiary} size={18} />
                  <AppText variant="subhead" tone={i <= step ? 'primary' : 'tertiary'}>
                    {label}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
        </View>
      )}

      {phase === 'review' && (
        <View style={styles.middle}>
          <Icon name="checkmark.seal.fill" color={colors.successFill} size={44} style={styles.centerSelf} />
          <AppText variant="title2" style={styles.center}>
            Analysis ready
          </AppText>
          <Card>
            <View style={styles.steps}>
              <View style={styles.stepRow}>
                <AppText variant="body" style={styles.flex}>
                  Reps counted
                </AppText>
                <Stepper label="Reps" value={reps} onChange={setReps} min={1} max={50} />
              </View>
              <AppText variant="footnote" tone="secondary">
                Fix the count if the camera missed a rep. It fills in the set's reps.
              </AppText>
              <View style={styles.stepRow}>
                <Icon name="checkmark.circle.fill" color={colors.successFill} size={16} />
                <AppText variant="subhead">Framing good · 1 rep flagged as low confidence</AppText>
              </View>
              {previous && (
                <View style={styles.stepRow}>
                  <Icon name="arrow.left.arrow.right" color={colors.accentText} size={16} />
                  <AppText variant="subhead">{`Compared with ${formatShortDate(previous.createdAt.slice(0, 10))}`}</AppText>
                </View>
              )}
            </View>
          </Card>
          <Button
            title={entry && set ? 'Save reps to set' : 'Done'}
            fullWidth
            onPress={() => {
              if (entry && set) dispatch({ type: 'updateSet', entryId: entry.id, setId: set.id, patch: { reps } });
              router.back();
              toast.show({ message: entry && set ? `${reps} reps saved. The report is attached to this set.` : 'Recording saved.', tone: 'success' });
            }}
          />
          {sample && (
            <Button
              title="View report"
              variant="secondary"
              fullWidth
              onPress={() => router.replace({ pathname: '/form/report', params: { id: sample.id, sample: '1' } })}
            />
          )}
          <Button
            title="Discard recording"
            variant="ghost"
            onPress={() => {
              router.back();
              toast.show({ message: 'Recording discarded.' });
            }}
          />
          <AppText variant="caption" tone="tertiary" style={styles.center}>
            This is a preview. Real recording and analysis arrive with the camera build.
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05080B',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  preview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,8,11,0.55)',
    gap: spacing.sm,
  },
  countText: {
    fontSize: 120,
    lineHeight: 130,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stop: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInner: {
    width: 30,
    height: 30,
    borderRadius: 6,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  steps: {
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  center: {
    textAlign: 'center',
  },
  centerSelf: {
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
});
