import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { PoseConfigureResult, PoseOrientationMode } from '../../../../modules/form-pose/src';
import { AppText, Button, Icon, SegmentedControl, Stepper, Toggle } from '@/components/ui';
import { spacing, radius } from '@/theme/tokens';
import type { JointAngles, Side } from '../pose/landmarks';
import type { PointSpace } from '../pose/overlayTransform';
import type { OverlaySettings } from './SkeletonOverlay';
import { batteryDrain, clockLooksRight, thermalName, totalDrops, type BatteryReading, type CameraSecond, type PerfReading, type RunSummary, type SpikeSample, type UiSecond } from './metrics';
import { describeConfig, formatDuration, RUN_PRESETS, totalSeconds, type RunId, type SpikeConfig } from './protocol';
import type { SpikeConditions } from './report';
import type { ActiveRun, FinishedRun } from './CameraSpike';
import type { FinishedClip } from './useClipRecorder';

export type SpikeView = {
  elapsed: number;
  sample?: SpikeSample;
  cam?: CameraSecond;
  ui?: UiSecond;
  perf?: PerfReading;
  cpuPercent?: number;
  battery?: BatteryReading;
  runSummary?: RunSummary;
};

export type CalibrationReading = { offByPoints: number; orientation: string; mirrored: boolean; bufferWidth: number; bufferHeight: number; error?: string };

const PANEL = 'rgba(0,0,0,0.62)';
const n = (value: number | undefined, digits = 0) => (value === undefined || !Number.isFinite(value) ? '–' : value.toFixed(digits));

/** The live numbers, over the top of the camera view. */
export function SpikeReadout(props: {
  view: SpikeView;
  config: SpikeConfig;
  engine: PoseConfigureResult | null;
  session: Record<string, string | number | boolean | null>;
  calibration: CalibrationReading | null;
  angles: { side: Side; angles: JointAngles } | null;
  lastClip: FinishedClip | null;
  problem: string | null;
  pointSpace: PointSpace;
  run: ActiveRun | null;
  onClose: () => void;
}) {
  const { view, config, engine, session, calibration, angles, lastClip, problem, run } = props;
  const [compact, setCompact] = useState(false);
  const cam = view.cam;
  const ui = view.ui;
  const drops = view.sample?.drops;
  const delivered = cam ? (cam.frames + (drops ? totalDrops(drops) : 0)) / cam.seconds : undefined;
  const clock = clockLooksRight(cam);
  const step = run ? run.preset.steps[run.stepIndex] : undefined;
  const runLine = run ? `${run.preset.id} ${run.preset.title} · ${formatDuration(view.elapsed)} of ${formatDuration(totalSeconds(run.preset))}${step && run.preset.steps.length > 1 ? ` · ${step.label}` : ''}` : 'Manual';

  const engineLine = !config.pose
    ? 'Pose detection off'
    : engine === null
      ? 'Loading the engine…'
      : !engine.ok
        ? `Engine failed: ${engine.error ?? 'unknown error'}`
        : config.engine === 'vision'
          ? `Apple Vision · ready in ${n(engine.loadMs)} ms`
          : `MediaPipe ${config.model} on ${engine.delegateActive.toUpperCase()}${engine.delegateActive !== config.delegate ? ` (asked for ${config.delegate.toUpperCase()})` : ''} · loaded in ${n(engine.loadMs)} ms`;

  const perf = view.perf;
  const level = view.battery?.level;
  const summary = view.runSummary;
  const drain = run ? batteryDrain(run.samples.map((s) => s.battery).filter((b): b is BatteryReading => b !== undefined)) : undefined;

  return (
    <View style={[styles.panel, { backgroundColor: PANEL }]}>
      <View style={styles.header}>
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
          <Icon name="xmark" size={18} color="#FFFFFF" />
        </Pressable>
        <AppText variant="headline" style={styles.headerTitle} numberOfLines={1}>
          {runLine}
        </AppText>
        <Pressable onPress={() => setCompact((c) => !c)} accessibilityRole="button" accessibilityLabel={compact ? 'Show all numbers' : 'Show fewer numbers'} hitSlop={10}>
          <Icon name={compact ? 'chevron.down' : 'chevron.up'} size={16} color="#FFFFFF" />
        </Pressable>
      </View>
      <Line text={engineLine} tone={config.pose && engine && !engine.ok ? 'error' : 'primary'} />
      <Line
        text={`Camera ${n(Number(session.fps ?? NaN))} fps chosen · ${n(delivered, 1)} in · ${n(cam?.fps, 1)} processed · drops ${drops ? totalDrops(drops) : 0}/s${drops && totalDrops(drops) > 0 ? ` (late ${drops.late}, busy ${drops.outOfBuffers})` : ''}`}
      />
      <Line text={`Inference ${n(cam?.inferP50)} ms (p95 ${n(cam?.inferP95)}, max ${n(cam?.inferMax)}) · pose age ${n(cam?.ageP50)} ms (p95 ${n(cam?.ageP95)})`} />
      <Line
        text={`Overlay ${n(ui?.overlayFps, 1)} fps on ${n(ui?.refreshHz)} Hz · UI lag ${n(ui?.lagP50)} ms · capture→screen ≈ ${cam && ui ? n(cam.ageP50 + ui.lagP50) : '–'} ms`}
      />
      <Line
        text={`Heat ${perf ? thermalName(perf.thermalState) : '–'} · pressure ${perf?.pressureLevel ?? '–'} · CPU ${n(view.cpuPercent)}% · memory ${n(perf?.footprintMB)} MB`}
        tone={perf && perf.thermalState >= 2 ? 'warning' : 'primary'}
      />
      {!compact && (
        <>
          <Line
            text={`Battery ${level !== undefined && level >= 0 ? `${Math.round(level * 100)}%` : '–'}${view.battery?.charging ? ' charging (unplug for battery numbers)' : ''}${perf?.lowPowerMode ? ' · Low Power Mode on' : ''}${drain && Number.isFinite(drain.percentPerHour) ? ` · ${n(drain.percentPerHour)}%/h${drain.precise ? '' : ' (rough)'}` : ''}`}
            tone={view.battery?.charging || perf?.lowPowerMode ? 'warning' : 'primary'}
          />
          <Line
            text={
              cam && cam.frames > 0
                ? `Pose in ${n((cam.poses / cam.frames) * 100)}% of frames${angles ? ` · ${angles.side} side: knee ${n(angles.angles.knee)}°, hip ${n(angles.angles.hip)}°, ankle ${n(angles.angles.ankle)}°, shin ${n(angles.angles.shin)}°, torso ${n(angles.angles.torso)}°` : ''}`
                : 'No frames processed yet'
            }
          />
          {calibration && (
            <Line
              text={`${
                calibration.error
                  ? `Overlay check: ${calibration.error}`
                  : `Overlay check: ${calibration.offByPoints < 8 ? 'matches' : 'off by'} ${n(calibration.offByPoints)} pt`
              } · frames ${calibration.bufferWidth}×${calibration.bufferHeight}, labelled ${calibration.orientation}${calibration.mirrored ? ', mirrored' : ''} · points ${props.pointSpace}`}
              tone={!calibration.error && calibration.offByPoints >= 8 ? 'warning' : 'primary'}
            />
          )}
          {clock === false && <Line text="Clock check failed: pose ages aren't between 0 and 1 s, so latency numbers are wrong." tone="error" />}
          {lastClip && (
            <Line
              text={`Last clip ${n(lastClip.seconds)} s, ${n(lastClip.bytes / 1_000_000, 1)} MB (${n(lastClip.bytes / 1_000_000 / (lastClip.seconds / 60))} MB/min, ${lastClip.codec === 'h265' ? 'HEVC' : lastClip.codec === 'h264' ? 'H.264' : 'default codec'})`}
            />
          )}
          {summary && (
            <Line text={`So far: ${n(summary.processedFps.median, 1)} fps median (min ${n(summary.processedFps.min, 1)}) · inference p95 ${n(summary.inferMs.p95)} ms · capture→screen p95 ${n(summary.endToEndMs.p95)} ms`} />
          )}
          {problem && <Line text={problem} tone="error" />}
        </>
      )}
    </View>
  );
}

function Line({ text, tone = 'primary' }: { text: string; tone?: 'primary' | 'warning' | 'error' }) {
  return (
    <AppText variant="caption" tone={tone} numeric maxFontSizeMultiplier={1.4}>
      {text}
    </AppText>
  );
}

/** The overlay settings on the screen; 'auto' picks the points' space by engine. */
export type OverlayChoice = Omit<OverlaySettings, 'viewWidth' | 'viewHeight' | 'space'> & { space: PointSpace | 'auto' };
type Overlay = OverlayChoice;

/** Runs, export and settings, at the bottom of the camera view. */
export function SpikeControls(props: {
  config: SpikeConfig;
  onConfig: (config: SpikeConfig) => void;
  orientationMode: PoseOrientationMode;
  onOrientationMode: (mode: PoseOrientationMode) => void;
  overlay: Overlay;
  onOverlay: (overlay: Overlay) => void;
  conditions: SpikeConditions;
  onConditions: (conditions: SpikeConditions) => void;
  run: ActiveRun | null;
  lastRun: FinishedRun | null;
  onStartRun: (id: RunId) => void;
  onStopRun: () => void;
  onExport: () => void;
}) {
  const { config, onConfig, overlay, onOverlay, conditions, onConditions, run, lastRun } = props;
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const set = <K extends keyof SpikeConfig>(key: K, value: SpikeConfig[K]) => onConfig({ ...config, [key]: value });
  const onOff = [
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ] as const;

  return (
    <View style={[styles.panel, { backgroundColor: PANEL }]}>
      {run ? (
        <Button title={`Stop ${run.preset.id} (saves what it has)`} variant="destructive" size="sm" onPress={props.onStopRun} />
      ) : (
        <View style={styles.runs}>
          {RUN_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              title={`${preset.id} ${preset.title}`}
              size="sm"
              variant="secondary"
              accessibilityHint={preset.summary}
              onPress={() => props.onStartRun(preset.id)}
            />
          ))}
        </View>
      )}
      {lastRun && !run && (
        <View style={styles.lastRunBlock}>
          <View style={styles.lastRun}>
            <AppText variant="caption" numeric style={styles.flex}>
              {`${lastRun.presetTitle} ${lastRun.completed ? 'finished' : 'stopped'}: ${n(lastRun.summary.processedFps.median, 1)} fps, inference p95 ${n(lastRun.summary.inferMs.p95)} ms. Saved as ${lastRun.name}.`}
            </AppText>
            <Button title="Export" size="sm" icon="square.and.arrow.up" onPress={props.onExport} />
          </View>
          {lastRun.steps.length > 1 &&
            lastRun.steps
              .filter((s) => s.summary.processedFps.median > 0)
              .slice(0, 12)
              .map((s) => (
                <AppText key={`${s.step}-${s.startsAt}`} variant="caption" tone="secondary" numeric>
                  {`${s.step}: ${n(s.summary.processedFps.median, 1)} fps, inference ${n(s.summary.inferMs.p50)} ms (p95 ${n(s.summary.inferMs.p95)}), heat ${s.summary.thermal.firstReached.serious !== undefined ? 'serious' : s.summary.thermal.firstReached.fair !== undefined ? 'fair' : 'nominal'}`}
                </AppText>
              ))}
        </View>
      )}
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={styles.disclosure} hitSlop={6}>
        <AppText variant="footnote" weight="600">
          {open ? 'Hide settings' : `Settings: ${describeConfig(config)}`}
        </AppText>
        <Icon name={open ? 'chevron.down' : 'chevron.up'} size={14} color="#FFFFFF" />
      </Pressable>
      {open && (
        <ScrollView style={{ maxHeight: height * 0.42 }} contentContainerStyle={styles.settings}>
          {run && <AppText variant="caption" tone="warning">A run sets these while it plays. Changes apply to the next run.</AppText>}
          <Setting label="Pose detection">
            <SegmentedControl label="Pose detection" options={onOff} value={config.pose ? 'on' : 'off'} onChange={(v) => set('pose', v === 'on')} />
          </Setting>
          <Setting label="Engine">
            <SegmentedControl
              label="Engine"
              options={[
                { value: 'mediapipe', label: 'MediaPipe' },
                { value: 'vision', label: 'Apple Vision' },
              ]}
              value={config.engine}
              onChange={(v) => set('engine', v)}
            />
          </Setting>
          <Setting label="MediaPipe model">
            <SegmentedControl
              label="MediaPipe model"
              options={[
                { value: 'lite', label: 'Lite' },
                { value: 'full', label: 'Full' },
                { value: 'heavy', label: 'Heavy' },
              ]}
              value={config.model}
              onChange={(v) => set('model', v)}
            />
          </Setting>
          <Setting label="MediaPipe runs on">
            <SegmentedControl
              label="MediaPipe runs on"
              options={[
                { value: 'gpu', label: 'GPU' },
                { value: 'cpu', label: 'CPU' },
              ]}
              value={config.delegate}
              onChange={(v) => set('delegate', v)}
            />
          </Setting>
          <Setting label="Camera">
            <SegmentedControl
              label="Camera"
              options={[
                { value: 'back', label: 'Back' },
                { value: 'front', label: 'Front' },
              ]}
              value={config.camera}
              onChange={(v) => set('camera', v)}
            />
          </Setting>
          <Setting label="Frame rate">
            <SegmentedControl
              label="Frame rate"
              options={[
                { value: '30', label: '30 fps' },
                { value: '60', label: '60 fps' },
              ]}
              value={String(config.fps) as '30' | '60'}
              onChange={(v) => set('fps', v === '60' ? 60 : 30)}
            />
          </Setting>
          <Setting label="Record video">
            <SegmentedControl label="Record video" options={onOff} value={config.record ? 'on' : 'off'} onChange={(v) => set('record', v === 'on')} />
          </Setting>
          <Setting label="Video format">
            <SegmentedControl
              label="Video format"
              options={[
                { value: 'h264', label: 'H.264' },
                { value: 'h265', label: 'HEVC' },
              ]}
              value={config.codec}
              onChange={(v) => set('codec', v)}
            />
          </Setting>
          <Setting label="Analysis frames">
            <SegmentedControl
              label="Analysis frames"
              options={[
                { value: 'format', label: 'Camera format' },
                { value: 'preview', label: 'Preview size' },
              ]}
              value={config.analysisSize}
              onChange={(v) => set('analysisSize', v)}
            />
          </Setting>
          <Setting label="Skeleton overlay">
            <SegmentedControl label="Skeleton overlay" options={onOff} value={config.overlay ? 'on' : 'off'} onChange={(v) => set('overlay', v === 'on')} />
          </Setting>
          <AppText variant="caption" tone="secondary">
            If the skeleton sits off the body, try these; they apply at once. The overlay check line says when the turn and fit maths match the camera.
          </AppText>
          <Setting label="Engine sees">
            <SegmentedControl
              label="Engine sees"
              options={[
                { value: 'frame', label: 'Upright' },
                { value: 'frameSwapped', label: 'Other turn' },
                { value: 'raw', label: 'Raw' },
              ]}
              value={props.orientationMode}
              onChange={props.onOrientationMode}
            />
          </Setting>
          <Setting label="Points are">
            <SegmentedControl
              label="Points are"
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'upright', label: 'Upright' },
                { value: 'buffer', label: 'Buffer' },
              ]}
              value={overlay.space}
              onChange={(v) => onOverlay({ ...overlay, space: v })}
            />
          </Setting>
          <Setting label="Quarter turns">
            <SegmentedControl
              label="Quarter turns"
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'swapped', label: 'Swapped' },
              ]}
              value={overlay.swapQuarterTurns ? 'swapped' : 'normal'}
              onChange={(v) => onOverlay({ ...overlay, swapQuarterTurns: v === 'swapped' })}
            />
          </Setting>
          <Setting label="Mirror">
            <SegmentedControl
              label="Mirror"
              options={[
                { value: 'auto', label: 'As the camera says' },
                { value: 'flipped', label: 'Flipped' },
              ]}
              value={overlay.flipMirror ? 'flipped' : 'auto'}
              onChange={(v) => onOverlay({ ...overlay, flipMirror: v === 'flipped' })}
            />
          </Setting>
          <Setting label="Preview">
            <SegmentedControl
              label="Preview"
              options={[
                { value: 'cover', label: 'Fill' },
                { value: 'contain', label: 'Fit' },
              ]}
              value={overlay.fit}
              onChange={(v) => onOverlay({ ...overlay, fit: v })}
            />
          </Setting>
          <AppText variant="caption" tone="secondary">
            Conditions, saved with each run.
          </AppText>
          <View style={styles.row}>
            <AppText variant="footnote" style={styles.flex}>
              Room temperature
            </AppText>
            <Stepper label="Room temperature" value={conditions.roomC ?? 22} min={5} max={40} unit="°C" onChange={(roomC) => onConditions({ ...conditions, roomC })} />
          </View>
          <View style={styles.row}>
            <AppText variant="footnote" style={styles.flex}>
              Phone in a case
            </AppText>
            <Toggle label="Phone in a case" value={conditions.inCase ?? false} onChange={(inCase) => onConditions({ ...conditions, inCase })} />
          </View>
          <View style={styles.row}>
            <AppText variant="footnote" style={styles.flex}>
              Screen brightness
            </AppText>
            <Stepper
              label="Screen brightness"
              value={conditions.brightnessPercent ?? 50}
              step={10}
              min={0}
              max={100}
              unit="%"
              onChange={(brightnessPercent) => onConditions({ ...conditions, brightnessPercent })}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.setting}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.md, padding: spacing.sm, gap: spacing.xxs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxs },
  headerTitle: { flex: 1 },
  runs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  lastRunBlock: { gap: spacing.xxs, marginTop: spacing.xs },
  lastRun: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disclosure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.sm },
  settings: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  setting: { gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
