import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Icon, Stepper, useToast } from '@/components/ui';
import { localDateOf } from '@/data/dates';
import { useExercises, useFormReports } from '@/data/hooks';
import { useHaptics } from '@/hooks/useHaptics';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { formatShortDate } from '@/lib/format';
import { FORM_ANALYSIS_PREVIEW } from '@/features/form/preview';
import { SkeletonFigure, useRepLoop } from '@/features/form/SkeletonFigure';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Phase = 'countdown' | 'recording' | 'analyzing' | 'review';
const REP_SECONDS = 2.8;
const ANALYSIS_STEPS = ['Finding body landmarks', 'Measuring joint angles', 'Splitting reps', 'Comparing with your last recording'];

const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);

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
  const { large } = useTextScale();
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
  const stopButton = useRef<ViewInstance>(null);
  const analyzingTitle = useRef<ViewInstance>(null);
  const reviewTitle = useRef<ViewInstance>(null);

  // Countdown with a tick each second; VoiceOver hears each number.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      haptics.success();
      setPhase('recording');
      return;
    }
    haptics.selection();
    announce(String(count));
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, haptics]);

  // A tap (and a spoken count) per rep; auto-stop a couple of seconds after the last one (spec 2.8).
  useEffect(() => {
    if (phase !== 'recording') return;
    if (loop.reps > lastRep.current) {
      lastRep.current = loop.reps;
      haptics.tap();
      announce(String(loop.reps));
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

  // The focused control (Cancel, then Stop) disappears at each phase change, so move VoiceOver to
  // the new phase once it has mounted, then queue what changed so the focus move doesn't cut it off.
  useEffect(() => {
    const target = phase === 'recording' ? stopButton : phase === 'analyzing' ? analyzingTitle : phase === 'review' ? reviewTitle : undefined;
    const message = phase === 'recording' ? 'Recording started.' : phase === 'analyzing' ? 'Recording stopped.' : phase === 'review' ? `${reps} ${reps === 1 ? 'rep' : 'reps'} counted.` : undefined;
    if (!target) return;
    const t = setTimeout(() => {
      if (target.current) AccessibilityInfo.sendAccessibilityEvent(target.current, 'focus');
      if (message) AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    }, 150);
    return () => clearTimeout(t);
  }, [phase]);

  function stop() {
    setReps(Math.max(1, loop.reps));
    setPhase('analyzing');
  }

  const discard = () => {
    router.back();
    toast.show({ message: 'Recording discarded.' });
  };

  // The mock links to the latest real sample report for this exercise (or any sample).
  const sample = [...(reports ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((r) => r.exerciseId === params.exercise) ?? reports?.[reports.length - 1];
  const previous = [...(reports ?? [])].filter((r) => r.exerciseId === params.exercise).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  // At accessibility text sizes the preview gives up height so the rep count and Stop stay on screen.
  const previewHeight = Math.min(height * (large ? 0.35 : 0.55), 460);
  const shownReps = phase === 'recording' ? loop.reps : 0;

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}
      // The two-finger escape works like Cancel / Discard; while recording, Stop is the way out.
      onAccessibilityEscape={phase === 'recording' ? undefined : phase === 'countdown' ? () => router.back() : discard}
    >
      {(phase === 'countdown' || phase === 'recording') && (
        <>
          <View style={styles.topBar}>
            {phase === 'recording' ? (
              <View style={[styles.rec, { backgroundColor: 'rgba(0,0,0,0.55)' }]} accessible accessibilityRole="text" accessibilityLabel={`Recording, ${spokenDuration(loop.seconds)}`}>
                <View style={[styles.recDot, { backgroundColor: colors.errorFill }]} />
                <AppText variant="footnote" weight="800" numeric maxFontSizeMultiplier={DENSE_TEXT_MAX}>{`REC ${formatClock(loop.seconds)}`}</AppText>
              </View>
            ) : (
              <AppText variant="headline" accessibilityRole="header" style={styles.shrink}>
                {exercise?.name ?? 'Recording'}
              </AppText>
            )}
            <View style={[styles.rec, { backgroundColor: 'rgba(0,0,0,0.55)' }]} accessible accessibilityRole="text" accessibilityLabel="Framing OK">
              <Icon name="checkmark.circle.fill" color={colors.successFill} size={13} />
              <AppText variant="footnote" weight="700" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                Framing OK
              </AppText>
            </View>
          </View>

          <View style={[styles.preview, { height: previewHeight }]}>
            <SkeletonFigure family={family} depth={loop.depth} withBar={exercise?.equipment === 'barbell'} width={width - spacing.lg * 2} height={previewHeight} />
            {phase === 'countdown' && (
              <View style={[StyleSheet.absoluteFill, styles.countOverlay]}>
                {/* Fixed size: it already fills the preview, and VoiceOver hears each number. */}
                <AppText style={styles.countText} numeric maxFontSizeMultiplier={1}>
                  {String(count)}
                </AppText>
                <AppText variant="headline" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                  Get into position
                </AppText>
              </View>
            )}
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.shrink} accessible accessibilityLabel={`${shownReps} of ${targetReps} reps`}>
              <AppText variant="display" numeric>
                {shownReps}
              </AppText>
              <AppText variant="footnote" tone="secondary">{`reps · target ${targetReps}`}</AppText>
            </View>
            {phase === 'recording' ? (
              <Pressable ref={stopButton} onPress={stop} accessibilityRole="button" accessibilityLabel="Stop recording" style={[styles.stop, { borderColor: '#FFFFFF' }]}>
                <View style={[styles.stopInner, { backgroundColor: colors.errorFill }]} />
              </Pressable>
            ) : (
              <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
            )}
          </View>
          <AppText variant="caption" tone="secondary" style={styles.center}>
            {phase === 'recording' ? 'Stops on its own a couple of seconds after your last rep.' : 'Recording starts after the countdown.'}
          </AppText>
        </>
      )}

      {phase === 'analyzing' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.middle}>
          <View ref={analyzingTitle} accessible accessibilityRole="header" accessibilityLabel="Analyzing on your phone">
            <AppText variant="title2" style={styles.center}>
              Analyzing on your phone
            </AppText>
          </View>
          <AppText variant="subhead" tone="secondary" style={styles.center}>
            Your video never leaves this device.
          </AppText>
          <Card>
            <View style={styles.steps}>
              {ANALYSIS_STEPS.map((label, i) => (
                <View key={label} style={styles.stepRow} accessible accessibilityLabel={`${label}, ${i < step ? 'done' : i === step ? 'in progress' : 'waiting'}`}>
                  <Icon name={i < step ? 'checkmark.circle.fill' : i === step ? 'circle.dotted' : 'circle'} color={i < step ? colors.successFill : colors.textTertiary} size={18} />
                  <AppText variant="subhead" tone={i <= step ? 'primary' : 'secondary'} style={styles.flex}>
                    {label}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
        </ScrollView>
      )}

      {phase === 'review' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.middle}>
          <Icon name="checkmark.seal.fill" color={colors.successFill} size={44} style={styles.centerSelf} />
          <View ref={reviewTitle} accessible accessibilityRole="header" accessibilityLabel="Analysis ready">
            <AppText variant="title2" style={styles.center}>
              Analysis ready
            </AppText>
          </View>
          <Card>
            <View style={styles.steps}>
              {/* Label above the stepper at accessibility sizes, so neither gets squeezed. */}
              <View style={large ? styles.stacked : styles.stepRow}>
                {/* The stepper speaks this label itself. */}
                <AppText variant="body" style={!large && styles.flex} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  Reps counted
                </AppText>
                <Stepper label="Reps counted" value={reps} onChange={setReps} min={1} max={50} />
              </View>
              <AppText variant="footnote" tone="secondary">
                Fix the count if the camera missed a rep. It fills in the set's reps.
              </AppText>
              <View style={styles.stepRow}>
                <Icon name="checkmark.circle.fill" color={colors.successFill} size={16} />
                <AppText variant="subhead" style={styles.flex}>
                  Framing good · 1 rep flagged as low confidence
                </AppText>
              </View>
              {previous && (
                <View style={styles.stepRow}>
                  <Icon name="arrow.left.arrow.right" color={colors.accentText} size={16} />
                  <AppText variant="subhead" style={styles.flex}>{`Compared with ${formatShortDate(localDateOf(previous.createdAt))}`}</AppText>
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
          <Button title="Discard recording" variant="ghost" onPress={discard} />
          {/* Only while recording is a mock (FORM_ANALYSIS_PREVIEW, switched off at G4.3). */}
          {FORM_ANALYSIS_PREVIEW && (
            <AppText variant="caption" tone="secondary" style={styles.center}>
              This is a preview. Real recording and analysis arrive with the camera build.
            </AppText>
          )}
        </ScrollView>
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
    gap: spacing.md,
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
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  steps: {
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stacked: {
    gap: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
  centerSelf: {
    alignSelf: 'center',
  },
  shrink: {
    flexShrink: 1,
  },
  flex: {
    flex: 1,
  },
});
