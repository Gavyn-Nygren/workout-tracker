import type { FormReport, Observation, Recording, RepMetrics, WorkoutSession } from '../types';
import { createRandom } from './random';

/** Average bottom knee angle for each of the three recordings, oldest first (smaller = deeper). */
const KNEE_BOTTOM_DEG = [83, 78, 73];

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildReps(reportIndex: number, repCount: number): RepMetrics[] {
  const random = createRandom(100 + reportIndex);
  return Array.from({ length: repCount }, (_, i) => {
    const fatigue = i === repCount - 1 ? 4 : i * 0.6;
    const kneeMin = Math.round(KNEE_BOTTOM_DEG[reportIndex] + fatigue + (random() - 0.5) * 2);
    const kneeMax = Math.round(171 + random() * 4);
    const hipMin = Math.round(kneeMin - 14 + (random() - 0.5) * 3);
    const ankleMin = Math.round(68 - reportIndex + (random() - 0.5) * 2);
    return {
      index: i + 1,
      durationSec: Math.round((2.6 + i * 0.15 + random() * 0.3) * 10) / 10,
      // The middle recording has one rep the model wasn't confident about.
      confidence: reportIndex === 1 && i === 2 ? 'low' : 'high',
      angles: {
        knee: { minDeg: kneeMin, maxDeg: kneeMax },
        hip: { minDeg: hipMin, maxDeg: Math.round(170 + random() * 6) },
        ankle: { minDeg: ankleMin, maxDeg: Math.round(92 + random() * 4) },
      },
      romDeg: kneeMax - kneeMin,
      partial: false,
    };
  });
}

function observationsFor(reportIndex: number, reps: RepMetrics[], previous?: RepMetrics[]): Observation[] {
  const trusted = reps.filter((r) => r.confidence === 'high');
  const knee = trusted.map((r) => r.angles.knee!.minDeg);
  const avg = Math.round(average(knee));
  const observations: Observation[] = [];

  if (previous) {
    const prevAvg = Math.round(average(previous.filter((r) => r.confidence === 'high').map((r) => r.angles.knee!.minDeg)));
    const diff = prevAvg - avg;
    observations.push({
      id: `obs_${reportIndex}_change`,
      kind: 'change',
      text:
        Math.abs(diff) < 5
          ? `Average bottom knee angle was ${avg}°, within 5° of your previous recording (${prevAvg}°): no meaningful change.`
          : `Average bottom knee angle was ${avg}°, ${Math.abs(diff)}° ${diff > 0 ? 'deeper' : 'shallower'} than your previous recording (${prevAvg}°).`,
      cue: diff > 0 ? 'Keeping the same controlled descent may help you hold this depth across every rep.' : undefined,
    });
  }

  const last = reps[reps.length - 1].angles.knee!.minDeg;
  const firstReps = Math.round(average(knee.slice(0, -1)));
  if (last - firstReps >= 3) {
    observations.push({
      id: `obs_${reportIndex}_consistency`,
      kind: 'consistency',
      text: `Rep ${reps.length} was ${last - firstReps}° shallower than the average of the earlier reps.`,
      cue: 'Some lifters find that a brief pause at the bottom helps keep the last reps as deep as the first.',
    });
  }

  if (reps.some((r) => r.confidence === 'low')) {
    const lowReps = reps.filter((r) => r.confidence === 'low').map((r) => r.index);
    observations.push({ id: `obs_${reportIndex}_quality`, kind: 'quality', text: `Rep ${lowReps.join(', ')} had low landmark confidence and is left out of trends.` });
  }
  return observations;
}

/** Three Back Squat recordings from the last three Lower A sessions, showing depth improving. */
export function generateFormReports(sessions: WorkoutSession[]): { recordings: Recording[]; formReports: FormReport[] } {
  const squatSessions = sessions.filter((s) => s.status === 'completed' && s.planWorkoutId === 'pw_lower_a').slice(-3);
  const recordings: Recording[] = [];
  const formReports: FormReport[] = [];
  let previousReps: RepMetrics[] | undefined;

  squatSessions.forEach((session, reportIndex) => {
    const squat = session.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'ex_back_squat');
    const set = squat?.sets.find((s) => s.kind === 'normal');
    if (!set?.completedAt || !set.reps) return;

    const recordingId = `rec_${set.id}`;
    set.recordingId = recordingId;
    // The oldest recording's video was deleted; its metrics stay.
    const videoDeleted = reportIndex === 0;
    recordings.push({
      id: recordingId,
      sessionId: session.id,
      setId: set.id,
      exerciseId: 'ex_back_squat',
      recordedAt: set.completedAt,
      orientation: reportIndex === 2 ? 'landscape' : 'portrait',
      durationSec: Math.round(set.reps * 3.2 + 6),
      videoUri: videoDeleted ? undefined : `file:///fake/recordings/${recordingId}.mov`,
    });

    const reps = buildReps(reportIndex, set.reps);
    const warnings = reportIndex === 0 ? ['The camera was about 20° off a true side view, so angles may be less reliable.'] : [];
    formReports.push({
      id: `report_${set.id}`,
      recordingId,
      sessionId: session.id,
      setId: set.id,
      exerciseId: 'ex_back_squat',
      family: 'squat',
      status: 'ready',
      modelVersion: 'pose-lite-0.1',
      ruleVersion: 'rules-0.1',
      primaryJoint: 'knee',
      quality: { framing: warnings.length ? 'warning' : 'good', warnings },
      detectedReps: set.reps,
      reps,
      observations: observationsFor(reportIndex, reps, previousReps),
      hasReplay: !videoDeleted,
      createdAt: set.completedAt,
      updatedAt: set.completedAt,
    });
    previousReps = reps;
  });

  return { recordings, formReports };
}
