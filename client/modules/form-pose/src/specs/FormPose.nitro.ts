import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

/** Which pose model runs: MediaPipe Pose Landmarker (33 points, feet included) or Apple Vision (19 points, no feet). */
export type PoseEngine = 'mediapipe' | 'vision';
/** MediaPipe's model size. Apple Vision ignores it. */
export type PoseModel = 'lite' | 'full' | 'heavy';
/** Where MediaPipe runs. Apple Vision picks its own hardware. */
export type PoseDelegate = 'cpu' | 'gpu';
/**
 * 'frame' hands the engine the frame's orientation, so it sees the person upright.
 * 'raw' hands it the buffer as it is (orientation up), for comparing the two.
 */
export type PoseOrientationMode = 'frame' | 'raw';

export interface PoseConfig {
  engine: PoseEngine;
  model: PoseModel;
  delegate: PoseDelegate;
  orientationMode: PoseOrientationMode;
  /** 0-1: MediaPipe's detection, presence and tracking thresholds. */
  minConfidence: number;
}

export interface PoseConfigureResult {
  ok: boolean;
  error?: string;
  /** The delegate actually in use: a GPU that fails to start falls back to the CPU. */
  delegateActive: PoseDelegate;
  /** How long loading the model took. */
  loadMs: number;
}

/** One frame's result. Times are milliseconds on the host clock (the camera's capture clock). */
export interface PoseResult {
  ok: boolean;
  error?: string;
  poseFound: boolean;
  /** Counts every detect() call since the plugin was created. */
  seq: number;
  /** The frame's capture time. */
  frameMs: number;
  /** When detect() started. */
  entryMs: number;
  /** When the engine returned. */
  resultMs: number;
  /** Time spent in the engine alone. */
  inferMs: number;
  /** The buffer's size as delivered, before any rotation. */
  bufferWidth: number;
  bufferHeight: number;
  /** 33 landmarks × [x, y, z, visibility, presence], x and y as 0-1 fractions of the image the engine saw. Empty when no pose. */
  landmarks: number[];
  /** MediaPipe's 33 world landmarks × [x, y, z] in metres, hip-centred. Empty for Apple Vision. */
  world: number[];
}

/** The phone's state, for the heat, battery and memory readings. */
export interface PerfSnapshot {
  hostMs: number;
  /** ProcessInfo.thermalState: 0 nominal, 1 fair, 2 serious, 3 critical, -1 unknown. */
  thermalState: number;
  lowPowerMode: boolean;
  /** The app's CPU time so far (user + system), in seconds. */
  cpuSeconds: number;
  /** Memory the app is charged for, in MB. */
  footprintMB: number;
  /** Memory left before iOS would stop the app, in MB. */
  availableMB: number;
  /** The camera's system pressure level (nominal, fair, serious, critical, shutdown), or 'unknown'. */
  pressureLevel: string;
}

/**
 * The form camera's pose plugin (G4.2 spike). One instance holds both engines; configure() swaps them
 * from the JS thread while detect() runs on the camera thread. detect() never throws: a thrown error
 * inside a frame processor would stop a release build, so failures come back in `error`.
 */
export interface FormPose extends HybridObject<{ ios: 'swift' }> {
  configure(config: PoseConfig): PoseConfigureResult;
  detect(frame: Frame): PoseResult;
  /** Starts a new video session, so timestamps can start over (MediaPipe needs them increasing). */
  reset(): void;
  /** cameraPosition: 'front' or 'back', for the camera's pressure level. */
  perfSnapshot(cameraPosition: string): PerfSnapshot;
  /** Now, on the same clock as PoseResult's times. */
  readonly hostTimeMs: number;
}
