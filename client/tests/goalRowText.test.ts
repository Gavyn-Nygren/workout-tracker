// What a goal row on Home says, on screen and to VoiceOver (G3.10 review 3): a goal with no start yet
// has no pace tag and no percent, just what it's waiting for and the days left.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { goalStatus, type GoalInput } from '../src/data/goals';
import type { FormReport, Goal, WorkoutSession } from '../src/data/types';
import { lbToKg } from '../src/data/units';
import { goalRowText } from '../src/features/home/goalRowText';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
/** A local time on a calendar day, as a UTC timestamp. */
const at = (day: string, hour: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};
// Set Oct 27 with an 8-week deadline (Dec 22); two weeks in.
const input = (patch: Partial<GoalInput> = {}): GoalInput => ({ sessions: [], exercisesById, bodyweight: [], formReports: [], today: '2026-11-10', ...patch });
const base = { id: 'g', createdAt: at('2026-10-27', 9), updatedAt: at('2026-10-27', 9), deadline: '2026-12-22' };
const bench: Goal = { ...base, title: 'Bench 225 × 5', type: 'lift', exerciseId: 'ex_bench_press', target: { kind: 'load_reps', loadKg: lbToKg(225), reps: 5 } };
const row = (goal: Goal, patch: Partial<GoalInput> = {}) => goalRowText(goal, goalStatus(goal, input(patch)), 'imperial');

describe('a goal row before its first value', () => {
  test('no pace tag and no percent: what it waits for, the target, and the days left', () => {
    const goals: Goal[] = [
      bench,
      { ...base, title: 'Bench e1RM 250 lb', type: 'lift', exerciseId: 'ex_bench_press', target: { kind: 'e1rm', loadKg: lbToKg(250) } },
      { ...base, title: 'Pull-Up +45 lb × 8', type: 'lift', exerciseId: 'ex_pull_up', target: { kind: 'load_reps', loadKg: lbToKg(45), reps: 8 } },
      { ...base, title: 'Reach 180 lb', type: 'bodyweight', targetKg: lbToKg(180) },
      { ...base, title: 'Back Squat: 80° knee angle', type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg: 80 },
    ];
    assert.deepEqual(
      goals.map((g) => row(g)),
      [
        { tag: undefined, meta: 'Not logged yet · target 225 lb × 5  ·  43 days left', spoken: 'Bench 225 × 5. Not logged yet, target 225 pounds for 5 reps, 43 days left' },
        { tag: undefined, meta: 'Not logged yet · target 250 lb e1RM  ·  43 days left', spoken: 'Bench e1RM 250 lb. Not logged yet, target 250 pounds estimated one-rep max, 43 days left' },
        { tag: undefined, meta: 'Not logged yet · target +45 lb × 8  ·  43 days left', spoken: 'Pull-Up +45 lb × 8. Not logged yet, target bodyweight plus 45 pounds for 8 reps, 43 days left' },
        { tag: undefined, meta: 'No weigh-in yet · target 180 lb  ·  43 days left', spoken: 'Reach 180 lb. No weigh-in yet, target 180 pounds, 43 days left' },
        { tag: undefined, meta: 'No recording yet · target 80° knee angle  ·  43 days left', spoken: 'Back Squat: 80° knee angle. No recording yet, target 80 degrees knee angle, 43 days left' },
      ],
    );
  });

  test('once there is a start, the pace tag and percent are back', () => {
    const session: WorkoutSession = {
      id: 'w',
      name: 'Workout',
      status: 'completed',
      completion: 'full',
      completedDate: '2026-10-01',
      startedAt: at('2026-10-01', 16),
      completedAt: at('2026-10-01', 17),
      blocks: [{ id: 'b', type: 'single', exercises: [{ id: 'e', exerciseId: 'ex_bench_press', skipped: false, sets: [{ id: 's', kind: 'normal', modifiers: [], reps: 5, loadKg: lbToKg(200), completedAt: at('2026-10-01', 17) }] }] }],
      createdAt: at('2026-10-01', 16),
      updatedAt: at('2026-10-01', 17),
    };
    assert.deepEqual(row(bench, { sessions: [session] }), {
      tag: { label: 'Behind pace', tone: 'warning' },
      meta: '200 lb / 225 lb × 5  ·  43 days left',
      spoken: 'Bench 225 × 5. Behind pace. 0 percent. 200 pounds of 225 pounds for 5 reps, 43 days left',
    });

    const depth: Goal = { ...base, title: 'Back Squat: 80° knee angle', type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg: 80 };
    const report: FormReport = {
      id: 'r',
      recordingId: 'rec',
      sessionId: 'sess',
      setId: 'set',
      exerciseId: 'ex_back_squat',
      family: 'squat',
      status: 'ready',
      modelVersion: 'test',
      ruleVersion: 'test',
      primaryJoint: 'knee',
      quality: { framing: 'good', warnings: [] },
      detectedReps: 1,
      reps: [{ index: 0, durationSec: 2, confidence: 'high', angles: { knee: { minDeg: 85, maxDeg: 170 } }, romDeg: 90, partial: false }],
      observations: [],
      hasReplay: false,
      createdAt: at('2026-11-09', 18),
      updatedAt: at('2026-11-09', 18),
    };
    const { meta, spoken } = row(depth, { formReports: [report] });
    assert.equal(meta, '85° now · target 80° knee angle  ·  43 days left');
    assert.equal(spoken, 'Back Squat: 80° knee angle. Behind pace. 0 percent. 85 degrees now, target 80 degrees knee angle, 43 days left');
  });
});
