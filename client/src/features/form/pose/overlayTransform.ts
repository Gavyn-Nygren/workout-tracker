import { STRIDE } from './landmarks';

/**
 * Maps a landmark (0-1 fractions of the image) onto the camera preview, for the live overlay, and
 * stands landmarks upright for angle maths. Pure and worklet-safe, so the UI thread runs it every
 * frame.
 *
 * Camera buffers arrive unrotated: held upright, the back camera's buffer is landscape. VisionCamera
 * labels each frame with an orientation in its own terms (CameraOrientation): 'left' means the
 * scene's top runs along the buffer's left edge, so the buffer turns clockwise to stand up
 * (VisionCamera's FrameCoordinateSystemConverter; UIImage and EXIF call the same frame .right).
 *
 * Points come in two spaces. MediaPipe returns them in the raw buffer's axes ('buffer': it turns the
 * image only to look). Apple Vision returns them in the upright image's ('upright'). The spike screen
 * picks by engine and can override both guesses, and swap the quarter turns, so a wrong guess is
 * fixed with a reload instead of a new build.
 */
export type FrameOrientation = 'up' | 'right' | 'down' | 'left';
export type Fit = 'cover' | 'contain';
export type PointSpace = 'upright' | 'buffer';

export type Size = { width: number; height: number };

/** The upright image's size: a quarter turn swaps width and height. */
export function uprightSize(bufferWidth: number, bufferHeight: number, orientation: FrameOrientation): Size {
  'worklet';
  return orientation === 'left' || orientation === 'right' ? { width: bufferHeight, height: bufferWidth } : { width: bufferWidth, height: bufferHeight };
}

/** A point in the raw buffer's fractions → the same point in the upright image's fractions (VisionCamera's labels). */
export function bufferToUpright(u: number, v: number, orientation: FrameOrientation): [number, number] {
  'worklet';
  switch (orientation) {
    case 'up':
      return [u, v];
    case 'left':
      // The scene's top is the buffer's left edge: turning clockwise sends the buffer's top-left
      // corner to the top-right.
      return [1 - v, u];
    case 'down':
      return [1 - u, 1 - v];
    case 'right':
      return [v, 1 - u];
  }
}

/** Swaps 'left' and 'right' when asked, in case a camera's label means the other quarter turn. */
export function effectiveOrientation(orientation: FrameOrientation, swapQuarterTurns: boolean): FrameOrientation {
  'worklet';
  if (!swapQuarterTurns) return orientation;
  if (orientation === 'left') return 'right';
  if (orientation === 'right') return 'left';
  return orientation;
}

/** How an image of `image` size sits in a view: 'cover' fills it and crops, 'contain' fits it whole. */
export function fitTransform(image: Size, view: Size, fit: Fit): { scale: number; offsetX: number; offsetY: number } {
  'worklet';
  if (!(image.width > 0 && image.height > 0 && view.width > 0 && view.height > 0)) return { scale: 0, offsetX: 0, offsetY: 0 };
  const sx = view.width / image.width;
  const sy = view.height / image.height;
  const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  return { scale, offsetX: (view.width - image.width * scale) / 2, offsetY: (view.height - image.height * scale) / 2 };
}

export type OverlayGeometry = {
  bufferWidth: number;
  bufferHeight: number;
  orientation: FrameOrientation;
  /** Mirror left-right (the front camera's preview is mirrored). */
  mirror: boolean;
  space: PointSpace;
  swapQuarterTurns: boolean;
  fit: Fit;
  viewWidth: number;
  viewHeight: number;
};

/** A landmark's fractions → view points. */
export function toView(u: number, v: number, geometry: OverlayGeometry): { x: number; y: number } {
  'worklet';
  const orientation = effectiveOrientation(geometry.orientation, geometry.swapQuarterTurns);
  let [x, y] = geometry.space === 'buffer' ? bufferToUpright(u, v, orientation) : [u, v];
  if (geometry.mirror) x = 1 - x;
  const image = uprightSize(geometry.bufferWidth, geometry.bufferHeight, orientation);
  const { scale, offsetX, offsetY } = fitTransform(image, { width: geometry.viewWidth, height: geometry.viewHeight }, geometry.fit);
  return { x: x * image.width * scale + offsetX, y: y * image.height * scale + offsetY };
}

/**
 * Landmarks (flat, 5 per point) with x and y turned into the upright image's fractions, everything
 * else copied, for angle maths. Not mirrored: angles don't change with a mirror, and left and right
 * stay the person's own.
 */
export function landmarksToUpright(landmarks: readonly number[], orientation: FrameOrientation, space: PointSpace, swapQuarterTurns: boolean): number[] {
  'worklet';
  const out = landmarks.slice();
  if (space === 'upright') return out;
  const turn = effectiveOrientation(orientation, swapQuarterTurns);
  for (let i = 0; i + 1 < out.length; i += STRIDE) {
    const [x, y] = bufferToUpright(landmarks[i], landmarks[i + 1], turn);
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}
