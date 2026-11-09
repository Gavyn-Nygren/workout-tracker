import { megabytesPerMinute, summarizeRun, summarizeSteps, type RunSummary, type SpikeSample, type StepSummary } from './metrics';
import type { RunId, SpikeConfig } from './protocol';

/**
 * The camera spike's export (roadmap G4.2): one JSON file per run, shared from the phone so the
 * numbers can be read on the PC. Pure; the screen supplies the device details and the samples.
 */
export const REPORT_SCHEMA = 'g42-perf/1';

export type SpikeConditions = { roomC?: number; inCase?: boolean; batteryHealthPercent?: number; brightnessPercent?: number; notes?: string };

export type SpikeEvent = { t: number; kind: 'start' | 'step' | 'config' | 'engine' | 'thermal' | 'error' | 'interruption' | 'end'; detail: string };

export type SpikeRecording = { t: number; seconds: number; bytes: number; codec: string };

/** The overlay and orientation choices on the screen, so a run's numbers can be tied to them. */
export type SpikeScreenSettings = { orientationMode: string; points: string; swapQuarterTurns: boolean; flipMirror: boolean; fit: string };

export type SpikeDevice = { modelId: string | null; modelName: string | null; osVersion: string | null; formSupported: boolean };

export type SpikeReportInput = {
  createdAt: Date;
  presetId: RunId | 'manual';
  presetTitle: string;
  appVersion: string | null;
  device: SpikeDevice;
  conditions: SpikeConditions;
  config: SpikeConfig;
  screen: SpikeScreenSettings;
  /** What the camera settled on (frame rate, pixel format), if VisionCamera said. */
  session?: Record<string, string | number | boolean | null>;
  events: readonly SpikeEvent[];
  recordings: readonly SpikeRecording[];
  samples: readonly SpikeSample[];
  /** True when the run ran to its end; false when it was stopped or the screen closed. */
  completed: boolean;
};

export type SpikeReport = {
  schema: typeof REPORT_SCHEMA;
  createdAt: string;
  completed: boolean;
  preset: { id: RunId | 'manual'; title: string };
  app: { version: string | null };
  device: SpikeDevice;
  conditions: SpikeConditions;
  config: SpikeConfig;
  screen: SpikeScreenSettings;
  session?: Record<string, string | number | boolean | null>;
  summary: RunSummary;
  /** One summary per step (R1's engines, R3's sets and rests). */
  steps: StepSummary[];
  storage: { recordings: number; seconds: number; megabytes: number; megabytesPerMinute: number };
  events: SpikeEvent[];
  recordings: SpikeRecording[];
  samples: SpikeSample[];
};

/** NaN and Infinity aren't JSON; they become null. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))) as T;
}

export function buildReport(input: SpikeReportInput): SpikeReport {
  const seconds = input.recordings.reduce((n, r) => n + r.seconds, 0);
  const bytes = input.recordings.reduce((n, r) => n + r.bytes, 0);
  return jsonSafe({
    schema: REPORT_SCHEMA,
    createdAt: input.createdAt.toISOString(),
    completed: input.completed,
    preset: { id: input.presetId, title: input.presetTitle },
    app: { version: input.appVersion },
    device: input.device,
    conditions: input.conditions,
    config: input.config,
    screen: input.screen,
    session: input.session,
    summary: summarizeRun(input.samples),
    steps: summarizeSteps(input.samples),
    storage: { recordings: input.recordings.length, seconds, megabytes: bytes / 1_000_000, megabytesPerMinute: megabytesPerMinute(bytes, seconds) },
    events: [...input.events],
    recordings: [...input.recordings],
    samples: [...input.samples],
  });
}

/** "g42-R2-2026-11-09-1405.json", in the phone's local time. */
export function reportFileName(createdAt: Date, presetId: RunId | 'manual'): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${createdAt.getFullYear()}-${two(createdAt.getMonth() + 1)}-${two(createdAt.getDate())}`;
  return `g42-${presetId}-${date}-${two(createdAt.getHours())}${two(createdAt.getMinutes())}.json`;
}
