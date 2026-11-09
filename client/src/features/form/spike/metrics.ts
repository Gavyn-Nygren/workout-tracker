/**
 * The camera spike's numbers (roadmap G4.2): per-second windows built on the camera thread and the
 * UI thread, and run summaries for frame rate, latency, heat, battery and storage. Pure, so tests
 * cover it; the window functions are worklets, since the frame processor calls them.
 *
 * Times are milliseconds. Camera-thread times use the host clock (the plugin's frameMs and
 * friends); the UI-thread lag compares Date.now() across threads, which is good to a millisecond.
 */

// MARK: - Percentiles

/** The p-th percentile (0-100) of the values, by nearest rank. NaN when there are none. */
export function percentile(values: readonly number[], p: number): number {
  'worklet';
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return NaN;
  const sorted = finite.slice().sort((a, b) => a - b);
  const rank = Math.ceil((Math.max(0, Math.min(100, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export function maxOf(values: readonly number[]): number {
  'worklet';
  let max = NaN;
  for (const v of values) if (Number.isFinite(v) && !(v <= max)) max = v;
  return max;
}

export function median(values: readonly number[]): number {
  'worklet';
  return percentile(values, 50);
}

// MARK: - Camera thread

/** What the frame processor needs from each plugin result (a subset of PoseResult). */
export type FrameReading = {
  ok: boolean;
  error?: string;
  poseFound: boolean;
  frameMs: number;
  entryMs: number;
  resultMs: number;
  inferMs: number;
  /** The analysis frame's size as delivered (the camera's format size, unless preview-sized). */
  bufferWidth?: number;
  bufferHeight?: number;
};

export type CameraWindow = {
  startMs: number;
  frames: number;
  poses: number;
  errors: number;
  lastError: string;
  infer: number[];
  /** Capture → result: how old the pose is when it's ready. */
  age: number[];
  /** Capture → detect() starting: the camera pipeline's delay before our code runs. */
  queue: number[];
  /** Time between consecutive processed frames' captures. */
  step: number[];
  prevFrameMs: number;
  bufferWidth: number;
  bufferHeight: number;
};

/** One second of the camera thread's numbers. */
export type CameraSecond = {
  /** Host time the window closed. */
  atMs: number;
  seconds: number;
  frames: number;
  /** Frames the plugin processed, per second. */
  fps: number;
  poses: number;
  errors: number;
  lastError?: string;
  inferP50: number;
  inferP95: number;
  inferMax: number;
  ageP50: number;
  ageP95: number;
  queueP50: number;
  stepP50: number;
  stepMax: number;
  /** The analysis frames' size in this second (0 × 0 if none was processed). */
  bufferWidth: number;
  bufferHeight: number;
};

export function newCameraWindow(startMs: number, prevFrameMs = NaN): CameraWindow {
  'worklet';
  return { startMs, frames: 0, poses: 0, errors: 0, lastError: '', infer: [], age: [], queue: [], step: [], prevFrameMs, bufferWidth: 0, bufferHeight: 0 };
}

/** Adds one result to the window (mutates it: it lives on the camera thread only). */
export function recordFrame(window: CameraWindow, reading: FrameReading): void {
  'worklet';
  window.frames += 1;
  if (reading.bufferWidth && reading.bufferHeight) {
    window.bufferWidth = reading.bufferWidth;
    window.bufferHeight = reading.bufferHeight;
  }
  if (!reading.ok) {
    window.errors += 1;
    window.lastError = reading.error ?? 'Unknown error';
    return;
  }
  if (reading.poseFound) window.poses += 1;
  window.infer.push(reading.inferMs);
  window.age.push(reading.resultMs - reading.frameMs);
  window.queue.push(reading.entryMs - reading.frameMs);
  if (Number.isFinite(window.prevFrameMs)) window.step.push(reading.frameMs - window.prevFrameMs);
  window.prevFrameMs = reading.frameMs;
}

export function closeCameraWindow(window: CameraWindow, endMs: number): CameraSecond {
  'worklet';
  const seconds = Math.max(0.001, (endMs - window.startMs) / 1000);
  return {
    atMs: endMs,
    seconds,
    frames: window.frames,
    fps: window.frames / seconds,
    poses: window.poses,
    errors: window.errors,
    lastError: window.lastError === '' ? undefined : window.lastError,
    inferP50: percentile(window.infer, 50),
    inferP95: percentile(window.infer, 95),
    inferMax: maxOf(window.infer),
    ageP50: percentile(window.age, 50),
    ageP95: percentile(window.age, 95),
    queueP50: percentile(window.queue, 50),
    stepP50: percentile(window.step, 50),
    stepMax: maxOf(window.step),
    bufferWidth: window.bufferWidth,
    bufferHeight: window.bufferHeight,
  };
}

// MARK: - UI thread

export type UiWindow = {
  startMs: number;
  /** UI frames drawn (the display's refresh). */
  ticks: number;
  /** UI frames that showed a new pose. */
  updates: number;
  lastSeq: number;
  /** Pose written on the camera thread → first UI frame that shows it (Date.now() on both). */
  lag: number[];
};

export type UiSecond = { atMs: number; refreshHz: number; overlayFps: number; lagP50: number; lagP95: number };

export function newUiWindow(startMs: number, lastSeq = -1): UiWindow {
  'worklet';
  return { startMs, ticks: 0, updates: 0, lastSeq, lag: [] };
}

/** Called once per UI frame with the newest pose's sequence number and when it was written. */
export function recordUiTick(window: UiWindow, nowMs: number, seq: number, writtenAtMs: number): void {
  'worklet';
  window.ticks += 1;
  if (seq !== window.lastSeq && seq >= 0) {
    window.lastSeq = seq;
    window.updates += 1;
    if (Number.isFinite(writtenAtMs)) window.lag.push(nowMs - writtenAtMs);
  }
}

export function closeUiWindow(window: UiWindow, endMs: number): UiSecond {
  'worklet';
  const seconds = Math.max(0.001, (endMs - window.startMs) / 1000);
  return { atMs: endMs, refreshHz: window.ticks / seconds, overlayFps: window.updates / seconds, lagP50: percentile(window.lag, 50), lagP95: percentile(window.lag, 95) };
}

// MARK: - Run summaries (JS thread)

export type DropCounts = { late: number; outOfBuffers: number; discontinuity: number; unknown: number };

export function emptyDrops(): DropCounts {
  return { late: 0, outOfBuffers: 0, discontinuity: 0, unknown: 0 };
}

export function addDrop(drops: DropCounts, reason: string): void {
  if (reason === 'frame-was-late') drops.late += 1;
  else if (reason === 'out-of-buffers') drops.outOfBuffers += 1;
  else if (reason === 'discontinuity') drops.discontinuity += 1;
  else drops.unknown += 1;
}

export function totalDrops(drops: DropCounts): number {
  return drops.late + drops.outOfBuffers + drops.discontinuity + drops.unknown;
}

/** The plugin's phone-state reading (PerfSnapshot), plus the battery from expo-battery. */
export type PerfReading = {
  hostMs: number;
  thermalState: number;
  lowPowerMode: boolean;
  cpuSeconds: number;
  footprintMB: number;
  availableMB: number;
  pressureLevel: string;
};

/** CPU use between two readings, as a percentage of one core (a busy app can pass 100). */
export function cpuPercent(previous: Pick<PerfReading, 'hostMs' | 'cpuSeconds'>, next: Pick<PerfReading, 'hostMs' | 'cpuSeconds'>): number {
  const wall = (next.hostMs - previous.hostMs) / 1000;
  if (!(wall > 0) || previous.cpuSeconds < 0 || next.cpuSeconds < 0) return NaN;
  return ((next.cpuSeconds - previous.cpuSeconds) / wall) * 100;
}

export const THERMAL_NAMES = ['nominal', 'fair', 'serious', 'critical'] as const;
export type ThermalName = (typeof THERMAL_NAMES)[number] | 'unknown';

export function thermalName(state: number): ThermalName {
  return THERMAL_NAMES[state] ?? 'unknown';
}

/**
 * Seconds spent in each thermal state, from readings in time order (each state lasts until the
 * next reading), and when the phone first reached each one (seconds from the first reading).
 */
export function thermalTimeline(readings: readonly { t: number; thermalState: number }[]): {
  seconds: Record<ThermalName, number>;
  firstReached: Partial<Record<ThermalName, number>>;
} {
  const seconds: Record<ThermalName, number> = { nominal: 0, fair: 0, serious: 0, critical: 0, unknown: 0 };
  const firstReached: Partial<Record<ThermalName, number>> = {};
  if (readings.length === 0) return { seconds, firstReached };
  const start = readings[0].t;
  readings.forEach((reading, i) => {
    const name = thermalName(reading.thermalState);
    if (firstReached[name] === undefined) firstReached[name] = reading.t - start;
    const next = readings[i + 1];
    if (next) seconds[name] += Math.max(0, next.t - reading.t);
  });
  return { seconds, firstReached };
}

export type BatteryReading = { t: number; level: number; charging: boolean };

/**
 * Battery drain in percentage points per hour. iOS reports the level in steps (often 5%), so the
 * estimate runs from the first step change to the last, which removes most of the rounding. With
 * fewer than two changes it falls back to the whole run and says the result is rough. Readings
 * while charging, or with an unknown level (-1), are left out.
 */
export function batteryDrain(readings: readonly BatteryReading[]): { percentPerHour: number; precise: boolean; stepPercent: number } {
  const usable = readings.filter((r) => !r.charging && r.level >= 0 && r.level <= 1);
  if (usable.length < 2) return { percentPerHour: NaN, precise: false, stepPercent: NaN };
  const changes: BatteryReading[] = [];
  for (let i = 1; i < usable.length; i++) if (usable[i].level !== usable[i - 1].level) changes.push(usable[i]);
  const steps = changes.map((c, i) => Math.abs((i === 0 ? usable[0].level : changes[i - 1].level) - c.level) * 100);
  const stepPercent = steps.length > 0 ? Math.round(median(steps) * 10) / 10 : NaN;
  if (changes.length >= 2) {
    const first = changes[0];
    const last = changes[changes.length - 1];
    const hours = (last.t - first.t) / 3600;
    return { percentPerHour: hours > 0 ? ((first.level - last.level) * 100) / hours : NaN, precise: true, stepPercent };
  }
  const first = usable[0];
  const last = usable[usable.length - 1];
  const hours = (last.t - first.t) / 3600;
  return { percentPerHour: hours > 0 ? ((first.level - last.level) * 100) / hours : NaN, precise: false, stepPercent };
}

/** Recording size per minute of video, in MB (1 MB = 1,000,000 bytes, as iOS shows storage). */
export function megabytesPerMinute(bytes: number, seconds: number): number {
  if (!(seconds > 0) || !(bytes >= 0)) return NaN;
  return bytes / 1_000_000 / (seconds / 60);
}

/** One per-second row of a run, as exported. */
export type SpikeSample = {
  /** Seconds since the run started. */
  t: number;
  step: string;
  cam?: CameraSecond;
  /**
   * The camera second began before the engine finished (re)loading, so its numbers mix two setups;
   * summaries leave it out.
   */
  settling?: boolean;
  ui?: UiSecond;
  drops: DropCounts;
  perf?: PerfReading;
  cpuPercent?: number;
  battery?: BatteryReading;
};

export type RunSummary = {
  seconds: number;
  processedFps: { median: number; min: number };
  deliveredFps: { median: number };
  inferMs: { p50: number; p95: number; max: number };
  ageMs: { p50: number; p95: number };
  /** Capture → shown: camera-side age plus the UI hop (the screen's own scan-out isn't included). */
  endToEndMs: { p50: number; p95: number };
  overlayFps: { median: number };
  poseFoundShare: number;
  drops: DropCounts;
  errors: number;
  /** CPU while the camera runs, and while it's off (a run's rests). */
  cpuPercent: { median: number; max: number };
  restCpuPercent: { median: number };
  footprintMB: { max: number };
  /** The analysis frames' size, e.g. "1920x1080" (the most common one). */
  frameSize: string | null;
  thermal: ReturnType<typeof thermalTimeline>;
  battery: ReturnType<typeof batteryDrain>;
};

/**
 * Sums up a run's samples. Per-second percentiles are combined as the median of the p50s and the
 * 95th percentile of the p95s. Overlay and CPU figures come only from seconds the camera processed
 * frames, so a run's camera-off rests don't drag them down; rest-time CPU is reported apart.
 */
export function summarizeRun(samples: readonly SpikeSample[]): RunSummary {
  const live = (s: SpikeSample) => s.cam !== undefined && s.cam.frames > 0 && !s.settling;
  const liveSamples = samples.filter(live);
  const cams = liveSamples.map((s) => s.cam!);
  const uis = liveSamples.map((s) => s.ui).filter((u): u is UiSecond => u !== undefined);
  const drops = emptyDrops();
  for (const s of samples) {
    drops.late += s.drops.late;
    drops.outOfBuffers += s.drops.outOfBuffers;
    drops.discontinuity += s.drops.discontinuity;
    drops.unknown += s.drops.unknown;
  }
  const delivered = liveSamples.map((s) => (s.cam!.frames + totalDrops(s.drops)) / s.cam!.seconds);
  const frames = cams.reduce((n, c) => n + c.frames, 0);
  const poses = cams.reduce((n, c) => n + c.poses, 0);
  const endToEnd = (p: 'lagP50' | 'lagP95', q: 'ageP50' | 'ageP95') => {
    const values: number[] = [];
    for (const s of liveSamples) if (s.ui && Number.isFinite(s.cam![q]) && Number.isFinite(s.ui[p])) values.push(s.cam![q] + s.ui[p]);
    return values;
  };
  const cpuOf = (list: readonly SpikeSample[]) => list.map((s) => s.cpuPercent).filter((v): v is number => v !== undefined && Number.isFinite(v));
  const cpu = cpuOf(liveSamples);
  const restCpu = cpuOf(samples.filter((s) => !s.cam || s.cam.frames === 0));
  const sizes = new Map<string, number>();
  for (const c of cams) if (c.bufferWidth > 0) sizes.set(`${c.bufferWidth}x${c.bufferHeight}`, (sizes.get(`${c.bufferWidth}x${c.bufferHeight}`) ?? 0) + 1);
  const frameSize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const footprints = samples.map((s) => s.perf?.footprintMB).filter((v): v is number => v !== undefined && v >= 0);
  const thermal = thermalTimeline(samples.filter((s) => s.perf).map((s) => ({ t: s.t, thermalState: s.perf!.thermalState })));
  const battery = batteryDrain(samples.map((s) => s.battery).filter((b): b is BatteryReading => b !== undefined));
  return {
    seconds: samples.length > 0 ? samples[samples.length - 1].t - samples[0].t : 0,
    processedFps: { median: median(cams.map((c) => c.fps)), min: cams.length > 0 ? Math.min(...cams.map((c) => c.fps)) : NaN },
    deliveredFps: { median: median(delivered) },
    inferMs: { p50: median(cams.map((c) => c.inferP50)), p95: percentile(cams.map((c) => c.inferP95), 95), max: maxOf(cams.map((c) => c.inferMax)) },
    ageMs: { p50: median(cams.map((c) => c.ageP50)), p95: percentile(cams.map((c) => c.ageP95), 95) },
    endToEndMs: { p50: median(endToEnd('lagP50', 'ageP50')), p95: percentile(endToEnd('lagP95', 'ageP95'), 95) },
    overlayFps: { median: median(uis.map((u) => u.overlayFps)) },
    poseFoundShare: frames > 0 ? poses / frames : NaN,
    drops,
    errors: cams.reduce((n, c) => n + c.errors, 0),
    cpuPercent: { median: median(cpu), max: maxOf(cpu) },
    restCpuPercent: { median: median(restCpu) },
    footprintMB: { max: maxOf(footprints) },
    frameSize,
    thermal,
    battery,
  };
}

export type StepSummary = { step: string; startsAt: number; summary: RunSummary };

/** One summary per step, in run order (consecutive samples with the same step label). */
export function summarizeSteps(samples: readonly SpikeSample[]): StepSummary[] {
  const groups: { step: string; startsAt: number; samples: SpikeSample[] }[] = [];
  for (const sample of samples) {
    const last = groups[groups.length - 1];
    if (last && last.step === sample.step) last.samples.push(sample);
    else groups.push({ step: sample.step, startsAt: sample.t, samples: [sample] });
  }
  return groups.map((g) => ({ step: g.step, startsAt: g.startsAt, summary: summarizeRun(g.samples) }));
}

/**
 * The clock check: a pose's age (capture → result) should be positive and well under a second.
 * If it isn't, the capture clock isn't the host clock and the latency numbers can't be trusted.
 */
export function clockLooksRight(cam: Pick<CameraSecond, 'ageP50'> | undefined): boolean | undefined {
  if (!cam || !Number.isFinite(cam.ageP50)) return undefined;
  return cam.ageP50 > 0 && cam.ageP50 < 1000;
}
