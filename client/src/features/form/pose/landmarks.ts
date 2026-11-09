import { angleAt, angleFromVertical, type Pt } from '../angles';

/**
 * MediaPipe Pose Landmarker's 33 landmarks, as the form-pose plugin returns them
 * (modules/form-pose): a flat array of 33 × [x, y, z, visibility, presence], x and y as 0-1
 * fractions of the image the engine saw. Apple Vision fills the same slots, with no face detail,
 * hands or feet (visibility 0). Left and right are the person's own.
 */
export const LANDMARK_COUNT = 33;
export const STRIDE = 5;

export const LANDMARK = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

const L = LANDMARK;

/** The lines the live overlay draws: torso, arms, legs and feet. */
export const BONES: readonly (readonly [number, number])[] = [
  [L.leftShoulder, L.rightShoulder],
  [L.leftShoulder, L.leftHip],
  [L.rightShoulder, L.rightHip],
  [L.leftHip, L.rightHip],
  [L.leftShoulder, L.leftElbow],
  [L.leftElbow, L.leftWrist],
  [L.rightShoulder, L.rightElbow],
  [L.rightElbow, L.rightWrist],
  [L.leftHip, L.leftKnee],
  [L.leftKnee, L.leftAnkle],
  [L.rightHip, L.rightKnee],
  [L.rightKnee, L.rightAnkle],
  [L.leftAnkle, L.leftHeel],
  [L.leftHeel, L.leftFootIndex],
  [L.leftAnkle, L.leftFootIndex],
  [L.rightAnkle, L.rightHeel],
  [L.rightHeel, L.rightFootIndex],
  [L.rightAnkle, L.rightFootIndex],
];

/** The joints the overlay marks with a dot. */
export const JOINTS: readonly number[] = [
  L.nose,
  L.leftShoulder,
  L.rightShoulder,
  L.leftElbow,
  L.rightElbow,
  L.leftWrist,
  L.rightWrist,
  L.leftHip,
  L.rightHip,
  L.leftKnee,
  L.rightKnee,
  L.leftAnkle,
  L.rightAnkle,
  L.leftHeel,
  L.rightHeel,
  L.leftFootIndex,
  L.rightFootIndex,
];

export type Side = 'left' | 'right';

const SIDE_POINTS: Record<Side, { ear: number; shoulder: number; hip: number; knee: number; ankle: number; heel: number; toe: number }> = {
  left: { ear: L.leftEar, shoulder: L.leftShoulder, hip: L.leftHip, knee: L.leftKnee, ankle: L.leftAnkle, heel: L.leftHeel, toe: L.leftFootIndex },
  right: { ear: L.rightEar, shoulder: L.rightShoulder, hip: L.rightHip, knee: L.rightKnee, ankle: L.rightAnkle, heel: L.rightHeel, toe: L.rightFootIndex },
};

/** A landmark's visibility (0-1). 0 when the array is short or the value is missing. */
export function visibilityOf(landmarks: readonly number[], index: number): number {
  'worklet';
  const value = landmarks[index * STRIDE + 3];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The side facing the camera in a side view: the one whose shoulder, hip, knee and ankle the
 * engine is surer of. The far side is partly hidden, so its points jump around more.
 */
export function facingSide(landmarks: readonly number[]): Side {
  'worklet';
  const score = (side: Side) => {
    const p = SIDE_POINTS[side];
    return visibilityOf(landmarks, p.shoulder) + visibilityOf(landmarks, p.hip) + visibilityOf(landmarks, p.knee) + visibilityOf(landmarks, p.ankle);
  };
  return score('right') > score('left') ? 'right' : 'left';
}

/** A landmark in pixels of the upright image (width × height), or undefined below minVisibility. */
export function pointOf(landmarks: readonly number[], index: number, width: number, height: number, minVisibility = 0): Pt | undefined {
  'worklet';
  const x = landmarks[index * STRIDE];
  const y = landmarks[index * STRIDE + 1];
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (visibilityOf(landmarks, index) < minVisibility) return undefined;
  return { x: x * width, y: y * height };
}

export type SidePose = { side: Side; ear?: Pt; shoulder?: Pt; hip?: Pt; knee?: Pt; ankle?: Pt; heel?: Pt; toe?: Pt };

/** One side of the body in pixels, the shape the mock skeleton (skeleton.ts) uses. */
export function sidePose(landmarks: readonly number[], width: number, height: number, minVisibility = 0.5, side: Side = facingSide(landmarks)): SidePose {
  'worklet';
  const p = SIDE_POINTS[side];
  return {
    side,
    ear: pointOf(landmarks, p.ear, width, height, minVisibility),
    shoulder: pointOf(landmarks, p.shoulder, width, height, minVisibility),
    hip: pointOf(landmarks, p.hip, width, height, minVisibility),
    knee: pointOf(landmarks, p.knee, width, height, minVisibility),
    ankle: pointOf(landmarks, p.ankle, width, height, minVisibility),
    heel: pointOf(landmarks, p.heel, width, height, minVisibility),
    toe: pointOf(landmarks, p.toe, width, height, minVisibility),
  };
}

/**
 * The angles spec 2.8 measures, in degrees, or undefined when a point is missing:
 * knee (hip-knee-ankle), hip (shoulder-hip-knee), ankle (knee-ankle-toe, needs the foot),
 * shin and torso against the vertical (phone upright).
 */
export type JointAngles = { knee?: number; hip?: number; ankle?: number; shin?: number; torso?: number };

export function jointAngles(pose: SidePose): JointAngles {
  'worklet';
  const finite = (value: number) => (Number.isFinite(value) ? value : undefined);
  const { shoulder, hip, knee, ankle, toe } = pose;
  return {
    knee: hip && knee && ankle ? finite(angleAt(hip, knee, ankle)) : undefined,
    hip: shoulder && hip && knee ? finite(angleAt(shoulder, hip, knee)) : undefined,
    ankle: knee && ankle && toe ? finite(angleAt(knee, ankle, toe)) : undefined,
    shin: ankle && knee ? finite(angleFromVertical(ankle, knee)) : undefined,
    torso: hip && shoulder ? finite(angleFromVertical(hip, shoulder)) : undefined,
  };
}
