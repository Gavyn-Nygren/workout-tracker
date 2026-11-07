import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { addDays } from '../src/data/dates';
import {
  bodyweightGoalStartKg,
  formGainDeg,
  formTrend,
  goalAwaitsStart,
  goalDeadlineSetAt,
  goalEditStartsOver,
  goalStatus,
  goalsReachedBySession,
  goalsReachedByReport,
  goalsReachedByWeighIn,
  latestFormAngle,
  liftBest,
  liftGoalFormKind,
  weeklyGoalTarget,
  weeklyGoalTotal,
  type BodyweightGoal,
  type FormGoal,
  type GoalInput,
  type LiftGoal,
  type WeeklyGoal,
} from '../src/data/goals';
import type { BodyweightEntry, FormReport, ISODate, LoggedSet, RepMetrics, WorkoutSession } from '../src/data/types';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
const TODAY = '2026-10-27';

/** A local time on a calendar day, as a UTC timestamp. */
const at = (day: ISODate, hour = 10) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

let n = 0;
const set = (patch: Partial<LoggedSet>): LoggedSet => ({ id: `set${n++}`, kind: 'normal', modifiers: [], completedAt: '2026-01-01T00:00:00Z', ...patch });
const workout = (day: ISODate, exerciseId: string, sets: LoggedSet[], hour = 10): WorkoutSession => ({
  id: `w_${day}_${n++}`,
  name: 'Workout',
  status: 'completed',
  completion: 'full',
  completedDate: day,
  startedAt: at(day, hour - 1),
  completedAt: at(day, hour),
  blocks: [{ id: 'b', type: 'single', exercises: [{ id: `e${n++}`, exerciseId, skipped: false, sets }] }],
  createdAt: at(day, hour - 1),
  updatedAt: at(day, hour),
});
/** A bench workout with these [kg, reps] sets. */
const bench = (day: ISODate, ...sets: [number, number][]) => workout(day, 'ex_bench_press', sets.map(([loadKg, reps]) => set({ loadKg, reps })));
const input = (patch: Partial<GoalInput> = {}): GoalInput => ({ sessions: [], exercisesById, bodyweight: [], formReports: [], today: TODAY, ...patch });

const stamps = (created: ISODate) => ({ id: `goal${n++}`, title: 'Goal', createdAt: at(created, 12), updatedAt: at(created, 12) });
const liftGoal = (created: ISODate, target: LiftGoal['target'], exerciseId = 'ex_bench_press', deadline?: ISODate): LiftGoal => ({ ...stamps(created), type: 'lift', exerciseId, target, deadline });
const weeklyGoal = (created: ISODate, workoutsPerWeek: number, deadline?: ISODate): WeeklyGoal => ({ ...stamps(created), type: 'frequency', workoutsPerWeek, deadline });
const weightGoal = (created: ISODate, targetKg: number, startKg?: number, deadline?: ISODate): BodyweightGoal => ({ ...stamps(created), type: 'bodyweight', targetKg, startKg, deadline });
const formGoal = (created: ISODate, targetDeg: number, startDeg: number): FormGoal => ({ ...stamps(created), type: 'form', exerciseId: 'ex_back_squat', joint: 'knee', targetDeg, startDeg });
const weighIn = (date: ISODate, weightKg: number): BodyweightEntry => ({ id: `bw_${date}`, date, weightKg, createdAt: at(date, 7), updatedAt: at(date, 7) });

describe('lift goals', () => {
  test('the start is the best in the 12 weeks before the goal was set', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 105, reps: 5 });
    const sessions = [
      bench('2026-06-01', [110, 5]), // more than 12 weeks before
      bench('2026-08-15', [90, 5]),
      bench('2026-08-25', [95, 5], [120, 3]), // 120 is short of 5 reps
      bench('2026-09-10', [100, 5]),
    ];
    const status = goalStatus(goal, input({ sessions }));
    assert.deepEqual([status.start, status.current, status.fraction, status.reached], [95, 100, 0.5, false]);
  });

  test('a workout earlier on the day the goal was set counts toward the start, not progress', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 105, reps: 5 });
    // 10 am; the goal was set at noon.
    const status = goalStatus(goal, input({ sessions: [bench('2026-09-01', [105, 5])] }));
    assert.deepEqual([status.start, status.current, status.fraction, status.reached], [105, 105, 0, false]);
  });

  test('without a baseline, the first value after the goal is the start', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 100, reps: 5 });
    const status = goalStatus(goal, input({ sessions: [bench('2026-09-03', [80, 5]), bench('2026-09-10', [90, 6])] }));
    assert.deepEqual([status.start, status.current, status.fraction], [80, 90, 0.5]);
  });

  test('with nothing since the goal, the bar starts at 0 and current shows the start', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 100, reps: 5 });
    const status = goalStatus(goal, input({ sessions: [bench('2026-08-20', [90, 5])] }));
    assert.deepEqual([status.start, status.current, status.fraction, status.reached], [90, 90, 0, false]);
    const empty = goalStatus(goal, input());
    assert.deepEqual([empty.start, empty.current, empty.fraction, empty.reached], [undefined, undefined, 0, false]);
  });

  test('reached by the first workout after the goal, and stays reached after a dip', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 100, reps: 5 });
    const hit = bench('2026-09-20', [100, 5]);
    const sessions = [bench('2026-08-20', [100, 5]), bench('2026-09-10', [95, 5]), hit, bench('2026-10-01', [90, 5])];
    const status = goalStatus(goal, input({ sessions }));
    assert.equal(status.reached, true);
    assert.equal(status.reachedDate, '2026-09-20');
    assert.deepEqual(status.reachedBy, { sessionId: hit.id });
    assert.equal(status.fraction, 1);
  });

  test('a reached goal moves to Completed goals 7 days later', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 100, reps: 5 });
    const sessions = [bench('2026-10-20', [100, 5])];
    assert.equal(goalStatus(goal, input({ sessions, today: '2026-10-26' })).archived, false);
    assert.equal(goalStatus(goal, input({ sessions, today: '2026-10-27' })).archived, true);
  });

  test('an e1RM goal is reached by a set whose e1RM meets it', () => {
    const goal = liftGoal('2026-09-01', { kind: 'e1rm', loadKg: 120 });
    const status = goalStatus(goal, input({ sessions: [bench('2026-09-05', [100, 3]), bench('2026-09-12', [100, 6])] }));
    assert.equal(status.reachedDate, '2026-09-12');
    assert.equal(status.addedLoad, undefined);
  });

  test('kg↔lb rounding within 0.05 kg still reaches the target', () => {
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 102.06, reps: 5 });
    assert.equal(goalStatus(goal, input({ sessions: [bench('2026-09-05', [102.5 - 0.47, 5])] })).reached, true);
  });

  test('bodyweight exercises compare added weight, not total load', () => {
    const pullUps = (day: ISODate, addedLoadKg?: number) => workout(day, 'ex_pull_up', [set({ reps: 5, bodyweightSnapshotKg: 80, addedLoadKg })]);
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 20, reps: 5 }, 'ex_pull_up');
    const status = goalStatus(goal, input({ sessions: [pullUps('2026-08-20', 5), pullUps('2026-09-10', 10)] }));
    assert.deepEqual([status.start, status.current, status.fraction, status.reached, status.addedLoad], [5, 10, 1 / 3, false, true]);
    assert.equal(goalStatus(goal, input({ sessions: [pullUps('2026-09-10', 20)] })).reached, true);

    // A target of 0 added is bodyweight only.
    const bodyweightOnly = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 0, reps: 5 }, 'ex_pull_up');
    assert.equal(goalStatus(bodyweightOnly, input({ sessions: [pullUps('2026-09-10')] })).reached, true);
  });

  test('assisted exercises progress by taking off assistance', () => {
    const assisted = (day: ISODate, assistanceKg: number) =>
      workout(day, 'ex_assisted_pull_up', [set({ kind: 'assisted', reps: 5, bodyweightSnapshotKg: 80, assistanceKg })]);
    const goal = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: -10, reps: 5 }, 'ex_assisted_pull_up');
    const status = goalStatus(goal, input({ sessions: [assisted('2026-08-20', 30), assisted('2026-09-10', 20)] }));
    assert.deepEqual([status.start, status.current, status.fraction, status.reached], [-30, -20, 0.5, false]);
    assert.equal(goalStatus(goal, input({ sessions: [assisted('2026-09-20', 10)] })).reached, true);
  });

  test('liftBest gives the goal form its hint', () => {
    const sessions = [bench('2026-07-01', [110, 5]), bench('2026-10-01', [97.5, 5], [97.5, 6]), bench('2026-10-10', [95, 8])];
    const best = liftBest('ex_bench_press', { kind: 'load_reps', reps: 5 }, sessions, exercisesById, { withinDays: 84, today: TODAY });
    assert.deepEqual([best?.value, best?.reps, best?.date, best?.addedLoad], [97.5, 6, '2026-10-01', false]);
    const e1rm = liftBest('ex_bench_press', { kind: 'e1rm' }, sessions, exercisesById, { withinDays: 84, today: TODAY });
    assert.deepEqual([e1rm?.loadKg, e1rm?.reps], [95, 8]);
    assert.equal(liftBest('ex_bench_press', { kind: 'load_reps', reps: 5 }, sessions, exercisesById, { since: at('2026-10-05') })?.value, 95);
    assert.equal(liftBest('ex_bench_press', { kind: 'load_reps', reps: 5 }, sessions, exercisesById, { before: at('2026-09-01') })?.value, 110);
  });
});

describe('weekly goals', () => {
  test('without a deadline: this week against workouts per week, never reached', () => {
    const goal = weeklyGoal('2026-09-01', 4);
    const streak = { thisWeekCompleted: 2 };
    const status = goalStatus(goal, input({ streak }));
    assert.deepEqual([status.mode, status.done, status.total, status.fraction, status.reached, status.pace], ['this_week', 2, 4, 0.5, false, undefined]);
    assert.equal(goalStatus(weeklyGoal('2026-09-01', 2), input({ streak })).reached, false);
  });

  test('without a streak, this week follows the week-start setting', () => {
    // Sunday Oct 25 is in this week when weeks start on Sunday, last week when they start on Monday.
    const sessions = [bench('2026-10-25', [60, 5]), bench('2026-10-26', [60, 5])];
    assert.equal(goalStatus(weeklyGoal('2026-09-01', 4), input({ sessions, weekStartsOn: 7 })).done, 2);
    assert.equal(goalStatus(weeklyGoal('2026-09-01', 4), input({ sessions, weekStartsOn: 1 })).done, 1);
  });

  test('with a deadline: a total of per week × weeks', () => {
    assert.equal(weeklyGoalTotal(weeklyGoal('2026-09-07', 4, '2026-11-02')), 32);
    assert.equal(weeklyGoalTotal(weeklyGoal('2026-09-07', 4, addDays('2026-09-07', 31))), 16);
    assert.equal(weeklyGoalTotal(weeklyGoal('2026-09-07', 3, '2026-09-09')), 3);
    assert.equal(weeklyGoalTotal(weeklyGoal('2026-09-07', 3)), undefined);
  });

  test('counts workouts from when the goal was set through the deadline', () => {
    const goal = weeklyGoal('2026-09-07', 1, '2026-09-28'); // 3 weeks: 3 workouts
    const early = bench('2026-09-07', [60, 5]); // 10 am, before the goal at noon
    const warmupOnly = workout('2026-09-09', 'ex_bench_press', [set({ kind: 'warmup', loadKg: 40, reps: 5 })]);
    const counted = [bench('2026-09-08', [60, 5]), bench('2026-09-15', [60, 5])];
    const late = bench('2026-09-29', [60, 5]);
    const status = goalStatus(goal, input({ sessions: [early, warmupOnly, ...counted, late], today: '2026-10-01' }));
    assert.deepEqual([status.mode, status.done, status.total, status.reached, status.pace, status.daysLeft], ['total', 2, 3, false, 'past_deadline', undefined]);
  });

  test('reached by the workout that makes the total', () => {
    const goal = weeklyGoal('2026-09-07', 1, '2026-09-28');
    const last = bench('2026-09-22', [60, 5]);
    const status = goalStatus(goal, input({ sessions: [bench('2026-09-08', [60, 5]), bench('2026-09-09', [60, 5]), last], today: '2026-09-25' }));
    assert.deepEqual([status.reached, status.reachedDate, status.fraction, status.pace], [true, '2026-09-22', 1, undefined]);
    assert.deepEqual(status.reachedBy, { sessionId: last.id });
  });

  test('pace: an extra workout makes up for a short week', () => {
    const goal = weeklyGoal('2026-09-07', 4, '2026-11-02'); // Monday; 32 workouts
    const week1 = ['2026-09-08', '2026-09-10'].map((d) => bench(d, [60, 5]));
    const behind = goalStatus(goal, input({ sessions: week1, today: '2026-09-14' }));
    assert.deepEqual([behind.pace, behind.daysLeft], ['behind', 50]);
    const week2 = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((d) => bench(d, [60, 5]));
    assert.equal(goalStatus(goal, input({ sessions: [...week1, ...week2], today: '2026-09-21' })).pace, 'on_track');
  });
});

describe('bodyweight goals', () => {
  test('reached by a weigh-in on or after the day it was set, and stays reached after a dip', () => {
    const goal = weightGoal('2026-09-01', 80, 86);
    const bodyweight = [weighIn('2026-08-10', 79.5), weighIn('2026-08-31', 86), weighIn('2026-09-10', 83), weighIn('2026-09-20', 79.9), weighIn('2026-10-01', 81)];
    const status = goalStatus(goal, input({ bodyweight }));
    assert.deepEqual([status.reached, status.reachedDate, status.current, status.start, status.fraction], [true, '2026-09-20', 81, 86, 1]);
    assert.deepEqual(status.reachedBy, { bodyweightEntryId: 'bw_2026-09-20' });
    const midway = goalStatus(goal, input({ bodyweight: bodyweight.slice(0, 3) }));
    assert.deepEqual([midway.reached, midway.fraction], [false, 0.5]);
  });

  test('a weigh-in on the day the goal was set counts', () => {
    const status = goalStatus(weightGoal('2026-09-01', 80, 86), input({ bodyweight: [weighIn('2026-09-01', 80)] }));
    assert.equal(status.reachedDate, '2026-09-01');
  });

  test('saved without a weigh-in: the first weigh-in after is the start, and it is never reached at any weight', () => {
    const goal = weightGoal('2026-09-01', 85);
    const none = goalStatus(goal, input());
    assert.deepEqual([none.start, none.current, none.fraction, none.reached], [undefined, undefined, 0, false]);

    const losing = goalStatus(goal, input({ bodyweight: [weighIn('2026-09-05', 90), weighIn('2026-09-20', 88), weighIn('2026-10-01', 95)] }));
    assert.deepEqual([losing.start, losing.current, losing.reached], [90, 95, false]);
    assert.equal(goalStatus(goal, input({ bodyweight: [weighIn('2026-09-05', 90), weighIn('2026-09-20', 88)] })).fraction, 0.4);

    // Below the target first: a goal to gain.
    const gaining = goalStatus(goal, input({ bodyweight: [weighIn('2026-09-05', 80), weighIn('2026-09-20', 84), weighIn('2026-10-01', 85.2)] }));
    assert.deepEqual([gaining.start, gaining.reachedDate], [80, '2026-10-01']);
  });

  test('older goals that stored the target as their start wait for a weigh-in too', () => {
    const goal = weightGoal('2026-09-01', 85, 85);
    const status = goalStatus(goal, input({ bodyweight: [weighIn('2026-09-05', 95), weighIn('2026-09-20', 92)] }));
    assert.deepEqual([status.start, status.reached], [95, false]);
    // The goal form keeps only a real start when the goal is edited (G3.10 review).
    assert.equal(bodyweightGoalStartKg(goal), undefined);
    assert.equal(bodyweightGoalStartKg(weightGoal('2026-09-01', 85, 85.04)), undefined);
    assert.equal(bodyweightGoalStartKg(weightGoal('2026-09-01', 85, 90)), 90);
    assert.equal(bodyweightGoalStartKg(weightGoal('2026-09-01', 85)), undefined);
  });

  test('pace follows a straight line to the deadline', () => {
    const goal = weightGoal('2026-09-01', 80, 90, '2026-10-31');
    const onTrack = goalStatus(goal, input({ bodyweight: [weighIn('2026-10-01', 85)], today: '2026-10-01' }));
    assert.equal(onTrack.pace, 'on_track');
    const behind = goalStatus(goal, input({ bodyweight: [weighIn('2026-10-01', 89)], today: '2026-10-01' }));
    assert.equal(behind.pace, 'behind');
    const past = goalStatus(goal, input({ bodyweight: [weighIn('2026-10-01', 89)], today: '2026-11-01' }));
    assert.deepEqual([past.pace, past.daysLeft, past.archived], ['past_deadline', undefined, false]);
    // Reaching it later still counts.
    const late = goalStatus(goal, input({ bodyweight: [weighIn('2026-11-05', 80)], today: '2026-11-06' }));
    assert.deepEqual([late.reached, late.pace], [true, undefined]);
  });
});

describe('form goals', () => {
  const rep = (angles: RepMetrics['angles'], confidence: RepMetrics['confidence'] = 'high'): RepMetrics => ({ index: 0, durationSec: 2, confidence, angles, romDeg: 90, partial: false });
  const report = (id: string, day: ISODate, reps: RepMetrics[], status: FormReport['status'] = 'ready'): FormReport => ({
    id,
    recordingId: `rec_${id}`,
    sessionId: 'sess',
    setId: `set_${id}`,
    exerciseId: 'ex_back_squat',
    family: 'squat',
    status,
    modelVersion: 'test',
    ruleVersion: 'test',
    primaryJoint: 'knee',
    quality: { framing: 'good', warnings: [] },
    detectedReps: reps.length,
    reps,
    observations: [],
    hasReplay: false,
    createdAt: at(day, 18),
    updatedAt: at(day, 18),
  });
  const knee = (deg: number) => rep({ knee: { minDeg: deg, maxDeg: 170 } });

  test('current is the newest report with a trusted angle for the joint', () => {
    const goal = formGoal('2026-09-01', 70, 83);
    const formReports = [
      report('r1', '2026-08-20', [knee(83)]),
      report('r2', '2026-09-10', [knee(76)]),
      report('r3', '2026-09-20', [rep({ hip: { minDeg: 60, maxDeg: 170 } })]), // no knee angle
      report('r4', '2026-09-25', [rep({ knee: { minDeg: 60, maxDeg: 170 } }, 'low')]), // not trusted
      report('r5', '2026-09-28', [knee(60)], 'processing'),
    ];
    const status = goalStatus(goal, input({ formReports }));
    assert.deepEqual([status.current, status.start, status.reached], [76, 83, false]);
    assert.equal(status.fraction, 7 / 13);
    assert.equal(latestFormAngle(formReports, 'ex_back_squat', 'knee')?.report.id, 'r2');
  });

  test('reached by the first report since the goal that meets it, in whole degrees', () => {
    const goal = formGoal('2026-09-01', 70, 83);
    const formReports = [report('r1', '2026-08-20', [knee(68)]), report('r2', '2026-09-10', [knee(70.4)]), report('r3', '2026-09-20', [knee(76)])];
    const status = goalStatus(goal, input({ formReports }));
    assert.deepEqual([status.reached, status.reachedDate, status.current, status.fraction], [true, '2026-09-10', 76, 1]);
    assert.deepEqual(status.reachedBy, { formReportId: 'r2' });
  });

  test('knee and hip goals aim deeper and ankle goals higher, whatever start was saved (G3.10 review)', () => {
    // A knee target above the latest recording: still reached by going deeper, never by going shallower.
    const knees = formGoal('2026-09-01', 70, 65);
    const shallower = goalStatus(knees, input({ formReports: [report('r1', '2026-09-10', [knee(78)])] }));
    assert.deepEqual([shallower.reached, shallower.fraction], [false, 0]);
    const deeper = goalStatus(knees, input({ formReports: [report('r1', '2026-09-10', [knee(62)])] }));
    assert.deepEqual([deeper.reached, deeper.reachedDate], [true, '2026-09-10']);

    // Calf raises: a larger ankle angle is a higher raise, as the form report compares them.
    const ankle = (deg: number) => rep({ ankle: { minDeg: deg, maxDeg: 150 } });
    const raise: FormGoal = { ...formGoal('2026-09-01', 125, 120), joint: 'ankle' };
    const lower = goalStatus(raise, input({ formReports: [report('a1', '2026-09-10', [ankle(118)])] }));
    assert.deepEqual([lower.reached, lower.fraction], [false, 0]);
    const partway = goalStatus(raise, input({ formReports: [report('a1', '2026-09-10', [ankle(123)])] }));
    assert.deepEqual([partway.reached, partway.fraction], [false, 0.6]);
    const higher = goalStatus(raise, input({ formReports: [report('a1', '2026-09-10', [ankle(124.6)])] }));
    assert.equal(higher.reached, true);
  });

  test('saved without a recording, the first recording after the goal is its start: no progress or pace until then (G3.10 review)', () => {
    const { startDeg: _none, ...goal } = { ...formGoal('2026-09-01', 70, 0), deadline: '2026-09-29' };
    const before = report('r0', '2026-08-20', [knee(90)]); // before the goal was set: not its start
    const none = goalStatus(goal, input({ formReports: [before], today: '2026-09-03' }));
    assert.deepEqual([none.start, none.current, none.fraction, none.reached], [undefined, 90, 0, false]);
    const first = goalStatus(goal, input({ formReports: [before, report('r1', '2026-09-05', [knee(85)])], today: '2026-09-05' }));
    assert.deepEqual([first.start, first.current, first.fraction], [85, 85, 0]);
    const later = goalStatus(goal, input({ formReports: [before, report('r1', '2026-09-05', [knee(85)]), report('r2', '2026-09-12', [knee(79)])], today: '2026-09-12' }));
    assert.deepEqual([later.start, later.current, later.fraction, later.pace], [85, 79, 0.4, 'on_track']);
    // A first recording that already meets the target reaches it.
    const met = goalStatus(goal, input({ formReports: [report('r1', '2026-09-05', [knee(69)])] }));
    assert.deepEqual([met.reached, met.reachedDate, met.fraction], [true, '2026-09-05', 1]);
  });

  test("formTrend leaves out a recording with no trusted angle, so it's never a 0° point (spec 2.8)", () => {
    const formReports = [
      report('r3', '2026-11-03', [knee(75.5)]),
      report('r1', '2026-10-20', [knee(81)]),
      report('r2', '2026-10-27', [rep({ knee: { minDeg: 60, maxDeg: 170 } }, 'low')]), // the camera wasn't sure
      report('r4', '2026-11-04', [knee(70)], 'processing'),
      { ...report('other', '2026-10-30', [knee(90)]), exerciseId: 'ex_front_squat' },
    ];
    assert.deepEqual(formTrend(formReports, 'ex_back_squat', 'knee'), [
      { date: '2026-10-20', value: 81 },
      { date: '2026-11-03', value: 75.5 },
    ]);
    assert.deepEqual(formTrend(formReports, 'ex_back_squat', 'hip'), [], 'no hip angle in any of them');
  });

  test('formGainDeg: deeper knees and hips, a higher ankle, in whole degrees (G3.10 review)', () => {
    const a = report('a', '2026-09-01', [rep({ knee: { minDeg: 90.4, maxDeg: 170 }, ankle: { minDeg: 100, maxDeg: 150 } })]);
    const b = report('b', '2026-09-08', [rep({ knee: { minDeg: 84.6, maxDeg: 170 }, ankle: { minDeg: 90, maxDeg: 150 } })]);
    assert.equal(formGainDeg(a, b, 'knee'), 5);
    assert.equal(formGainDeg(a, b, 'ankle'), -10, 'a lower calf raise is worse');
    assert.equal(formGainDeg(b, a, 'ankle'), 10);
    assert.equal(formGainDeg(a, b, 'hip'), undefined);
  });
});

describe('the goal form (G3.10 review)', () => {
  const pullUp = exercisesById.get('ex_pull_up')!;
  const benchPress = exercisesById.get('ex_bench_press')!;

  test('bodyweight exercises take weight × reps, but an existing e1RM goal on the same exercise stays e1RM', () => {
    assert.ok(pullUp.isBodyweight);
    const legacy = liftGoal('2026-09-01', { kind: 'e1rm', loadKg: 110 }, 'ex_pull_up');
    assert.equal(liftGoalFormKind('e1rm', pullUp, legacy), 'e1rm', 'editing it (only the deadline, say) keeps it an e1RM goal');
    assert.equal(liftGoalFormKind('load_reps', pullUp, legacy), 'load_reps');
    assert.equal(liftGoalFormKind('e1rm', pullUp), 'load_reps', 'not offered for a new goal');
    assert.equal(liftGoalFormKind('e1rm', exercisesById.get('ex_wide_grip_pull_up')!, legacy), 'load_reps', 'nor when it moves to another exercise');
    assert.equal(liftGoalFormKind('e1rm', pullUp, liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 10, reps: 5 }, 'ex_pull_up')), 'load_reps');
    assert.equal(liftGoalFormKind('e1rm', benchPress), 'e1rm');
  });

  test('an edit starts a goal over when it measures something else: another type, exercise or joint, or a new weekly deadline', () => {
    const lift = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 100, reps: 5 });
    assert.equal(goalEditStartsOver(undefined, { type: 'lift', exerciseId: 'ex_bench_press' }, false), true);
    assert.equal(goalEditStartsOver(lift, { type: 'lift', exerciseId: 'ex_bench_press' }, false), false, 'a new target or reps keeps it');
    assert.equal(goalEditStartsOver(lift, { type: 'lift', exerciseId: 'ex_back_squat' }, false), true);
    assert.equal(goalEditStartsOver(lift, { type: 'bodyweight' }, false), true);
    const depth = formGoal('2026-08-01', 70, 83);
    assert.equal(goalEditStartsOver(depth, { type: 'form', exerciseId: 'ex_back_squat', joint: 'knee' }, false), false);
    assert.equal(goalEditStartsOver(depth, { type: 'form', exerciseId: 'ex_back_squat', joint: 'hip' }, false), true);
    assert.equal(goalEditStartsOver(depth, { type: 'form', exerciseId: 'ex_front_squat', joint: 'knee' }, false), true);
    const weekly = weeklyGoal('2026-09-01', 4, '2026-10-27');
    assert.equal(goalEditStartsOver(weekly, { type: 'frequency' }, false), false);
    assert.equal(goalEditStartsOver(weekly, { type: 'frequency' }, true), true);
  });

  test('a form goal moved to another joint starts over, so an old report can no longer reach it and archive it at once', () => {
    // Set Aug 1 on the knee; on Oct 27 moved to the hip with a 60° target. A Sep 1 hip angle of 58° met it.
    const hip = (deg: number) => ({ index: 0, durationSec: 2, confidence: 'high' as const, angles: { hip: { minDeg: deg, maxDeg: 170 } }, romDeg: 90, partial: false });
    const reportOn = (id: string, day: ISODate, deg: number): FormReport => ({
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
      reps: [hip(deg)],
      observations: [],
      hasReplay: false,
      createdAt: at(day, 18),
      updatedAt: at(day, 18),
    });
    const formReports = [reportOn('r1', '2026-09-01', 58), reportOn('r2', '2026-10-20', 70)];
    const original = formGoal('2026-08-01', 70, 83);
    const subject = { type: 'form' as const, exerciseId: 'ex_back_squat', joint: 'hip' as const };
    const now = at(TODAY, 15);
    const edited: FormGoal = { ...original, joint: 'hip', targetDeg: 60, startDeg: 70, createdAt: goalEditStartsOver(original, subject, false) ? now : original.createdAt, updatedAt: now };
    const status = goalStatus(edited, input({ formReports }));
    assert.deepEqual([status.reached, status.archived, status.fraction], [false, false, 0]);
  });
});

describe('pace (G3.10 review 3)', () => {
  const kneeReport = (id: string, day: ISODate, deg: number, hour = 18): FormReport => ({
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
    reps: [{ index: 0, durationSec: 2, confidence: 'high', angles: { knee: { minDeg: deg, maxDeg: 170 } }, romDeg: 90, partial: false }],
    observations: [],
    hasReplay: false,
    createdAt: at(day, hour),
    updatedAt: at(day, hour),
  });
  const brief = (s: ReturnType<typeof goalStatus>) => ({ start: s.start, fraction: s.fraction, pace: s.pace, daysLeft: s.daysLeft });

  test('a goal with no start yet has no pace, only days left; once it has one, pace runs as before', () => {
    // Set Oct 27 with an 8-week deadline; two weeks in.
    const deadline = '2026-12-22';
    const today = '2026-11-10';
    const { startDeg: _none, ...depth } = { ...formGoal(TODAY, 70, 0), deadline };
    assert.deepEqual(brief(goalStatus(depth, input({ today }))), { start: undefined, fraction: 0, pace: undefined, daysLeft: 43 }, 'form: no recording since it was set');
    const weight = weightGoal(TODAY, 80, undefined, deadline);
    assert.deepEqual(brief(goalStatus(weight, input({ today }))), { start: undefined, fraction: 0, pace: undefined, daysLeft: 43 }, 'bodyweight: no weigh-in yet');
    const lift = liftGoal(TODAY, { kind: 'load_reps', loadKg: 105, reps: 5 }, 'ex_bench_press', deadline);
    assert.deepEqual(brief(goalStatus(lift, input({ today }))), { start: undefined, fraction: 0, pace: undefined, daysLeft: 43 }, 'lift: nothing logged before or since');
    assert.ok([depth, weight, lift].every((g) => goalAwaitsStart(g, goalStatus(g, input({ today }))) === true));

    // A baseline in the 12 weeks before is a start: pace runs from when the goal was set.
    const withBaseline = goalStatus(lift, input({ sessions: [bench('2026-10-01', [95, 5])], today }));
    assert.deepEqual(brief(withBaseline), { start: 95, fraction: 0, pace: 'behind', daysLeft: 43 });
    // The first recording since the goal was set is the start: pace as before, from the day the goal was set.
    const recorded = goalStatus(depth, input({ formReports: [kneeReport('r1', '2026-11-09', 85)], today }));
    assert.deepEqual(brief(recorded), { start: 85, fraction: 0, pace: 'behind', daysLeft: 43 });
    // Past the deadline, the neutral tag still shows.
    assert.equal(goalStatus(depth, input({ today: '2026-12-23' })).pace, 'past_deadline');
    // Weekly goals always have a start.
    const weekly = weeklyGoal(TODAY, 3, deadline);
    assert.equal(goalAwaitsStart(weekly, goalStatus(weekly, input({ today }))), false);
  });

  test('a deadline added later: pace runs from then, from the progress the goal had then', () => {
    // Set Aug 1 from a 95 baseline toward 105: 100 by Sep 15 is halfway. On Oct 27 at 9 am an
    // 8-week deadline is added.
    const sessions = [bench('2026-07-20', [95, 5]), bench('2026-09-15', [100, 5])];
    const old = liftGoal('2026-08-01', { kind: 'load_reps', loadKg: 105, reps: 5 }, 'ex_bench_press', '2026-12-22');
    const goal: LiftGoal = { ...old, deadlineSetAt: at(TODAY, 9) };
    const now = goalStatus(goal, input({ sessions }));
    assert.deepEqual([now.fraction, now.pace, now.daysLeft], [0.5, 'on_track', 57], 'on track the day it was added');
    assert.equal(goalStatus(old, input({ sessions })).pace, 'behind', 'without deadlineSetAt (older goals) the line runs from the set date');

    // Four weeks later, halfway to the deadline: the line is at 75%.
    const later = '2026-11-24';
    assert.equal(goalStatus(goal, input({ sessions, today: later })).pace, 'behind', 'still 50%');
    assert.equal(goalStatus(goal, input({ sessions: [...sessions, bench('2026-11-20', [102.5, 5])], today: later })).pace, 'on_track', '75%');
    // A workout after the deadline was added counts as progress, not as where the line starts.
    const sameDay = [...sessions, workout(TODAY, 'ex_bench_press', [set({ loadKg: 102.5, reps: 5 })], 15)];
    assert.deepEqual(
      [goalStatus(goal, input({ sessions: sameDay })).fraction, goalStatus(goal, input({ sessions: sameDay, today: '2026-11-17' })).pace],
      [0.75, 'on_track'],
    );
    // A deadlineSetAt at or before the set date is the set date.
    assert.equal(goalStatus({ ...old, deadlineSetAt: at('2026-07-01') }, input({ sessions })).pace, 'behind');
  });

  test('bodyweight and form goals: progress at the moment the deadline was added, from the history then', () => {
    // From 90 toward 80; 85 on Oct 1 is halfway. A deadline is added Oct 27 at noon; that evening's
    // weigh-in of 86 drops progress to 40%, below the line that starts at 50%.
    const weight: BodyweightGoal = { ...weightGoal('2026-09-01', 80, 90, '2026-11-24'), deadlineSetAt: at(TODAY, 12) };
    const evening: BodyweightEntry = { ...weighIn(TODAY, 86), id: 'bw_evening', createdAt: at(TODAY, 20), updatedAt: at(TODAY, 20) };
    const morning: BodyweightEntry = { ...weighIn(TODAY, 86), id: 'bw_morning' };
    assert.deepEqual([goalStatus(weight, input({ bodyweight: [weighIn('2026-10-01', 85)] })).pace], ['on_track']);
    assert.deepEqual([goalStatus(weight, input({ bodyweight: [weighIn('2026-10-01', 85), evening] })).fraction, goalStatus(weight, input({ bodyweight: [weighIn('2026-10-01', 85), evening] })).pace], [0.4, 'behind']);
    // The same weigh-in at 7 am was already in when the deadline was added: the line starts at 40%.
    assert.equal(goalStatus(weight, input({ bodyweight: [weighIn('2026-10-01', 85), morning] })).pace, 'on_track');

    // Form: 85° → 70°; 79° by Sep 12 is 40% of the way. A deadline added Oct 27 starts the line there.
    const depth: FormGoal = { ...formGoal('2026-09-01', 70, 85), deadline: '2026-11-24', deadlineSetAt: at(TODAY, 9) };
    const formReports = [kneeReport('r1', '2026-09-12', 79)];
    assert.deepEqual([goalStatus(depth, input({ formReports })).pace, goalStatus({ ...depth, deadlineSetAt: undefined }, input({ formReports })).pace], ['on_track', 'behind']);
    assert.equal(goalStatus(depth, input({ formReports, today: '2026-11-10' })).pace, 'behind', 'two weeks on with no new recording');
    // Halfway to the deadline the line is at 70%: 74° is 73%.
    assert.equal(goalStatus(depth, input({ formReports: [...formReports, kneeReport('r2', '2026-11-09', 74)], today: '2026-11-10' })).pace, 'on_track');
  });

  test('the goal form records when a deadline is added or changed, and only then', () => {
    const now = at(TODAY, 15);
    const lift = liftGoal('2026-08-01', { kind: 'load_reps', loadKg: 105, reps: 5 });
    assert.equal(goalDeadlineSetAt(lift, false, '2026-12-22', now), now, 'added');
    const dated: LiftGoal = { ...lift, deadline: '2026-11-24', deadlineSetAt: at('2026-10-01') };
    assert.equal(goalDeadlineSetAt(dated, false, '2026-12-22', now), now, 'changed');
    assert.equal(goalDeadlineSetAt(dated, false, '2026-11-24', now), at('2026-10-01'), 'kept: untouched');
    assert.equal(goalDeadlineSetAt({ ...dated, deadlineSetAt: undefined }, false, '2026-11-24', now), undefined, 'kept on an older goal: still from its set date');
    assert.equal(goalDeadlineSetAt(dated, false, undefined, now), undefined, 'removed');
    assert.equal(goalDeadlineSetAt(undefined, true, '2026-12-22', now), undefined, 'a new goal is set now anyway');
    assert.equal(goalDeadlineSetAt(dated, true, '2026-12-22', now), undefined, 'a goal that starts over is set now anyway');
  });
});

describe('weekly goal target for the streak', () => {
  const workouts = (days: ISODate[]) => days.map((d) => bench(d, [60, 5]));

  test('the newest weekly goal wins, skipping archived ones', () => {
    const plain = { ...weeklyGoal('2026-09-01', 3), updatedAt: at('2026-09-01') };
    const withDeadline = { ...weeklyGoal('2026-09-07', 1, '2026-09-21'), updatedAt: at('2026-09-07', 13) };
    const sessions = workouts(['2026-09-08', '2026-09-10']); // 2 of 2: reached Sep 10
    const goals = [plain, withDeadline, liftGoal('2026-09-20', { kind: 'e1rm', loadKg: 100 })];
    assert.equal(weeklyGoalTarget(goals, { sessions, today: '2026-09-16' }), 1);
    assert.equal(weeklyGoalTarget(goals, { sessions, today: '2026-09-17' }), 3);
    // Past its deadline but never reached, it still sets the target.
    assert.equal(weeklyGoalTarget(goals, { sessions: sessions.slice(0, 1), today: '2026-10-27' }), 1);
  });

  test('goals set after the day asked about are ignored', () => {
    const goals = [weeklyGoal('2026-09-01', 3), { ...weeklyGoal('2026-10-01', 5), updatedAt: at('2026-10-01', 13) }];
    assert.equal(weeklyGoalTarget(goals, { sessions: [], today: '2026-09-27' }), 3);
    assert.equal(weeklyGoalTarget(goals, { sessions: [], today: '2026-10-04' }), 5);
    assert.equal(weeklyGoalTarget([liftGoal('2026-09-01', { kind: 'e1rm', loadKg: 100 })], { sessions: [], today: TODAY }), undefined);
  });
});

describe('celebrations', () => {
  test('a workout, weigh-in, or report finds the goals it reached', () => {
    const lift = liftGoal('2026-09-01', { kind: 'load_reps', loadKg: 100, reps: 5 });
    const weekly = weeklyGoal('2026-09-01', 1, '2026-09-15'); // 2 workouts
    const weight = weightGoal('2026-09-01', 80, 85);
    const first = bench('2026-09-05', [90, 5]);
    const second = bench('2026-09-10', [100, 5]);
    const third = bench('2026-09-12', [102, 5]);
    const data = input({ sessions: [first, second, third], bodyweight: [weighIn('2026-09-11', 80)] });
    const goals = [lift, weekly, weight];
    assert.deepEqual(goalsReachedBySession(goals, second.id, data).map((g) => g.id), [lift.id, weekly.id]);
    assert.deepEqual(goalsReachedBySession(goals, third.id, data), []);
    assert.deepEqual(goalsReachedByWeighIn(goals, 'bw_2026-09-11', data).map((g) => g.id), [weight.id]);
    assert.deepEqual(goalsReachedByReport(goals, 'r1', data), []);
  });
});
