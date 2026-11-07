import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import type { LoadField } from '../src/data/logging';
import { defaultRounding } from '../src/data/preferences';
import { occurrenceIdFor } from '../src/data/schedule';
import type {
  ISODate,
  LoggedSet,
  MissBehavior,
  Plan,
  PlannedExercise,
  PlanSchedule,
  PlanShift,
  ProgressionRule,
  ProgressionSuggestion,
  RepTarget,
  SessionExercise,
  SetKind,
  SetPrescription,
  StarterTemplate,
  WorkoutSession,
} from '../src/data/types';
import { kgToLb, lbToKg } from '../src/data/units';
import { describeProgression, missHint } from '../src/features/plans/describe';
import { planFromTemplate, updatePlanned } from '../src/features/plans/planEdits';
import type { DayItem } from '../src/features/today/agenda';
import { sessionForReopen, sessionFromPlan } from '../src/features/workout/buildSession';
import { completedNewestFirst, lastTimes, slotHistory, withSessionWrite } from '../src/features/workout/history';
import { sessionToResume } from '../src/features/workout/persistence';
import { canUndoSuggestion, describeSuggestion, progressionFor, suggestionLine, undoSuggestion, type ProgressionPreferences } from '../src/features/workout/progression';
import { workoutReducer, type ActiveWorkout, type WorkoutAction } from '../src/features/workout/workoutReducer';
import { spokenLoad } from '../src/lib/format';
import { openTestDatabase } from './support/nodeSqlite';

const byId = new Map(builtinExercises.map((e) => [e.id, e]));
const SQUAT = 'ex_back_squat'; // barbell
const BENCH = 'ex_bench_press'; // barbell
const CURL = 'ex_db_curl'; // dumbbell
const PULL_UP = 'ex_pull_up'; // bodyweight
const ASSISTED = 'ex_assisted_pull_up'; // machine, assisted
const TODAY = '2026-10-26'; // a Monday
const W = 'pw_a';
const PLAN_ID = 'plan1';

const LB: ProgressionPreferences = { units: 'imperial', roundingIncrements: defaultRounding.imperial, weekStartsOn: 1 };
const KG: ProgressionPreferences = { units: 'metric', roundingIncrements: defaultRounding.metric, weekStartsOn: 1 };

// ---------------------------------------------------------------------------
// Builders

type SetSpec = { lb?: number; kg?: number; addedLb?: number; assistLb?: number; reps: number; kind?: SetKind; done?: boolean; target?: RepTarget };

/** Sets at one weight, one per rep count. */
const at = (lb: number, reps: number[], extra: Partial<SetSpec> = {}): SetSpec[] => reps.map((r) => ({ lb, reps: r, ...extra }));

let counter = 0;
function logged(date: ISODate, spec: SetSpec): LoggedSet {
  return {
    id: `set${++counter}`,
    kind: spec.kind ?? (spec.assistLb !== undefined ? 'assisted' : 'normal'),
    modifiers: [],
    reps: spec.reps,
    loadKg: spec.lb !== undefined ? lbToKg(spec.lb) : spec.kg,
    addedLoadKg: spec.addedLb !== undefined ? lbToKg(spec.addedLb) : undefined,
    assistanceKg: spec.assistLb !== undefined ? lbToKg(spec.assistLb) : undefined,
    target: spec.target !== undefined ? { kind: 'normal', modifiers: [], targetReps: spec.target } : undefined,
    completedAt: spec.done === false ? undefined : `${date}T10:00:00.000Z`,
  };
}

type EntrySpec = { exerciseId: string; sets: SetSpec[]; plannedId?: string | null; skipped?: boolean };

/** A finished workout. In plan workout W unless `planWorkoutId` says otherwise (null: freestyle). */
function past(date: ISODate, entries: EntrySpec | EntrySpec[], where: { planWorkoutId?: string | null; planId?: string } = {}): WorkoutSession {
  const planWorkoutId = where.planWorkoutId === null ? undefined : (where.planWorkoutId ?? W);
  const id = `sess${++counter}`;
  return {
    id,
    name: 'Past',
    status: 'completed',
    completion: 'full',
    planId: planWorkoutId ? (where.planId ?? PLAN_ID) : undefined,
    planWorkoutId,
    completedDate: date,
    completedAt: `${date}T10:00:00.000Z`,
    blocks: (Array.isArray(entries) ? entries : [entries]).map((e, i) => ({
      id: `${id}b${i}`,
      type: 'single',
      exercises: [
        {
          id: `${id}e${i}`,
          exerciseId: e.exerciseId,
          plannedExerciseId: e.plannedId === null ? undefined : (e.plannedId ?? (planWorkoutId ? 'pe1' : undefined)),
          skipped: e.skipped ?? false,
          sets: e.sets.map((s) => logged(date, s)),
        },
      ],
    })),
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  };
}

const working = (n: number, reps?: RepTarget, extra: Partial<SetPrescription> = {}): SetPrescription[] =>
  Array.from({ length: n }, () => ({ kind: 'normal' as const, modifiers: [], ...(reps !== undefined ? { targetReps: reps } : {}), ...extra }));
const warmup = (reps = 5): SetPrescription => ({ kind: 'warmup', modifiers: [], targetReps: reps });
const pe = (exerciseId: string, sets: SetPrescription[], progression?: ProgressionRule, id = 'pe1'): PlannedExercise => ({ id, exerciseId, sets, progression });
const repeat: MissBehavior = { type: 'repeat' };
const deload = (n: number, percent = 10): MissBehavior => ({ type: 'deload', afterConsecutiveMisses: n, percent });
const repRule = (incLb: number, onMiss: MissBehavior = repeat): ProgressionRule => ({ type: 'rep_range', incrementKg: lbToKg(incLb), onMiss });
const weekly = (percent: number, onMiss: MissBehavior = repeat): ProgressionRule => ({ type: 'percent_weekly', percent, onMiss });

const WEEKLY: PlanSchedule = { type: 'weekly', days: [{ weekday: 1, workoutIds: [W] }] };

function planWith(planned: PlannedExercise[], schedule: PlanSchedule = WEEKLY, startDate: ISODate = '2026-09-07'): Plan {
  return {
    id: PLAN_ID,
    name: 'Plan',
    version: 1,
    status: 'active',
    startDate,
    schedule,
    workouts: [{ id: W, name: 'Upper A', blocks: [{ id: 'pb1', type: 'single', exercises: planned }] }],
    createdAt: 'x',
    updatedAt: 'x',
  };
}

const itemFor = (plan: Plan, today: ISODate = TODAY): DayItem => ({ key: 'k', date: today, name: plan.workouts[0].name, status: 'planned', plan, workout: plan.workouts[0] });

type StartOptions = { prefs?: ProgressionPreferences; today?: ISODate; plan?: Plan; repeatOf?: WorkoutSession };

function start(planned: PlannedExercise | PlannedExercise[], history: WorkoutSession[], opts: StartOptions = {}): SessionExercise[] {
  const plan = opts.plan ?? planWith(Array.isArray(planned) ? planned : [planned]);
  const today = opts.today ?? TODAY;
  const session = sessionFromPlan({ item: itemFor(plan, today), history: completedNewestFirst(history), exercisesById: byId, preferences: opts.prefs ?? LB, today, repeatOf: opts.repeatOf });
  return session.blocks.flatMap((b) => b.exercises);
}
const first = (planned: PlannedExercise | PlannedExercise[], history: WorkoutSession[], opts: StartOptions = {}) => start(planned, history, opts)[0];

const toLb = (kg: number | undefined) => (kg === undefined ? undefined : Math.round(kgToLb(kg) * 100) / 100);
const toKg = (kg: number | undefined) => (kg === undefined ? undefined : Math.round(kg * 100) / 100);
/** The entry's weights in lb (or kg with `metric`), set by set. */
const weights = (entry: SessionExercise, field: LoadField = 'loadKg', metric = false) => entry.sets.map((s) => (metric ? toKg(s[field]) : toLb(s[field])));
const repsOf = (entry: SessionExercise) => entry.sets.map((s) => s.reps);

// ---------------------------------------------------------------------------

describe('rep-range rule', () => {
  const plan3x8to12 = pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5));

  test('every set at the top of the range adds the increment, and reps start at the bottom', () => {
    const entry = first(plan3x8to12, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);
    assert.deepEqual(weights(entry), [205, 205, 205]);
    assert.deepEqual(repsOf(entry), [8, 8, 8]);
    const s = entry.suggestion!;
    assert.equal(s.kind, 'increase');
    assert.equal(s.rule, 'rep_range');
    assert.equal(s.field, 'loadKg');
    assert.equal(toLb(s.fromKg), 200);
    assert.equal(toLb(s.toKg), 205);
    assert.equal(s.topReps, 12);
    assert.equal(s.sets.length, 3);
  });

  test('reps inside the range keep the weight and last time’s reps, with no suggestion', () => {
    const entry = first(plan3x8to12, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 11, 12]) })]);
    assert.deepEqual(weights(entry), [200, 200, 200]);
    assert.deepEqual(repsOf(entry), [12, 11, 12]);
    assert.equal(entry.suggestion, undefined);
  });

  test('a set below the bottom is a miss: repeat keeps the weight and says so (decision D)', () => {
    const entry = first(plan3x8to12, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [9, 7, 8]) })]);
    assert.deepEqual(weights(entry), [200, 200, 200]);
    assert.deepEqual(repsOf(entry), [9, 8, 8], 'reps aren’t reset after a miss, just kept in the range');
    assert.equal(entry.suggestion?.kind, 'hold_after_miss');
    assert.equal(entry.suggestion?.missCount, 1);
    assert.equal(entry.suggestion?.deloadAfter, undefined);
    assert.deepEqual(entry.suggestion?.sets, []);
  });

  test('a fixed rep target is a range of one: all fives go up, a four is a miss', () => {
    const fives = pe(SQUAT, working(5, 5), repRule(5));
    assert.deepEqual(weights(first(fives, [past('2026-10-21', { exerciseId: SQUAT, sets: at(225, [5, 5, 5, 5, 5]) })])), [230, 230, 230, 230, 230]);
    const missed = first(fives, [past('2026-10-21', { exerciseId: SQUAT, sets: at(225, [5, 5, 5, 5, 4]) })]);
    assert.deepEqual(weights(missed), [225, 225, 225, 225, 225]);
    assert.equal(missed.suggestion?.kind, 'hold_after_miss');
  });

  test('a partial last time holds: a set left undone, or the exercise skipped partway', () => {
    const undone = first(plan3x8to12, [past('2026-10-21', { exerciseId: SQUAT, sets: [...at(200, [12, 12]), { lb: 200, reps: 12, done: false }] })]);
    assert.deepEqual(weights(undone), [200, 200, 200]);
    assert.equal(undone.suggestion, undefined);
    const skipped = first(plan3x8to12, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]), skipped: true })]);
    assert.equal(skipped.suggestion, undefined);
    // A completed set below the bottom is still a miss.
    const partialMiss = first(plan3x8to12, [past('2026-10-21', { exerciseId: SQUAT, sets: [...at(200, [6]), { lb: 200, reps: 12, done: false }] })]);
    assert.equal(partialMiss.suggestion?.kind, 'hold_after_miss');
  });

  test('sets added or removed since: extra sets keep their logged target; new ones don’t block', () => {
    const twoSets = pe(SQUAT, working(2, { min: 8, max: 12 }), repRule(5));
    // Last time had a third set, logged with an 8-12 target.
    const third = (reps: number): SetSpec => ({ lb: 200, reps, target: { min: 8, max: 12 } });
    assert.equal(first(twoSets, [past('2026-10-21', { exerciseId: SQUAT, sets: [...at(200, [12, 12]), third(12)] })]).suggestion?.kind, 'increase');
    assert.equal(first(twoSets, [past('2026-10-21', { exerciseId: SQUAT, sets: [...at(200, [12, 12]), third(10)] })]).suggestion, undefined);
    // The plan has four sets now; last time's three all hit the top.
    const fourSets = pe(SQUAT, working(4, { min: 8, max: 12 }), repRule(5));
    const entry = first(fourSets, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);
    assert.deepEqual(weights(entry), [205, 205, 205, 205]);
    assert.deepEqual(repsOf(entry), [8, 8, 8, 8]);
  });

  test('the plan’s range now is what counts, not the one last time was logged with', () => {
    const logged8to12 = { target: { min: 8, max: 12 } };
    const lower = pe(SQUAT, working(3, { min: 6, max: 10 }), repRule(5));
    assert.equal(first(lower, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [10, 10, 10], logged8to12) })]).suggestion?.kind, 'increase');
    const higher = pe(SQUAT, working(3, { min: 10, max: 12 }), repRule(5));
    assert.equal(first(higher, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [9, 9, 9], logged8to12) })]).suggestion?.kind, 'hold_after_miss');
  });

  test('sets with no rep target never block or trigger anything', () => {
    const noTargets = pe(SQUAT, working(3), repRule(5));
    assert.equal(first(noTargets, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [1, 1, 1]) })]).suggestion, undefined);
    const oneOpen = pe(SQUAT, [...working(2, { min: 8, max: 12 }), ...working(1)], repRule(5));
    assert.equal(first(oneOpen, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 3]) })]).suggestion?.kind, 'increase');
  });

  test('warm-ups and drop sets never count', () => {
    const planned = pe(SQUAT, [warmup(), ...working(2, { min: 8, max: 12 }), { kind: 'drop', modifiers: [], targetReps: { min: 8, max: 12 } }], repRule(5));
    const last = past('2026-10-21', { exerciseId: SQUAT, sets: [{ lb: 95, reps: 1, kind: 'warmup' }, ...at(200, [12, 12]), { lb: 150, reps: 2, kind: 'drop' }] });
    const entry = first(planned, [last]);
    assert.equal(entry.suggestion?.kind, 'increase');
    assert.equal(toLb(entry.sets[1].loadKg), 205);
    assert.equal(toLb(entry.sets[3].loadKg), 150, 'a drop set repeats last time’s drop');
  });
});

describe('missed reps', () => {
  const planned = (onMiss: MissBehavior) => pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5, onMiss));
  const miss = (date: ISODate, lb: number) => past(date, { exerciseId: SQUAT, sets: at(lb, [8, 7, 6]) });
  const hold = (date: ISODate, lb: number) => past(date, { exerciseId: SQUAT, sets: at(lb, [10, 9, 9]) });

  test('a deload after N misses in a row at the same weight, with reps back at the bottom', () => {
    const entry = first(planned(deload(3)), [miss('2026-10-21', 205), miss('2026-10-14', 205), miss('2026-10-07', 205)]);
    assert.deepEqual(weights(entry), [185, 185, 185], '205 less 10% is 184.5, rounded to 185');
    assert.deepEqual(repsOf(entry), [8, 8, 8]);
    const s = entry.suggestion!;
    assert.equal(s.kind, 'deload');
    assert.equal(s.missCount, 3);
    assert.equal(s.deloadAfter, 3);
    assert.equal(s.percent, 10);
    assert.equal(toLb(s.fromKg), 205);
  });

  test('fewer misses than N keeps the weight and counts them', () => {
    const entry = first(planned(deload(3)), [miss('2026-10-21', 205), miss('2026-10-14', 205)]);
    assert.deepEqual(weights(entry), [205, 205, 205]);
    assert.equal(entry.suggestion?.kind, 'hold_after_miss');
    assert.equal(entry.suggestion?.missCount, 2);
    assert.equal(entry.suggestion?.deloadAfter, 3);
  });

  test('repeat never deloads, however many misses', () => {
    const entry = first(planned(repeat), [miss('2026-10-21', 205), miss('2026-10-14', 205), miss('2026-10-07', 205), miss('2026-09-30', 205)]);
    assert.deepEqual(weights(entry), [205, 205, 205]);
    assert.equal(entry.suggestion?.kind, 'hold_after_miss');
    assert.equal(entry.suggestion?.missCount, 4);
  });

  test('the count starts again at a new weight, and after a workout that wasn’t a miss', () => {
    const newWeight = first(planned(deload(3)), [miss('2026-10-21', 205), miss('2026-10-14', 205), miss('2026-10-07', 200)]);
    assert.equal(newWeight.suggestion?.missCount, 2);
    assert.equal(newWeight.suggestion?.kind, 'hold_after_miss');
    const broken = first(planned(deload(3)), [miss('2026-10-21', 205), hold('2026-10-14', 205), miss('2026-10-07', 205), miss('2026-09-30', 205)]);
    assert.equal(broken.suggestion?.missCount, 1);
  });

  test('a deload after one miss when N is 1', () => {
    assert.equal(first(planned(deload(1)), [miss('2026-10-21', 205)]).suggestion?.kind, 'deload');
  });

  test('a deload always drops at least one increment', () => {
    const curls = pe(CURL, working(3, { min: 8, max: 12 }), repRule(5, deload(1)));
    const light = first(curls, [past('2026-10-21', { exerciseId: CURL, sets: at(20, [6, 6, 6]) })]);
    assert.deepEqual(weights(light), [15, 15, 15], '10% off 20 lb rounds back to 20, so it drops a whole 5 lb step');
    const gentle = first(planned(deload(1, 1)), [miss('2026-10-21', 200)]);
    assert.deepEqual(weights(gentle), [195, 195, 195], '1% off 200 rounds back to 200');
  });

  test('a deload never goes below zero: with nothing to take off, it keeps the weight', () => {
    const pullUps = pe(PULL_UP, working(3, { min: 5, max: 8 }), repRule(5, deload(1)));
    const entry = first(pullUps, [past('2026-10-21', { exerciseId: PULL_UP, sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }] })]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [undefined, undefined, undefined]);
    assert.equal(entry.suggestion?.kind, 'hold_after_miss');
  });
});

describe('weekly % rule (decision B)', () => {
  const fives = (rule: ProgressionRule = weekly(2.5)) => pe(SQUAT, working(5, 5), rule);
  const lifted = (date: ISODate, lb = 200, reps = [5, 5, 5, 5, 5]) => past(date, { exerciseId: SQUAT, sets: at(lb, reps) });

  test('a new week adds the percent to the weight lifted last time', () => {
    const entry = first(fives(), [lifted('2026-10-21')]);
    assert.deepEqual(weights(entry), [205, 205, 205, 205, 205]);
    assert.equal(entry.suggestion?.kind, 'increase');
    assert.equal(entry.suggestion?.rule, 'percent_weekly');
    assert.equal(entry.suggestion?.percent, 2.5);
  });

  test('the same week keeps the weight', () => {
    const entry = first(fives(), [lifted('2026-10-21')], { today: '2026-10-23' });
    assert.deepEqual(weights(entry), [200, 200, 200, 200, 200]);
    assert.equal(entry.suggestion, undefined);
  });

  test('a gap of several weeks still adds one step', () => {
    assert.deepEqual(weights(first(fives(), [lifted('2026-09-28')])), [205, 205, 205, 205, 205]);
  });

  test('weeks follow the week-start setting: with Sunday weeks, Sunday is a new week', () => {
    const saturday = [lifted('2026-10-24')];
    assert.equal(first(fives(), saturday, { today: '2026-10-25' }).suggestion, undefined, 'Monday weeks: same week');
    assert.equal(first(fives(), saturday, { today: '2026-10-25', prefs: { ...LB, weekStartsOn: 7 } }).suggestion?.kind, 'increase');
  });

  test('a fixed-length program uses its own weeks, the ones “Week N of M” counts', () => {
    // Starts on a Thursday, so its weeks run Thursday to Wednesday.
    const program = (planned: PlannedExercise) => planWith([planned], { type: 'fixed', weeks: 8, days: [{ week: 1, weekday: 4, workoutIds: [W] }] }, '2026-10-01');
    const planned = fives();
    // Friday and the next Monday are both in week 3.
    assert.equal(first(planned, [lifted('2026-10-16')], { today: '2026-10-19', plan: program(planned) }).suggestion, undefined);
    // Wednesday is week 3 and Thursday week 4, in the same calendar week.
    assert.equal(first(planned, [lifted('2026-10-21')], { today: '2026-10-22', plan: program(planned) }).suggestion?.kind, 'increase');
  });

  describe('a program workout counts in the week the plan first put it in', () => {
    // From Monday 2026-10-05. Week 1: W on Wednesday 10-07 and Sunday 10-11. Week 2: B on Monday
    // 10-12, W on Wednesday 10-14.
    const planned = fives();
    const plan = planWith(
      [planned],
      {
        type: 'fixed',
        weeks: 2,
        days: [
          { week: 1, weekday: 3, workoutIds: [W] },
          { week: 1, weekday: 7, workoutIds: [W] },
          { week: 2, weekday: 1, workoutIds: ['pw_b'] },
          { week: 2, weekday: 3, workoutIds: [W] },
        ],
      },
      '2026-10-05',
    );
    /** Last time: W from `original`, done on `date`. */
    const lastTime = (original: ISODate, date: ISODate) => {
      const session = { ...lifted(date), occurrenceId: occurrenceIdFor(PLAN_ID, original, W) };
      return [{ session, entry: session.blocks[0].exercises[0] }];
    };
    /** W from `original`, on the calendar on `on`. */
    const calendarW = (original: ISODate, on: ISODate = original) => ({ planId: PLAN_ID, scheduledDate: on, ...(original !== on && { shiftedFromDate: original }) });
    const suggestion = (history: ReturnType<typeof lastTime>, today: ISODate, occurrence?: ReturnType<typeof calendarW>, shifts?: PlanShift[]) =>
      progressionFor({ planned, exercise: byId.get(SQUAT), history, preferences: LB, plan, shifts, occurrence, today }).suggestion?.kind;

    test("last time's late workout is in its own week: week 1's Sunday done on Monday, then week 2's Wednesday goes up", () => {
      const history = lastTime('2026-10-11', '2026-10-12');
      assert.equal(suggestion(history, '2026-10-14', calendarW('2026-10-14')), 'increase');
      assert.equal(suggestion(history, '2026-10-14'), 'increase', 'also without the calendar workout');
    });

    test("a late workout now is in its own week: week 1's Sunday started on Monday keeps week 1's weight", () => {
      assert.equal(suggestion(lastTime('2026-10-07', '2026-10-07'), '2026-10-12', calendarW('2026-10-11')), undefined);
    });

    test('after a kept workout lost its session and the plan was pushed again, the week is still the workout’s', () => {
      // Sunday's W missed and Monday's B done. On Tuesday W is pushed 2 days (keeping B), B's
      // session is deleted, W is missed again, and on Thursday it is pushed 2 more. The pushes alone
      // put Thursday in week 2, through B moved to Wednesday.
      const shift = (id: string, createdAt: string, keptIds?: string[]): PlanShift => ({
        id,
        planId: PLAN_ID,
        occurrenceId: occurrenceIdFor(PLAN_ID, '2026-10-11', W),
        fromDate: '2026-10-11',
        days: 2,
        ...(keptIds && { keptIds }),
        createdAt,
        updatedAt: createdAt,
      });
      const shifts = [shift('sh1', '2026-10-13T12:00:00.000Z', [occurrenceIdFor(PLAN_ID, '2026-10-12', 'pw_b')]), shift('sh2', '2026-10-15T12:00:00.000Z')];
      assert.equal(suggestion(lastTime('2026-10-07', '2026-10-07'), '2026-10-15', calendarW('2026-10-11', '2026-10-15'), shifts), undefined, "Thursday's W is week 1's");
      // Then week 2's Wednesday W, pushed to Sunday, is the first of week 2.
      assert.equal(suggestion(lastTime('2026-10-11', '2026-10-15'), '2026-10-18', calendarW('2026-10-14', '2026-10-18'), shifts), 'increase', "Sunday's W is week 2's");
    });

    test('starting the workout from its calendar card uses that week; a repeat uses the week it is now', () => {
      // Week 1's Wednesday done, then week 1's Sunday W started late on Monday 10-12 (week 2).
      const done = { ...lifted('2026-10-07'), occurrenceId: occurrenceIdFor(PLAN_ID, '2026-10-07', W) };
      const occurrence = { id: occurrenceIdFor(PLAN_ID, '2026-10-11', W), planId: PLAN_ID, planWorkoutId: W, planVersion: 1, scheduledDate: '2026-10-11' };
      const build = (repeatOf?: WorkoutSession) =>
        sessionFromPlan({ item: { ...itemFor(plan, '2026-10-11'), occurrence }, history: [done], exercisesById: byId, preferences: LB, today: '2026-10-12', repeatOf }).blocks[0].exercises[0];
      assert.equal(build().suggestion, undefined, "Sunday's W is week 1's, like last time");
      assert.equal(build(done).suggestion?.kind, 'increase', 'a repeat is done in week 2');
    });
  });

  test('every set has to be done: an unfinished last time keeps the weight', () => {
    const entry = first(fives(), [past('2026-10-21', { exerciseId: SQUAT, sets: [...at(200, [5, 5, 5, 5]), { lb: 200, reps: 5, done: false }] })]);
    assert.equal(entry.suggestion, undefined);
  });

  test('a miss repeats or deloads like the rep-range rule, whatever the week', () => {
    const missed = (date: ISODate) => lifted(date, 200, [5, 5, 5, 5, 3]);
    assert.equal(first(fives(), [missed('2026-10-21')]).suggestion?.kind, 'hold_after_miss');
    const entry = first(fives(weekly(2.5, deload(2))), [missed('2026-10-23'), missed('2026-10-21')], { today: '2026-10-24' });
    assert.equal(entry.suggestion?.kind, 'deload');
    assert.deepEqual(weights(entry), [180, 180, 180, 180, 180]);
  });

  test('a range counts as hit at its bottom: 9 of 8-12 goes up next week', () => {
    const range = pe(SQUAT, working(3, { min: 8, max: 12 }), weekly(2.5));
    const entry = first(range, [lifted('2026-10-21', 200, [9, 9, 8])]);
    assert.equal(entry.suggestion?.kind, 'increase');
    assert.deepEqual(repsOf(entry), [8, 8, 8]);
  });

  test('small weights still move a whole increment', () => {
    const curls = pe(CURL, working(3, 10), weekly(2.5));
    assert.deepEqual(weights(first(curls, [past('2026-10-21', { exerciseId: CURL, sets: at(40, [10, 10, 10]) })])), [45, 45, 45]);
    // 20 kg dumbbells (2 kg steps): 2.5% is 20.5, so it goes to 22.
    const metric = first(curls, [past('2026-10-21', { exerciseId: CURL, sets: [{ kg: 20, reps: 10 }, { kg: 20, reps: 10 }, { kg: 20, reps: 10 }] })], { prefs: KG });
    assert.deepEqual(weights(metric, 'loadKg', true), [22, 22, 22]);
  });

  test('it needs a weight to scale: bodyweight with nothing added gets no suggestion', () => {
    const pullUps = pe(PULL_UP, working(3, 8), weekly(5));
    assert.equal(first(pullUps, [past('2026-10-21', { exerciseId: PULL_UP, sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] })]).suggestion, undefined);
  });
});

describe('rounding and units', () => {
  test('kg: the increment is added and rounded in kg', () => {
    const planned = pe(SQUAT, working(3, 5), { type: 'rep_range', incrementKg: 2.5, onMiss: repeat });
    const entry = first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: [{ kg: 100, reps: 5 }, { kg: 100, reps: 5 }, { kg: 100, reps: 5 }] })], { prefs: KG });
    assert.deepEqual(weights(entry, 'loadKg', true), [102.5, 102.5, 102.5]);
  });

  test('custom increments: microplates allow a 2.5 lb jump', () => {
    const planned = pe(SQUAT, working(3, 5), repRule(2.5));
    const prefs: ProgressionPreferences = { ...LB, roundingIncrements: { ...defaultRounding.imperial, barbell: 2.5 } };
    assert.deepEqual(weights(first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [5, 5, 5]) })], { prefs })), [202.5, 202.5, 202.5]);
  });

  test('an increment smaller than the equipment’s still moves one whole step', () => {
    const planned = pe(CURL, working(3, 10), repRule(1));
    assert.deepEqual(weights(first(planned, [past('2026-10-21', { exerciseId: CURL, sets: at(50, [10, 10, 10]) })])), [55, 55, 55]);
  });

  test('last time’s weight off the increment rounds first: 227 holds at 225 and goes up to 230', () => {
    const planned = pe(SQUAT, working(2, 5), repRule(5));
    assert.deepEqual(weights(first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(227, [5, 4]) })])), [225, 225]);
    assert.deepEqual(weights(first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(227, [5, 5]) })])), [230, 230]);
  });
});

describe('assisted and bodyweight exercises', () => {
  const assisted = (rule: ProgressionRule) => pe(ASSISTED, working(3, { min: 5, max: 8 }), rule);
  const assistedAt = (date: ISODate, assistLb: number, reps: number[]) => past(date, { exerciseId: ASSISTED, sets: reps.map((r) => ({ assistLb, reps: r })) });

  test('progress takes assistance away', () => {
    const entry = first(assisted(repRule(5)), [assistedAt('2026-10-21', 40, [8, 8, 8])]);
    assert.ok(entry.sets.every((s) => s.kind === 'assisted'));
    assert.deepEqual(weights(entry, 'assistanceKg'), [35, 35, 35]);
    assert.equal(entry.suggestion?.field, 'assistanceKg');
    assert.equal(entry.suggestion?.kind, 'increase');
  });

  test('a deload adds assistance', () => {
    const entry = first(assisted(repRule(5, deload(1))), [assistedAt('2026-10-21', 40, [4, 4, 4])]);
    assert.deepEqual(weights(entry, 'assistanceKg'), [45, 45, 45], '10% more than 40 is 44, rounded to 45');
    assert.equal(entry.suggestion?.kind, 'deload');
  });

  test('weekly %: the percent comes off the assistance, at least one step', () => {
    assert.deepEqual(weights(first(assisted(weekly(2.5)), [assistedAt('2026-10-21', 40, [6, 6, 6])]), 'assistanceKg'), [35, 35, 35]);
  });

  test('with no assistance left there’s nothing to take away, so no suggestion', () => {
    const entry = first(assisted(repRule(5)), [past('2026-10-21', { exerciseId: ASSISTED, sets: [8, 8, 8].map((reps) => ({ reps, kind: 'assisted' as const })) })]);
    assert.equal(entry.suggestion, undefined);
    assert.deepEqual(weights(entry, 'assistanceKg'), [undefined, undefined, undefined]);
  });

  test('the hardest set is the starting point: the one with the least assistance', () => {
    const entry = first(pe(ASSISTED, working(3, { min: 5, max: 8 })), [past('2026-10-21', { exerciseId: ASSISTED, sets: [{ assistLb: 40, reps: 8 }, { assistLb: 35, reps: 6 }, { assistLb: 35, reps: 5 }] })]);
    assert.deepEqual(weights(entry, 'assistanceKg'), [35, 35, 35]);
  });

  test('bodyweight exercises progress the added weight; their warm-ups stay at bodyweight', () => {
    const pullUps = pe(PULL_UP, [warmup(3), ...working(3, { min: 5, max: 8 })], repRule(5));
    const entry = first(pullUps, [past('2026-10-21', { exerciseId: PULL_UP, sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] })]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [undefined, 5, 5, 5]);
    assert.equal(entry.suggestion?.field, 'addedLoadKg');
    const heavier = first(pullUps, [past('2026-10-21', { exerciseId: PULL_UP, sets: [8, 8, 8].map((reps) => ({ addedLb: 25, reps })) })]);
    assert.deepEqual(weights(heavier, 'addedLoadKg'), [undefined, 30, 30, 30]);
  });
});

describe('what the rule gives way to', () => {
  test('a weight typed into the plan wins: no suggestion', () => {
    const planned = pe(SQUAT, working(3, { min: 8, max: 12 }, { targetLoadKg: lbToKg(185) }), repRule(5));
    const entry = first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);
    assert.deepEqual(weights(entry), [185, 185, 185]);
    assert.equal(entry.suggestion, undefined);
  });

  test('no history: no suggestion, and the weight is left for the lifter', () => {
    const entry = first(pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5)), []);
    assert.deepEqual(weights(entry), [undefined, undefined, undefined]);
    assert.equal(entry.suggestion, undefined);
  });

  test('no rule: last time’s weight and reps, as before', () => {
    const entry = first(pe(SQUAT, working(3, { min: 8, max: 12 })), [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);
    assert.deepEqual(weights(entry), [200, 200, 200]);
    assert.deepEqual(repsOf(entry), [12, 12, 12]);
    assert.equal(entry.suggestion, undefined);
  });

  test('a repeat follows the rules like any start', () => {
    const planned = pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5));
    const source = past('2026-10-26', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) });
    const entry = first(planned, [source], { repeatOf: source });
    assert.equal(entry.suggestion?.kind, 'increase');
    assert.deepEqual(weights(entry), [205, 205, 205]);
  });

  test('the suggestion is only stored when there is one', () => {
    const entry = first(pe(SQUAT, working(1, 5)), []);
    assert.equal('suggestion' in entry, false);
  });
});

describe('history: the same plan workout (decision C)', () => {
  const benchA = pe(BENCH, working(3, { min: 5, max: 8 }), repRule(5));
  const upperA = (date: ISODate, lb: number, reps: number[]) => past(date, { exerciseId: BENCH, sets: at(lb, reps) });
  const upperB = (date: ISODate, lb: number, reps: number[]) => past(date, { exerciseId: BENCH, sets: at(lb, reps), plannedId: 'pe_b' }, { planWorkoutId: 'pw_b' });

  test('bench in Upper A builds on the last Upper A, not a lighter Upper B since', () => {
    const entry = first(benchA, [upperB('2026-10-23', 150, [12, 12, 12]), upperA('2026-10-21', 200, [8, 8, 8])]);
    assert.deepEqual(weights(entry), [205, 205, 205]);
  });

  test('if this plan workout hasn’t been done yet, it uses the last bench anywhere', () => {
    const entry = first(benchA, [upperB('2026-10-23', 150, [8, 8, 8])]);
    assert.deepEqual(weights(entry), [155, 155, 155]);
  });

  test('freestyle workouts are “anywhere”: they count only until the plan workout has been done', () => {
    const freestyle = past('2026-10-24', { exerciseId: BENCH, sets: at(160, [6, 6, 6]) }, { planWorkoutId: null });
    assert.deepEqual(weights(first(benchA, [freestyle])), [160, 160, 160]);
    assert.deepEqual(weights(first(benchA, [freestyle, upperA('2026-10-21', 200, [6, 6, 6])])), [200, 200, 200]);
  });

  test('the miss streak walks the same history, skipping the other days', () => {
    const planned = pe(BENCH, working(3, { min: 5, max: 8 }), repRule(5, deload(2)));
    const entry = first(planned, [upperB('2026-10-24', 150, [8, 8, 8]), upperA('2026-10-21', 200, [4, 4, 4]), upperB('2026-10-17', 150, [8, 8, 8]), upperA('2026-10-14', 200, [4, 4, 4])]);
    assert.equal(entry.suggestion?.kind, 'deload');
    assert.equal(entry.suggestion?.missCount, 2);
  });

  test('a plan workout where the exercise was skipped doesn’t count for it', () => {
    const skippedThere = past('2026-10-21', { exerciseId: BENCH, sets: [{ lb: 200, reps: 8, done: false }] });
    const entry = first(benchA, [skippedThere, upperA('2026-10-14', 190, [6, 6, 6])]);
    assert.deepEqual(weights(entry), [190, 190, 190]);
  });

  test('another plan’s workout doesn’t count, even with the same workout id', () => {
    const otherPlan = past('2026-10-23', { exerciseId: BENCH, sets: at(100, [8, 8, 8]) }, { planId: 'plan2' });
    assert.deepEqual(weights(first(benchA, [otherPlan, upperA('2026-10-21', 200, [6, 6, 6])])), [200, 200, 200]);
  });

  test('the same exercise twice in one workout: each builds on its own entry', () => {
    const heavy = pe(BENCH, working(3, { min: 3, max: 5 }), repRule(5), 'pe_heavy');
    const light = pe(BENCH, working(3, { min: 10, max: 12 }), repRule(5), 'pe_light');
    const both = (ids: [string | null, string | null]) =>
      past('2026-10-21', [
        { exerciseId: BENCH, sets: at(250, [5, 5, 5]), plannedId: ids[0] },
        { exerciseId: BENCH, sets: at(185, [12, 12, 12]), plannedId: ids[1] },
      ]);
    const [h, l] = start([heavy, light], [both(['pe_heavy', 'pe_light'])]);
    assert.deepEqual(weights(h), [255, 255, 255]);
    assert.deepEqual(weights(l), [190, 190, 190]);
    // Saved without the plan's ids: matched by position instead.
    const [h2, l2] = start([heavy, light], [both([null, null])]);
    assert.deepEqual(weights(h2), [255, 255, 255]);
    assert.deepEqual(weights(l2), [190, 190, 190]);
  });

  test('plan edits keep the workout’s id, so its history carries over; a template copy starts its own', () => {
    const plan = planWith([benchA]);
    const edited = updatePlanned(plan, W, 'pe1', (p) => ({ ...p, sets: working(4, { min: 5, max: 8 }) }));
    assert.equal(edited.workouts[0].id, W);
    assert.deepEqual(weights(first(edited.workouts[0].blocks[0].exercises[0], [upperA('2026-10-21', 200, [8, 8, 8])], { plan: edited })), [205, 205, 205, 205]);
    const template: StarterTemplate = { id: 't', name: 'T', category: 'gym', level: 'beginner', levels: ['beginner'], goals: ['general'], daysPerWeek: 1, description: '', equipment: [], schedule: WEEKLY, workouts: plan.workouts };
    const copy = planFromTemplate(template, TODAY);
    assert.notEqual(copy.workouts[0].id, W);
  });

  test('the PREVIOUS column shows the same last time', () => {
    const history = completedNewestFirst([upperB('2026-10-23', 150, [12, 12, 12]), upperA('2026-10-21', 200, [8, 8, 8])]);
    const session = sessionFromPlan({ item: itemFor(planWith([benchA])), history, exercisesById: byId, preferences: LB, today: TODAY });
    const entry = session.blocks[0].exercises[0];
    assert.equal(toLb(lastTimes(session, history).get(entry.id)?.sets[0].loadKg), 200);
    // An exercise added during the workout uses its last time anywhere.
    const added: SessionExercise = { id: 'added', exerciseId: BENCH, skipped: false, sets: [] };
    const withAdded = { ...session, blocks: [...session.blocks, { id: 'b2', type: 'single' as const, exercises: [added] }] };
    assert.equal(toLb(lastTimes(withAdded, history).get('added')?.sets[0].loadKg), 150);
  });

  test('slotHistory stops at its limit', () => {
    const history = completedNewestFirst([upperA('2026-10-21', 200, [8, 8, 8]), upperA('2026-10-14', 195, [8, 8, 8])]);
    assert.equal(slotHistory(history, { exerciseId: BENCH, planId: PLAN_ID, planWorkoutId: W, plannedExerciseId: 'pe1' }).length, 2);
    assert.equal(slotHistory(history, { exerciseId: BENCH, planId: PLAN_ID, planWorkoutId: W, plannedExerciseId: 'pe1' }, 1).length, 1);
  });
});

describe('“Use last time’s weight” (undoSuggestion)', () => {
  const planned = pe(SQUAT, [warmup(), ...working(3, { min: 8, max: 12 })], repRule(10));
  const started = () => first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);

  test('a warm-up and every working set start from the suggestion', () => {
    const entry = started();
    assert.deepEqual(weights(entry), [105, 210, 210, 210]);
    assert.deepEqual(repsOf(entry), [5, 8, 8, 8]);
  });

  test('puts back last time’s weight and reps on sets not done and still as suggested', () => {
    const entry = started();
    // Set 1 done, set 2 changed by hand, set 3 untouched, and a set added during the workout.
    const [w, s1, s2, s3] = entry.sets;
    const added: LoggedSet = { ...s3, id: 'added' };
    const edited: SessionExercise = {
      ...entry,
      sets: [w, { ...s1, completedAt: 'now' }, { ...s2, loadKg: lbToKg(215), reps: 9 }, s3, added],
    };
    const undone = undoSuggestion(edited);
    assert.deepEqual(weights(undone), [100, 210, 215, 200, 200], 'the warm-up goes back to half of 200');
    assert.deepEqual(repsOf(undone), [5, 8, 9, 12, 8], 'reps go back to last time’s on the sets the pre-fill set');
    assert.equal(undone.suggestion?.dismissed, true);
    assert.equal(undone.sets[1], edited.sets[1], 'a completed set is never touched');
  });

  test('a hold after a miss changes nothing but is marked dismissed; no suggestion, nothing to undo', () => {
    const missed = first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [7, 7, 7]) })]);
    const undone = undoSuggestion(missed);
    assert.deepEqual(undone.sets, missed.sets);
    assert.equal(undone.suggestion?.dismissed, true);
    const plain = first(pe(SQUAT, working(1, 5)), []);
    assert.equal(undoSuggestion(plain), plain);
    assert.equal(undoSuggestion(undone), undone, 'undoing twice does nothing more');
  });

  test('assisted: the assistance goes back', () => {
    const entry = first(pe(ASSISTED, working(2, { min: 5, max: 8 }), repRule(5)), [past('2026-10-21', { exerciseId: ASSISTED, sets: [{ assistLb: 40, reps: 8 }, { assistLb: 40, reps: 8 }] })]);
    assert.deepEqual(weights(undoSuggestion(entry), 'assistanceKg'), [40, 40]);
  });

  test('the reducer action undoes it; swapping the exercise drops it', () => {
    const entry = started();
    const workout: ActiveWorkout = { mode: 'new', session: { id: 'w', name: 'W', status: 'in_progress', blocks: [{ id: 'b', type: 'single', exercises: [entry] }], createdAt: 'x', updatedAt: 'x' } };
    const undone = workoutReducer(workout, { type: 'undoSuggestion', entryId: entry.id })!.session.blocks[0].exercises[0];
    assert.deepEqual(weights(undone), [100, 200, 200, 200]);
    const swapped = workoutReducer(workout, { type: 'swapExercise', entryId: entry.id, exerciseId: BENCH })!.session.blocks[0].exercises[0];
    assert.equal(swapped.suggestion, undefined);
    assert.equal('suggestion' in swapped, false);
  });
});

describe('the reason line (describeSuggestion)', () => {
  const base: Omit<ProgressionSuggestion, 'kind'> = { rule: 'rep_range', field: 'loadKg', fromKg: lbToKg(200), toKg: lbToKg(205), sets: [] };
  const text = (s: ProgressionSuggestion, units: 'imperial' | 'metric' = 'imperial') => describeSuggestion(s, units)!.text;

  test('an increase says how much and why, pointing up', () => {
    const line = describeSuggestion({ ...base, kind: 'increase', topReps: 12 }, 'imperial')!;
    assert.equal(line.direction, 'up');
    assert.equal(line.text, '+5 lb · every set hit 12 last time');
    assert.equal(line.label, 'Suggested weight up 5 pounds, to 205 pounds. Every set hit 12 reps last time.');
    assert.equal(describeSuggestion({ ...base, kind: 'increase', topReps: 1 }, 'imperial')!.label, 'Suggested weight up 5 pounds, to 205 pounds. Every set hit 1 rep last time.');
    assert.equal(text({ ...base, kind: 'increase' }), '+5 lb · every set hit its top reps last time', 'sets with different tops');
  });

  test('a weekly-% increase names the new week and the percent', () => {
    const line = describeSuggestion({ ...base, kind: 'increase', rule: 'percent_weekly', percent: 2.5 }, 'imperial')!;
    assert.equal(line.text, '+5 lb · new week, +2.5%');
    assert.equal(line.label, 'Suggested weight up 5 pounds, to 205 pounds. New week, 2.5 percent more since you hit your reps.');
    assert.equal(text({ ...base, kind: 'increase', rule: 'percent_weekly', percent: 2.5000000001 }), '+5 lb · new week, +2.5%', 'no float noise');
  });

  test('it uses the units in Settings now, whatever they were when it was made', () => {
    assert.equal(text({ ...base, kind: 'increase', fromKg: 100, toKg: 102.5, topReps: 5 }, 'metric'), '+2.5 kg · every set hit 5 last time');
    // 200 to 205 lb shows as 90.72 to 92.99 kg in the sets, to the hundredth, and the line matches.
    assert.equal(text({ ...base, kind: 'increase', topReps: 12 }, 'metric'), '+2.27 kg · every set hit 12 last time');
    assert.equal(
      describeSuggestion({ ...base, kind: 'increase', fromKg: 100, toKg: 102.5, topReps: 5 }, 'metric')!.label,
      'Suggested weight up 2.5 kilograms, to 102.5 kilograms. Every set hit 5 reps last time.',
    );
  });

  test('a deload says the percent and the misses, pointing down', () => {
    const line = describeSuggestion({ ...base, kind: 'deload', fromKg: lbToKg(205), toKg: lbToKg(185), percent: 10, missCount: 3, deloadAfter: 3 }, 'imperial')!;
    assert.equal(line.direction, 'down');
    assert.equal(line.text, '−10% · 3 misses in a row at 205');
    assert.equal(line.label, 'Suggested deload: down 10 percent, to 185 pounds. 3 misses in a row at 205 pounds.');
    const once = describeSuggestion({ ...base, kind: 'deload', fromKg: lbToKg(205), toKg: lbToKg(185), percent: 10, missCount: 1, deloadAfter: 1 }, 'imperial')!;
    assert.equal(once.text, '−10% · missed reps at 205 last time');
    assert.equal(once.label, 'Suggested deload: down 10 percent, to 185 pounds. Missed reps at 205 pounds last time.');
    assert.equal(text({ ...base, kind: 'deload', fromKg: 92.5, toKg: 82.5, percent: 10, missCount: 2, deloadAfter: 2 }, 'metric'), '−10% · 2 misses in a row at 92.5');
    assert.equal(text({ ...base, kind: 'deload', fromKg: lbToKg(205), toKg: lbToKg(185), missCount: 3 }), '−20 lb · 3 misses in a row at 205', 'without a percent, the weight');
  });

  test('a hold after a miss is quieter and says how close a deload is', () => {
    const hold = { ...base, kind: 'hold_after_miss' as const, toKg: lbToKg(200) };
    const once = describeSuggestion({ ...hold, missCount: 1 }, 'imperial')!;
    assert.equal(once.direction, 'same');
    assert.equal(once.text, 'Same weight · missed reps last time');
    assert.equal(once.label, 'Same weight as last time. You missed reps last time.');
    assert.equal(text({ ...hold, missCount: 2 }), 'Same weight · 2 misses in a row', 'repeat: the streak');
    assert.equal(text({ ...hold, missCount: 1, deloadAfter: 3 }), 'Same weight · 1 of 3 misses before a deload');
    const pending = describeSuggestion({ ...hold, missCount: 2, deloadAfter: 3 }, 'imperial')!;
    assert.equal(pending.text, 'Same weight · 2 of 3 misses before a deload');
    assert.equal(pending.label, 'Same weight as last time. 2 of 3 misses in a row before a deload.');
    assert.equal(text({ ...hold, missCount: 3, deloadAfter: 3 }), 'Same weight · 3 misses in a row', 'a deload with nothing to take off');
  });

  test('assistance reads in its own terms', () => {
    const assisted = { ...base, field: 'assistanceKg' as const, fromKg: lbToKg(40) };
    const up = describeSuggestion({ ...assisted, kind: 'increase', toKg: lbToKg(35), topReps: 8 }, 'imperial')!;
    assert.equal(up.direction, 'up');
    assert.equal(up.text, '5 lb less assistance · every set hit 8 last time');
    assert.equal(up.label, 'Suggested assistance down 5 pounds, to 35 pounds of assistance. Every set hit 8 reps last time.');
    assert.equal(describeSuggestion({ ...assisted, kind: 'increase', fromKg: lbToKg(5), toKg: 0, topReps: 8 }, 'imperial')!.label, 'Suggested assistance down 5 pounds, to no assistance. Every set hit 8 reps last time.');
    // No minus sign next to the up arrow.
    assert.equal(text({ ...assisted, kind: 'increase', rule: 'percent_weekly', percent: 2.5, toKg: lbToKg(35) }), '5 lb less assistance · new week, 2.5% less');
    const down = describeSuggestion({ ...assisted, kind: 'deload', toKg: lbToKg(45), percent: 10, missCount: 1, deloadAfter: 1 }, 'imperial')!;
    assert.equal(down.direction, 'down');
    assert.equal(down.text, '5 lb more assistance · missed reps at −40 last time');
    assert.equal(down.label, 'Suggested deload: 5 pounds more assistance, to 45 pounds of assistance. Missed reps at 40 pounds of assistance last time.');
    assert.equal(text({ ...assisted, kind: 'deload', fromKg: 0, toKg: lbToKg(5), percent: 10, missCount: 2, deloadAfter: 2 }), '5 lb more assistance · 2 misses in a row with no assistance');
    assert.equal(text({ ...assisted, kind: 'hold_after_miss', toKg: lbToKg(40), missCount: 1 }), 'Same assistance · missed reps last time');
  });

  test('added weight reads as added', () => {
    const added = { ...base, field: 'addedLoadKg' as const, fromKg: lbToKg(25), toKg: lbToKg(30), topReps: 8 };
    const up = describeSuggestion({ ...added, kind: 'increase' }, 'imperial')!;
    assert.equal(up.text, '+5 lb · every set hit 8 last time');
    assert.equal(up.label, 'Suggested added weight up 5 pounds, to bodyweight plus 30 pounds. Every set hit 8 reps last time.');
    assert.equal(text({ ...added, kind: 'deload', toKg: lbToKg(20), percent: 10, missCount: 3 }), '−10% · 3 misses in a row at +25');
    assert.equal(text({ ...added, kind: 'deload', fromKg: 0, toKg: 0, percent: 10, missCount: 1 }), '−10% · missed reps at bodyweight last time');
    assert.equal(text({ ...added, kind: 'hold_after_miss', toKg: lbToKg(25), missCount: 1 }), 'Same weight · missed reps last time');
  });

  test('a suggestion it can’t read gives no line', () => {
    assert.equal(describeSuggestion({ ...base, kind: 'sideways' } as unknown as ProgressionSuggestion, 'imperial'), undefined);
    assert.equal(describeSuggestion({ ...base, kind: 'increase', toKg: undefined } as unknown as ProgressionSuggestion, 'imperial'), undefined);
  });
});

describe('when the reason line shows, and when it offers last time’s weight', () => {
  const planned = pe(SQUAT, [warmup(), ...working(3, { min: 8, max: 12 })], repRule(10));
  const started = () => first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);

  test('a fresh suggestion shows and can be undone', () => {
    const line = suggestionLine(started(), 'imperial')!;
    assert.equal(line.text, '+10 lb · every set hit 12 last time');
    assert.equal(line.undoable, true);
  });

  test('after “Use last time’s weight” the line hides', () => {
    assert.equal(suggestionLine(undoSuggestion(started()), 'imperial'), undefined);
    assert.equal(canUndoSuggestion(undoSuggestion(started())), false);
  });

  test('a skipped exercise shows no line', () => {
    assert.equal(suggestionLine({ ...started(), skipped: true }, 'imperial'), undefined);
  });

  test('no suggestion, no line', () => {
    assert.equal(suggestionLine(first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [10, 10, 10]) })]), 'imperial'), undefined);
    assert.equal(suggestionLine(first(planned, []), 'imperial'), undefined);
  });

  test('once every changed set is done, it stays as information only', () => {
    const entry = started();
    const allDone: SessionExercise = { ...entry, sets: entry.sets.map((s) => ({ ...s, completedAt: 'now' })) };
    const line = suggestionLine(allDone, 'imperial')!;
    assert.equal(line.text, '+10 lb · every set hit 12 last time');
    assert.equal(line.undoable, false);
    // One set left as suggested is still worth undoing.
    const oneLeft: SessionExercise = { ...allDone, sets: allDone.sets.map((s, i) => (i === allDone.sets.length - 1 ? { ...s, completedAt: undefined } : s)) };
    assert.equal(canUndoSuggestion(oneLeft), true);
  });

  test('sets all changed by hand leave nothing to undo', () => {
    const entry = started();
    const edited: SessionExercise = { ...entry, sets: entry.sets.map((s) => ({ ...s, loadKg: lbToKg(225), reps: 6 })) };
    assert.equal(canUndoSuggestion(edited), false);
  });

  test('a hold after a miss shows, but there’s nothing to undo', () => {
    const missed = first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [7, 7, 7]) })]);
    const line = suggestionLine(missed, 'imperial')!;
    assert.equal(line.direction, 'same');
    assert.equal(line.text, 'Same weight · missed reps last time');
    assert.equal(line.undoable, false);
  });

  test('a deload offers last time’s weight too', () => {
    const misses = ['2026-10-07', '2026-10-14', '2026-10-21'].map((d) => past(d, { exerciseId: SQUAT, sets: at(205, [7, 7, 7]) }));
    const line = suggestionLine(first(pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5, deload(3))), misses), 'imperial')!;
    assert.equal(line.direction, 'down');
    assert.equal(line.text, '−10% · 3 misses in a row at 205');
    assert.equal(line.undoable, true);
  });

  test('a reopened workout shows what it started with, undoable only while a set can go back', () => {
    const entry = started();
    const finished: WorkoutSession = {
      id: 'done',
      name: 'Upper A',
      status: 'completed',
      completion: 'full',
      planId: PLAN_ID,
      planWorkoutId: W,
      completedDate: TODAY,
      completedAt: `${TODAY}T10:00:00.000Z`,
      blocks: [{ id: 'b', type: 'single', exercises: [{ ...entry, sets: entry.sets.map((s) => ({ ...s, completedAt: `${TODAY}T10:00:00.000Z` })) }] }],
      createdAt: 'x',
      updatedAt: 'x',
    };
    const reopened = sessionForReopen(finished).blocks[0].exercises[0];
    const line = suggestionLine(reopened, 'imperial')!;
    assert.equal(line.text, '+10 lb · every set hit 12 last time');
    assert.equal(line.undoable, false);
  });

  test('swapping the exercise drops the line', () => {
    const entry = started();
    const workout: ActiveWorkout = { mode: 'new', session: { id: 'w', name: 'W', status: 'in_progress', blocks: [{ id: 'b', type: 'single', exercises: [entry] }], createdAt: 'x', updatedAt: 'x' } };
    const swapped = workoutReducer(workout, { type: 'swapExercise', entryId: entry.id, exerciseId: BENCH })!.session.blocks[0].exercises[0];
    assert.equal(suggestionLine(swapped, 'imperial'), undefined);
  });
});

describe('the plan editor’s words for a rule', () => {
  const sets = (reps: RepTarget[], kind: SetKind = 'normal'): SetPrescription[] => reps.map((r) => ({ kind, modifiers: [], targetReps: r }));

  test('describeProgression: rep range, fixed reps, weekly %', () => {
    assert.equal(describeProgression(repRule(5), 'imperial', sets([{ min: 8, max: 12 }])), '+5 lb at top of range · repeat on a miss');
    assert.equal(describeProgression(repRule(5, deload(3)), 'imperial', sets([{ min: 8, max: 12 }])), '+5 lb at top of range · deload 10% after 3 misses');
    assert.equal(describeProgression(repRule(5, deload(1)), 'imperial'), '+5 lb at top of range · deload 10% after a miss');
    assert.equal(describeProgression(repRule(10), 'imperial', [warmup(5), ...sets([5, 5, 5])]), '+10 lb when every set hits 5 · repeat on a miss', 'warm-ups don’t count');
    assert.equal(describeProgression(repRule(10), 'imperial', sets([5, 3, 1])), '+10 lb when every set hits its reps · repeat on a miss');
    assert.equal(describeProgression(weekly(2.5, deload(2, 15)), 'metric'), '+2.5% a week · deload 15% after 2 misses');
    assert.equal(describeProgression(undefined, 'imperial'), 'No auto progression');
  });

  test('missHint: below the bottom of the range is a miss', () => {
    assert.equal(missHint([{ min: 8, max: 12 }, { min: 8, max: 12 }], false), 'A set below the bottom of its range counts as a miss: fewer than 8 reps for 8–12.');
    assert.equal(missHint([{ min: 5, max: 5 }], false), 'A set with fewer reps than its target counts as a miss.');
    assert.equal(
      missHint([{ min: 1, max: 3 }], true),
      'A set below the bottom of its range counts as a miss: fewer than 1 rep for 1–3. Only misses in a row at the same weight count toward a deload.',
    );
    assert.equal(missHint([undefined, undefined], true), 'Add target reps to the sets so the rule can tell when you hit or miss them.');
  });

  test('assisted sets: the plan says assistance comes off, and a deload adds it', () => {
    const assistedMachine = byId.get(ASSISTED)!;
    const pullUp = byId.get(PULL_UP)!;
    assert.equal(
      describeProgression(repRule(5, deload(3)), 'imperial', sets([{ min: 5, max: 8 }]), assistedMachine),
      '5 lb less assistance at top of range · 10% more assistance after 3 misses',
    );
    assert.equal(describeProgression(weekly(2.5, deload(1)), 'imperial', sets([{ min: 5, max: 8 }]), assistedMachine), '2.5% less assistance a week · 10% more assistance after a miss');
    // Pull-ups planned as Assisted read the same way; plain pull-ups add weight.
    assert.equal(describeProgression(repRule(5), 'imperial', sets([{ min: 5, max: 8 }], 'assisted'), pullUp), '5 lb less assistance at top of range · repeat on a miss');
    assert.equal(describeProgression(repRule(5), 'imperial', sets([{ min: 5, max: 8 }]), pullUp), '+5 lb at top of range · repeat on a miss');
    assert.equal(
      missHint([{ min: 5, max: 8 }], true, true),
      'A set below the bottom of its range counts as a miss: fewer than 5 reps for 5–8. Only misses in a row at the same assistance count toward a deload.',
    );
  });
});

describe('saved suggestions', () => {
  test('a suggestion is saved with the workout, and workouts saved before G3.9 still load', async () => {
    const db = openTestDatabase();
    migrate(db);
    eraseAllData(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const planned = pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5));
    const history = [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })];
    const session = sessionFromPlan({ item: itemFor(planWith([planned])), history, exercisesById: byId, preferences: LB, today: TODAY });
    await repo.saveSession(session);
    await repo.saveSession(history[0]);
    const [loaded] = (await repo.listSessions()).filter((s) => s.id === session.id);
    assert.deepEqual(loaded.blocks[0].exercises[0].suggestion, session.blocks[0].exercises[0].suggestion);
    const old = (await repo.getSession(history[0].id))!;
    assert.equal('suggestion' in old.blocks[0].exercises[0], false);
    assert.equal(undoSuggestion(old.blocks[0].exercises[0]), old.blocks[0].exercises[0]);
  });

  test('a phone note from before G3.9 resumes as it was', () => {
    const original = past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) });
    const reopened = sessionForReopen(original);
    const found = sessionToResume({ sessionId: reopened.id, mode: 'reopen', rest: null, original }, [reopened]);
    assert.equal(found?.session.id, reopened.id);
    assert.equal(found?.meta.original?.blocks[0].exercises[0].suggestion, undefined);
  });
});

describe('“Discard it and start” after a reopen (G3.6 carry-over)', () => {
  const planned = pe(SQUAT, working(3, { min: 5, max: 8 }), repRule(5));
  const older = past('2026-10-14', { exerciseId: SQUAT, sets: at(190, [8, 8, 8]) });
  const latest = past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [8, 8, 8]) });

  test('the restored workout counts for the next start, before the sessions catch up', () => {
    // While it was reopened, the saved sessions held its unfinished version.
    const whileReopened = [older, sessionForReopen(latest)];
    assert.deepEqual(weights(first(planned, completedNewestFirst(whileReopened))), [195, 195, 195], 'the stale list skips it');
    const afterDiscard = withSessionWrite(whileReopened, { kind: 'save', session: latest });
    assert.deepEqual(weights(first(planned, completedNewestFirst(afterDiscard))), [205, 205, 205]);
  });

  test('a discarded new workout is gone, and a finished one counts straight away', () => {
    const fresh = { ...sessionForReopen(latest), id: 'fresh', completedAt: undefined, completedDate: undefined };
    assert.deepEqual(withSessionWrite([older, fresh], { kind: 'delete', sessionId: 'fresh' }), [older]);
    const finished = withSessionWrite([older], { kind: 'save', session: latest });
    assert.equal(completedNewestFirst(finished)[0].id, latest.id);
  });
});

// ---------------------------------------------------------------------------
// Review fixes (G3.9)

describe('sets planned as Assisted on a plain bodyweight exercise', () => {
  const assistedPullUps = (rule?: ProgressionRule) => pe(PULL_UP, working(3, { min: 8, max: 12 }, { kind: 'assisted' }), rule);
  const assistedAt = (date: ISODate, assistLb: number, reps: number[]) => past(date, { exerciseId: PULL_UP, sets: reps.map((r) => ({ assistLb, reps: r })) });

  test('without a rule, last time’s assistance carries over', () => {
    const entry = first(assistedPullUps(), [assistedAt('2026-10-21', 40, [10, 10, 10])]);
    assert.ok(entry.sets.every((s) => s.kind === 'assisted'));
    assert.deepEqual(weights(entry, 'assistanceKg'), [40, 40, 40]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [undefined, undefined, undefined]);
  });

  test('a rule takes assistance away, and the line says so', () => {
    const entry = first(assistedPullUps(repRule(5)), [assistedAt('2026-10-21', 40, [12, 12, 12])]);
    assert.deepEqual(weights(entry, 'assistanceKg'), [35, 35, 35]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [undefined, undefined, undefined]);
    assert.equal(entry.suggestion?.field, 'assistanceKg');
    assert.equal(toLb(entry.suggestion?.fromKg), 40);
    assert.equal(suggestionLine(entry, 'imperial')?.text, '5 lb less assistance · every set hit 12 last time');
    assert.deepEqual(weights(undoSuggestion(entry), 'assistanceKg'), [40, 40, 40]);
  });

  test('a deload adds assistance', () => {
    const entry = first(assistedPullUps(repRule(5, deload(1))), [assistedAt('2026-10-21', 40, [6, 6, 6])]);
    assert.deepEqual(weights(entry, 'assistanceKg'), [45, 45, 45]);
    assert.equal(entry.suggestion?.kind, 'deload');
  });

  test('last time logged in the other field: nothing to build on, so no suggestion', () => {
    const unassisted = past('2026-10-21', { exerciseId: PULL_UP, sets: [12, 12, 12].map((reps) => ({ addedLb: 10, reps })) });
    const entry = first(assistedPullUps(repRule(5)), [unassisted]);
    assert.equal(entry.suggestion, undefined);
    assert.deepEqual(weights(entry, 'assistanceKg'), [undefined, undefined, undefined]);
  });

  test('plain and Assisted sets mixed: each starts from last time in its own field', () => {
    const mixed = pe(PULL_UP, [...working(1, { min: 8, max: 12 }), ...working(2, { min: 8, max: 12 }, { kind: 'assisted' })]);
    const last = past('2026-10-21', { exerciseId: PULL_UP, sets: [{ addedLb: 10, reps: 8 }, { assistLb: 30, reps: 10 }, { assistLb: 40, reps: 10 }] });
    const entry = first(mixed, [last]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [10, undefined, undefined]);
    assert.deepEqual(weights(entry, 'assistanceKg'), [undefined, 30, 30], 'the least assistance');
  });
});

describe('the same exercise twice: a swapped or removed entry never borrows the other one’s', () => {
  const heavy = pe(BENCH, working(3, { min: 3, max: 5 }), repRule(5), 'pe_heavy');
  const light = pe(BENCH, working(3, { min: 10, max: 12 }), repRule(5), 'pe_light');
  const plan = planWith([heavy, light]);
  const twoWeeksAgo = past('2026-10-12', [
    { exerciseId: BENCH, sets: at(250, [5, 5, 5]), plannedId: 'pe_heavy' },
    { exerciseId: BENCH, sets: at(180, [12, 12, 12]), plannedId: 'pe_light' },
  ]);
  const heavySwapped = past('2026-10-19', [
    { exerciseId: CURL, sets: at(30, [10, 10, 10]), plannedId: 'pe_heavy' },
    { exerciseId: BENCH, sets: at(185, [12, 12, 12]), plannedId: 'pe_light' },
  ]);

  test('heavy swapped for curls last week: heavy builds on its own 250, light on its 185', () => {
    const [h, l] = start([heavy, light], [heavySwapped, twoWeeksAgo], { plan });
    assert.deepEqual(weights(h), [255, 255, 255]);
    assert.equal(h.suggestion?.topReps, 5);
    assert.deepEqual(weights(l), [190, 190, 190]);
  });

  test('light removed last week: light builds on its own 180, not heavy’s 255', () => {
    const lightRemoved = past('2026-10-19', { exerciseId: BENCH, sets: at(255, [5, 5, 5]), plannedId: 'pe_heavy' });
    const [h, l] = start([heavy, light], [lightRemoved, twoWeeksAgo], { plan });
    assert.deepEqual(weights(h), [260, 260, 260]);
    assert.deepEqual(weights(l), [185, 185, 185]);
    assert.equal(l.suggestion?.kind, 'increase');
  });

  test('the PREVIOUS column shows each one’s own last time', () => {
    const history = completedNewestFirst([heavySwapped, twoWeeksAgo]);
    const session = sessionFromPlan({ item: itemFor(plan), history, exercisesById: byId, preferences: LB, today: TODAY });
    const [h, l] = session.blocks[0].exercises;
    const previous = lastTimes(session, history);
    assert.equal(toLb(previous.get(h.id)?.sets[0].loadKg), 250);
    assert.equal(toLb(previous.get(l.id)?.sets[0].loadKg), 185);
  });

  test('a planned exercise new to the workout doesn’t take the other one’s entry', () => {
    // Heavy was added to the plan after light had been done; its last bench anywhere is a freestyle 230.
    const freestyle = past('2026-10-05', { exerciseId: BENCH, sets: at(230, [5, 5, 5]) }, { planWorkoutId: null });
    const lightOnly = past('2026-10-19', { exerciseId: BENCH, sets: at(185, [11, 11, 11]), plannedId: 'pe_light' });
    const [h, l] = start([heavy, light], [lightOnly, freestyle], { plan });
    assert.deepEqual(weights(h), [235, 235, 235]);
    assert.deepEqual(weights(l), [185, 185, 185]);
  });

  test('a planned exercise since removed from the plan still matches by position', () => {
    const before = past('2026-10-19', [
      { exerciseId: BENCH, sets: at(250, [4, 4, 4]), plannedId: 'pe_removed' },
      { exerciseId: BENCH, sets: at(185, [11, 11, 11]), plannedId: 'pe_light' },
    ]);
    const [h] = start([heavy, light], [before], { plan });
    assert.deepEqual(weights(h), [250, 250, 250]);
  });
});

describe('“Use last time’s weight” leaves a set you changed exactly as it is', () => {
  const planned = pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5));
  const started = () => first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);
  const editSet = (entry: SessionExercise, index: number, patch: Partial<LoggedSet>): SessionExercise => ({ ...entry, sets: entry.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  test('a set whose weight you typed over keeps its reps too', () => {
    const undone = undoSuggestion(editSet(started(), 0, { loadKg: lbToKg(210) }));
    assert.deepEqual(weights(undone), [210, 200, 200]);
    assert.deepEqual(repsOf(undone), [8, 12, 12]);
  });

  test('a set whose reps you changed keeps its weight', () => {
    const undone = undoSuggestion(editSet(started(), 1, { reps: 10 }));
    assert.deepEqual(weights(undone), [200, 205, 200]);
    assert.deepEqual(repsOf(undone), [12, 10, 12]);
  });

  test('every weight typed over: no weight to put back, so the line isn’t tappable and nothing changes', () => {
    const entry = started();
    const edited: SessionExercise = { ...entry, sets: entry.sets.map((s) => ({ ...s, loadKg: lbToKg(215) })) };
    assert.equal(canUndoSuggestion(edited), false);
    assert.equal(suggestionLine(edited, 'imperial')?.undoable, false);
    assert.deepEqual(undoSuggestion(edited).sets, edited.sets);
  });
});

describe('the reason line says what happened when the smallest step decides', () => {
  const threeMisses = (exerciseId: string, sets: SetSpec[]) => ['2026-10-07', '2026-10-14', '2026-10-21'].map((d) => past(d, { exerciseId, sets }));

  test('a deload on 20 lb dumbbells drops 5 lb, and says 5 lb, not 10%', () => {
    const curls = pe(CURL, working(3, { min: 8, max: 12 }), repRule(5, deload(3)));
    const entry = first(curls, threeMisses(CURL, at(20, [6, 6, 6])));
    assert.deepEqual(weights(entry), [15, 15, 15]);
    assert.equal(entry.suggestion?.minimumStep, true);
    const line = suggestionLine(entry, 'imperial')!;
    assert.equal(line.text, '−5 lb · 3 misses in a row at 20');
    assert.equal(line.label, 'Suggested deload: down 5 pounds, to 15 pounds. 3 misses in a row at 20 pounds.');
  });

  test('10 kg dumbbells go to 8 kg: “−2 kg”', () => {
    const curls = pe(CURL, working(3, { min: 8, max: 12 }), repRule(5, deload(3)));
    const entry = first(curls, threeMisses(CURL, [6, 6, 6].map((reps) => ({ kg: 10, reps }))), { prefs: KG });
    assert.deepEqual(weights(entry, 'loadKg', true), [8, 8, 8]);
    assert.equal(suggestionLine(entry, 'metric')?.text, '−2 kg · 3 misses in a row at 10');
  });

  test('added weight: +25 lb goes to +20, “−5 lb”', () => {
    const pullUps = pe(PULL_UP, working(3, { min: 5, max: 8 }), repRule(5, deload(1)));
    const entry = first(pullUps, [past('2026-10-21', { exerciseId: PULL_UP, sets: [3, 3, 3].map((reps) => ({ addedLb: 25, reps })) })]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [20, 20, 20]);
    assert.equal(suggestionLine(entry, 'imperial')?.text, '−5 lb · missed reps at +25 last time');
  });

  test('when the percent is what happened, the line keeps it', () => {
    const squat = pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5, deload(3)));
    const entry = first(squat, threeMisses(SQUAT, at(200, [6, 6, 6])));
    assert.deepEqual(weights(entry), [180, 180, 180]);
    assert.equal(entry.suggestion?.minimumStep, undefined);
    assert.equal(suggestionLine(entry, 'imperial')?.text, '−10% · 3 misses in a row at 200');
  });

  test('weekly %: 2.5% on 40 lb dumbbells is a whole 5 lb step, so the line leaves the percent out', () => {
    const curls = pe(CURL, working(3, 10), weekly(2.5));
    const entry = first(curls, [past('2026-10-21', { exerciseId: CURL, sets: at(40, [10, 10, 10]) })]);
    assert.deepEqual(weights(entry), [45, 45, 45]);
    const line = suggestionLine(entry, 'imperial')!;
    assert.equal(line.text, '+5 lb · new week, reps hit last time');
    assert.equal(line.label, 'Suggested weight up 5 pounds, to 45 pounds. New week, and you hit your reps last time.');
    const metric = first(curls, [past('2026-10-21', { exerciseId: CURL, sets: [10, 10, 10].map((reps) => ({ kg: 16, reps })) })], { prefs: KG });
    assert.deepEqual(weights(metric, 'loadKg', true), [18, 18, 18]);
    assert.equal(suggestionLine(metric, 'metric')?.text, '+2 kg · new week, reps hit last time');
    const squat = first(pe(SQUAT, working(3, 5), weekly(2.5)), [past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [5, 5, 5]) })]);
    assert.equal(suggestionLine(squat, 'imperial')?.text, '+5 lb · new week, +2.5%', '200 to 205 is the 2.5%');
  });

  test('assisted weekly %: no minus sign next to the up arrow', () => {
    const rule = (percent: number) => pe(ASSISTED, working(3, { min: 5, max: 8 }), weekly(percent));
    const lastAt = (assistLb: number) => [past('2026-10-21', { exerciseId: ASSISTED, sets: [6, 6, 6].map((reps) => ({ assistLb, reps })) })];
    const small = suggestionLine(first(rule(2.5), lastAt(40)), 'imperial')!;
    assert.equal(small.direction, 'up');
    assert.equal(small.text, '5 lb less assistance · new week, reps hit last time');
    const big = first(rule(10), lastAt(100));
    assert.deepEqual(weights(big, 'assistanceKg'), [90, 90, 90]);
    assert.equal(suggestionLine(big, 'imperial')?.text, '10 lb less assistance · new week, 10% less');
  });
});

// ---------------------------------------------------------------------------
// Second review pass (G3.9)

describe('history from elsewhere: a miss is judged by the target it was done against', () => {
  const bench8to12 = (onMiss: MissBehavior) => pe(BENCH, working(3, { min: 8, max: 12 }), repRule(5, onMiss));
  // Another plan's heavy bench, each set logged with its target of 5.
  const oldPlan = (date: ISODate, reps = [5, 5, 5, 5, 5]) =>
    past(date, { exerciseId: BENCH, sets: at(250, reps, { target: 5 }), plannedId: 'pe_old' }, { planId: 'plan_old', planWorkoutId: 'pw_old' });
  const allHit = ['2026-10-21', '2026-10-14', '2026-10-07'].map((d) => oldPlan(d));

  test('a new plan’s first bench after three 5x5s that were all hit: no misses, no deload', () => {
    for (const onMiss of [repeat, deload(3)]) {
      const entry = first(bench8to12(onMiss), allHit);
      assert.deepEqual(weights(entry), [250, 250, 250]);
      assert.equal(entry.suggestion, undefined);
    }
  });

  test('the first light day after the heavy day: its 5s aren’t misses for an 8-12', () => {
    const light = pe(BENCH, working(3, { min: 8, max: 12 }), repRule(5, deload(1)), 'pe_light');
    const heavyDay = past('2026-10-26', { exerciseId: BENCH, sets: at(250, [5, 5, 5, 5, 5], { target: 5 }), plannedId: 'pe_heavy' }, { planWorkoutId: 'pw_heavy' });
    const entry = first(light, [heavyDay], { today: '2026-10-28' });
    assert.deepEqual(weights(entry), [250, 250, 250]);
    assert.equal(entry.suggestion, undefined);
  });

  test('a set short of its own target is still a miss', () => {
    const entry = first(bench8to12(repeat), [oldPlan('2026-10-21', [5, 5, 5, 5, 4])]);
    assert.equal(entry.suggestion?.kind, 'hold_after_miss');
    assert.equal(suggestionLine(entry, 'imperial')?.text, 'Same weight · missed reps last time');
  });

  test('a set logged with no target (freestyle) is never a miss, though hitting the top still counts', () => {
    const freestyle = (lb: number, reps: number[]) => past('2026-10-21', { exerciseId: BENCH, sets: at(lb, reps) }, { planWorkoutId: null });
    assert.equal(first(bench8to12(deload(1)), [freestyle(250, [5, 5, 5])]).suggestion, undefined);
    assert.deepEqual(weights(first(bench8to12(repeat), [freestyle(150, [12, 12, 12])])), [155, 155, 155]);
  });

  test('this plan workout’s own history still uses the plan’s targets now', () => {
    const own = past('2026-10-21', { exerciseId: BENCH, sets: at(250, [5, 5, 5], { target: 5 }) });
    assert.equal(first(bench8to12(repeat), [own]).suggestion?.kind, 'hold_after_miss');
  });
});

describe('PREVIOUS when one of two bench entries is removed partway', () => {
  const heavy = pe(BENCH, working(3, { min: 3, max: 5 }), repRule(5), 'pe_heavy');
  const light = pe(BENCH, working(3, { min: 10, max: 12 }), repRule(5), 'pe_light');
  const plan = planWith([heavy, light]);
  // What the workout screen passes: the plan workout's planned exercise ids.
  const planIds = plan.workouts[0].blocks.flatMap((b) => b.exercises.map((e) => e.id));
  const twoWeeksAgo = past('2026-10-12', [
    { exerciseId: BENCH, sets: at(250, [5, 5, 5]), plannedId: 'pe_heavy' },
    { exerciseId: BENCH, sets: at(180, [12, 12, 12]), plannedId: 'pe_light' },
  ]);
  const lastWeek = {
    'light removed': past('2026-10-19', { exerciseId: BENCH, sets: at(255, [5, 5, 5]), plannedId: 'pe_heavy' }),
    'light swapped for curls': past('2026-10-19', [
      { exerciseId: BENCH, sets: at(255, [5, 5, 5]), plannedId: 'pe_heavy' },
      { exerciseId: CURL, sets: at(30, [12, 12, 12]), plannedId: 'pe_light' },
    ]),
  };

  for (const [what, session] of Object.entries(lastWeek)) {
    test(`${what} last week, heavy removed today: light still shows its own 180 x 12`, () => {
      const history = completedNewestFirst([session, twoWeeksAgo]);
      const today = sessionFromPlan({ item: itemFor(plan), history, exercisesById: byId, preferences: LB, today: TODAY });
      const [h, l] = today.blocks[0].exercises;
      assert.deepEqual(weights(l), [185, 185, 185]);
      const workout: ActiveWorkout = { mode: 'new', session: today };
      const removed = workoutReducer(workout, { type: 'removeExercise', entryId: h.id })!.session;
      const previous = lastTimes(removed, history, planIds).get(l.id);
      assert.deepEqual(previous?.sets.map((s) => [toLb(s.loadKg), s.reps]), [[180, 12], [180, 12], [180, 12]]);
    });
  }
});

describe('plain and Assisted pull-ups mixed, with a rule', () => {
  const mixed = pe(PULL_UP, [...working(2, { min: 8, max: 12 }), ...working(1, { min: 8, max: 12 }, { kind: 'assisted' })], repRule(5));
  const last = past('2026-10-21', { exerciseId: PULL_UP, sets: [{ addedLb: 10, reps: 12 }, { addedLb: 10, reps: 12 }, { assistLb: 30, reps: 12 }] });

  test('the Assisted set, which the rule doesn’t move, keeps last time’s reps', () => {
    const entry = first(mixed, [last]);
    assert.deepEqual(weights(entry, 'addedLoadKg'), [15, 15, undefined]);
    assert.deepEqual(weights(entry, 'assistanceKg'), [undefined, undefined, 30]);
    assert.deepEqual(repsOf(entry), [8, 8, 12]);
    assert.deepEqual(entry.suggestion?.sets.map((s) => s.setId), [entry.sets[0].id, entry.sets[1].id]);
    const undone = undoSuggestion(entry);
    assert.deepEqual(weights(undone, 'addedLoadKg'), [10, 10, undefined]);
    assert.deepEqual(repsOf(undone), [12, 12, 12]);
  });
});

describe('“Use last time’s weight”: added sets and kind changes', () => {
  const planned = pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5));
  const history = completedNewestFirst([past('2026-10-21', { exerciseId: SQUAT, sets: at(200, [12, 12, 12]) })]);
  const begin = (): ActiveWorkout => ({ mode: 'new', session: sessionFromPlan({ item: itemFor(planWith([planned])), history, exercisesById: byId, preferences: LB, today: TODAY }) });
  const entryOf = (w: ActiveWorkout | null) => w!.session.blocks[0].exercises[0];
  const act = (w: ActiveWorkout | null, ...actions: ((entry: SessionExercise) => WorkoutAction)[]) =>
    actions.reduce((state, make) => workoutReducer(state, make(entryOf(state))), w);

  test('an added set with its reps changed stays; an untouched one goes back', () => {
    const changed = act(
      begin(),
      (e) => ({ type: 'addSet', entryId: e.id }),
      (e) => ({ type: 'updateSet', entryId: e.id, setId: e.sets[3].id, patch: { reps: 10 } }),
      (e) => ({ type: 'undoSuggestion', entryId: e.id }),
    );
    assert.deepEqual(weights(entryOf(changed)), [200, 200, 200, 205]);
    assert.deepEqual(repsOf(entryOf(changed)), [12, 12, 12, 10]);
    const untouched = act(
      begin(),
      (e) => ({ type: 'addSet', entryId: e.id }),
      (e) => ({ type: 'undoSuggestion', entryId: e.id }),
    );
    assert.deepEqual(weights(entryOf(untouched)), [200, 200, 200, 200]);
  });

  test('with only a changed added set left, there’s nothing to put back', () => {
    const w = act(
      begin(),
      ...[0, 1, 2].map((i) => (e: SessionExercise): WorkoutAction => ({ type: 'completeSet', entryId: e.id, setId: e.sets[i].id, completedAt: 'now' })),
      (e) => ({ type: 'addSet', entryId: e.id }),
      (e) => ({ type: 'updateSet', entryId: e.id, setId: e.sets[3].id, patch: { reps: 10 } }),
    );
    assert.equal(canUndoSuggestion(entryOf(w)), false);
  });

  test('a set changed to a drop set stays as it is', () => {
    const w = act(begin(), (e) => ({ type: 'updateSet', entryId: e.id, setId: e.sets[2].id, patch: { kind: 'drop' } }));
    assert.equal(entryOf(w).suggestion?.sets[2].kind, 'normal');
    const undone = undoSuggestion(entryOf(w));
    assert.deepEqual(weights(undone), [200, 200, 205]);
    assert.deepEqual(repsOf(undone), [12, 12, 8]);
    assert.equal(undone.sets[2].kind, 'drop');
  });
});

describe('off the increment: the rule builds on what was lifted', () => {
  test('82.5 lb with a +2.5 lb rule is 85 on a 5 lb increment, not 90', () => {
    const entry = first(pe(SQUAT, working(3, 5), repRule(2.5)), [past('2026-10-21', { exerciseId: SQUAT, sets: at(82.5, [5, 5, 5]) })]);
    assert.deepEqual(weights(entry), [85, 85, 85]);
    assert.equal(toLb(entry.suggestion?.fromKg), 82.5);
    assert.equal(suggestionLine(entry, 'imperial')?.text, '+2.5 lb · every set hit 5 last time');
    assert.equal(suggestionLine(entry, 'imperial')?.undoable, false, 'without the rule it’s 85 too');
  });

  test('137.5 lb: +2.5 lb or 2.5% a week is 140; on the increment, 135 plus 2.5 is 140', () => {
    const lifted = (lb: number, reps: number[]) => [past('2026-10-21', { exerciseId: SQUAT, sets: at(lb, reps) })];
    assert.deepEqual(weights(first(pe(SQUAT, working(3, { min: 5, max: 8 }), repRule(2.5)), lifted(137.5, [8, 8, 8]))), [140, 140, 140]);
    const weeklyEntry = first(pe(SQUAT, working(3, 5), weekly(2.5)), lifted(137.5, [5, 5, 5]));
    assert.deepEqual(weights(weeklyEntry), [140, 140, 140]);
    assert.equal(suggestionLine(weeklyEntry, 'imperial')?.text, '+2.5 lb · new week, +2.5%');
    const onGrid = first(pe(SQUAT, working(3, 5), repRule(2.5)), lifted(135, [5, 5, 5]));
    assert.deepEqual(weights(onGrid), [140, 140, 140]);
    assert.equal(suggestionLine(onGrid, 'imperial')?.text, '+5 lb · every set hit 5 last time');
  });

  test('a deload off the increment says the weight that was missed', () => {
    const misses = ['2026-10-07', '2026-10-14', '2026-10-21'].map((d) => past(d, { exerciseId: SQUAT, sets: at(207, [6, 6, 6]) }));
    const entry = first(pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5, deload(3))), misses);
    assert.deepEqual(weights(entry), [185, 185, 185]);
    assert.equal(suggestionLine(entry, 'imperial')?.text, '−10% · 3 misses in a row at 207');
    const holding = first(pe(SQUAT, working(3, { min: 8, max: 12 }), repRule(5)), misses);
    assert.deepEqual(weights(holding), [205, 205, 205]);
    assert.equal(toLb(holding.suggestion?.toKg), 205);
  });
});

describe('the reason line to the hundredth, and “1 pound”', () => {
  const microKg: ProgressionPreferences = { ...KG, roundingIncrements: { ...defaultRounding.metric, barbell: 1.25 } };
  const microLb: ProgressionPreferences = { ...LB, roundingIncrements: { ...defaultRounding.imperial, barbell: 1.25 } };

  test('a 1.25 kg step reads +1.25 kg, to 61.25', () => {
    const planned = pe(SQUAT, working(3, { min: 8, max: 12 }), { type: 'rep_range', incrementKg: 1.25, onMiss: repeat });
    const entry = first(planned, [past('2026-10-21', { exerciseId: SQUAT, sets: [12, 12, 12].map((reps) => ({ kg: 60, reps })) })], { prefs: microKg });
    assert.deepEqual(weights(entry, 'loadKg', true), [61.25, 61.25, 61.25]);
    const line = suggestionLine(entry, 'metric')!;
    assert.equal(line.text, '+1.25 kg · every set hit 12 last time');
    assert.equal(line.label, 'Suggested weight up 1.25 kilograms, to 61.25 kilograms. Every set hit 12 reps last time.');
  });

  test('a 1.25 lb step on added weight reads +1.25 lb, the same as on a barbell', () => {
    const pullUps = pe(PULL_UP, working(3, { min: 8, max: 12 }), repRule(1.25));
    const entry = first(pullUps, [past('2026-10-21', { exerciseId: PULL_UP, sets: [12, 12, 12].map((reps) => ({ addedLb: 25, reps })) })], { prefs: microLb });
    assert.deepEqual(weights(entry, 'addedLoadKg'), [26.25, 26.25, 26.25]);
    const line = suggestionLine(entry, 'imperial')!;
    assert.equal(line.text, '+1.25 lb · every set hit 12 last time');
    assert.equal(line.label, 'Suggested added weight up 1.25 pounds, to bodyweight plus 26.25 pounds. Every set hit 12 reps last time.');
  });

  test('one unit is “1 pound” and “1 kilogram”', () => {
    const one = { rule: 'rep_range' as const, field: 'loadKg' as const, kind: 'increase' as const, topReps: 12, sets: [] };
    assert.equal(describeSuggestion({ ...one, fromKg: 60, toKg: 61 }, 'metric')!.label, 'Suggested weight up 1 kilogram, to 61 kilograms. Every set hit 12 reps last time.');
    assert.equal(describeSuggestion({ ...one, fromKg: lbToKg(205), toKg: lbToKg(206) }, 'imperial')!.label, 'Suggested weight up 1 pound, to 206 pounds. Every set hit 12 reps last time.');
    assert.equal(spokenLoad(lbToKg(1), 'imperial'), '1 pound');
    assert.equal(spokenLoad(1, 'metric'), '1 kilogram');
    assert.equal(spokenLoad(lbToKg(11), 'imperial'), '11 pounds');
  });
});
