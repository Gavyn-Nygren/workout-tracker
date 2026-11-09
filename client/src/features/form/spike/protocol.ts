/**
 * The camera spike's settings and timed runs (roadmap G4.2). Each run is a list of steps the
 * screen plays through by itself, so the owner only starts it and keeps the phone still.
 * Pure, so tests check the timings.
 */
export type SpikeEngine = 'mediapipe' | 'vision';
export type SpikeModel = 'lite' | 'full' | 'heavy';
export type SpikeDelegate = 'cpu' | 'gpu';

export type SpikeConfig = {
  /** false: the camera and recording run, the pose plugin doesn't (the battery baseline). */
  pose: boolean;
  engine: SpikeEngine;
  model: SpikeModel;
  delegate: SpikeDelegate;
  camera: 'back' | 'front';
  fps: 30 | 60;
  /** Record video while analysing, as a real set would. */
  record: boolean;
  codec: 'h264' | 'h265';
  overlay: boolean;
  /**
   * The analysis frames' size. 'format' is the camera format's own size: VisionCamera picks one
   * format for every output, so while recording 1080p the frames are 1920 × 1080. 'preview' is the
   * smaller preview size VisionCamera can deliver instead.
   */
  analysisSize: 'format' | 'preview';
};

export const DEFAULT_CONFIG: SpikeConfig = {
  pose: true,
  engine: 'mediapipe',
  model: 'lite',
  delegate: 'gpu',
  camera: 'back',
  fps: 30,
  record: true,
  codec: 'h264',
  overlay: true,
  analysisSize: 'format',
};

export type RunStep = {
  label: string;
  seconds: number;
  /** false: the camera is off (a rest between sets). */
  cameraOn: boolean;
  /** Settings for this step, on top of the ones the run started with. */
  config: Partial<SpikeConfig>;
};

export type RunId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export type RunPreset = { id: RunId; title: string; summary: string; steps: readonly RunStep[] };

/** Video is recorded in clips of this length, deleted after measuring, so a long run doesn't fill the phone. */
export const RECORDING_CLIP_SECONDS = 60;

const minutes = (n: number) => n * 60;

function sessionSteps(): RunStep[] {
  const steps: RunStep[] = [];
  for (let set = 1; set <= 10; set++) {
    steps.push({ label: `Set ${set} of 10`, seconds: 60, cameraOn: true, config: { record: true } });
    if (set < 10) steps.push({ label: `Rest after set ${set}`, seconds: 120, cameraOn: false, config: {} });
  }
  return steps;
}

export const RUN_PRESETS: readonly RunPreset[] = [
  {
    id: 'R0',
    title: 'Smoke test',
    summary: '1 minute with the current settings. Checks the numbers make sense.',
    steps: [{ label: 'Smoke test', seconds: 60, cameraOn: true, config: {} }],
  },
  {
    id: 'R1',
    title: 'Engine sweep',
    summary: '2 minutes each: MediaPipe lite, full and heavy on the CPU and GPU, then Apple Vision. Records throughout.',
    steps: [
      { label: 'MediaPipe lite, CPU', seconds: 120, cameraOn: true, config: { pose: true, engine: 'mediapipe', model: 'lite', delegate: 'cpu', record: true } },
      { label: 'MediaPipe lite, GPU', seconds: 120, cameraOn: true, config: { pose: true, engine: 'mediapipe', model: 'lite', delegate: 'gpu', record: true } },
      { label: 'MediaPipe full, CPU', seconds: 120, cameraOn: true, config: { pose: true, engine: 'mediapipe', model: 'full', delegate: 'cpu', record: true } },
      { label: 'MediaPipe full, GPU', seconds: 120, cameraOn: true, config: { pose: true, engine: 'mediapipe', model: 'full', delegate: 'gpu', record: true } },
      { label: 'MediaPipe heavy, GPU', seconds: 120, cameraOn: true, config: { pose: true, engine: 'mediapipe', model: 'heavy', delegate: 'gpu', record: true } },
      { label: 'Apple Vision', seconds: 120, cameraOn: true, config: { pose: true, engine: 'vision', record: true } },
    ],
  },
  {
    id: 'R2',
    title: 'Soak',
    summary: '30 minutes nonstop with the current settings, recording. Shows heat and battery over a long run.',
    steps: [{ label: 'Soak', seconds: minutes(30), cameraOn: true, config: { record: true } }],
  },
  {
    id: 'R3',
    title: 'Real session',
    summary: '10 one-minute sets with 2-minute rests (camera off), about 28 minutes. The current settings, recording each set.',
    steps: sessionSteps(),
  },
  {
    id: 'R4',
    title: 'Battery baseline',
    summary: '30 minutes of camera and recording with pose detection off, to compare with the soak.',
    steps: [{ label: 'Baseline', seconds: minutes(30), cameraOn: true, config: { pose: false, overlay: false, record: true } }],
  },
];

export function presetById(id: RunId): RunPreset {
  return RUN_PRESETS.find((p) => p.id === id) ?? RUN_PRESETS[0];
}

export function totalSeconds(preset: Pick<RunPreset, 'steps'>): number {
  return preset.steps.reduce((sum, step) => sum + step.seconds, 0);
}

export type StepPosition = { index: number; step: RunStep; startsAt: number; endsAt: number };

/** The step running `elapsed` seconds into the run, or undefined once it's over. */
export function stepAt(preset: Pick<RunPreset, 'steps'>, elapsed: number): StepPosition | undefined {
  if (!(elapsed >= 0)) return undefined;
  let startsAt = 0;
  for (let index = 0; index < preset.steps.length; index++) {
    const step = preset.steps[index];
    const endsAt = startsAt + step.seconds;
    if (elapsed < endsAt) return { index, step, startsAt, endsAt };
    startsAt = endsAt;
  }
  return undefined;
}

/** The settings a step runs with. */
export function configForStep(base: SpikeConfig, step: RunStep): SpikeConfig {
  return { ...base, ...step.config };
}

/** "28:00", "1:00:00". */
export function formatDuration(totalSecondsValue: number): string {
  const s = Math.max(0, Math.floor(totalSecondsValue));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** A short label for a configuration, for the screen and the export. */
export function describeConfig(config: SpikeConfig): string {
  const pose = !config.pose ? 'pose off' : config.engine === 'vision' ? 'Apple Vision' : `MediaPipe ${config.model} ${config.delegate.toUpperCase()}`;
  const camera = `${config.camera} ${config.fps} fps`;
  const record = config.record ? `recording ${config.codec === 'h265' ? 'HEVC' : 'H.264'}` : 'not recording';
  return [pose, camera, record, config.analysisSize === 'preview' ? 'preview-size frames' : 'format-size frames', config.overlay ? 'overlay' : 'no overlay'].join(', ');
}
