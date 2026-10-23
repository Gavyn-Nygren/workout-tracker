import type { SFSymbol } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineChart } from '@/components/charts/LineChart';
import { AppText, Button, Card, Chip, EmptyState, Icon, SectionHeader, ToastViewport, useToast } from '@/components/ui';
import { useDeleteFormReport, useDeleteRecordingVideo, useExercises, useFormReports, usePreferences, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { FormReport, Joint, Observation } from '@/data/types';
import { formatLoad, formatShortDate } from '@/lib/format';
import { reportAngle } from '@/features/home/goals';
import { RepDotChart } from '@/features/form/RepDotChart';
import { SkeletonFigure, useRepLoop } from '@/features/form/SkeletonFigure';
import { Change, Legend } from '@/features/progress/ProgressParts';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const JOINT_LABEL: Record<Joint, string> = { knee: 'knee', hip: 'hip', ankle: 'ankle' };
const OBS_ICON: Record<Observation['kind'], SFSymbol> = { change: 'chart.line.downtrend.xyaxis', consistency: 'equal.circle', quality: 'exclamationmark.triangle' };
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/**
 * Form report (roadmap G2.7, user's pick: summary first). Compares you with your own earlier
 * recordings, never with an "ideal" (spec 2.8), and never diagnoses or prescribes.
 */
export default function FormReportScreen() {
  const { id, sample } = useLocalSearchParams<{ id: string; sample?: string }>();
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const units = (usePreferences().data ?? defaultPreferences).units;
  const { data: reports } = useFormReports();
  const { data: sessions } = useSessions();
  const { data: exercises } = useExercises();
  const deleteVideo = useDeleteRecordingVideo();
  const deleteReport = useDeleteFormReport();

  const report = reports?.find((r) => r.id === id);
  const earlier = useMemo(
    () => (report ? (reports ?? []).filter((r) => r.exerciseId === report.exerciseId && r.createdAt < report.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [reports, report],
  );
  const [compareId, setCompareId] = useState<string | null | undefined>(undefined);
  const comparison = compareId === null ? undefined : (earlier.find((r) => r.id === compareId) ?? earlier[0]);

  if (!report) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState icon="video.slash" title="Report not found" message="It may have been deleted." actionLabel="Close" onAction={() => router.back()} />
      </View>
    );
  }

  const exercise = exercises?.find((e) => e.id === report.exerciseId);
  const session = sessions?.find((s) => s.id === report.sessionId);
  const sessionEntry = session?.blocks.flatMap((b) => b.exercises).find((e) => e.sets.some((s) => s.id === report.setId));
  const setIndex = sessionEntry?.sets.findIndex((s) => s.id === report.setId) ?? -1;
  const set = sessionEntry?.sets[setIndex];
  const joint = report.primaryJoint;
  const date = report.createdAt.slice(0, 10);

  // Compare the angles as displayed (whole degrees) so the text always matches the numbers shown.
  const rawAngle = reportAngle(report, joint);
  const angle = rawAngle === undefined ? undefined : Math.round(rawAngle);
  const rawCompare = comparison ? reportAngle(comparison, joint) : undefined;
  const compareAngle = rawCompare === undefined ? undefined : Math.round(rawCompare);
  // For knees and hips a smaller bottom angle is deeper; for calf raises a larger ankle angle is a higher raise.
  const improvement = angle !== undefined && compareAngle !== undefined ? (joint === 'ankle' ? angle - compareAngle : compareAngle - angle) : undefined;
  const trusted = report.reps.filter((r) => r.confidence === 'high');
  const rom = average(trusted.map((r) => r.romDeg));
  const repTime = average(report.reps.map((r) => r.durationSec));
  const lowCount = report.reps.length - trusted.length;

  const trend = [...(reports ?? [])]
    .filter((r) => r.exerciseId === report.exerciseId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => ({ date: r.createdAt.slice(0, 10), value: reportAngle(r, joint) ?? 0 }));

  const confirmDeleteVideo = () =>
    Alert.alert('Delete the video?', 'The replay is removed from this phone. Angles, reps, charts, and trends are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete video',
        style: 'destructive',
        onPress: async () => {
          const recordingId = report.recordingId;
          await deleteVideo.mutateAsync(recordingId);
          toast.show({ message: 'Video deleted. Metrics kept.' });
        },
      },
    ]);
  const confirmDeleteReport = () =>
    Alert.alert('Delete this report?', 'The video, replay, and all of its measurements are removed, including from your trends.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete report',
        style: 'destructive',
        onPress: async () => {
          await deleteReport.mutateAsync(report.id);
          router.back();
          toast.show({ message: 'Report deleted.' });
        },
      },
    ]);
  const openMenu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Recording',
        options: ['Export video', ...(report.hasReplay ? ['Delete video (keep metrics)'] : []), 'Delete report', 'Cancel'],
        destructiveButtonIndex: report.hasReplay ? [1, 2] : [1],
        cancelButtonIndex: report.hasReplay ? 3 : 2,
        userInterfaceStyle: scheme,
      },
      (i) => {
        if (i === 0) toast.show({ message: report.hasReplay ? 'Export to Photos arrives with the camera build.' : 'The video was deleted, so there is nothing to export.' });
        if (report.hasReplay && i === 1) confirmDeleteVideo();
        if ((report.hasReplay && i === 2) || (!report.hasReplay && i === 1)) confirmDeleteReport();
      },
    );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <AppText variant="body" tone="accent">
            Close
          </AppText>
        </Pressable>
        <AppText variant="headline">Form report</AppText>
        <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Recording options" hitSlop={10}>
          <Icon name="ellipsis.circle" color={colors.accentText} size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.huge }]}>
        {sample === '1' && (
          <View style={[styles.banner, { backgroundColor: colors.accentSubtle }]}>
            <Icon name="info.circle" color={colors.accentText} size={14} />
            <AppText variant="footnote" tone="accent" style={styles.flex}>
              Sample report. Your own recordings get reports like this once the camera build lands.
            </AppText>
          </View>
        )}

        {/* Summary first (user's pick) */}
        <Card>
          <View style={styles.stack}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="title2">{exercise?.name ?? 'Exercise'}</AppText>
                <AppText variant="subhead" tone="secondary" numeric>
                  {[formatShortDate(date), setIndex >= 0 ? `Set ${setIndex + 1}` : undefined, set?.loadKg ? `${formatLoad(set.loadKg, units)} × ${set.reps}` : undefined].filter(Boolean).join('  ·  ')}
                </AppText>
              </View>
              <View style={[styles.pill, { backgroundColor: report.quality.framing === 'good' ? colors.successSubtle : colors.input }]}>
                <Icon name={report.quality.framing === 'good' ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'} color={report.quality.framing === 'good' ? colors.successFill : colors.warningFill} size={12} />
                <AppText variant="caption" weight="700" tone={report.quality.framing === 'good' ? 'success' : 'warning'}>
                  {report.quality.framing === 'good' ? 'Good framing' : 'Framing warning'}
                </AppText>
              </View>
            </View>
            <View>
              <AppText variant="display" numeric>{angle !== undefined ? `${Math.round(angle)}°` : '—'}</AppText>
              <AppText variant="subhead" tone="secondary">{`Average ${JOINT_LABEL[joint]} angle at the bottom`}</AppText>
            </View>
            {improvement !== undefined && comparison && (
              <Change
                text={
                  Math.abs(improvement) < 5
                    ? `Within 5° of ${formatShortDate(comparison.createdAt.slice(0, 10))}: no meaningful change`
                    : `${Math.round(Math.abs(improvement))}° ${improvement > 0 ? (joint === 'ankle' ? 'higher' : 'deeper') : joint === 'ankle' ? 'lower' : 'shallower'} than ${formatShortDate(comparison.createdAt.slice(0, 10))}`
                }
                delta={Math.abs(improvement) < 5 ? 0 : improvement}
              />
            )}
            <View style={[styles.stats, { borderTopColor: colors.border }]}>
              <Stat label="Range of motion" value={rom !== undefined ? `${Math.round(rom)}°` : '—'} />
              <Stat label="Reps" value={`${report.detectedReps}${lowCount ? ` (${lowCount} unclear)` : ''}`} />
              <Stat label="Time per rep" value={repTime !== undefined ? `${repTime.toFixed(1)} s` : '—'} />
            </View>
            {report.quality.warnings.map((w) => (
              <AppText key={w} variant="footnote" tone="warning">
                {w}
              </AppText>
            ))}
          </View>
        </Card>

        <View style={styles.section}>
          <SectionHeader title="Compare with" />
          {earlier.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {earlier.slice(0, 2).map((r) => (
                <Chip key={r.id} label={formatShortDate(r.createdAt.slice(0, 10))} selected={comparison?.id === r.id} onPress={() => setCompareId(r.id)} />
              ))}
              {earlier.length > 2 && (
                <Chip
                  label="Older…"
                  selected={!!comparison && earlier.indexOf(comparison) >= 2}
                  onPress={() =>
                    ActionSheetIOS.showActionSheetWithOptions(
                      { title: 'Compare with', options: [...earlier.slice(2).map((r) => formatShortDate(r.createdAt.slice(0, 10))), 'Cancel'], cancelButtonIndex: earlier.length - 2, userInterfaceStyle: scheme },
                      (i) => i < earlier.length - 2 && setCompareId(earlier[i + 2].id),
                    )
                  }
                />
              )}
              <Chip label="None" selected={compareId === null} onPress={() => setCompareId(null)} />
            </ScrollView>
          ) : (
            <AppText variant="footnote" tone="secondary">
              This is your first recording of this exercise. Next time you'll see the change.
            </AppText>
          )}
        </View>

        <Replay report={report} family={exercise?.formAnalysis ?? 'squat'} withBar={exercise?.equipment === 'barbell'} />

        <View style={styles.section}>
          <SectionHeader title={`Bottom ${JOINT_LABEL[joint]} angle per rep`} />
          <Card>
            <View style={styles.stack}>
              <RepDotChart
                joint={joint}
                current={{ label: formatShortDate(date), color: colors.chartCompare[0], reps: report.reps }}
                comparison={comparison ? { label: formatShortDate(comparison.createdAt.slice(0, 10)), color: colors.chartCompare[1], reps: comparison.reps } : undefined}
              />
              <Legend
                items={[
                  { label: `${formatShortDate(date)} (this set)`, color: colors.chartCompare[0], kind: 'dot' },
                  ...(comparison ? [{ label: formatShortDate(comparison.createdAt.slice(0, 10)), color: colors.chartCompare[1], kind: 'dot' as const }] : []),
                ]}
              />
              <AppText variant="caption" tone="tertiary">
                Hollow dots are reps the camera wasn't sure about; they're left out of averages and trends.
              </AppText>
            </View>
          </Card>
        </View>

        {trend.length > 1 && (
          <View style={styles.section}>
            <SectionHeader title="Depth over time" />
            <Card>
              <LineChart
                series={[{ key: 'trend', label: 'Average bottom angle', color: colors.chartPrimary, points: trend, style: 'line', area: false }]}
                primaryKey="trend"
                formatValue={(v) => `${Math.round(v)}°`}
                bestIs={joint === 'ankle' ? 'max' : 'min'}
                height={170}
                label={`Average bottom ${JOINT_LABEL[joint]} angle across ${trend.length} recordings: ${trend.map((t) => `${Math.round(t.value)}°`).join(', ')}`}
              />
            </Card>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="Rep by rep" />
          <Card padding="none">
            <View style={[styles.tableRow, { borderBottomColor: colors.border }]}>
              {['REP', 'KNEE', 'HIP', 'ANKLE', 'TIME'].map((h) => (
                <AppText key={h} variant="caption" weight="700" tone="tertiary" style={styles.cell}>
                  {h}
                </AppText>
              ))}
            </View>
            {report.reps.map((r, i) => {
              const low = r.confidence === 'low';
              return (
                <View key={r.index} style={[styles.tableRow, i < report.reps.length - 1 && { borderBottomColor: colors.border }]} accessibilityLabel={`Rep ${r.index}${low ? ', low confidence' : ''}`}>
                  <AppText variant="subhead" weight="700" style={styles.cell} tone={low ? 'tertiary' : 'primary'} numeric>
                    {low ? `${r.index}?` : String(r.index)}
                  </AppText>
                  {(['knee', 'hip', 'ankle'] as Joint[]).map((j) => (
                    <AppText key={j} variant="subhead" style={styles.cell} tone={low ? 'tertiary' : j === joint ? 'primary' : 'secondary'} weight={j === joint ? '700' : '400'} numeric>
                      {r.angles[j] ? `${r.angles[j]!.minDeg}°` : '—'}
                    </AppText>
                  ))}
                  <AppText variant="subhead" style={styles.cell} tone={low ? 'tertiary' : 'secondary'} numeric>
                    {`${r.durationSec.toFixed(1)}s`}
                  </AppText>
                </View>
              );
            })}
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="What changed" />
          <Card padding="none">
            {report.observations.map((o, i) => (
              <View key={o.id} style={[styles.observation, i < report.observations.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Icon name={OBS_ICON[o.kind]} color={o.kind === 'quality' ? colors.warningFill : colors.accentText} size={18} />
                <View style={styles.flex}>
                  <AppText variant="subhead">{o.text}</AppText>
                  {o.cue && (
                    <View style={styles.cue}>
                      <Icon name="lightbulb" color={colors.textSecondary} size={12} />
                      <AppText variant="footnote" tone="secondary" style={styles.flex}>
                        {o.cue}
                      </AppText>
                    </View>
                  )}
                </View>
              </View>
            ))}
            {!report.observations.length && (
              <AppText variant="subhead" tone="secondary" style={styles.none}>
                Nothing stood out compared with your earlier recordings.
              </AppText>
            )}
          </Card>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.input }]}>
          <Icon name="info.circle" color={colors.textSecondary} size={16} />
          <AppText variant="footnote" tone="secondary" style={styles.flex}>
            Educational, not medical advice. These numbers compare you with your own earlier recordings, not with an ideal form, and video angles have limits. Stop if you feel pain.
          </AppText>
        </View>

        <View style={styles.actions}>
          {report.hasReplay && <Button title="Delete video, keep metrics" variant="ghost" size="sm" icon="video.slash" onPress={confirmDeleteVideo} />}
          <Button title="Delete report" variant="ghost" size="sm" icon="trash" onPress={confirmDeleteReport} />
        </View>
      </ScrollView>
      <ToastViewport bottomOffset={spacing.lg} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" numeric>
        {value}
      </AppText>
    </View>
  );
}

/** Annotated replay: the skeleton loops through the reps with the measured angle drawn on. */
function Replay({ report, family, withBar }: { report: FormReport; family: 'squat' | 'lunge' | 'deadlift' | 'calf_raise'; withBar: boolean }) {
  return (
    <SchemeOverride scheme="dark">
      <ReplayBody report={report} family={family} withBar={withBar} />
    </SchemeOverride>
  );
}

function ReplayBody({ report, family, withBar }: { report: FormReport; family: 'squat' | 'lunge' | 'deadlift' | 'calf_raise'; withBar: boolean }) {
  const { colors } = useAppTheme();
  const [playing, setPlaying] = useState(true);
  const repSeconds = average(report.reps.map((r) => r.durationSec)) ?? 2.8;
  const loop = useRepLoop({ playing: playing && report.hasReplay, repSeconds });
  const currentRep = loop.reps % report.reps.length;

  return (
    <View style={[styles.replay, { backgroundColor: '#05080B', borderColor: colors.border }]}>
      {report.hasReplay ? (
        <>
          <View style={styles.replayHeader}>
            <AppText variant="label" tone="secondary">
              Annotated replay
            </AppText>
            <Pressable onPress={() => setPlaying((p) => !p)} accessibilityRole="button" accessibilityLabel={playing ? 'Pause replay' : 'Play replay'} hitSlop={8} style={[styles.play, { backgroundColor: colors.input }]}>
              <Icon name={playing ? 'pause.fill' : 'play.fill'} color={colors.text} size={14} />
            </Pressable>
          </View>
          <View style={styles.replayFigure}>
            <SkeletonFigure family={family} depth={loop.depth} showAngle withBar={withBar} width={240} height={260} />
          </View>
          <View style={styles.repMarks}>
            {report.reps.map((r, i) => (
              <View
                key={r.index}
                style={[
                  styles.repMark,
                  { backgroundColor: i === currentRep && playing ? colors.accent : colors.input },
                  r.confidence === 'low' && { borderColor: colors.warningFill, borderWidth: 1.5 },
                ]}
              >
                <AppText variant="caption" weight="700" tone={i === currentRep && playing ? 'onAccent' : 'secondary'}>
                  {String(r.index)}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.noVideo}>
          <Icon name="video.slash.fill" color={colors.textSecondary} size={28} />
          <AppText variant="headline">Video deleted</AppText>
          <AppText variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            The replay is gone, but every angle, rep, and trend from this recording is kept.
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: spacing.sm,
  },
  chips: {
    gap: spacing.sm,
  },
  replay: {
    borderRadius: radius.card + 4,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  replayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  play: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replayFigure: {
    alignItems: 'center',
  },
  repMarks: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  repMark: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVideo: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  cell: {
    flex: 1,
  },
  observation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  cue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  none: {
    padding: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
