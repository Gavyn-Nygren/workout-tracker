import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  CommonResolutions,
  useCameraPermission,
  useFrameOutput,
  useVideoOutput,
  type CameraOrientation,
  type CameraRef,
  type CameraSessionConfig,
  type Frame,
  type FrameDroppedReason,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

import { createFormPose, type PoseConfigureResult, type PoseOrientationMode } from '../../../../modules/form-pose/src';
import { AppText, Button } from '@/components/ui';
import { shareText } from '@/features/settings/shareFile';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { isFormAnalysisSupported } from '../capability';
import { jointAngles, sidePose, type JointAngles, type Side } from '../pose/landmarks';
import { landmarksToUpright, toView, uprightSize, type PointSpace } from '../pose/overlayTransform';
import {
  addDrop,
  closeCameraWindow,
  closeUiWindow,
  cpuPercent,
  emptyDrops,
  newCameraWindow,
  newUiWindow,
  recordFrame,
  recordUiTick,
  summarizeRun,
  type CameraSecond,
  type CameraWindow,
  type DropCounts,
  type PerfReading,
  type RunSummary,
  type SpikeSample,
  type StepSummary,
  type UiSecond,
  type UiWindow,
} from './metrics';
import { configForStep, DEFAULT_CONFIG, describeConfig, presetById, stepAt, totalSeconds, type RunId, type RunPreset, type SpikeConfig } from './protocol';
import { buildReport, reportFileName, type SpikeConditions, type SpikeEvent, type SpikeRecording, type SpikeScreenSettings } from './report';
import { SkeletonOverlay, type LivePose, type OverlaySettings } from './SkeletonOverlay';
import { SpikeControls, SpikeReadout, type CalibrationReading, type OverlayChoice, type SpikeView } from './SpikePanels';
import { useClipRecorder, type FinishedClip } from './useClipRecorder';

/** The newest frame's geometry, for checking the overlay maths against VisionCamera's preview. */
type CalibrationSample = { bufferWidth: number; bufferHeight: number; orientation: CameraOrientation; mirrored: boolean };

/** Three buffer points, as fractions, to place both ways. */
const CHECK_POINTS = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
] as const;

export type ActiveRun = {
  preset: RunPreset;
  base: SpikeConfig;
  startedAt: number;
  stepIndex: number;
  samples: SpikeSample[];
  events: SpikeEvent[];
  recordings: SpikeRecording[];
};

export type FinishedRun = { name: string; json: string; summary: RunSummary; steps: StepSummary[]; completed: boolean; presetTitle: string };

const MIN_CONFIDENCE = 0.5;

/**
 * Developer → Camera spike (roadmap G4.2). VisionCamera with the form-pose plugin on the camera
 * thread, a Skia skeleton on the UI thread, and once a second the numbers G4.2 has to measure:
 * frame rate, latency, heat, battery, CPU, memory and storage. Timed runs (protocol.ts) play by
 * themselves and save a JSON report, which Export shares.
 */
export function CameraSpike() {
  return (
    <SchemeOverride scheme="dark">
      <Spike />
    </SchemeOverride>
  );
}

function Spike() {
  useKeepAwake();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const permission = useCameraPermission();
  const formPose = useMemo(() => createFormPose(), []);
  const cameraRef = useRef<CameraRef>(null);
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  // Settings: the manual ones, or a run's step on top of the ones it started with.
  const [config, setConfig] = useState<SpikeConfig>(DEFAULT_CONFIG);
  const [orientationMode, setOrientationMode] = useState<PoseOrientationMode>('frame');
  const [overlay, setOverlay] = useState<OverlayChoice>({ space: 'auto', swapQuarterTurns: false, flipMirror: false, fit: 'cover' });
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [conditions, setConditions] = useState<SpikeConditions>({ roomC: 22, inCase: true });
  const [run, setRun] = useState<ActiveRun | null>(null);
  const runRef = useRef<ActiveRun | null>(null);
  const [lastRun, setLastRun] = useState<FinishedRun | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [cameraRunning, setCameraRunning] = useState(false);

  const step = run ? run.preset.steps[run.stepIndex] : undefined;
  const effective = run && step ? configForStep(run.base, step) : config;
  const cameraOn = (step ? step.cameraOn : true) && appActive && permission.hasPermission;
  // MediaPipe gives points in the raw buffer's axes, Apple Vision in the upright image's; 'raw'
  // frames give buffer axes either way. The screen can override the guess.
  const pointSpace: PointSpace = overlay.space !== 'auto' ? overlay.space : effective.engine === 'mediapipe' || orientationMode === 'raw' ? 'buffer' : 'upright';

  // Live readings.
  const [view, setView] = useState<SpikeView>({ elapsed: 0 });
  // The engine's load result, for the settings it was loaded with; other settings read as loading.
  const engineKey = `${effective.engine}/${effective.model}/${effective.delegate}/${orientationMode}`;
  const [engineState, setEngineState] = useState<{ key: string; result: PoseConfigureResult } | null>(null);
  const engine = engineState && engineState.key === engineKey ? engineState.result : null;
  const [session, setSession] = useState<Record<string, string | number | boolean | null>>({});
  const [calibration, setCalibration] = useState<CalibrationReading | null>(null);
  const [angles, setAngles] = useState<{ side: Side; angles: JointAngles } | null>(null);
  const [lastClip, setLastClip] = useState<FinishedClip | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Errors from the camera thread, cleared by the next clean second (others stay until a new run).
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);

  // Shared with the camera and UI threads.
  const pose = useSharedValue<LivePose | null>(null);
  const uiSecond = useSharedValue<UiSecond | null>(null);
  const overlaySettings = useSharedValue<OverlaySettings>({ ...overlay, space: pointSpace, viewWidth: 0, viewHeight: 0 });
  useEffect(() => {
    overlaySettings.set({ ...overlay, space: pointSpace, viewWidth: viewSize.width, viewHeight: viewSize.height });
  }, [overlay, pointSpace, viewSize, overlaySettings]);

  // What the 1-second sampler reads (refs, so the interval always sees the latest).
  const pendingCam = useRef<CameraSecond | undefined>(undefined);
  const lastUiAt = useRef(0);
  const drops = useRef<DropCounts>(emptyDrops());
  const previousPerf = useRef<PerfReading | undefined>(undefined);
  const battery = useRef<{ level: number; charging: boolean } | undefined>(undefined);
  const lastThermal = useRef<number | undefined>(undefined);
  // Host time the engine finished (re)loading: camera seconds that began earlier are settling.
  const configuredAt = useRef(0);
  const latest = useRef({ effective, overlay, pointSpace, viewSize, orientationMode });
  useEffect(() => {
    latest.current = { effective, overlay, pointSpace, viewSize, orientationMode };
  });

  const elapsedNow = useCallback(() => (Date.now() - (runRef.current?.startedAt ?? mountedAt.current)) / 1000, []);

  const logEvent = useCallback(
    (kind: SpikeEvent['kind'], detail: string) => {
      runRef.current?.events.push({ t: Math.round(elapsedNow() * 10) / 10, kind, detail });
    },
    [elapsedNow],
  );

  // MARK: Camera thread → JS

  const onCameraSecond = useCallback(
    (second: CameraSecond, calib: CalibrationSample | null) => {
      pendingCam.current = second;
      if (second.errors > 0 && second.lastError) setCameraProblem(second.lastError);
      else if (second.frames > 0) setCameraProblem(null);
      if (!calib || !cameraRef.current) return;
      const { overlay: o, viewSize: size, effective: current } = latest.current;
      if (current.camera !== 'back') {
        // AVFoundation's device points are the back camera's raw buffer; the front camera's are unverified.
        setCalibration({ offByPoints: NaN, orientation: calib.orientation, mirrored: calib.mirrored, bufferWidth: calib.bufferWidth, bufferHeight: calib.bufferHeight, error: 'back camera only' });
        return;
      }
      try {
        let worst = 0;
        for (const [u, v] of CHECK_POINTS) {
          // For the back camera's unrotated buffer, its own fractions are AVFoundation's device points.
          const theirs = cameraRef.current.convertCameraPointToViewPoint({ x: u, y: v });
          const ours = toView(u, v, {
            bufferWidth: calib.bufferWidth,
            bufferHeight: calib.bufferHeight,
            orientation: calib.orientation,
            mirror: calib.mirrored !== o.flipMirror,
            space: 'buffer',
            swapQuarterTurns: o.swapQuarterTurns,
            fit: o.fit,
            viewWidth: size.width,
            viewHeight: size.height,
          });
          worst = Math.max(worst, Math.hypot(theirs.x - ours.x, theirs.y - ours.y));
        }
        setCalibration({ offByPoints: worst, orientation: calib.orientation, mirrored: calib.mirrored, bufferWidth: calib.bufferWidth, bufferHeight: calib.bufferHeight });
      } catch (e) {
        setCalibration({ offByPoints: NaN, orientation: calib.orientation, mirrored: calib.mirrored, bufferWidth: calib.bufferWidth, bufferHeight: calib.bufferHeight, error: String(e) });
      }
    },
    [],
  );

  const onFrameError = useCallback((message: string) => setCameraProblem(message), []);

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        const result = formPose.detect(frame);
        const g = globalThis as unknown as { __formSpikeCam?: CameraWindow };
        let w = g.__formSpikeCam;
        // A new window on the first frame, and after a pause (camera off, or the screen reopened).
        if (w === undefined || result.resultMs < w.startMs || result.resultMs - w.startMs > 5000) {
          w = newCameraWindow(result.resultMs);
          g.__formSpikeCam = w;
        }
        recordFrame(w, result);
        if (result.ok) {
          pose.set({
            seq: result.seq,
            found: result.poseFound,
            landmarks: result.landmarks,
            bufferWidth: result.bufferWidth,
            bufferHeight: result.bufferHeight,
            orientation: frame.orientation,
            mirrored: frame.isMirrored,
            writtenAt: Date.now(),
          });
        }
        if (result.resultMs - w.startMs >= 1000) {
          const second = closeCameraWindow(w, result.resultMs);
          g.__formSpikeCam = newCameraWindow(result.resultMs, w.prevFrameMs);
          const calib: CalibrationSample | null =
            result.bufferWidth > 0 ? { bufferWidth: result.bufferWidth, bufferHeight: result.bufferHeight, orientation: frame.orientation, mirrored: frame.isMirrored } : null;
          scheduleOnRN(onCameraSecond, second, calib);
        }
      } catch (e) {
        scheduleOnRN(onFrameError, String(e));
      } finally {
        frame.dispose();
      }
    },
    [formPose, pose, onCameraSecond, onFrameError],
  );

  const onFrameDropped = useCallback((reason: FrameDroppedReason) => addDrop(drops.current, reason), []);

  // MARK: UI thread: refresh rate, overlay updates and the lag from camera to screen

  useFrameCallback(() => {
    'worklet';
    const now = Date.now();
    const g = globalThis as unknown as { __formSpikeUi?: UiWindow };
    let w = g.__formSpikeUi;
    if (w === undefined || now < w.startMs || now - w.startMs > 5000) {
      w = newUiWindow(now);
      g.__formSpikeUi = w;
    }
    const p = pose.get();
    recordUiTick(w, now, p ? p.seq : -1, p ? p.writtenAt : NaN);
    if (now - w.startMs >= 1000) {
      uiSecond.set(closeUiWindow(w, now));
      g.__formSpikeUi = newUiWindow(now, w.lastSeq);
    }
  });

  // MARK: Outputs and the plugin

  const frameOutput = useFrameOutput({
    // MediaPipe needs BGRA ('rgb'); Apple Vision reads YUV directly, which is cheaper.
    pixelFormat: effective.engine === 'mediapipe' ? 'rgb' : 'yuv',
    targetResolution: CommonResolutions.HD_16_9,
    enablePreviewSizedOutputBuffers: effective.analysisSize === 'preview',
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped,
  });
  const videoOutput = useVideoOutput({ targetResolution: CommonResolutions.FHD_16_9, enableAudio: false, fileType: 'mp4' });
  const outputs = useMemo(() => [...(effective.pose ? [frameOutput] : []), ...(effective.record ? [videoOutput] : [])], [effective.pose, effective.record, frameOutput, videoOutput]);
  const constraints = useMemo(() => [{ fps: effective.fps }], [effective.fps]);

  // Loading a model blocks the JS thread briefly, so it waits a tick: the readout shows
  // "Loading the engine…" first.
  useEffect(() => {
    if (!effective.pose) return;
    const timer = setTimeout(() => {
      const result = formPose.configure({ engine: effective.engine, model: effective.model, delegate: effective.delegate, orientationMode, minConfidence: MIN_CONFIDENCE });
      configuredAt.current = formPose.hostTimeMs;
      setEngineState({ key: engineKey, result });
      if (!result.ok) setProblem(result.error ?? 'The engine failed to load');
      logEvent('engine', `${effective.engine} ${effective.model} ${effective.delegate} → ${result.ok ? `${result.delegateActive}, ${Math.round(result.loadMs)} ms` : result.error}`);
    }, 0);
    return () => clearTimeout(timer);
  }, [formPose, effective.pose, effective.engine, effective.model, effective.delegate, orientationMode, engineKey, logEvent]);

  const onClip = useCallback(
    (clip: FinishedClip) => {
      setLastClip(clip);
      runRef.current?.recordings.push({ t: Math.round(elapsedNow()), seconds: clip.seconds, bytes: clip.bytes, codec: clip.codec });
    },
    [elapsedNow],
  );
  const onClipError = useCallback(
    (message: string) => {
      setProblem(message);
      logEvent('error', `Recording: ${message}`);
    },
    [logEvent],
  );
  useClipRecorder(videoOutput, effective.record && cameraOn && cameraRunning, effective.codec, onClip, onClipError);

  // MARK: Battery and app state

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
        if (!cancelled) battery.current = { level, charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL };
      } catch {
        // Battery readings are optional.
      }
    };
    void read();
    const timer = setInterval(() => void read(), 10_000);
    const subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      battery.current = { level: batteryLevel, charging: battery.current?.charging ?? false };
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state !== 'active') logEvent('interruption', `App ${state}`);
    });
    return () => subscription.remove();
  }, [logEvent]);

  // MARK: Runs and reports

  const screenSettings = useCallback(
    (): SpikeScreenSettings => ({
      orientationMode: latest.current.orientationMode,
      points: latest.current.overlay.space === 'auto' ? `auto (${latest.current.pointSpace})` : latest.current.pointSpace,
      swapQuarterTurns: latest.current.overlay.swapQuarterTurns,
      flipMirror: latest.current.overlay.flipMirror,
      fit: latest.current.overlay.fit,
    }),
    [],
  );

  const saveReport = useCallback(
    (active: ActiveRun, completed: boolean, fileName?: string): FinishedRun => {
      const createdAt = new Date(active.startedAt);
      const report = buildReport({
        createdAt,
        presetId: active.preset.id,
        presetTitle: active.preset.title,
        appVersion: Constants.expoConfig?.version ?? null,
        device: { modelId: Device.modelId ?? null, modelName: Device.modelName ?? null, osVersion: Device.osVersion ?? null, formSupported: isFormAnalysisSupported() },
        conditions,
        config: active.base,
        screen: screenSettings(),
        session,
        events: active.events,
        recordings: active.recordings,
        samples: active.samples,
        completed,
      });
      const name = fileName ?? reportFileName(createdAt, active.preset.id);
      const json = JSON.stringify(report, null, 1);
      try {
        const file = new File(Paths.document, name);
        try {
          file.delete();
        } catch {
          // Nothing to replace.
        }
        file.write(json);
      } catch (e) {
        setProblem(`Couldn't save the report: ${String(e)}`);
      }
      return { name, json, summary: report.summary, steps: report.steps, completed, presetTitle: active.preset.title };
    },
    [conditions, session, screenSettings],
  );

  const finishRun = useCallback(
    (completed: boolean) => {
      const active = runRef.current;
      if (!active) return;
      active.events.push({ t: Math.round(elapsedNow()), kind: 'end', detail: completed ? 'Finished' : 'Stopped' });
      const finished = saveReport(active, completed);
      runRef.current = null;
      setRun(null);
      setLastRun(finished);
    },
    [elapsedNow, saveReport],
  );

  const startRun = useCallback(
    (id: RunId) => {
      const preset = presetById(id);
      const active: ActiveRun = {
        preset,
        base: config,
        startedAt: Date.now(),
        stepIndex: 0,
        samples: [],
        events: [{ t: 0, kind: 'start', detail: `${preset.title} (${Math.round(totalSeconds(preset) / 60)} min): ${describeConfig(config)}` }],
        recordings: [],
      };
      active.events.push({ t: 0, kind: 'step', detail: preset.steps[0].label });
      runRef.current = active;
      setRun(active);
      setLastRun(null);
      setProblem(null);
      setCameraProblem(null);
    },
    [config],
  );

  // A run that's still going when the screen closes is saved as stopped.
  const saveOnClose = useRef(saveReport);
  useEffect(() => {
    saveOnClose.current = saveReport;
  }, [saveReport]);
  useEffect(
    () => () => {
      const active = runRef.current;
      if (active) saveOnClose.current(active, false);
    },
    [],
  );

  // MARK: The 1-second sampler

  useEffect(() => {
    const timer = setInterval(() => {
      const active = runRef.current;
      const elapsed = elapsedNow();
      // The second that just ended ran under the step that was current, so it keeps that label.
      const sampleStep = active ? active.preset.steps[active.stepIndex].label : 'Manual';

      // Advance the run.
      if (active) {
        const position = stepAt(active.preset, elapsed);
        if (!position) {
          finishRun(true);
          return;
        }
        if (position.index !== active.stepIndex) {
          active.stepIndex = position.index;
          active.events.push({ t: Math.round(elapsed), kind: 'step', detail: position.step.label });
          setRun({ ...active });
        }
      }

      let perf: PerfReading | undefined;
      try {
        perf = formPose.perfSnapshot(latest.current.effective.camera);
      } catch {
        perf = undefined;
      }
      const cpu = perf && previousPerf.current ? cpuPercent(previousPerf.current, perf) : undefined;
      if (perf) previousPerf.current = perf;
      if (perf && perf.thermalState !== lastThermal.current) {
        if (lastThermal.current !== undefined) logEvent('thermal', `Thermal state ${perf.thermalState}`);
        lastThermal.current = perf.thermalState;
      }

      const cam = pendingCam.current;
      pendingCam.current = undefined;
      let ui: UiSecond | undefined;
      const u = uiSecond.get();
      if (u && u.atMs !== lastUiAt.current) {
        ui = u;
        lastUiAt.current = u.atMs;
      }
      const sampleDrops = drops.current;
      drops.current = emptyDrops();
      const t = Math.round(elapsed * 10) / 10;
      const sample: SpikeSample = {
        t,
        step: sampleStep,
        cam,
        settling: cam ? cam.atMs - cam.seconds * 1000 < configuredAt.current : undefined,
        ui,
        drops: sampleDrops,
        perf,
        cpuPercent: cpu,
        battery: battery.current ? { t, level: battery.current.level, charging: battery.current.charging } : undefined,
      };
      if (active) {
        active.samples.push(sample);
        if (Math.round(elapsed) % 30 === 0) saveReport(active, false, 'g42-autosave.json');
      }
      setView((previous) => ({
        elapsed,
        sample,
        cam: cam ?? previous.cam,
        ui: ui ?? previous.ui,
        perf: perf ?? previous.perf,
        cpuPercent: cpu ?? previous.cpuPercent,
        battery: sample.battery ?? previous.battery,
        runSummary: active && Math.round(elapsed) % 5 === 0 ? summarizeRun(active.samples) : previous.runSummary,
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [elapsedNow, finishRun, formPose, logEvent, saveReport, uiSecond]);

  // Live angles, four times a second, from the newest pose.
  useEffect(() => {
    const timer = setInterval(() => {
      const p = pose.get();
      if (!p || !p.found) {
        setAngles(null);
        return;
      }
      const { pointSpace: space, overlay: o } = latest.current;
      const upright = landmarksToUpright(p.landmarks, p.orientation, space, o.swapQuarterTurns);
      const size = uprightSize(p.bufferWidth, p.bufferHeight, p.orientation);
      const side = sidePose(upright, size.width, size.height, MIN_CONFIDENCE);
      setAngles({ side: side.side, angles: jointAngles(side) });
    }, 250);
    return () => clearInterval(timer);
  }, [pose]);

  const onSessionConfigSelected = useCallback((selected: CameraSessionConfig) => {
    setSession({
      fps: selected.selectedFPS ?? null,
      nativePixelFormat: selected.nativePixelFormat,
      binned: selected.isBinned,
      videoStabilization: selected.selectedVideoStabilizationMode ?? null,
      autoFocusSystem: selected.autoFocusSystem,
    });
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => setViewSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }), []);

  const exportRun = useCallback(async () => {
    if (!lastRun) return;
    try {
      await shareText(lastRun.name, lastRun.json, 'application/json');
    } catch (e) {
      setProblem(`Export failed: ${String(e)}`);
    }
  }, [lastRun]);

  if (!permission.hasPermission) {
    return (
      <View style={[styles.permission, { backgroundColor: colors.background, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.permissionBody}>
          <AppText variant="title2">Camera access</AppText>
          <AppText tone="secondary">
            {permission.canRequestPermission ? 'The spike needs the camera. Nothing is recorded until a run or Record is on, and videos stay on this phone.' : 'Camera access is off for Tracker Dev. Turn it on in Settings to run the spike.'}
          </AppText>
        </View>
        <View style={styles.permissionButtons}>
          {permission.canRequestPermission ? (
            <Button title="Allow camera" onPress={() => void permission.requestPermission()} />
          ) : (
            <Button title="Open Settings" onPress={() => void Linking.openSettings()} />
          )}
          <Button title="Close" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} onLayout={onLayout}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        isActive={cameraOn}
        device={effective.camera}
        outputs={outputs}
        constraints={constraints}
        resizeMode={overlay.fit}
        orientationSource="device"
        onSessionConfigSelected={onSessionConfigSelected}
        onStarted={() => setCameraRunning(true)}
        onStopped={() => setCameraRunning(false)}
        onError={(e) => {
          setProblem(e.message);
          logEvent('error', `Camera: ${e.message}`);
        }}
        onInterruptionStarted={(reason) => logEvent('interruption', `Camera interrupted: ${reason}`)}
        onInterruptionEnded={() => logEvent('interruption', 'Camera interruption ended')}
      />
      {effective.pose && effective.overlay && <SkeletonOverlay pose={pose} settings={overlaySettings} />}
      {!cameraOn && (
        <View style={[StyleSheet.absoluteFill, styles.cameraOff]} pointerEvents="none">
          <AppText variant="title3">{step && !step.cameraOn ? step.label : 'Camera off'}</AppText>
        </View>
      )}
      <View style={[styles.top, { paddingTop: insets.top + spacing.xs }]} pointerEvents="box-none">
        <SpikeReadout
          view={view}
          config={effective}
          engine={engine}
          session={session}
          calibration={calibration}
          angles={angles}
          lastClip={lastClip}
          problem={cameraProblem ?? problem}
          pointSpace={pointSpace}
          run={run}
          onClose={() => router.back()}
        />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xs }]} pointerEvents="box-none">
        <SpikeControls
          config={config}
          onConfig={setConfig}
          orientationMode={orientationMode}
          onOrientationMode={setOrientationMode}
          overlay={overlay}
          onOverlay={setOverlay}
          conditions={conditions}
          onConditions={setConditions}
          run={run}
          lastRun={lastRun}
          onStartRun={startRun}
          onStopRun={() => finishRun(false)}
          onExport={() => void exportRun()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.sm },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.sm },
  cameraOff: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
  permission: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'space-between' },
  permissionBody: { gap: spacing.md },
  permissionButtons: { gap: spacing.sm },
});
