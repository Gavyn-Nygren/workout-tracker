import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import type { BodyweightGoal, FormGoal, LiftGoal, WeeklyGoal } from '../src/data/goals';
import type { BodyweightEntry, FormReport, ISODate, LoggedSet, RepMetrics, WorkoutSession } from '../src/data/types';
import {
  goalReachedMessage,
  goalsAddedByReopen,
  goalsReachedByFormReport,
  goalsReachedByNewWeighIn,
  goalsReachedByWorkout,
  reachedAfter,
} from '../src/features/summary/goalsReached';
import { sessionForReopen } from '../src/features/workout/buildSession';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
const TODAY = '2026-10-27';

/** A local time on a calendar day, as a UTC timestamp. */
const at = (day: ISODate, hour = 10) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

let n = 0;
const set = (loadKg: number, reps: number): LoggedSet => ({ id: `set${n++}`, kind: 'normal', modifiers: [], completedAt: '2026-01-01T00:00:00Z', loadKg, reps });
/** A bench workout with these [kg, reps] sets. */
const bench = (day: ISODate, ...sets: [number, number][]): WorkoutSession => ({
  id: `w_${day}_${n++}`,
  name: 'Workout',
  status: 'completed',
  completion: 'full',
  completedDate: day,
  startedAt: at(day, 9),
  completedAt: at(day, 10),
  blocks: [{ id: 'b', type: 'single', exercises: [{ id: `e${n++}`, exerciseId: 'ex_bench_press', skipped: false, sets: sets.map(([kg, reps]) => set(kg, reps)) }] }],
  createdAt: at(day, 9),
  updatedAt: at(day, 10),
});

const stamps = (created: ISODate, title = 'Goal') => ({ id: `goal${n++}`, title, createdAt: at(created, 8), updatedAt: at(created, 8) });
const liftGoal = (created: ISODate, loadKg: number, reps = 5): LiftGoal => ({ ...stamps(created, `Bench Press ${loadKg} × ${reps}`), type: 'lift', exerciseId: 'ex_bench_press', target: { kind: 'load_reps', loadKg, reps } });
const weeklyGoal = (created: ISODate, workoutsPerWeek: number, deadline?: ISODate): WeeklyGoal => ({ ...stamps(created, `Train ${workoutsPerWeek}× per week`), type: 'frequency', workoutsPerWeek, deadline });
const weightGoal = (created: ISODate, targetKg: number, startKg?: number): BodyweightGoal => ({ ...stamps(created, `Reach ${targetKg} kg`), type: 'bodyweight', targetKg, startKg });
const formGoal = (created: ISODate, targetDeg: number, startDeg: number): FormGoal => ({ ...stamps(created, 'Squat depth'), type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg, startDeg });
const weighIn = (id: string, date: ISODate, weightKg: number): BodyweightEntry => ({ id, date, weightKg, createdAt: at(date, 7), updatedAt: at(date, 7) });

describe('goals a workout reached', () => {
  test('lists the lift and weekly goals this workout reached, not ones reached earlier', () => {
    const early = liftGoal('2026-09-01', 90);
    const late = liftGoal('2026-09-01', 100);
    const weekly = weeklyGoal('2026-10-01', 1, '2026-10-08'); // 1 workout by the deadline
    const first = bench('2026-10-03', [90, 5]);
    const second = bench('2026-10-20', [100, 5]);
    const sessions = [first, second];
    const goals = [early, late, weekly];
    assert.deepEqual(goalsReachedByWorkout(goals, first.id, sessions, exercisesById, TODAY).map((g) => g.id), [early.id, weekly.id]);
    assert.deepEqual(goalsReachedByWorkout(goals, second.id, sessions, exercisesById, TODAY).map((g) => g.id), [late.id]);
  });

  test('a reopened workout keeps the goals it reached, and a later one doesn’t take them', () => {
    const goal = liftGoal('2026-09-01', 100);
    const first = bench('2026-10-10', [100, 5]);
    const later = bench('2026-10-20', [100, 5]);
    const sessions = [sessionForReopen(first), later];
    assert.deepEqual(goalsReachedByWorkout([goal], first.id, sessions, exercisesById, TODAY).map((g) => g.id), [goal.id]);
    assert.deepEqual(goalsReachedByWorkout([goal], later.id, sessions, exercisesById, TODAY), []);
  });

  test('ignores bodyweight and form goals', () => {
    const workout = bench('2026-10-20', [100, 5]);
    const goals = [weightGoal('2026-09-01', 80, 85), formGoal('2026-09-01', 70, 80)];
    assert.deepEqual(goalsReachedByWorkout(goals, workout.id, [workout], exercisesById, TODAY), []);
  });
});

describe('goals a reopened workout reached', () => {
  test('only goals the edits reached', () => {
    const kept = liftGoal('2026-09-01', 90);
    const added = liftGoal('2026-09-01', 100);
    const original = bench('2026-10-20', [90, 5]);
    const finished: WorkoutSession = { ...original, blocks: [{ ...original.blocks[0], exercises: [{ ...original.blocks[0].exercises[0], sets: [set(90, 5), set(100, 5)] }] }] };
    // While reopened, the stored copy is unfinished.
    const stored = [{ ...original, status: 'in_progress' as const }];
    const goals = [kept, added];
    assert.deepEqual(goalsAddedByReopen(goals, stored, original, finished, exercisesById, TODAY).map((g) => g.id), [added.id]);
  });

  test('a goal another workout had already reached is not new, even if this one now reaches it first', () => {
    const goal = liftGoal('2026-09-01', 100);
    const original = bench('2026-10-10', [90, 5]);
    const later = bench('2026-10-20', [100, 5]);
    const finished: WorkoutSession = { ...original, blocks: [{ ...original.blocks[0], exercises: [{ ...original.blocks[0].exercises[0], sets: [set(100, 5)] }] }] };
    const reached = goalsReachedByWorkout([goal], finished.id, [finished, later], exercisesById, TODAY);
    assert.deepEqual(reached.map((g) => g.id), [goal.id]);
    assert.deepEqual(goalsAddedByReopen([goal], [original, later], original, finished, exercisesById, TODAY), []);
  });
});

describe('goals a weigh-in reached', () => {
  test('a new weigh-in at the target reaches the goal', () => {
    const goal = weightGoal('2026-09-01', 80, 85);
    const entries = [weighIn('a', '2026-10-20', 82)];
    const entry = weighIn('b', '2026-10-27', 79.9);
    assert.deepEqual(goalsReachedByNewWeighIn([goal], entries, entry, TODAY).map((g) => g.id), [goal.id]);
    assert.deepEqual(goalsReachedByNewWeighIn([goal], entries, weighIn('c', '2026-10-27', 81), TODAY), []);
  });

  test('a goal already reached is not reached again, even by a weigh-in that replaces the one that reached it', () => {
    const goal = weightGoal('2026-09-01', 80, 85);
    const entries = [weighIn('a', '2026-10-27', 79.5)];
    assert.deepEqual(goalsReachedByNewWeighIn([goal], entries, weighIn('b', '2026-10-27', 79), TODAY), []);
  });

  test('a goal saved without a start waits for a weigh-in to set it', () => {
    const goal = weightGoal('2026-10-01', 80);
    // The first weigh-in since the goal is its start, so it can't reach a lower target by itself.
    assert.deepEqual(goalsReachedByNewWeighIn([goal], [], weighIn('a', '2026-10-27', 84), TODAY), []);
    assert.deepEqual(goalsReachedByNewWeighIn([goal], [weighIn('a', '2026-10-20', 84)], weighIn('b', '2026-10-27', 80), TODAY).map((g) => g.id), [goal.id]);
  });
});

describe('goals a form report reached', () => {
  const rep = (deg: number): RepMetrics => ({ index: 0, durationSec: 2, confidence: 'high', angles: { knee: { minDeg: deg, maxDeg: 170 } }, romDeg: 90, partial: false });
  const report = (id: string, day: ISODate, deg: number): FormReport => ({
    id,
    recordingId: `rec_${id}`,
    sessionId: 'sess',
    setId: `set_${id}`,
    exerciseId: 'ex_back_squat',
    family: 'squat',
    status: 'ready',
    modelVersion: 'test',
    ruleVersion: 'test',
    primaryJoint: 'knee',
    quality: { framing: 'good', warnings: [] },
    detectedReps: 1,
    reps: [rep(deg)],
    observations: [],
    hasReplay: false,
    createdAt: at(day, 18),
    updatedAt: at(day, 18),
  });

  test('only the report that first met the target', () => {
    const goal = formGoal('2026-09-01', 70, 80);
    const reports = [report('r1', '2026-09-10', 74), report('r2', '2026-09-20', 69), report('r3', '2026-10-01', 68)];
    assert.deepEqual(goalsReachedByFormReport([goal], 'r2', reports, TODAY).map((g) => g.id), [goal.id]);
    assert.deepEqual(goalsReachedByFormReport([goal], 'r3', reports, TODAY), []);
    assert.deepEqual(goalsReachedByFormReport([goal], 'r1', reports, TODAY), []);
  });
});

describe('wording', () => {
  test('one goal, or several', () => {
    assert.equal(goalReachedMessage([{ title: 'Reach 180 lb' }]), 'Goal reached: Reach 180 lb.');
    assert.equal(goalReachedMessage([{ title: 'A' }, { title: 'B' }, { title: 'C' }]), 'Goals reached: A, B and C.');
  });

  test('how long it took, from the day the goal was set', () => {
    assert.equal(reachedAfter({ createdAt: at('2026-10-03') }, '2026-10-27'), 'Reached 24 days after you set it');
    assert.equal(reachedAfter({ createdAt: at('2026-10-27') }, '2026-10-27'), 'Reached the day you set it');
    assert.equal(reachedAfter({ createdAt: at('2026-10-26') }, '2026-10-27'), 'Reached 1 day after you set it');
  });
});
