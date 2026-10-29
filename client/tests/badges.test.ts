import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BADGE_CATALOG, badgeEarnedText, badgeProgress, badgeState, badgeText, deriveBadges, holdsPlanned, nextUpBadges, type BadgeInput } from '../src/data/badges';
import { builtinExercises } from '../src/data/content';
import { addDays } from '../src/data/dates';
import { fixedFromPattern, scheduleOccurrences, weeklyFromPattern } from '../src/data/schedule';
import type { BodyweightEntry, FormReport, Joint, LoggedSet, PersonalRecord, Plan, ScheduledOccurrence, SessionExercise, Weekday, WorkoutSession } from '../src/data/types';
import { lbToKg } from '../src/data/units';
import { buildWins } from '../src/features/home/wins';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));

let nextId = 0;
const uid = (prefix: string) => `${prefix}${nextId++}`;
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: uid('set'), kind: 'normal', modifiers: [], reps: 5, completedAt: '2026-01-01T10:00:00Z', ...patch });
const lift = (exerciseId: string, ...sets: LoggedSet[]): SessionExercise => ({ id: uid('entry'), exerciseId, skipped: false, sets });
const lb = (n: number) => set({ loadKg: lbToKg(n), reps: 1 });
const kg = (n: number) => set({ loadKg: n, reps: 1 });
const workout = (day: string, exercises: SessionExercise[] = [lift('ex_leg_press', kg(50))], patch: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: uid(`sess_${day}_`),
  name: 'Workout',
  status: 'completed',
  completion: 'full',
  completedDate: day,
  startedAt: `${day}T09:00:00Z`,
  completedAt: `${day}T10:00:00Z`,
  blocks: [{ id: 'b', type: 'single', exercises }],
  createdAt: `${day}T09:00:00Z`,
  updatedAt: `${day}T10:00:00Z`,
  ...patch,
});

/** Monday, Jan 5 2026, plus `n` days. */
const day = (n: number) => addDays('2026-01-05', n);

const input = (patch: Partial<BadgeInput> = {}): BadgeInput => ({
  sessions: [],
  exercisesById,
  formReports: [],
  records: [],
  streak: { currentWeeks: 0, milestoneDates: [] },
  occurrences: [],
  plans: [],
  planVersions: [],
  bodyweight: [],
  units: 'imperial',
  weekStartsOn: 1,
  today: '2026-10-27',
  ...patch,
});
const earnedOn = (data: BadgeInput, key: string) => deriveBadges(data).find((b) => b.badgeKey === key)?.earnedDate;
const progressOf = (data: BadgeInput, key: string) => badgeProgress(data).find((b) => b.badgeKey === key);
const nextKeys = (data: BadgeInput, limit = 50) => nextUpBadges(data, limit).map((b) => b.badgeKey);

const weighIn = (date: string, weightKg: number): BodyweightEntry => ({ id: uid('bw'), date, weightKg, createdAt: `${date}T08:00:00Z`, updatedAt: `${date}T08:00:00Z` });
const record = (date: string): PersonalRecord => ({ id: uid('pr'), exerciseId: 'ex_bench_press', type: 'heaviest_weight', value: 100, sessionId: 's', setId: uid('set'), achievedDate: date, previousValue: 95 });

const FAMILY_EXERCISE = { squat: 'ex_back_squat', deadlift: 'ex_deadlift', lunge: 'ex_reverse_lunge', calf_raise: 'ex_standing_calf_raise' } as const;
const report = (exerciseId: string, at: string, angle?: number, patch: Partial<FormReport> = {}): FormReport => {
  const joint: Joint = patch.primaryJoint ?? 'knee';
  return {
    id: uid('report'),
    recordingId: uid('rec'),
    sessionId: 'sess',
    setId: uid('set'),
    exerciseId,
    family: exercisesById.get(exerciseId)?.formAnalysis ?? 'squat',
    status: 'ready',
    modelVersion: 'test',
    ruleVersion: 'test',
    primaryJoint: joint,
    quality: { framing: 'good', warnings: [] },
    detectedReps: 1,
    reps: angle === undefined ? [] : [{ index: 0, durationSec: 2, confidence: 'high', angles: { [joint]: { minDeg: angle, maxDeg: 170 } }, romDeg: 170 - angle, partial: false }],
    observations: [],
    hasReplay: false,
    createdAt: at,
    updatedAt: at,
    ...patch,
  };
};
/** Noon UTC, the same local date in any time zone from UTC−11 to UTC+11. */
const noon = (date: string) => `${date}T12:00:00.000Z`;

const plan = (patch: Partial<Plan> = {}): Plan => ({
  id: 'plan_program',
  name: 'Program',
  version: 1,
  status: 'active',
  startDate: '2026-01-05',
  // 4 weeks, Monday and Thursday: 8 workouts, the last week starting Monday Jan 26.
  schedule: fixedFromPattern(4, { 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: [] }),
  workouts: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...patch,
});

/** Links occurrences to new workouts done on the given dates (the occurrence's own date by default). */
function doWorkouts(occurrences: ScheduledOccurrence[], doneOn: (string | undefined)[]): { occurrences: ScheduledOccurrence[]; sessions: WorkoutSession[] } {
  const sessions: WorkoutSession[] = [];
  const linked = occurrences.map((occ, i) => {
    const date = doneOn[i];
    if (!date) return occ;
    const session = workout(date, undefined, { occurrenceId: occ.id, planId: occ.planId });
    sessions.push(session);
    return { ...occ, sessionId: session.id };
  });
  return { occurrences: linked, sessions };
}

describe('badge catalog', () => {
  test('has about 50 badges with unique keys, each ladder in rising steps in both units', () => {
    assert.equal(BADGE_CATALOG.length, 50);
    assert.equal(new Set(BADGE_CATALOG.map((b) => b.key)).size, BADGE_CATALOG.length);
    const ladders = new Map<string, typeof BADGE_CATALOG[number][]>();
    for (const def of BADGE_CATALOG) ladders.set(def.ladder, [...(ladders.get(def.ladder) ?? []), def]);
    for (const [name, steps] of ladders) {
      assert.deepEqual(
        steps.map((s) => s.step),
        steps.map((_, i) => i + 1),
        name,
      );
      assert.ok(steps.every((s) => s.category === steps[0].category && s.measure.kind === steps[0].measure.kind), name);
      for (const units of ['imperial', 'metric'] as const) {
        const thresholds = steps.map((s) => badgeText(s, units).threshold);
        assert.ok(
          thresholds.every((t, i) => i === 0 || t > thresholds[i - 1]),
          `${name} rises in ${units}`,
        );
      }
    }
  });

  test('keeps the keys the app already uses', () => {
    const keys = new Set(BADGE_CATALOG.map((b) => b.key));
    for (const key of ['first_workout', 'workouts_25', 'workouts_50', 'squat_2_plate', 'deadlift_3_plate', 'streak_4_weeks', 'first_analysis']) assert.ok(keys.has(key), key);
  });

  test('titles and descriptions follow the unit', () => {
    const bench = BADGE_CATALOG.find((b) => b.key === 'bench_2_plate')!;
    assert.deepEqual(badgeText(bench, 'imperial'), { title: '2-Plate Bench', description: 'Bench 225 lb for a working set.', earned: 'Benched 225 lb for a working set.', threshold: 225 });
    assert.deepEqual(badgeText(bench, 'metric'), { title: '2-Plate Bench', description: 'Bench 100 kg for a working set.', earned: 'Benched 100 kg for a working set.', threshold: 100 });
    const volume = BADGE_CATALOG.find((b) => b.key === 'volume_2')!;
    assert.deepEqual(badgeText(volume, 'imperial'), { title: 'Quarter Million', description: 'Lift 250,000 lb of total volume.', earned: 'Lifted 250,000 lb of total volume.', threshold: 250_000 });
    assert.deepEqual(badgeText(volume, 'metric'), { title: '100K Club', description: 'Lift 100,000 kg of total volume.', earned: 'Lifted 100,000 kg of total volume.', threshold: 100_000 });
    const ohp = BADGE_CATALOG.find((b) => b.key === 'ohp_1_plate')!;
    assert.equal(badgeText(ohp, 'imperial').description, 'Press 135 lb overhead for a working set.');
    const ratio = BADGE_CATALOG.find((b) => b.key === 'deadlift_bodyweight_2_5x')!;
    assert.deepEqual(badgeText(ratio, 'metric'), {
      title: '2.5× Bodyweight Deadlift',
      description: 'Deadlift 2.5× your bodyweight for a working set.',
      earned: 'Deadlifted 2.5× your bodyweight for a working set.',
      threshold: 2.5,
    });
  });

  test('every badge says how to earn it, and once earned, what was done', () => {
    for (const def of BADGE_CATALOG) {
      for (const units of ['imperial', 'metric'] as const) {
        const { description, earned } = badgeText(def, units);
        assert.match(description, /^[A-Z].*\.$/, `${def.key} description`);
        assert.match(earned, /^[A-Z].*\.$/, `${def.key} earned line`);
        assert.equal(badgeEarnedText(def.key, units), earned);
      }
    }
    assert.equal(badgeEarnedText('workouts_50', 'imperial'), 'Completed 50 workouts.');
    assert.equal(badgeEarnedText('depth_10', 'metric'), "Improved a lift's range of motion by 10° over your first recording of it.");
    assert.equal(badgeEarnedText('no_such_badge', 'metric'), undefined);
  });
});

describe('milestone badges', () => {
  test('workout badges are dated by the 1st and 10th workout that counts', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => workout(day(i)));
    // Neither counts: only warm-ups done, and a workout still in progress.
    sessions.push(workout(day(3), [lift('ex_leg_press', set({ kind: 'warmup', loadKg: 20 }))]));
    sessions.push(workout(day(4), undefined, { status: 'in_progress', completedDate: undefined, completedAt: undefined }));
    const data = input({ sessions });
    assert.equal(earnedOn(data, 'first_workout'), day(0));
    assert.equal(earnedOn(data, 'workouts_10'), day(9));
    assert.equal(earnedOn(data, 'workouts_25'), undefined);
    assert.equal(progressOf(data, 'workouts_25')?.progressLabel, '10 / 25 workouts');
  });

  test('volume thresholds are round numbers in the user unit, under one key', () => {
    // 10,000 lb a workout: 200 lb × 10 reps × 5 sets.
    const tenK = () => lift('ex_leg_press', ...Array.from({ length: 5 }, () => set({ loadKg: lbToKg(200), reps: 10 })));
    const sessions = Array.from({ length: 12 }, (_, i) => workout(day(i), [tenK()]));
    // 100,000 lb on the 10th workout.
    assert.equal(earnedOn(input({ sessions }), 'volume_1'), day(9));
    assert.equal(deriveBadges(input({ sessions })).find((b) => b.badgeKey === 'volume_1')?.title, '100K Club');
    // 50,000 kg (110,231 lb) on the 12th.
    const metric = input({ sessions, units: 'metric' });
    assert.equal(earnedOn(metric, 'volume_1'), day(11));
    assert.equal(deriveBadges(metric).find((b) => b.badgeKey === 'volume_1')?.title, '50K Club');
    assert.equal(progressOf(input({ sessions }), 'volume_2')?.progressLabel, '120k / 250k lb');
  });
});

describe('strength badges', () => {
  test('plate badges are dated by the first working set at the weight', () => {
    const data = input({
      sessions: [
        workout(day(0), [lift('ex_bench_press', lb(135))]),
        workout(day(7), [lift('ex_bench_press', lb(205))]),
        workout(day(14), [lift('ex_bench_press', lb(225))]),
        workout(day(21), [lift('ex_bench_press', lb(230))]),
      ],
    });
    assert.equal(earnedOn(data, 'bench_1_plate'), day(0));
    assert.equal(earnedOn(data, 'bench_2_plate'), day(14));
    assert.equal(earnedOn(data, 'bench_3_plate'), undefined);
    assert.equal(progressOf(data, 'bench_3_plate')?.progressLabel, '230 / 315 lb');
  });

  test('plate thresholds are 45 lb plates in lb and 20 kg plates in kg', () => {
    const data = input({ sessions: [workout(day(0), [lift('ex_back_squat', kg(100)), lift('ex_deadlift', kg(140)), lift('ex_overhead_press', kg(60))])] });
    // 100 kg is 220.5 lb: two plates in kg, one in lb.
    assert.equal(earnedOn({ ...data, units: 'metric' }, 'squat_2_plate'), day(0));
    assert.equal(earnedOn(data, 'squat_2_plate'), undefined);
    assert.equal(earnedOn(data, 'squat_1_plate'), day(0));
    // 140 kg (308.6 lb) is three plates in kg, two in lb.
    assert.equal(earnedOn({ ...data, units: 'metric' }, 'deadlift_3_plate'), day(0));
    assert.equal(earnedOn(data, 'deadlift_3_plate'), undefined);
    assert.equal(earnedOn(data, 'deadlift_2_plate'), day(0));
    assert.equal(earnedOn({ ...data, units: 'metric' }, 'ohp_1_plate'), day(0));
    assert.equal(earnedOn(data, 'ohp_1_plate'), undefined);
    assert.equal(progressOf({ ...data, units: 'metric' }, 'squat_3_plate')?.progressLabel, '100 / 140 kg');
  });

  test('weights within 0.05 kg are the same weight', () => {
    const data = input({ sessions: [workout(day(0), [lift('ex_back_squat', set({ loadKg: lbToKg(225) - 0.04, reps: 1 }))])] });
    assert.equal(earnedOn(data, 'squat_2_plate'), day(0));
    const short = input({ sessions: [workout(day(0), [lift('ex_back_squat', set({ loadKg: lbToKg(225) - 0.1, reps: 1 }))])] });
    assert.equal(earnedOn(short, 'squat_2_plate'), undefined);
    assert.equal(progressOf(short, 'squat_2_plate')?.progressLabel, '224.7 / 225 lb');
  });

  test('only sets that count for PRs earn strength badges', () => {
    const data = input({
      sessions: [
        workout(day(0), [
          lift(
            'ex_back_squat',
            set({ kind: 'warmup', loadKg: lbToKg(315), reps: 1 }),
            set({ loadKg: lbToKg(315), reps: 1, modifiers: ['lengthened_partials'] }),
            set({ loadKg: lbToKg(315), reps: 1, completedAt: undefined }),
            set({ loadKg: lbToKg(315), reps: 0 }),
            lb(135),
          ),
        ]),
      ],
    });
    assert.equal(earnedOn(data, 'squat_1_plate'), day(0));
    assert.equal(earnedOn(data, 'squat_2_plate'), undefined);
  });

  test('bodyweight ratios use the latest weigh-in on or before the workout', () => {
    const bodyweight = [weighIn(day(0), 80), weighIn(day(20), 70)];
    const data = input({
      bodyweight,
      sessions: [
        // 105 / 80 = 1.31: the later 70 kg weigh-in doesn't count yet.
        workout(day(10), [lift('ex_bench_press', kg(105))]),
        // A weigh-in that morning counts: 105 / 70 = 1.5.
        workout(day(20), [lift('ex_bench_press', kg(105))]),
      ],
    });
    assert.equal(earnedOn(data, 'bench_bodyweight_1x'), day(10));
    assert.equal(earnedOn(data, 'bench_bodyweight_1_5x'), day(20));
    const before = input({ bodyweight, sessions: data.sessions.slice(0, 1) });
    assert.equal(progressOf(before, 'bench_bodyweight_1_5x')?.progressLabel, '1.3× / 1.5× bodyweight');
  });

  test("a set's own bodyweight snapshot wins over a weigh-in", () => {
    // Logged with an 80 kg snapshot plus 40 kg: 120 / 80 = 1.5 (by the 100 kg weigh-in it'd be 1.2).
    const data = input({
      bodyweight: [weighIn(day(0), 100)],
      sessions: [workout(day(5), [lift('ex_back_squat', set({ bodyweightSnapshotKg: 80, addedLoadKg: 40, reps: 1 }))])],
    });
    assert.equal(earnedOn(data, 'squat_bodyweight_1_5x'), day(5));
  });

  test('without any bodyweight, ratio badges are neither earned nor shown', () => {
    const data = input({ sessions: [workout(day(0), [lift('ex_back_squat', kg(250)), lift('ex_bench_press', kg(200)), lift('ex_deadlift', kg(300))])] });
    const ratioKeys = BADGE_CATALOG.filter((b) => b.measure.kind === 'ratio').map((b) => b.key);
    assert.ok(!deriveBadges(data).some((b) => ratioKeys.includes(b.badgeKey)));
    assert.ok(!nextKeys(data).some((k) => ratioKeys.includes(k)));
    // A weigh-in after the workout doesn't count either.
    assert.ok(!deriveBadges({ ...data, bodyweight: [weighIn(day(1), 80)] }).some((b) => ratioKeys.includes(b.badgeKey)));
  });

  test('PR badges are dated by the Nth record', () => {
    const records = Array.from({ length: 10 }, (_, i) => record(day(i)));
    assert.equal(earnedOn(input({ records }), 'prs_10'), day(9));
    const nine = input({ records: records.slice(0, 9) });
    assert.equal(earnedOn(nine, 'prs_10'), undefined);
    assert.equal(progressOf(nine, 'prs_10')?.progressLabel, '9 / 10 PRs');
  });
});

describe('consistency badges', () => {
  test('streak badges are dated by the day the streak first reached that length', () => {
    const milestoneDates = Array.from({ length: 9 }, (_, i) => day(i * 7));
    const data = input({ streak: { currentWeeks: 2, milestoneDates } });
    assert.equal(earnedOn(data, 'streak_4_weeks'), day(21));
    assert.equal(earnedOn(data, 'streak_8_weeks'), day(49));
    assert.equal(earnedOn(data, 'streak_12_weeks'), undefined);
    // Progress toward the next one is the current streak, not the longest.
    assert.equal(progressOf(data, 'streak_12_weeks')?.progressLabel, '2 / 12 weeks');
    assert.ok(!nextKeys({ ...data, streak: { currentWeeks: 0, milestoneDates } }).includes('streak_12_weeks'));
  });

  test('a perfect week is dated by the workout that completed its last planned one', () => {
    const weekly: Plan = plan({ id: 'plan_weekly', schedule: weeklyFromPattern({ 1: ['a'], 2: [], 3: ['b'], 4: [], 5: ['c'], 6: [], 7: [] }) });
    const occurrences = scheduleOccurrences(weekly, day(0), day(13));
    // Week 1: all three done, Friday's on Saturday. Week 2: Wednesday missed.
    const { occurrences: linked, sessions } = doWorkouts(occurrences, [day(0), day(2), day(5), day(7), undefined, day(11)]);
    const data = input({ occurrences: linked, sessions, plans: [weekly] });
    assert.equal(earnedOn(data, 'perfect_week'), day(5));
    assert.equal(earnedOn({ ...data, occurrences: linked.slice(3) }, 'perfect_week'), undefined);
  });

  test('a workout that does not count leaves its planned day undone', () => {
    const weekly: Plan = plan({ id: 'plan_weekly', schedule: weeklyFromPattern({ 1: ['a'], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }) });
    const [occ] = scheduleOccurrences(weekly, day(0), day(6));
    const warmupsOnly = workout(day(0), [lift('ex_leg_press', set({ kind: 'warmup', loadKg: 20 }))]);
    const data = input({ occurrences: [{ ...occ, sessionId: warmupsOnly.id }], sessions: [warmupsOnly] });
    assert.equal(earnedOn(data, 'perfect_week'), undefined);
  });

  test("a finished week's stored planned count holds even before the first counted workout (G3.10 review)", () => {
    // Mon/Wed/Fri from Jan 5; nothing done that week. Friday's workout is done late, the next Monday, as
    // the user's first workout; then the plan is deleted, taking Monday's and Wednesday's misses with it.
    const weekly: Plan = plan({ id: 'plan_weekly', schedule: weeklyFromPattern({ 1: ['a'], 2: [], 3: ['b'], 4: [], 5: ['c'], 6: [], 7: [] }) });
    const [, , friday] = scheduleOccurrences(weekly, day(0), day(6));
    const { occurrences, sessions } = doWorkouts([friday], [day(7)]);
    // The streak lists weeks from the first counted workout only, so it has nothing for that week.
    const streak = { currentWeeks: 0, milestoneDates: [], weeks: [] };
    const data = input({ occurrences, sessions, planVersions: [weekly], streak, today: day(9) });
    assert.equal(earnedOn(data, 'perfect_week'), day(7), 'without the stored count, the week looks perfect');
    // The repository stores every finished week's planned count, from the first scheduled workout.
    assert.equal(earnedOn({ ...data, frozenWeeks: [{ weekStart: day(0), planned: 3 }] }, 'perfect_week'), undefined);
  });

  test('a stored week keeps Perfect Week to the workouts it planned: by id, else by date, else by count (G3.10 review 3b)', () => {
    // Thursday and Sunday, two plans on Sunday. The week was stored with Thursday and plan A's Sunday.
    const at = (date: string, planId: string): ScheduledOccurrence => ({ id: `occ_${planId}_${date}`, planId, planVersion: 1, planWorkoutId: 'w', scheduledDate: date });
    const thu = at(day(3), 'a');
    const sunA = at(day(6), 'a');
    const sunB = at(day(6), 'b');
    const stored = { weekStart: day(0), planned: 2, plannedDates: [day(3), day(6)], plannedIds: [thu.id, sunA.id] };
    assert.equal(holdsPlanned(stored, [thu, sunA]), true);
    assert.equal(holdsPlanned(stored, [thu, sunA, sunB]), true, 'one more moved in is fine (it must be done too)');
    // Plan A's Sunday is gone and B's moved in on the same day: same count and dates, different workout.
    assert.equal(holdsPlanned(stored, [thu, sunB]), false);
    assert.equal(holdsPlanned({ ...stored, plannedIds: undefined }, [thu, sunB]), true, 'a row with dates only matches by date');
    assert.equal(holdsPlanned({ ...stored, plannedIds: undefined }, [sunA, sunB]), false, 'Thursday is missing');
    assert.equal(holdsPlanned({ weekStart: day(0), planned: 2 }, [sunA, sunB]), true, 'a row with neither matches by count');
    assert.equal(holdsPlanned({ weekStart: day(0), planned: 2 }, [sunA]), false);
    // Thursday moved within the week (an undone push): still the workout planned there.
    assert.equal(holdsPlanned(stored, [{ ...thu, scheduledDate: day(1) }, sunA]), true);
    assert.equal(holdsPlanned(undefined, []), true, 'a week not stored yet');
  });

  test('weeks with nothing planned are never perfect', () => {
    const data = input({ sessions: Array.from({ length: 14 }, (_, i) => workout(day(i))) });
    assert.equal(earnedOn(data, 'perfect_week'), undefined);
    assert.ok(!nextKeys(data).includes('perfect_week'));
  });

  test('the current week earns it once all its planned workouts are done', () => {
    const today = '2026-10-27'; // Tuesday
    const weekly: Plan = plan({ id: 'plan_weekly', startDate: '2026-10-26', schedule: weeklyFromPattern({ 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: [] }) });
    const occurrences = scheduleOccurrences(weekly, '2026-10-26', '2026-11-01');
    const mondayOnly = doWorkouts(occurrences, ['2026-10-26']);
    const midweek = input({ ...mondayOnly, plans: [weekly], today });
    assert.equal(earnedOn(midweek, 'perfect_week'), undefined);
    assert.equal(nextUpBadges(midweek, 50).find((b) => b.badgeKey === 'perfect_week')?.progressLabel, '1 / 2 workouts this week');
    // Thursday's workout done early, today.
    const both = doWorkouts(occurrences, ['2026-10-26', today]);
    assert.equal(earnedOn(input({ ...both, plans: [weekly], today }), 'perfect_week'), today);
  });

  test('perfect weeks follow the week-start setting', () => {
    const weekly: Plan = plan({ id: 'plan_weekly', schedule: weeklyFromPattern({ 1: ['a'], 2: [], 3: [], 4: [], 5: [], 6: ['b'], 7: ['c'] }) });
    // Saturday Jan 10 done, Sunday Jan 11 missed, Monday Jan 12 done.
    const occurrences = scheduleOccurrences(weekly, '2026-01-10', '2026-01-12');
    const done = doWorkouts(occurrences, ['2026-01-10', undefined, '2026-01-12']);
    const data = input({ ...done, plans: [weekly] });
    // Monday weeks: Sat + Sun (missed), then Mon alone.
    assert.equal(earnedOn({ ...data, weekStartsOn: 1 as Weekday }, 'perfect_week'), '2026-01-12');
    // Sunday weeks: Sat alone, then Sun (missed) + Mon.
    assert.equal(earnedOn({ ...data, weekStartsOn: 7 as Weekday }, 'perfect_week'), '2026-01-10');
  });

  test('a program is finished at 3 in 4 of its workouts, only from its final week', () => {
    const program = plan();
    const occurrences = scheduleOccurrences(program, '2026-01-05', '2026-02-01');
    assert.equal(occurrences.length, 8);
    const dates = occurrences.map((o) => o.scheduledDate);
    // 5 done in the first three weeks, the 6th (3 in 4 of 8) on the final Monday.
    const finished = doWorkouts(occurrences, [dates[0], dates[1], dates[2], undefined, dates[4], dates[5], dates[6]]);
    assert.equal(earnedOn(input({ ...finished, plans: [program] }), 'program_finished'), '2026-01-26');
    // All 6 of the first three weeks done: not finished until a final-week workout.
    const early = doWorkouts(occurrences, dates.slice(0, 6));
    assert.equal(earnedOn(input({ ...early, plans: [program] }), 'program_finished'), undefined);
    assert.equal(progressOf(input({ ...early, plans: [program] }), 'program_finished')?.progressLabel, '6 / 8 program workouts');
    const thenFinal = doWorkouts(occurrences, [...dates.slice(0, 6), undefined, dates[7]]);
    assert.equal(earnedOn(input({ ...thenFinal, plans: [program] }), 'program_finished'), '2026-01-29');
    // 5 of 8 is short, final week or not.
    const short = doWorkouts(occurrences, [dates[0], undefined, dates[2], undefined, dates[4], undefined, dates[6], dates[7]]);
    assert.equal(earnedOn(input({ ...short, plans: [program] }), 'program_finished'), undefined);
  });

  test("a push moves the program's final week", () => {
    const program = plan();
    // Pushed 3 days from week 3 on: the final week starts Thursday Jan 29.
    const occurrences = scheduleOccurrences(program, '2026-01-05', '2026-02-01').map((o) =>
      o.scheduledDate >= '2026-01-19' ? { ...o, scheduledDate: addDays(o.scheduledDate, 3), shiftedFromDate: o.scheduledDate } : o,
    );
    const dates = occurrences.map((o) => o.scheduledDate);
    // Week 3's second workout (now Sunday Jan 25) done late, on Tuesday Jan 27: 6 of 8, but not the final week yet.
    const late = doWorkouts(occurrences, [dates[0], dates[1], dates[2], dates[3], dates[4], '2026-01-27']);
    assert.equal(earnedOn(input({ ...late, plans: [program] }), 'program_finished'), undefined);
    const final = doWorkouts(occurrences, [dates[0], dates[1], dates[2], dates[3], dates[4], '2026-01-27', dates[6]]);
    assert.equal(earnedOn(input({ ...final, plans: [program] }), 'program_finished'), '2026-01-29');
  });

  test('a deleted program still counts from its saved versions; weekly plans never finish', () => {
    const program = plan();
    const occurrences = scheduleOccurrences(program, '2026-01-05', '2026-02-01');
    const done = doWorkouts(occurrences, occurrences.map((o) => o.scheduledDate));
    assert.equal(earnedOn(input({ ...done, plans: [], planVersions: [program] }), 'program_finished'), '2026-01-26');
    const weekly = plan({ schedule: weeklyFromPattern({ 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: [] }) });
    assert.equal(earnedOn(input({ ...done, plans: [weekly] }), 'program_finished'), undefined);
  });

  test('weeks away with the app closed (nothing stored for them) still count toward the program (G3.10 review)', () => {
    // 20 weeks of Mon/Wed/Fri: 60 workouts. The calendar was filled through week 12; weeks 13-16 passed
    // with the app closed, so nothing was stored for them. Weeks 1-8 and 17-20 done: 36 of 60.
    const program = plan({ schedule: fixedFromPattern(20, { 1: ['a'], 2: [], 3: ['b'], 4: [], 5: ['c'], 6: [], 7: [] }) });
    const all = scheduleOccurrences(program, day(0), day(139));
    assert.equal(all.length, 60);
    const week = (o: ScheduledOccurrence) => Math.floor((Date.parse(o.scheduledDate) - Date.parse(day(0))) / (7 * 86400000)) + 1;
    const stored = all.filter((o) => week(o) <= 12 || week(o) >= 17);
    const done = doWorkouts(stored, stored.map((o) => (week(o) <= 8 || week(o) >= 17 ? o.scheduledDate : undefined)));
    const data = input({ ...done, plans: [program], planVersions: [program], today: day(139) });
    assert.equal(earnedOn(data, 'program_finished'), undefined, '36 of 60 is short of 3 in 4');
    assert.equal(progressOf(data, 'program_finished')?.progressLabel, '36 / 60 program workouts');
  });

  test("a day added to every week mid-program doesn't reach back to weeks before the edit (G3.10 review)", () => {
    // 12 weeks of Mon/Wed/Fri; on week 7's Monday, Tuesday is added to every week. Weeks 1-6 had 18
    // workouts and weeks 7-12 have 24: 42 in all, and 33 done is more than 3 in 4.
    const v1 = plan({ schedule: fixedFromPattern(12, { 1: ['a'], 2: [], 3: ['b'], 4: [], 5: ['c'], 6: [], 7: [] }), updatedAt: '2026-01-01T00:00:00Z' });
    const v2: Plan = { ...v1, version: 2, schedule: fixedFromPattern(12, { 1: ['a'], 2: ['d'], 3: ['b'], 4: [], 5: ['c'], 6: [], 7: [] }), updatedAt: `${day(42)}T08:00:00Z` };
    const stored = [...scheduleOccurrences(v1, day(0), day(41)), ...scheduleOccurrences(v2, day(42), day(83))];
    assert.equal(stored.length, 42);
    const doneFor = (keep: (i: number) => boolean) =>
      input({ ...doWorkouts(stored, stored.map((o, i) => (keep(i) ? o.scheduledDate : undefined))), plans: [v2], planVersions: [v1, v2], today: day(83) });
    assert.equal(progressOf(doneFor((i) => i < 30), 'program_finished')?.progressLabel, '30 / 42 program workouts');
    // 33 done, three of them in the final week.
    assert.equal(earnedOn(doneFor((i) => i < 30 || i >= 39), 'program_finished'), day(79));
  });

  test('a paused stretch of a program adds nothing to it (G3.10 review)', () => {
    // 12 weeks of Mon/Thu, paused for weeks 5-8: its workouts there were taken off the calendar.
    const v1 = plan({ schedule: fixedFromPattern(12, { 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: [] }), updatedAt: '2026-01-01T00:00:00Z' });
    const paused: Plan = { ...v1, version: 2, status: 'paused', updatedAt: `${day(28)}T08:00:00Z` };
    const resumed: Plan = { ...v1, version: 3, updatedAt: `${day(56)}T08:00:00Z` };
    const stored = [...scheduleOccurrences(v1, day(0), day(27)), ...scheduleOccurrences(resumed, day(56), day(83))];
    assert.equal(stored.length, 16);
    const data = input({ ...doWorkouts(stored, stored.map((o) => o.scheduledDate)), plans: [resumed], planVersions: [v1, paused, resumed], today: day(83) });
    assert.ok(earnedOn(data, 'program_finished'), '16 of the 16 workouts it had');
  });

  test("a program's progress counts the workouts not scheduled yet", () => {
    const program = plan();
    // Only the first two weeks are on the calendar so far.
    const occurrences = scheduleOccurrences(program, '2026-01-05', '2026-01-18');
    const done = doWorkouts(occurrences, occurrences.map((o) => o.scheduledDate));
    const data = input({ ...done, plans: [program], today: '2026-01-18' });
    assert.equal(nextUpBadges(data, 50).find((b) => b.badgeKey === 'program_finished')?.progressLabel, '4 / 8 program workouts');
    // A program that isn't running any more shows no progress.
    assert.ok(!nextKeys({ ...data, plans: [{ ...program, status: 'archived' }] }).includes('program_finished'));
  });
});

describe('form badges', () => {
  test('recording badges count ready reports, in total and per movement', () => {
    const reports = Array.from({ length: 10 }, (_, i) => report('ex_back_squat', noon(day(i)), 90));
    reports.push(report('ex_back_squat', noon(day(2)), 90, { status: 'processing' }), report('ex_back_squat', noon(day(3)), undefined, { status: 'failed' }));
    const data = input({ formReports: reports });
    assert.equal(earnedOn(data, 'first_analysis'), day(0));
    assert.equal(earnedOn(data, 'recordings_10'), day(9));
    assert.equal(earnedOn(data, 'form_squat_10'), day(9));
    assert.equal(earnedOn(data, 'form_deadlift_10'), undefined);
    assert.equal(progressOf(data, 'recordings_50')?.progressLabel, '10 / 50 recordings');
  });

  test('each movement family counts its own reports, by the exercise', () => {
    const reports = [
      ...Array.from({ length: 6 }, (_, i) => report(FAMILY_EXERCISE.squat, noon(day(i)), 90)),
      // The exercise decides the family, whatever the report says.
      ...Array.from({ length: 10 }, (_, i) => report(FAMILY_EXERCISE.deadlift, noon(day(i)), 60, { primaryJoint: 'hip', family: 'squat' })),
      ...Array.from({ length: 3 }, (_, i) => report(FAMILY_EXERCISE.lunge, noon(day(i)), 90)),
      ...Array.from({ length: 10 }, (_, i) => report(FAMILY_EXERCISE.calf_raise, noon(day(20 + i)), 70, { primaryJoint: 'ankle' })),
    ];
    const data = input({ formReports: reports });
    assert.equal(earnedOn(data, 'form_deadlift_10'), day(9));
    assert.equal(earnedOn(data, 'form_calf_raise_10'), day(29));
    assert.equal(earnedOn(data, 'form_squat_10'), undefined);
    assert.equal(progressOf(data, 'form_squat_10')?.progressLabel, '6 / 10 squat recordings');
    assert.equal(progressOf(data, 'form_lunge_10')?.progressLabel, '3 / 10 lunge recordings');
  });

  test("depth badges compare with the first recording of the lift, in whole degrees", () => {
    const reports = [
      report('ex_back_squat', noon(day(0)), 100.4),
      report('ex_back_squat', noon(day(1)), 96),
      // 100 → 95 once rounded: 5° deeper than the first.
      report('ex_back_squat', noon(day(2)), 95.4),
      report('ex_back_squat', noon(day(3)), 89.6),
    ];
    const data = input({ formReports: reports });
    assert.equal(earnedOn(data, 'depth_5'), day(2));
    assert.equal(earnedOn(data, 'depth_10'), day(3));
    const partway = input({ formReports: reports.slice(0, 2) });
    assert.equal(progressOf(partway, 'depth_5')?.progressLabel, '4° / 5° more range');
  });

  test('depth is measured per lift and joint, from trusted angles only', () => {
    const reports = [
      // No trusted reps: not a baseline.
      report('ex_back_squat', noon(day(0)), 120, { reps: [{ index: 0, durationSec: 2, confidence: 'low', angles: { knee: { minDeg: 120, maxDeg: 170 } }, romDeg: 50, partial: false }] }),
      report('ex_back_squat', noon(day(1)), 100),
      // A front squat has its own baseline, so it isn't 15° deeper than the back squat.
      report('ex_front_squat', noon(day(2)), 85),
      report('ex_front_squat', noon(day(3)), 84),
      report('ex_back_squat', noon(day(4)), 97),
    ];
    const data = input({ formReports: reports });
    assert.equal(earnedOn(data, 'depth_5'), undefined);
    assert.equal(progressOf(data, 'depth_5')?.current, 3);
  });

  test('a calf raise improves by a higher ankle angle, as the form report reads it (G3.10 review)', () => {
    const calf = (date: string, angle: number) => report('ex_standing_calf_raise', noon(date), angle, { primaryJoint: 'ankle' });
    const higher = input({ formReports: [calf(day(0), 90), calf(day(7), 100)] });
    assert.equal(earnedOn(higher, 'depth_5'), day(7));
    assert.equal(earnedOn(higher, 'depth_10'), day(7));
    const lower = input({ formReports: [calf(day(0), 100), calf(day(7), 90)] });
    assert.equal(earnedOn(lower, 'depth_5'), undefined);
    assert.ok(!nextKeys(lower).includes('depth_5'), 'no progress shown for a lower raise');
    const partway = input({ formReports: [calf(day(0), 100), calf(day(7), 103)] });
    assert.equal(progressOf(partway, 'depth_5')?.progressLabel, '3° / 5° more range');
    // Recent wins agree, and say "higher".
    const wins = (reports: FormReport[]) => buildWins({ records: [], formReports: reports, badges: [], exercisesById, units: 'imperial', today: day(9) }).filter((w) => w.kind === 'form');
    assert.deepEqual(
      wins(higher.formReports).map((w) => [w.title, w.detail]),
      [['Standing Calf Raise (Machine) · 10° higher', 'ankle angle 100° vs 90° last recording']],
    );
    assert.deepEqual(wins(lower.formReports), []);
  });

  test('depth uses the same 5° improvement as Recent wins', () => {
    for (const [before, after] of [
      [100.4, 95.6],
      [100.4, 95.4],
      [91, 86.2],
    ]) {
      const reports = [report('ex_back_squat', noon('2026-10-20'), before), report('ex_back_squat', noon('2026-10-21'), after)];
      const win = buildWins({ records: [], formReports: reports, badges: [], exercisesById, units: 'imperial', today: '2026-10-27' }).some((w) => w.kind === 'form');
      const badge = earnedOn(input({ formReports: reports }), 'depth_5') !== undefined;
      assert.equal(badge, win, `${before} → ${after}`);
    }
  });
});

describe('next up', () => {
  test("shows each ladder's lowest unearned step once there is progress, nearest first", () => {
    const sessions = [
      ...Array.from({ length: 40 }, (_, i) => workout(day(i))),
      workout(day(41), [lift('ex_back_squat', lb(205))]),
    ];
    const data = input({ sessions, records: Array.from({ length: 3 }, (_, i) => record(day(i))) });
    const next = nextUpBadges(data, 50);
    assert.deepEqual(
      next.map((b) => [b.badgeKey, b.progressLabel]),
      [
        ['squat_2_plate', '205 / 225 lb'],
        ['workouts_50', '41 / 50 workouts'],
        ['prs_10', '3 / 10 PRs'],
        ['volume_1', '4k / 100k lb'],
      ],
    );
    // Higher steps of the same ladders wait their turn.
    assert.ok(!next.some((b) => ['workouts_100', 'squat_3_plate', 'prs_50'].includes(b.badgeKey)));
    // No bench, deadlift, press, form or bodyweight: none of those show.
    assert.ok(!next.some((b) => /bench|deadlift|ohp|bodyweight|form|recordings|depth|first_analysis/.test(b.badgeKey)));
    assert.deepEqual(
      nextUpBadges(data, 2).map((b) => b.badgeKey),
      ['squat_2_plate', 'workouts_50'],
    );
  });

  test('labels read in the user unit', () => {
    const volume = input({ sessions: [workout(day(0), [lift('ex_leg_press', set({ loadKg: lbToKg(312_500), reps: 1 }))])] });
    assert.equal(nextUpBadges(volume, 50).find((b) => b.ladder === 'volume')?.progressLabel, '312k / 500k lb');
    assert.equal(nextUpBadges({ ...volume, units: 'metric' }, 50).find((b) => b.ladder === 'volume')?.progressLabel, '141k / 250k kg');
    const million = input({ sessions: [workout(day(0), [lift('ex_leg_press', set({ loadKg: lbToKg(1_240_000), reps: 1 }))])] });
    assert.equal(nextUpBadges(million, 50).find((b) => b.ladder === 'volume')?.progressLabel, '1.2M / 2.5M lb');
    const squat = input({ bodyweight: [weighIn(day(0), 80)], sessions: [workout(day(1), [lift('ex_back_squat', kg(104))])] });
    assert.equal(nextUpBadges(squat, 50).find((b) => b.ladder === 'ratio_squat')?.progressLabel, '1.3× / 1.5× bodyweight');
    // Current and target are in the label's unit.
    const plate = nextUpBadges(squat, 50).find((b) => b.ladder === 'plates_squat')!;
    assert.equal(plate.target, 315);
    assert.ok(Math.abs(plate.current - 229.28) < 0.01);
  });
});

/**
 * One history that earns every badge in the catalog: 500 daily workouts of heavy squats, bench,
 * deadlifts and presses at 80 kg bodyweight, a 4-week program done in full, 250 records, a
 * 52-week streak, and 13 recordings of each movement getting 12° deeper.
 */
function everything(units: 'imperial' | 'metric'): BadgeInput {
  const start = '2025-01-06';
  const sessions = Array.from({ length: 500 }, (_, i) =>
    workout(addDays(start, i), [
      lift('ex_back_squat', set({ loadKg: lbToKg(500), reps: 5 }), set({ loadKg: lbToKg(500), reps: 5 })),
      lift('ex_bench_press', lb(315)),
      lift('ex_deadlift', lb(495)),
      lift('ex_overhead_press', lb(135)),
    ]),
  );
  const program = plan({ startDate: '2025-02-03' });
  const occurrences = scheduleOccurrences(program, '2025-02-03', '2025-03-02');
  const byDate = new Map(sessions.map((s) => [s.completedDate!, s]));
  const linked = occurrences.map((o) => ({ ...o, sessionId: byDate.get(o.scheduledDate)!.id }));
  const formReports = Object.entries(FAMILY_EXERCISE).flatMap(([family, exerciseId], f) =>
    Array.from({ length: 13 }, (_, i) =>
      report(exerciseId, noon(addDays(start, f * 20 + i)), 100 - i, { primaryJoint: family === 'deadlift' ? 'hip' : family === 'calf_raise' ? 'ankle' : 'knee' }),
    ),
  );
  return input({
    sessions,
    occurrences: linked,
    plans: [program],
    bodyweight: [weighIn('2025-01-01', 80)],
    records: Array.from({ length: 250 }, (_, i) => record(addDays(start, i))),
    streak: { currentWeeks: 52, milestoneDates: Array.from({ length: 52 }, (_, i) => addDays(start, i * 7 + 6)) },
    formReports,
    units,
    today: addDays(start, 500),
  });
}

describe('one catalog for earning and progress', () => {
  test('every badge in the catalog can be earned, in lb and in kg', () => {
    for (const units of ['imperial', 'metric'] as const) {
      const earned = new Set(deriveBadges(everything(units)).map((b) => b.badgeKey));
      assert.deepEqual(
        BADGE_CATALOG.map((b) => b.key).filter((k) => !earned.has(k)),
        [],
        units,
      );
    }
  });

  test('every next-up badge is unearned, short of its target, and earned by the same catalog further on', () => {
    for (const units of ['imperial', 'metric'] as const) {
      const full = everything(units);
      const fullEarned = new Set(deriveBadges(full).map((b) => b.badgeKey));
      // The same history, partway through.
      const cut = addDays('2025-01-06', 44);
      const partial: BadgeInput = {
        ...full,
        sessions: full.sessions.filter((s) => s.completedDate! <= cut),
        occurrences: full.occurrences.map((o) => (o.scheduledDate <= cut ? o : { ...o, sessionId: undefined })),
        records: full.records.slice(0, 7),
        streak: { currentWeeks: 3, milestoneDates: full.streak.milestoneDates.slice(0, 6) },
        formReports: full.formReports.filter((r) => r.createdAt <= noon(addDays('2025-01-06', 6))),
        today: '2025-02-20',
      };
      const state = badgeState(partial, 50);
      const earned = new Set(state.earned.map((b) => b.badgeKey));
      assert.ok(state.nextUp.length >= 8, `${units}: ${state.nextUp.map((b) => b.badgeKey).join(', ')}`);
      for (const badge of state.nextUp) {
        assert.ok(!earned.has(badge.badgeKey), badge.badgeKey);
        assert.ok(badge.current > 0 && badge.current < badge.target, badge.badgeKey);
        assert.ok(fullEarned.has(badge.badgeKey), `${badge.badgeKey} can be earned`);
      }
    }
  });

  test('earned badges keep the shape Home and Recent wins read', () => {
    const [first] = deriveBadges(input({ sessions: [workout(day(0))] }));
    assert.deepEqual(first, {
      id: 'badge_first_workout',
      badgeKey: 'first_workout',
      category: 'milestone',
      title: 'First Rep',
      description: 'Complete your first workout.',
      ladder: 'workouts',
      step: 1,
      earnedDate: day(0),
    });
  });
});
