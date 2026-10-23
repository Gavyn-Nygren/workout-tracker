import { useEffect, useRef, useState } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { FormMovementFamily } from '@/data/types';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors as palette } from '@/theme/tokens';
import { depthAt, poseAt, PRIMARY_JOINT, VIEW, type Pt } from './skeleton';

const BONE = palette.dark.accent;
const JOINT = '#FFFFFF';

type Props = {
  family: FormMovementFamily;
  depth: number;
  /** Shows the primary joint's live angle next to it, as the annotated replay will. */
  showAngle?: boolean;
  /** A barbell plate at the shoulders for barbell lifts. */
  withBar?: boolean;
  /** Dashed outline the lifter should fit inside during setup. */
  showFrame?: boolean;
  width?: number;
  height?: number;
};

/** Pose skeleton over a dark "camera" backdrop: bones in the accent, joints in white. */
export function SkeletonFigure({ family, depth, showAngle, withBar, showFrame, width = 200, height = 240 }: Props) {
  const pose = poseAt(family, depth);
  const joint = PRIMARY_JOINT[family];
  const at: Pt = pose[joint];
  const bone = (a: Pt, b: Pt, key: string) => <Line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BONE} strokeWidth={5} strokeLinecap="round" />;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}>
      <Line x1={10} x2={190} y1={VIEW.ground} y2={VIEW.ground} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      {showFrame && <Rect x={40} y={20} width={130} height={206} rx={14} stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} strokeDasharray="6 6" fill="none" />}
      <G>
        {bone(pose.heel, pose.toe, 'foot')}
        {bone(pose.ankle, pose.knee, 'shin')}
        {bone(pose.knee, pose.hip, 'thigh')}
        {bone(pose.hip, pose.shoulder, 'torso')}
        {withBar && <Circle cx={pose.shoulder.x - 4} cy={pose.shoulder.y + 2} r={20} stroke="rgba(255,255,255,0.35)" strokeWidth={3} fill="rgba(255,255,255,0.06)" />}
        <Circle cx={pose.head.x} cy={pose.head.y - 6} r={11} stroke={BONE} strokeWidth={4} fill="none" />
        {[pose.ankle, pose.knee, pose.hip, pose.shoulder].map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4.5} fill={JOINT} stroke={BONE} strokeWidth={2} />
        ))}
      </G>
      {showAngle && (
        <G>
          <Path d={`M ${at.x + 14} ${at.y} A 14 14 0 0 0 ${at.x} ${at.y - 14}`} stroke={palette.dark.pr} strokeWidth={2} fill="none" />
          <Rect x={at.x + 12} y={at.y - 30} width={42} height={20} rx={10} fill="rgba(11,15,20,0.85)" />
          <SvgText x={at.x + 33} y={at.y - 16} textAnchor="middle" fill={JOINT} fontSize={12} fontWeight="700">
            {`${Math.round(pose.angles[joint])}°`}
          </SvgText>
        </G>
      )}
    </Svg>
  );
}

/**
 * Drives a looping rep animation: depth 0 → 1 → 0 every `repSeconds`, counting reps as each one
 * completes. Holds at the top when paused or when Reduce Motion is on.
 */
export function useRepLoop({ playing, repSeconds = 2.8, maxReps }: { playing: boolean; repSeconds?: number; maxReps?: number }) {
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState({ depth: 0, reps: 0, seconds: 0 });
  const elapsed = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      elapsed.current += (now - last) / 1000;
      last = now;
      const total = maxReps ? Math.min(elapsed.current, maxReps * repSeconds) : elapsed.current;
      setState({ depth: reducedMotion ? 0 : depthAt(total, repSeconds), reps: Math.floor(total / repSeconds), seconds: elapsed.current });
    }, 33);
    return () => clearInterval(id);
  }, [playing, repSeconds, maxReps, reducedMotion]);

  return state;
}
