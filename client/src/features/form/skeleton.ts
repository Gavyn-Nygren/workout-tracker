import type { FormMovementFamily, Joint } from '@/data/types';
import { angleAt, type Pt } from './angles';

export type { Pt };
export type Pose = { head: Pt; shoulder: Pt; hip: Pt; knee: Pt; ankle: Pt; toe: Pt; heel: Pt; angles: Record<Joint, number> };

/** Side view in a 200×240 box, facing right. Segment lengths are roughly athletic proportions. */
export const VIEW = { width: 200, height: 240, ground: 220 };
const SHIN = 52;
const THIGH = 52;
const TORSO = 62;

type Motion = { knee: [number, number]; shin: [number, number]; torso: [number, number]; heelLift: number };

/** Top → bottom of the rep for each verified movement family (spec 2.8). */
const MOTION: Record<FormMovementFamily, Motion> = {
  squat: { knee: [172, 74], shin: [6, 38], torso: [8, 45], heelLift: 0 },
  lunge: { knee: [170, 88], shin: [4, 28], torso: [4, 14], heelLift: 0 },
  deadlift: { knee: [175, 132], shin: [3, 16], torso: [6, 74], heelLift: 0 },
  calf_raise: { knee: [176, 176], shin: [2, 2], torso: [4, 4], heelLift: 9 },
};

/** The primary joint each family is judged by (matches FormReport.primaryJoint). */
export const PRIMARY_JOINT: Record<FormMovementFamily, Joint> = { squat: 'knee', lunge: 'knee', deadlift: 'hip', calf_raise: 'ankle' };

const rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Joint positions at `depth` (0 = top of the rep, 1 = bottom). A stand-in for real pose
 * landmarks until the camera build (roadmap G4.2), drawn so the mock screens move like a lifter.
 */
export function poseAt(family: FormMovementFamily, depth: number): Pose {
  const m = MOTION[family];
  const lift = m.heelLift * depth;
  const ankle = { x: 104, y: 212 - lift };
  const toe = { x: ankle.x + 24, y: VIEW.ground - 4 };
  const heel = { x: ankle.x - 7, y: ankle.y + 6 };

  const shinLean = rad(lerp(m.shin[0], m.shin[1], depth));
  const knee = { x: ankle.x + SHIN * Math.sin(shinLean), y: ankle.y - SHIN * Math.cos(shinLean) };

  // The thigh leaves the knee at the knee angle, measured from the shin and opening backward.
  const toAnkle = Math.atan2(ankle.y - knee.y, ankle.x - knee.x);
  const thighDir = toAnkle + rad(lerp(m.knee[0], m.knee[1], depth));
  const hip = { x: knee.x + THIGH * Math.cos(thighDir), y: knee.y + THIGH * Math.sin(thighDir) };

  const torsoLean = rad(lerp(m.torso[0], m.torso[1], depth));
  const shoulder = { x: hip.x + TORSO * Math.sin(torsoLean), y: hip.y - TORSO * Math.cos(torsoLean) };
  const head = { x: shoulder.x + 17 * Math.sin(torsoLean * 0.6), y: shoulder.y - 17 * Math.cos(torsoLean * 0.6) };

  return {
    head,
    shoulder,
    hip,
    knee,
    ankle,
    toe,
    heel,
    angles: { knee: angleAt(hip, knee, ankle), hip: angleAt(shoulder, hip, knee), ankle: angleAt(knee, ankle, toe) },
  };
}

/** 0 → 1 → 0 over one rep, eased like a controlled descent and drive up. */
export function depthAt(secondsIntoRep: number, repSeconds: number): number {
  const t = (secondsIntoRep % repSeconds) / repSeconds;
  return (1 - Math.cos(2 * Math.PI * t)) / 2;
}
