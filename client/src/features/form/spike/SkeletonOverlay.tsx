import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { BONES, JOINTS, STRIDE, visibilityOf } from '../pose/landmarks';
import { toView, type Fit, type FrameOrientation, type PointSpace } from '../pose/overlayTransform';

/** The newest pose, written by the camera thread (never read there: a read would block it). */
export type LivePose = {
  seq: number;
  found: boolean;
  landmarks: number[];
  bufferWidth: number;
  bufferHeight: number;
  orientation: FrameOrientation;
  mirrored: boolean;
  /** Date.now() when the camera thread wrote it, for the UI lag. */
  writtenAt: number;
};

/** The overlay's own settings, set from the screen. */
export type OverlaySettings = { space: PointSpace; swapQuarterTurns: boolean; flipMirror: boolean; fit: Fit; viewWidth: number; viewHeight: number };

const MIN_VISIBILITY = 0.5;

/**
 * The live skeleton (G4.2 spike), drawn by Skia on the UI thread straight from the shared values,
 * so it never waits for the JS thread. Preview only: nothing here goes into the recorded video.
 */
export function SkeletonOverlay({ pose, settings }: { pose: SharedValue<LivePose | null>; settings: SharedValue<OverlaySettings> }) {
  const bones = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const p = pose.get();
    const s = settings.get();
    if (!p || !p.found || p.landmarks.length < 33 * STRIDE) return builder.detach();
    const geometry = {
      bufferWidth: p.bufferWidth,
      bufferHeight: p.bufferHeight,
      orientation: p.orientation,
      mirror: p.mirrored !== s.flipMirror,
      space: s.space,
      swapQuarterTurns: s.swapQuarterTurns,
      fit: s.fit,
      viewWidth: s.viewWidth,
      viewHeight: s.viewHeight,
    };
    for (const [a, b] of BONES) {
      if (visibilityOf(p.landmarks, a) < MIN_VISIBILITY || visibilityOf(p.landmarks, b) < MIN_VISIBILITY) continue;
      const from = toView(p.landmarks[a * STRIDE], p.landmarks[a * STRIDE + 1], geometry);
      const to = toView(p.landmarks[b * STRIDE], p.landmarks[b * STRIDE + 1], geometry);
      builder.moveTo(from.x, from.y);
      builder.lineTo(to.x, to.y);
    }
    return builder.detach();
  });

  const joints = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const p = pose.get();
    const s = settings.get();
    if (!p || !p.found || p.landmarks.length < 33 * STRIDE) return builder.detach();
    const geometry = {
      bufferWidth: p.bufferWidth,
      bufferHeight: p.bufferHeight,
      orientation: p.orientation,
      mirror: p.mirrored !== s.flipMirror,
      space: s.space,
      swapQuarterTurns: s.swapQuarterTurns,
      fit: s.fit,
      viewWidth: s.viewWidth,
      viewHeight: s.viewHeight,
    };
    for (const index of JOINTS) {
      if (visibilityOf(p.landmarks, index) < MIN_VISIBILITY) continue;
      const point = toView(p.landmarks[index * STRIDE], p.landmarks[index * STRIDE + 1], geometry);
      builder.addCircle(point.x, point.y, 5);
    }
    return builder.detach();
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={bones} style="stroke" strokeWidth={4} strokeCap="round" color="#3DDC84" />
      <Path path={joints} color="#FFFFFF" />
    </Canvas>
  );
}
