import type { SFSymbol } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Chip, Icon } from '@/components/ui';
import { useExercises } from '@/data/hooks';
import type { FormMovementFamily } from '@/data/types';
import { FormUnavailable } from '@/features/form/FormUnavailable';
import { SkeletonFigure } from '@/features/form/SkeletonFigure';
import { isFormAnalysisSupported } from '@/features/form/capability';
import { FORM_ANALYSIS_PREVIEW } from '@/features/form/preview';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type CheckState = 'checking' | 'ok' | 'warn';
type Check = { key: string; label: string; okLabel: string; warnLabel: string; state: CheckState };

const CHECKS: Check[] = [
  { key: 'side', label: 'Side view', okLabel: 'Side view', warnLabel: 'Turn side-on', state: 'checking' },
  { key: 'body', label: 'Full body', okLabel: 'Full body', warnLabel: 'Step back', state: 'checking' },
  { key: 'light', label: 'Lighting', okLabel: 'Lighting', warnLabel: 'Dim light', state: 'checking' },
];
// The mock's result for each check: lighting warns, to show the warning style.
const mockResult = (c: Check): CheckState => (c.key === 'light' ? 'warn' : 'ok');
const spokenCheck = (c: Check) => `${c.label}: ${c.state === 'checking' ? 'checking' : c.state === 'ok' ? 'OK' : c.warnLabel}`;

const ORIENTATION: Record<FormMovementFamily, string> = {
  squat: 'Portrait or landscape both work for squats.',
  lunge: 'Landscape fits a lunge stride better.',
  deadlift: 'Landscape fits the bar and your whole hinge.',
  calf_raise: 'Portrait works well; keep your feet in frame.',
};

/**
 * Camera setup (roadmap G2.7, user's pick: live preview + checklist). A posed skeleton stands in
 * for the camera until the camera build (G4.3). Warnings never block recording (spec 2.8).
 */
export default function FormSetupScreen() {
  return (
    <SchemeOverride scheme="dark">
      <Setup />
    </SchemeOverride>
  );
}

function Setup() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { large } = useTextScale();
  const params = useLocalSearchParams<{ exercise: string; entry?: string; set?: string }>();
  const { data: exercises } = useExercises();
  const { workout } = useActiveWorkout();
  const [countdown, setCountdown] = useState(5);
  const [showTips, setShowTips] = useState(false);
  const [forceUnsupported, setForceUnsupported] = useState(false);
  const [checks, setChecks] = useState<Check[]>(CHECKS);
  const tipsTitle = useRef<ViewInstance>(null);

  // Mock framing checks resolve one by one. VoiceOver hears each result as it lands.
  useEffect(() => {
    const timers = CHECKS.map((check, i) =>
      setTimeout(() => {
        const done = { ...check, state: mockResult(check) };
        setChecks((prev) => prev.map((c, j) => (j === i ? done : c)));
        AccessibilityInfo.announceForAccessibilityWithOptions(`${spokenCheck(done)}${done.state === 'warn' ? '. You can still record.' : ''}`, { queue: true });
      }, 700 + i * 500),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // The tips overlay is modal for VoiceOver; start reading at its title.
  useEffect(() => {
    if (!showTips) return;
    const t = setTimeout(() => tipsTitle.current && AccessibilityInfo.sendAccessibilityEvent(tipsTitle.current, 'focus'), 100);
    return () => clearTimeout(t);
  }, [showTips]);

  const exercise = exercises?.find((e) => e.id === params.exercise);
  const family = exercise?.formAnalysis ?? 'squat';
  const entry = workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === params.entry);
  const setIndex = entry?.sets.findIndex((s) => s.id === params.set) ?? -1;
  const warnings = checks.filter((c) => c.state === 'warn');

  if (!isFormAnalysisSupported() || forceUnsupported) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]} onAccessibilityEscape={() => router.back()}>
        <FormUnavailable onClose={() => router.back()} />
      </View>
    );
  }

  // At accessibility text sizes the preview gives up height so the text and Start button fit.
  const previewHeight = Math.min(height * (large ? 0.3 : 0.5), 420);

  return (
    <View
      style={[styles.screen, { backgroundColor: '#05080B', paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}
      onAccessibilityEscape={() => router.back()}
    >
      <View style={styles.topBar}>
        <RoundButton icon="xmark" label="Close" onPress={() => router.back()} />
        <View style={styles.title}>
          <AppText variant="headline" accessibilityRole="header" numberOfLines={2} style={styles.center}>
            {exercise?.name ?? 'Form recording'}
          </AppText>
          <AppText variant="footnote" tone="secondary" style={styles.center}>
            {setIndex >= 0 ? `Set ${setIndex + 1} · line up from the side` : 'Line up from the side'}
          </AppText>
        </View>
        <RoundButton icon="questionmark" label="Placement tips" onPress={() => setShowTips(true)} />
      </View>

      {/* Scrolls only when the text is too big to fit; otherwise the bottom block sits at the bottom. */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.body} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
        <View style={styles.checks}>
          {checks.map((c) => (
            <CheckPill key={c.key} check={c} />
          ))}
        </View>

        <View style={[styles.preview, { height: previewHeight }]} accessible accessibilityLabel="Camera preview. Fit your whole body inside the outline, side-on to the phone.">
          <SkeletonFigure family={family} depth={0} showFrame withBar={exercise?.equipment === 'barbell'} width={width - spacing.lg * 2} height={previewHeight} />
          {/* Only while the camera is a mock (FORM_ANALYSIS_PREVIEW, switched off at G4.3). */}
          {FORM_ANALYSIS_PREVIEW && (
            <View style={[styles.liveTag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.successFill }]} />
              <AppText variant="caption" weight="700" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                PREVIEW · MOCK CAMERA
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.bottom}>
          <AppText variant="footnote" tone="secondary" style={styles.center}>
            {ORIENTATION[family]}
          </AppText>
          {warnings.length > 0 && (
            <AppText variant="footnote" tone="warning" style={styles.center}>
              {`${warnings.map((w) => w.warnLabel).join(', ')}. You can still record; unclear reps are flagged in the report.`}
            </AppText>
          )}
          <View style={styles.countdownRow}>
            <AppText variant="subhead" tone="secondary">
              Countdown
            </AppText>
            {[5, 10].map((s) => (
              <Chip key={s} label={`${s} s`} role="radio" accessibilityLabel={`${s} second countdown`} selected={countdown === s} onPress={() => setCountdown(s)} />
            ))}
          </View>
          <Button
            title="Start recording"
            icon="record.circle"
            fullWidth
            onPress={() => router.replace({ pathname: '/form/record', params: { exercise: params.exercise, entry: params.entry, set: params.set, countdown: String(countdown) } })}
          />
        </View>
      </ScrollView>

      {showTips && (
        <View
          style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.scrim, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setShowTips(false)}
        >
          <Card elevated>
            {/* Scrolls at large text sizes so "Got it" is always reachable. */}
            <ScrollView style={{ maxHeight: height - insets.top - insets.bottom - spacing.lg * 4 }} contentContainerStyle={styles.tips} alwaysBounceVertical={false}>
              <View ref={tipsTitle} accessible accessibilityRole="header" accessibilityLabel="Set up the shot">
                <AppText variant="title3">Set up the shot</AppText>
              </View>
              {[
                ['iphone.landscape', 'Prop the phone side-on to you, about hip height.'],
                ['figure.walk', 'Step back about 3 m (10 ft) so head to feet fit the outline.'],
                ['sun.max', 'Face the light. A bright window behind you hides your joints.'],
                ['person.fill', 'Keep other people out of the frame.'],
              ].map(([icon, text]) => (
                <View key={text} style={styles.tip}>
                  <Icon name={icon as SFSymbol} color={colors.accentText} size={18} />
                  <AppText variant="subhead" style={styles.flex}>
                    {text}
                  </AppText>
                </View>
              ))}
              <Button title="Got it" fullWidth onPress={() => setShowTips(false)} />
              {__DEV__ && (
                <Button
                  title="Preview the unsupported-device screen"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setShowTips(false);
                    setForceUnsupported(true);
                  }}
                />
              )}
            </ScrollView>
          </Card>
        </View>
      )}
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={[styles.round, { backgroundColor: colors.input }]}>
      <Icon name={icon} color={colors.text} size={16} weight="bold" />
    </Pressable>
  );
}

function CheckPill({ check }: { check: Check }) {
  const { colors } = useAppTheme();
  const icon: SFSymbol = check.state === 'ok' ? 'checkmark.circle.fill' : check.state === 'warn' ? 'exclamationmark.triangle.fill' : 'circle.dotted';
  const color = check.state === 'ok' ? colors.successFill : check.state === 'warn' ? colors.warningFill : colors.textTertiary;
  const label = check.state === 'ok' ? check.okLabel : check.state === 'warn' ? check.warnLabel : `${check.label}…`;
  return (
    <View style={[styles.pill, { backgroundColor: 'rgba(23,26,31,0.9)' }]} accessible accessibilityRole="text" accessibilityLabel={spokenCheck(check)}>
      <Icon name={icon} color={color} size={14} />
      {/* Camera-overlay chrome: grows only to the dense cap. */}
      <AppText variant="footnote" weight="700" tone={check.state === 'warn' ? 'warning' : check.state === 'ok' ? 'primary' : 'secondary'} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    alignItems: 'center',
  },
  body: {
    flexGrow: 1,
    gap: spacing.md,
  },
  round: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  preview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTag: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bottom: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  center: {
    textAlign: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  overlay: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  tips: {
    gap: spacing.md,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
