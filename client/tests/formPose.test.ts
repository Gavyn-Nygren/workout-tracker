// Pose maths for the camera spike (G4.2): joint angles, MediaPipe's 33 landmarks, and mapping
// landmarks onto the camera preview. Angles are measured in pixels of the upright image, so a 16:9
// frame doesn't skew them, and both camera orientations land on the same screen point.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { angleAt, angleFromVertical } from '../src/features/form/angles';
import { BONES, facingSide, JOINTS, jointAngles, LANDMARK, LANDMARK_COUNT, pointOf, sidePose, STRIDE } from '../src/features/form/pose/landmarks';
import { bufferToUpright, effectiveOrientation, fitTransform, landmarksToUpright, toView, uprightSize, type OverlayGeometry } from '../src/features/form/pose/overlayTransform';
import { poseAt } from '../src/features/form/skeleton';

const close = (actual: number | undefined, expected: number, tolerance = 1e-6) => {
  assert.ok(actual !== undefined && Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
};

describe('angles', () => {
  test('the interior angle at the middle point', () => {
    close(angleAt({ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90);
    close(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 180);
    close(angleAt({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }), 0, 1e-4);
  });

  test('a zero-length segment gives NaN, not a made-up angle', () => {
    assert.ok(Number.isNaN(angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })));
  });

  test('a segment against the vertical, with y down', () => {
    close(angleFromVertical({ x: 0, y: 0 }, { x: 0, y: -5 }), 0);
    close(angleFromVertical({ x: 0, y: 0 }, { x: 5, y: 0 }), 90);
    close(angleFromVertical({ x: 0, y: 0 }, { x: 0, y: 5 }), 180);
    close(angleFromVertical({ x: 0, y: 0 }, { x: 1, y: -1 }), 45);
    assert.ok(Number.isNaN(angleFromVertical({ x: 2, y: 2 }, { x: 2, y: 2 })));
  });

  test("the mock skeleton's angles still come out as before", () => {
    const pose = poseAt('squat', 0);
    close(pose.angles.knee, 172, 1e-6);
  });
});

/** Writes points (pixels of a width × height image) into a 33-landmark array, every point fully visible. */
function landmarksFrom(points: Partial<Record<keyof typeof LANDMARK, { x: number; y: number }>>, width: number, height: number, visibility = 1): number[] {
  const out = new Array<number>(LANDMARK_COUNT * STRIDE).fill(0);
  for (const [name, p] of Object.entries(points)) {
    const i = LANDMARK[name as keyof typeof LANDMARK];
    out[i * STRIDE] = p!.x / width;
    out[i * STRIDE + 1] = p!.y / height;
    out[i * STRIDE + 3] = visibility;
    out[i * STRIDE + 4] = visibility;
  }
  return out;
}

describe('landmarks', () => {
  test("MediaPipe's 33 indices, each used once", () => {
    const indices = Object.values(LANDMARK);
    assert.equal(indices.length, 33);
    assert.deepEqual([...indices].sort((a, b) => a - b), Array.from({ length: 33 }, (_, i) => i));
    for (const [a, b] of BONES) assert.ok(a >= 0 && a < 33 && b >= 0 && b < 33);
    for (const j of JOINTS) assert.ok(j >= 0 && j < 33);
  });

  test('the side facing the camera is the one the engine is surer of', () => {
    const lm = new Array<number>(LANDMARK_COUNT * STRIDE).fill(0);
    for (const i of [LANDMARK.rightShoulder, LANDMARK.rightHip, LANDMARK.rightKnee, LANDMARK.rightAnkle]) lm[i * STRIDE + 3] = 0.9;
    for (const i of [LANDMARK.leftShoulder, LANDMARK.leftHip, LANDMARK.leftKnee, LANDMARK.leftAnkle]) lm[i * STRIDE + 3] = 0.4;
    assert.equal(facingSide(lm), 'right');
    for (const i of [LANDMARK.leftShoulder, LANDMARK.leftHip, LANDMARK.leftKnee, LANDMARK.leftAnkle]) lm[i * STRIDE + 3] = 0.95;
    assert.equal(facingSide(lm), 'left');
  });

  test('points come back in pixels, or not at all when unsure or missing', () => {
    const lm = landmarksFrom({ leftKnee: { x: 640, y: 360 } }, 1280, 720, 0.8);
    assert.deepEqual(pointOf(lm, LANDMARK.leftKnee, 1280, 720), { x: 640, y: 360 });
    assert.equal(pointOf(lm, LANDMARK.leftKnee, 1280, 720, 0.9), undefined);
    assert.equal(pointOf([], LANDMARK.leftKnee, 1280, 720), undefined);
  });

  test('angles from a 16:9 frame match the true angles (measured in pixels, not fractions)', () => {
    // The mock lifter at the bottom of a squat, placed in a landscape 1280 × 720 frame.
    const pose = poseAt('squat', 1);
    const shift = (p: { x: number; y: number }) => ({ x: p.x * 3 + 200, y: p.y * 3 - 20 });
    const lm = landmarksFrom(
      { leftShoulder: shift(pose.shoulder), leftHip: shift(pose.hip), leftKnee: shift(pose.knee), leftAnkle: shift(pose.ankle), leftHeel: shift(pose.heel), leftFootIndex: shift(pose.toe) },
      1280,
      720,
    );
    const angles = jointAngles(sidePose(lm, 1280, 720));
    close(angles.knee, pose.angles.knee, 1e-6);
    close(angles.hip, pose.angles.hip, 1e-6);
    close(angles.ankle, pose.angles.ankle, 1e-6);

    // Measuring on fractions would be wrong: the same knee angle comes out different.
    const fractional = jointAngles(sidePose(lm, 1, 1));
    assert.ok(Math.abs((fractional.knee ?? 0) - pose.angles.knee) > 1);
  });

  test('without foot points (Apple Vision) there is no ankle angle, but the shin still has one', () => {
    const pose = poseAt('calf_raise', 0.5);
    const lm = landmarksFrom({ leftShoulder: pose.shoulder, leftHip: pose.hip, leftKnee: pose.knee, leftAnkle: pose.ankle }, 200, 240);
    const angles = jointAngles(sidePose(lm, 200, 240));
    assert.equal(angles.ankle, undefined);
    assert.ok(angles.shin !== undefined && angles.shin >= 0 && angles.shin < 10);
    assert.ok(angles.knee !== undefined);
  });
});

describe('overlay transform', () => {
  test('a quarter turn swaps width and height', () => {
    assert.deepEqual(uprightSize(1280, 720, 'right'), { width: 720, height: 1280 });
    assert.deepEqual(uprightSize(1280, 720, 'left'), { width: 720, height: 1280 });
    assert.deepEqual(uprightSize(1280, 720, 'up'), { width: 1280, height: 720 });
    assert.deepEqual(uprightSize(1280, 720, 'down'), { width: 1280, height: 720 });
  });

  test("buffer corners land where VisionCamera's label sends them ('left' = the scene's top on the buffer's left edge, turn clockwise)", () => {
    // VisionCamera's FrameCoordinateSystemConverter for .left: translatedBy(1, 0).rotated(π/2), (x, y) → (1 - y, x).
    assert.deepEqual(bufferToUpright(0, 0, 'left'), [1, 0]);
    assert.deepEqual(bufferToUpright(1, 0, 'left'), [1, 1]);
    assert.deepEqual(bufferToUpright(0, 1, 'left'), [0, 0]);
    assert.deepEqual(bufferToUpright(0, 0, 'right'), [0, 1]);
    assert.deepEqual(bufferToUpright(0, 0, 'down'), [1, 1]);
    assert.deepEqual(bufferToUpright(0.3, 0.6, 'up'), [0.3, 0.6]);
  });

  test("'left' undoes 'right'", () => {
    const [x, y] = bufferToUpright(0.2, 0.7, 'right');
    const [u, v] = bufferToUpright(x, y, 'left');
    close(u, 0.2);
    close(v, 0.7);
  });

  test('cover fills the view and crops; contain fits the whole image', () => {
    const image = { width: 1080, height: 1920 };
    const view = { width: 390, height: 844 };
    const cover = fitTransform(image, view, 'cover');
    close(cover.scale, 844 / 1920);
    close(cover.offsetY, 0);
    assert.ok(cover.offsetX < 0);
    const contain = fitTransform(image, view, 'contain');
    close(contain.scale, 390 / 1080);
    close(contain.offsetX, 0);
    assert.ok(contain.offsetY > 0);
    assert.deepEqual(fitTransform({ width: 0, height: 0 }, view, 'cover'), { scale: 0, offsetX: 0, offsetY: 0 });
  });

  const geometry: OverlayGeometry = {
    bufferWidth: 1280,
    bufferHeight: 720,
    orientation: 'right',
    mirror: false,
    space: 'upright',
    swapQuarterTurns: false,
    fit: 'cover',
    viewWidth: 390,
    viewHeight: 844,
  };

  test('the centre maps to the centre of the view', () => {
    const p = toView(0.5, 0.5, geometry);
    close(p.x, 195);
    close(p.y, 422);
  });

  test('a point given in buffer axes lands where the same point does in upright axes', () => {
    const [u, v] = bufferToUpright(0.25, 0.8, 'right');
    const fromUpright = toView(u, v, geometry);
    const fromBuffer = toView(0.25, 0.8, { ...geometry, space: 'buffer' });
    close(fromBuffer.x, fromUpright.x);
    close(fromBuffer.y, fromUpright.y);
  });

  test('mirroring flips left and right about the centre', () => {
    const plain = toView(0.3, 0.4, geometry);
    const mirrored = toView(0.3, 0.4, { ...geometry, mirror: true });
    close(plain.x + mirrored.x, 390);
    close(plain.y, mirrored.y);
  });

  test('swapping only touches quarter turns', () => {
    assert.equal(effectiveOrientation('left', true), 'right');
    assert.equal(effectiveOrientation('right', true), 'left');
    assert.equal(effectiveOrientation('up', true), 'up');
    assert.equal(effectiveOrientation('left', false), 'left');
  });

  test("MediaPipe's buffer-axis points, stood upright, give the true angles (back camera held upright)", () => {
    // The lifter in an upright 720 × 1280 image, then laid into the 1280 × 720 buffer VisionCamera labels 'left'.
    const pose = poseAt('deadlift', 0.8);
    const place = (p: { x: number; y: number }) => ({ x: p.x * 4 + 100, y: p.y * 4 + 200 });
    const upright = landmarksFrom(
      { leftShoulder: place(pose.shoulder), leftHip: place(pose.hip), leftKnee: place(pose.knee), leftAnkle: place(pose.ankle), leftHeel: place(pose.heel), leftFootIndex: place(pose.toe) },
      720,
      1280,
    );
    // Undo the clockwise turn: upright (x, y) came from buffer (y, 1 - x).
    const buffer = upright.slice();
    for (let i = 0; i < buffer.length; i += STRIDE) {
      buffer[i] = upright[i + 1];
      buffer[i + 1] = 1 - upright[i];
    }
    const back = landmarksToUpright(buffer, 'left', 'buffer', false);
    for (let i = 0; i < back.length; i++) close(back[i], upright[i], 1e-9);
    const size = uprightSize(1280, 720, 'left');
    const angles = jointAngles(sidePose(back, size.width, size.height));
    close(angles.knee, pose.angles.knee, 1e-6);
    close(angles.hip, pose.angles.hip, 1e-6);
    close(angles.ankle, pose.angles.ankle, 1e-6);
    // Points already upright (Apple Vision) pass through untouched.
    assert.deepEqual(landmarksToUpright(upright, 'left', 'upright', false), upright);
  });

  test("swapping quarter turns treats 'right' as 'left'", () => {
    const swapped = toView(0.25, 0.8, { ...geometry, space: 'buffer', swapQuarterTurns: true });
    const asLeft = toView(0.25, 0.8, { ...geometry, space: 'buffer', orientation: 'left' });
    close(swapped.x, asLeft.x);
    close(swapped.y, asLeft.y);
  });
});
