/**
 * Joint-angle maths for form analysis (spec 2.8). Pure, so tests run it, and every function is a
 * worklet, so the camera thread can run it too ('worklet' is just a string outside a worklet).
 *
 * Points are in pixels of the upright image, y down. Fractions (0-1) of a non-square image give
 * wrong angles, since x and y would be scaled differently.
 */
export type Pt = { x: number; y: number };

/** The interior angle at b, in degrees (0-180). NaN when a or c sits on b. */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  'worklet';
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const lengths = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!(lengths > 0)) return NaN;
  const cos = (v1x * v2x + v1y * v2y) / lengths;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * The segment from → to against the vertical, in degrees: 0 when `to` is straight above `from`,
 * 90 when level. Only meaningful with the phone held upright (the image's vertical is gravity's).
 * NaN when the two points are the same.
 */
export function angleFromVertical(from: Pt, to: Pt): number {
  'worklet';
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return NaN;
  // Up is -y in image coordinates.
  const cos = -dy / length;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
