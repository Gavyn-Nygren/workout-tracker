// The camera spike's numbers, runs and export (G4.2): per-second windows from the camera and UI
// threads, run summaries (frame rate, latency, heat, battery drain from stepped levels, storage),
// the timed runs the owner plays, and the JSON file shared from the phone.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  addDrop,
  batteryDrain,
  clockLooksRight,
  closeCameraWindow,
  closeUiWindow,
  cpuPercent,
  emptyDrops,
  megabytesPerMinute,
  newCameraWindow,
  newUiWindow,
  percentile,
  recordFrame,
  recordUiTick,
  summarizeRun,
  summarizeSteps,
  thermalTimeline,
  totalDrops,
  type SpikeSample,
} from '../src/features/form/spike/metrics';
import { configForStep, DEFAULT_CONFIG, describeConfig, formatDuration, presetById, RUN_PRESETS, stepAt, totalSeconds } from '../src/features/form/spike/protocol';
import { buildReport, REPORT_SCHEMA, reportFileName } from '../src/features/form/spike/report';

describe('percentiles', () => {
  test('nearest rank, ignoring NaN', () => {
    const values = [5, 1, 4, 2, 3, NaN];
    assert.equal(percentile(values, 50), 3);
    assert.equal(percentile(values, 95), 5);
    assert.equal(percentile(values, 0), 1);
    assert.ok(Number.isNaN(percentile([], 50)));
  });
});

describe('camera window', () => {
  test('a second of frames: rate, timings and the gap between captures', () => {
    const w = newCameraWindow(1000);
    for (let i = 0; i < 30; i++) {
      const frameMs = 1000 + i * 33;
      recordFrame(w, { ok: true, poseFound: i % 3 !== 0, frameMs, entryMs: frameMs + 5, resultMs: frameMs + 25, inferMs: 18 + (i % 5) });
    }
    recordFrame(w, { ok: false, error: 'boom', poseFound: false, frameMs: 2000, entryMs: 2000, resultMs: 2000, inferMs: 0 });
    const second = closeCameraWindow(w, 2000);
    assert.equal(second.frames, 31);
    assert.equal(second.errors, 1);
    assert.equal(second.lastError, 'boom');
    assert.equal(second.poses, 20);
    assert.equal(Math.round(second.fps), 31);
    assert.equal(second.ageP50, 25);
    assert.equal(second.queueP50, 5);
    assert.equal(second.stepP50, 33);
    assert.equal(second.inferMax, 22);
  });

  test('the gap carries over into the next window', () => {
    const w = newCameraWindow(0, 967);
    recordFrame(w, { ok: true, poseFound: true, frameMs: 1000, entryMs: 1001, resultMs: 1020, inferMs: 19 });
    assert.deepEqual(w.step, [33]);
  });
});

describe('UI window', () => {
  test('counts refreshes, and overlay updates only for a new pose', () => {
    const w = newUiWindow(0);
    recordUiTick(w, 10, 1, 4);
    recordUiTick(w, 26, 1, 4);
    recordUiTick(w, 43, 2, 38);
    recordUiTick(w, 60, 2, 38);
    const second = closeUiWindow(w, 1000);
    assert.equal(second.refreshHz, 4);
    assert.equal(second.overlayFps, 2);
    assert.equal(second.lagP50, 5);
    assert.equal(second.lagP95, 6);
  });
});

describe('run numbers', () => {
  test('frame drops by reason', () => {
    const drops = emptyDrops();
    for (const r of ['frame-was-late', 'out-of-buffers', 'out-of-buffers', 'discontinuity', 'unknown', 'something-new']) addDrop(drops, r);
    assert.deepEqual(drops, { late: 1, outOfBuffers: 2, discontinuity: 1, unknown: 2 });
    assert.equal(totalDrops(drops), 6);
  });

  test('CPU use is a share of one core', () => {
    assert.equal(cpuPercent({ hostMs: 0, cpuSeconds: 10 }, { hostMs: 2000, cpuSeconds: 13 }), 150);
    assert.ok(Number.isNaN(cpuPercent({ hostMs: 0, cpuSeconds: 1 }, { hostMs: 0, cpuSeconds: 2 })));
  });

  test('time in each thermal state, and when each was first reached', () => {
    const t = thermalTimeline([
      { t: 0, thermalState: 0 },
      { t: 300, thermalState: 1 },
      { t: 900, thermalState: 2 },
      { t: 1000, thermalState: 1 },
      { t: 1200, thermalState: 1 },
    ]);
    assert.deepEqual(t.seconds, { nominal: 300, fair: 800, serious: 100, critical: 0, unknown: 0 });
    assert.deepEqual(t.firstReached, { nominal: 0, fair: 300, serious: 900 });
  });

  test('battery drain from stepped levels uses the first and last step', () => {
    // 5% steps: 80% until 200 s, 75% at 200 s, 70% at 1100 s → 5 points in 900 s = 20 %/h.
    const readings = [
      { t: 0, level: 0.8, charging: false },
      { t: 100, level: 0.8, charging: false },
      { t: 200, level: 0.75, charging: false },
      { t: 600, level: 0.75, charging: false },
      { t: 1100, level: 0.7, charging: false },
      { t: 1200, level: 0.7, charging: false },
    ];
    const drain = batteryDrain(readings);
    assert.equal(drain.precise, true);
    assert.ok(Math.abs(drain.percentPerHour - 20) < 1e-9);
    assert.ok(Math.abs(drain.stepPercent - 5) < 1e-9);
  });

  test('one step or none is rough; charging and unknown levels are left out', () => {
    const rough = batteryDrain([
      { t: 0, level: 0.8, charging: false },
      { t: 1800, level: 0.75, charging: false },
      { t: 2000, level: 0.9, charging: true },
      { t: 2100, level: -1, charging: false },
    ]);
    assert.equal(rough.precise, false);
    assert.ok(Math.abs(rough.percentPerHour - 10) < 1e-9);
    assert.ok(Number.isNaN(batteryDrain([]).percentPerHour));
  });

  test('storage per minute of video', () => {
    assert.equal(megabytesPerMinute(120_000_000, 60), 120);
    assert.ok(Number.isNaN(megabytesPerMinute(1, 0)));
  });

  test('the clock check flags ages that are negative or over a second', () => {
    assert.equal(clockLooksRight({ ageP50: 24 }), true);
    assert.equal(clockLooksRight({ ageP50: -3 }), false);
    assert.equal(clockLooksRight({ ageP50: 5000 }), false);
    assert.equal(clockLooksRight(undefined), undefined);
  });

  test('a run summary combines the seconds', () => {
    const samples: SpikeSample[] = [0, 1, 2, 3].map((t) => {
      const w = newCameraWindow(t * 1000);
      for (let i = 0; i < 30; i++) {
        const f = t * 1000 + i * 33;
        recordFrame(w, { ok: true, poseFound: true, frameMs: f, entryMs: f + 4, resultMs: f + 30 + t, inferMs: 20 + t });
      }
      const drops = emptyDrops();
      drops.outOfBuffers = t === 3 ? 2 : 0;
      return {
        t,
        step: 'Smoke test',
        cam: closeCameraWindow(w, (t + 1) * 1000),
        ui: { atMs: 0, refreshHz: 60, overlayFps: 30, lagP50: 8, lagP95: 12 },
        drops,
        perf: { hostMs: t * 1000, thermalState: t < 2 ? 0 : 1, lowPowerMode: false, cpuSeconds: t * 0.8, footprintMB: 300 + t, availableMB: 2000, pressureLevel: 'nominal' },
        cpuPercent: t > 0 ? 80 : undefined,
      };
    });
    const s = summarizeRun(samples);
    assert.equal(s.seconds, 3);
    assert.equal(Math.round(s.processedFps.median), 30);
    assert.equal(s.inferMs.p50, 21);
    assert.equal(s.inferMs.p95, 23);
    assert.equal(s.drops.outOfBuffers, 2);
    assert.equal(s.poseFoundShare, 1);
    assert.equal(s.endToEndMs.p50, 31 + 8);
    assert.equal(s.cpuPercent.median, 80);
    assert.equal(s.footprintMB.max, 303);
    assert.deepEqual(s.thermal.seconds, { nominal: 2, fair: 1, serious: 0, critical: 0, unknown: 0 });
  });
});

describe('run summaries with rests, engine changes and steps', () => {
  /** A second with the camera processing frames (or, with `frames: 0`, a camera-off rest). */
  const second = (t: number, step: string, opts: { frames?: number; inferMs?: number; cpu?: number; settling?: boolean; size?: [number, number] } = {}): SpikeSample => {
    const frames = opts.frames ?? 30;
    const w = newCameraWindow(t * 1000);
    for (let i = 0; i < frames; i++) {
      const f = t * 1000 + i * 33;
      recordFrame(w, { ok: true, poseFound: true, frameMs: f, entryMs: f + 4, resultMs: f + 30, inferMs: opts.inferMs ?? 20, bufferWidth: opts.size?.[0], bufferHeight: opts.size?.[1] });
    }
    return {
      t,
      step,
      cam: frames > 0 ? closeCameraWindow(w, (t + 1) * 1000) : undefined,
      ui: { atMs: 0, refreshHz: 60, overlayFps: frames > 0 ? 30 : 0, lagP50: 8, lagP95: 12 },
      drops: emptyDrops(),
      cpuPercent: opts.cpu ?? 90,
      settling: opts.settling,
    };
  };

  test("camera-off rests don't drag the overlay rate or CPU down; rest CPU is its own figure", () => {
    const samples = [second(0, 'Set 1'), second(1, 'Set 1'), second(2, 'Rest', { frames: 0, cpu: 5 }), second(3, 'Rest', { frames: 0, cpu: 5 }), second(4, 'Rest', { frames: 0, cpu: 5 })];
    const s = summarizeRun(samples);
    assert.equal(s.overlayFps.median, 30);
    assert.equal(s.cpuPercent.median, 90);
    assert.equal(s.restCpuPercent.median, 5);
  });

  test('a second that straddles an engine change is left out', () => {
    const s = summarizeRun([second(0, 'A', { inferMs: 20 }), second(1, 'A', { inferMs: 400, settling: true }), second(2, 'A', { inferMs: 22 })]);
    assert.equal(s.inferMs.max, 22);
  });

  test("the analysis frames' size is recorded, the most common one wins", () => {
    const s = summarizeRun([second(0, 'A', { size: [1920, 1080] }), second(1, 'A', { size: [1920, 1080] }), second(2, 'A', { size: [1280, 720] })]);
    assert.equal(s.frameSize, '1920x1080');
    assert.equal(second(0, 'A', { size: [1920, 1080] }).cam?.bufferWidth, 1920);
  });

  test('one summary per step, in order', () => {
    const steps = summarizeSteps([second(0, 'Lite', { inferMs: 10 }), second(1, 'Lite', { inferMs: 10 }), second(2, 'Full', { inferMs: 30 }), second(3, 'Full', { inferMs: 30 })]);
    assert.deepEqual(steps.map((s) => s.step), ['Lite', 'Full']);
    assert.deepEqual(steps.map((s) => s.startsAt), [0, 2]);
    assert.equal(steps[0].summary.inferMs.p50, 10);
    assert.equal(steps[1].summary.inferMs.p50, 30);
  });
});

describe('timed runs', () => {
  test('five runs, R0 to R4, with the planned lengths', () => {
    assert.deepEqual(RUN_PRESETS.map((p) => p.id), ['R0', 'R1', 'R2', 'R3', 'R4']);
    assert.deepEqual(RUN_PRESETS.map((p) => totalSeconds(p)), [60, 720, 1800, 1680, 1800]);
    for (const p of RUN_PRESETS) for (const s of p.steps) assert.ok(s.seconds > 0, `${p.id} ${s.label}`);
  });

  test('the real session alternates one-minute sets with camera-off rests', () => {
    const r3 = presetById('R3');
    assert.equal(r3.steps.filter((s) => s.cameraOn).length, 10);
    assert.equal(r3.steps.filter((s) => !s.cameraOn).length, 9);
    assert.ok(r3.steps.every((s, i) => s.cameraOn === (i % 2 === 0)));
  });

  test('finding the step at a time', () => {
    const r1 = presetById('R1');
    assert.equal(stepAt(r1, 0)?.index, 0);
    assert.equal(stepAt(r1, 119.9)?.index, 0);
    assert.equal(stepAt(r1, 120)?.index, 1);
    assert.equal(stepAt(r1, 719)?.index, 5);
    assert.equal(stepAt(r1, 720), undefined);
    assert.equal(stepAt(r1, -1), undefined);
  });

  test("a step's settings sit on top of the run's", () => {
    const r4 = presetById('R4');
    const config = configForStep({ ...DEFAULT_CONFIG, model: 'full' }, r4.steps[0]);
    assert.equal(config.pose, false);
    assert.equal(config.overlay, false);
    assert.equal(config.model, 'full');
  });

  test('durations and labels', () => {
    assert.equal(formatDuration(1680), '28:00');
    assert.equal(formatDuration(59.9), '0:59');
    assert.equal(formatDuration(3725), '1:02:05');
    assert.equal(describeConfig(DEFAULT_CONFIG), 'MediaPipe lite GPU, back 30 fps, recording H.264, format-size frames, overlay');
    assert.match(describeConfig({ ...DEFAULT_CONFIG, pose: false }), /^pose off/);
    assert.match(describeConfig({ ...DEFAULT_CONFIG, engine: 'vision' }), /^Apple Vision/);
  });
});

describe('export', () => {
  const input = {
    createdAt: new Date(2026, 10, 9, 14, 5),
    presetId: 'R2' as const,
    presetTitle: 'Soak',
    appVersion: '1.0.0',
    device: { modelId: 'iPhone15,2', modelName: 'iPhone 14 Pro', osVersion: '26.6', formSupported: true },
    conditions: { roomC: 22, inCase: true },
    config: DEFAULT_CONFIG,
    screen: { orientationMode: 'frame', points: 'auto (buffer)', swapQuarterTurns: false, flipMirror: false, fit: 'cover' },
    events: [{ t: 0, kind: 'start' as const, detail: 'Soak' }],
    recordings: [
      { t: 60, seconds: 60, bytes: 100_000_000, codec: 'h264' },
      { t: 120, seconds: 60, bytes: 110_000_000, codec: 'h264' },
    ],
    samples: [],
    completed: true,
  };

  test('a versioned JSON file with the summary and storage', () => {
    const report = buildReport(input);
    assert.equal(report.schema, REPORT_SCHEMA);
    assert.equal(report.preset.id, 'R2');
    assert.equal(report.storage.recordings, 2);
    assert.equal(report.storage.megabytes, 210);
    assert.equal(report.storage.megabytesPerMinute, 105);
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  });

  test('numbers that are missing become null, since JSON has no NaN', () => {
    const report = buildReport(input);
    assert.equal(report.summary.processedFps.median, null);
  });

  test("the file name uses the phone's local time", () => {
    assert.equal(reportFileName(new Date(2026, 10, 9, 14, 5), 'R2'), 'g42-R2-2026-11-09-1405.json');
    assert.equal(reportFileName(new Date(2026, 0, 2, 3, 4), 'manual'), 'g42-manual-2026-01-02-0304.json');
  });
});
