import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { derivePersonalRecords, deriveRecordBests, livePRSetIds, newRecords, sessionsBefore } from '../src/data/records';
import { asBeforeReopen } from '../src/data/reopen';
import type { LoggedSet, PersonalRecord, WorkoutSession } from '../src/data/types';
import { sessionForFinish, sessionForReopen } from '../src/features/workout/buildSession';
import { bodyweightForSet, lastEntryFor, recordsAddedByReopen } from '../src/features/workout/history';
import { continueAs, discardPlan, sessionToResume } from '../src/features/workout/persistence';
import { countSets, workoutReducer, type ActiveWorkout } from '../src/features/workout/workoutReducer';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
const SQUAT = 'ex_back_squat';
const BENCH = 'ex_bench_press';
const PULL_UP = 'ex_pull_up';
const ASSISTED_PULL_UP = 'ex_assisted_pull_up';
const TODAY = '2026-10-22';

let nextId = 0;
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], ...patch });
/** A set done on `day`, `minute` minutes into the hour, so sets within a workout keep their order. */
const lifted = (day: string, loadKg: number, reps: number, minute = 0, patch: Partial<LoggedSet> = {}) =>
  set({ loadKg, reps, completedAt: `${day}T10:${String(minute).padStart(2, '0')}:00.000Z`, ...patch });

/** A workout with one single-exercise block per entry; entry ids are e0, e1, … */
const workoutOn = (day: string, entries: [exerciseId: string, sets: LoggedSet[]][], status: WorkoutSession['status'] = 'completed'): WorkoutSession => ({
  id: `sess_${day}_${nextId++}`,
  name: day,
  status,
  completion: status === 'completed' ? 'full' : undefined,
  completedDate: status === 'completed' ? day : undefined,
  completedAt: status === 'completed' ? `${day}T11:00:00.000Z` : undefined,
  startedAt: `${day}T10:00:00.000Z`,
  blocks: entries.map(([exerciseId, sets], i) => ({ id: `b${i}`, type: 'single', exercises: [{ id: `e${i}`, exerciseId, skipped: false, sets }] })),
  createdAt: `${day}T10:00:00.000Z`,
  updatedAt: `${day}T11:00:00.000Z`,
});

const open = (session: WorkoutSession, mode: ActiveWorkout['mode'] = 'new'): ActiveWorkout => ({ mode, session });
const setsOf = (workout: ActiveWorkout | null, entry = 0) => workout!.session.blocks[entry].exercises[0].sets;
const edit = (workout: ActiveWorkout | null, setId: string, patch: Partial<LoggedSet>, entryId = 'e0') => workoutReducer(workout, { type: 'updateSet', entryId, setId, patch });

/** The live PR badges, measured the way the app does: against the finished workouts before this one. */
const badges = (sessions: WorkoutSession[], workout: ActiveWorkout | null) =>
  livePRSetIds(workout!.session, deriveRecordBests(sessionsBefore(sessions, workout!.session, workout!.mode), exercisesById), exercisesById);

describe('editing the live workout', () => {
  test('an assisted exercise is added with assisted sets; any other with normal sets', () => {
    const empty = open(workoutOn(TODAY, [], 'in_progress'));
    const assisted = workoutReducer(empty, { type: 'addExercise', exerciseId: ASSISTED_PULL_UP, isAssisted: true });
    assert.deepEqual(setsOf(assisted).map((s) => s.kind), ['assisted', 'assisted', 'assisted']);
    const plain = workoutReducer(empty, { type: 'addExercise', exerciseId: SQUAT });
    assert.deepEqual(setsOf(plain).map((s) => s.kind), ['normal', 'normal', 'normal']);
  });

  test('a swap switches normal and assisted sets to suit the new exercise, both ways, and clears what was logged', () => {
    const logged = set({ id: 'top', reps: 8, addedLoadKg: 10, bodyweightSnapshotKg: 80, effectiveLoadOverrideKg: 85, recordingId: 'rec1', completedAt: `${TODAY}T10:00:00.000Z` });
    const pullUps = open(workoutOn(TODAY, [[PULL_UP, [set({ kind: 'warmup', reps: 5 }), logged, set({ kind: 'drop', addedLoadKg: 5, reps: 6 }), set({ kind: 'timed_hold', durationSec: 30 })]]], 'in_progress'));

    const toAssisted = workoutReducer(pullUps, { type: 'swapExercise', entryId: 'e0', exerciseId: ASSISTED_PULL_UP, isAssisted: true });
    assert.deepEqual(setsOf(toAssisted).map((s) => s.kind), ['warmup', 'assisted', 'drop', 'timed_hold']);
    const swapped = setsOf(toAssisted)[1];
    for (const field of ['completedAt', 'loadKg', 'addedLoadKg', 'assistanceKg', 'effectiveLoadOverrideKg', 'bodyweightSnapshotKg', 'recordingId'] as const) {
      assert.equal(swapped[field], undefined, field);
    }
    assert.equal(swapped.reps, 8, 'reps are kept');

    const withAssistance = edit(toAssisted, 'top', { assistanceKg: 20 });
    const back = workoutReducer(withAssistance, { type: 'swapExercise', entryId: 'e0', exerciseId: PULL_UP, isAssisted: false });
    assert.deepEqual(setsOf(back).map((s) => s.kind), ['warmup', 'normal', 'drop', 'timed_hold']);
    assert.equal(setsOf(back)[1].assistanceKg, undefined);
  });

  test('switching a set to assisted drops its added weight; switching back drops its assistance', () => {
    const pullUps = open(workoutOn(TODAY, [[PULL_UP, [set({ id: 'x', addedLoadKg: 10, reps: 8 })]]], 'in_progress'));
    const assisted = edit(pullUps, 'x', { kind: 'assisted' });
    assert.equal(setsOf(assisted)[0].addedLoadKg, undefined);
    const withAssistance = edit(assisted, 'x', { assistanceKg: 20 });
    assert.equal(setsOf(withAssistance)[0].assistanceKg, 20);
    const normal = edit(withAssistance, 'x', { kind: 'normal' });
    assert.equal(setsOf(normal)[0].kind, 'normal');
    assert.equal(setsOf(normal)[0].assistanceKg, undefined);
    // Other kind changes keep the weight.
    assert.equal(setsOf(edit(pullUps, 'x', { kind: 'drop' }))[0].addedLoadKg, 10);
  });

  test('re-checking a set in a reopened workout keeps the bodyweight it was logged with', () => {
    const old = open(sessionForReopen(workoutOn('2026-10-01', [[PULL_UP, [set({ id: 'x', reps: 8, bodyweightSnapshotKg: 80, completedAt: '2026-10-01T10:00:00.000Z' })]]])), 'reopen');
    const unchecked = workoutReducer(old, { type: 'uncompleteSet', entryId: 'e0', setId: 'x' });
    const rechecked = workoutReducer(unchecked, { type: 'completeSet', entryId: 'e0', setId: 'x', completedAt: `${TODAY}T10:00:00.000Z`, bodyweightKg: 85 });
    assert.equal(setsOf(rechecked)[0].bodyweightSnapshotKg, 80);
    // A set with no snapshot yet takes today's.
    const fresh = open(workoutOn(TODAY, [[PULL_UP, [set({ id: 'y', reps: 8 })]]], 'in_progress'));
    assert.equal(setsOf(workoutReducer(fresh, { type: 'completeSet', entryId: 'e0', setId: 'y', completedAt: 'now', bodyweightKg: 85 }))[0].bodyweightSnapshotKg, 85);
  });
});

describe('live PR badge (spec 2.6)', () => {
  const history = [workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 100, 5)]]]), workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 110, 5)]]])];
  const today = () => {
    const heavy = lifted(TODAY, 120, 5, 1);
    const next = lifted(TODAY, 115, 5, 2);
    return { heavy, next, workout: open(workoutOn(TODAY, [[SQUAT, [heavy, next]]], 'in_progress')) };
  };

  test('only a set that beats every set before it gets the badge', () => {
    const { heavy, workout } = today();
    // 115 beats last week's 110, but not the 120 done earlier today.
    assert.deepEqual([...badges([...history, workout.session], workout)], [heavy.id]);
  });

  test('an exercise’s first-ever workout shows no badge', () => {
    const bench = open(workoutOn(TODAY, [[BENCH, [lifted(TODAY, 100, 5, 1), lifted(TODAY, 110, 5, 2)]]], 'in_progress'));
    assert.equal(badges([...history, bench.session], bench).size, 0);
    assert.equal(badges([bench.session], bench).size, 0);
  });

  test('editing a badged set to a warm-up or a lower weight takes its badge away', () => {
    const { heavy, next, workout } = today();
    const all = (w: ActiveWorkout | null) => [...history, w!.session];
    for (const patch of [{ kind: 'warmup' as const }, { loadKg: 105 }]) {
      const edited = edit(workout, heavy.id, patch);
      const flagged = badges(all(edited), edited);
      assert.ok(!flagged.has(heavy.id), JSON.stringify(patch));
      // With the 120 gone, 115 is now the heaviest since last week.
      assert.ok(flagged.has(next.id), JSON.stringify(patch));
    }
    const unchecked = workoutReducer(workout, { type: 'uncompleteSet', entryId: 'e0', setId: heavy.id });
    assert.ok(!badges(all(unchecked), unchecked).has(heavy.id));
  });

  test('sets done before an exercise is skipped keep their badge', () => {
    const { heavy, workout } = today();
    const skipped = workoutReducer(workout, { type: 'toggleSkip', entryId: 'e0' });
    assert.ok(badges([...history, skipped!.session], skipped).has(heavy.id));
  });

  test('a history of only sets over 12 reps gives no e1RM to beat, so no false badge', () => {
    const highReps = [workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 60, 15)]]])];
    const workout = open(workoutOn(TODAY, [[SQUAT, [lifted(TODAY, 60, 10, 1)]]], 'in_progress'));
    assert.equal(badges([...highReps, workout.session], workout).size, 0);
  });

  test('a reopened workout is measured only against workouts finished before it', () => {
    const first = workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 100, 5)]]]);
    const middle = workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 105, 5, 0, { id: 'mid' })]]]);
    const later = workoutOn('2026-10-15', [[SQUAT, [lifted('2026-10-15', 130, 5)]]]);
    const all = [first, middle, later];
    const edited = edit(open(sessionForReopen(middle), 'reopen'), 'mid', { loadKg: 120 });

    assert.deepEqual(sessionsBefore(all, edited!.session, 'reopen').map((s) => s.id), [first.id]);
    assert.ok(badges(all, edited).has('mid'));
    // Measured against every other workout, the later 130 would hide it.
    assert.ok(!badges(all, { ...edited!, mode: 'new' }).has('mid'));
  });
});

describe('finishing a reopened workout (G3.6)', () => {
  const summary = (records: PersonalRecord[]) => records.map((r) => [r.type, Math.round(r.value * 100) / 100]);
  const finish = (workout: ActiveWorkout | null): WorkoutSession => ({ ...workout!.session, status: 'completed' });

  test('finishing without changes adds no records', () => {
    const first = workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 100, 5)]]]);
    const original = workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 110, 5)]]]);
    const unchanged = finish(open(sessionForReopen(original), 'reopen'));
    assert.ok(derivePersonalRecords([first, original], exercisesById).length > 0, 'the workout already holds records');
    assert.deepEqual(newRecords(derivePersonalRecords([first, original], exercisesById), derivePersonalRecords([first, unchanged], exercisesById)), []);
    assert.deepEqual(recordsAddedByReopen([first, original], original, unchanged, exercisesById), []);
  });

  test('a heavier edit adds only the record it changed', () => {
    const first = workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 100, 5)]]]);
    const original = workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 110, 5), lifted('2026-10-08', 90, 20, 1, { id: 'light' })]]]);
    // 90 × 20 → 120 × 15: the same volume and no e1RM (over 12 reps), but a heavier weight.
    const edited = finish(edit(open(sessionForReopen(original), 'reopen'), 'light', { loadKg: 120, reps: 15 }));
    const added = newRecords(derivePersonalRecords([first, original], exercisesById), derivePersonalRecords([first, edited], exercisesById));
    assert.deepEqual(summary(added), [['heaviest_weight', 120]]);
    assert.deepEqual(summary(recordsAddedByReopen([first, original], original, edited, exercisesById)), [['heaviest_weight', 120]]);
  });

  test('lowering a record, or handing one to a later workout, is nothing to celebrate', () => {
    const first = workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 100, 5)]]]);
    const middle = workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 120, 5, 0, { id: 'top' })]]]);
    const later = workoutOn('2026-10-15', [[SQUAT, [lifted('2026-10-15', 110, 5)]]]);
    const lowered = finish(edit(open(sessionForReopen(middle), 'reopen'), 'top', { loadKg: 105 }));
    const after = derivePersonalRecords([first, lowered, later], exercisesById);
    // 105 still beats 100, and the later 110 now beats 105, but both only follow from the correction.
    assert.ok(after.some((r) => r.sessionId === middle.id));
    assert.ok(after.some((r) => r.sessionId === later.id));
    assert.deepEqual(recordsAddedByReopen([first, middle, later], middle, lowered, exercisesById), []);
  });
});

describe('the copy a reopened workout keeps (spec 2.10)', () => {
  test('it reads as it was until Finish, which saves the edits and drops the copy', () => {
    const finished = workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 100, 5, 0, { id: 'top' })]]]);
    const reopened = sessionForReopen(finished);
    assert.deepEqual(reopened.beforeReopen, finished);
    const edited = edit(open(reopened, 'reopen'), 'top', { loadKg: 200 })!.session;
    assert.deepEqual(asBeforeReopen(edited), finished);

    const saved = sessionForFinish(edited, true, new Date(`${TODAY}T18:00:00.000Z`));
    assert.equal('beforeReopen' in saved, false);
    assert.deepEqual([saved.status, saved.completion, saved.completedAt, saved.completedDate], ['completed', 'full', finished.completedAt, '2026-10-08']);
    assert.equal(saved.blocks[0].exercises[0].sets[0].loadKg, 200);
  });

  test('the copy is never nested, even from a session that still has one', () => {
    const finished = workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 100, 5)]]]);
    const stale = { ...finished, beforeReopen: { ...finished, name: 'Old name' } };
    assert.deepEqual(sessionForReopen(stale).beforeReopen, finished);
  });

  test('a new workout finishes now', () => {
    const now = new Date(`${TODAY}T18:00:00.000Z`);
    const saved = sessionForFinish(workoutOn(TODAY, [[SQUAT, [lifted(TODAY, 100, 5), set({ loadKg: 100, reps: 5 })]]], 'in_progress'), false, now);
    assert.deepEqual([saved.status, saved.completion, saved.completedAt], ['completed', 'partial', now.toISOString()]);
  });
});

describe('resuming without the phone’s note', () => {
  test('a reopened workout resumes as a reopen; its restore point keeps the date, and discarding restores it', () => {
    // Finished with one set never logged, so partial.
    const finished: WorkoutSession = { ...workoutOn('2026-10-08', [[SQUAT, [lifted('2026-10-08', 100, 5), set({ loadKg: 100, reps: 5 })]]]), completion: 'partial' };
    const reopened = { ...sessionForReopen(finished), startedAt: `${TODAY}T09:00:00.000Z` };
    const found = sessionToResume(null, [reopened]);
    assert.equal(found?.session.id, finished.id);
    assert.equal(found?.meta.mode, 'reopen');
    assert.equal(found?.session.completedAt, finished.completedAt, 'Finish keeps the original day');
    const restorePoint = found!.meta.original!;
    assert.equal(restorePoint.status, 'completed');
    assert.equal(restorePoint.completedAt, finished.completedAt);
    assert.equal(restorePoint.completedDate, '2026-10-08');
    assert.equal(restorePoint.completion, 'partial', 'one set was never logged');
    assert.deepEqual(restorePoint, finished, 'as it was before the reopen, without the copy');
    assert.deepEqual(discardPlan(found!.meta, reopened.id), { kind: 'restore', session: restorePoint });
  });

  test('a new workout resumes as new, and discarding it deletes it', () => {
    const fresh = workoutOn(TODAY, [[SQUAT, [lifted(TODAY, 100, 5)]]], 'in_progress');
    const found = sessionToResume(null, [fresh]);
    assert.equal(found?.meta.mode, 'new');
    assert.equal(found?.meta.original, undefined);
    assert.deepEqual(discardPlan(found!.meta, fresh.id), { kind: 'delete', sessionId: fresh.id });
  });
});

describe('an exercise skipped partway (G3.6 review)', () => {
  const partway = () => {
    const w = workoutOn(TODAY, [[SQUAT, [lifted(TODAY, 100, 5, 1), lifted(TODAY, 100, 5, 2), set({ loadKg: 100, reps: 5 })]], [BENCH, [set({ loadKg: 60, reps: 8 })]]], 'in_progress');
    w.blocks[0].exercises[0].skipped = true;
    return w;
  };

  test('its done sets count toward progress, so Finish can save the workout', () => {
    assert.deepEqual(countSets(partway()), { done: 2, total: 3 });
  });

  test('warm-ups alone don’t make it “last time”', () => {
    const earlier = workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 90, 5)]]]);
    const warmedUp = workoutOn('2026-10-15', [[SQUAT, [lifted('2026-10-15', 60, 5, 1, { kind: 'warmup' }), set({ loadKg: 100, reps: 5 })]]]);
    warmedUp.blocks[0].exercises[0].skipped = true;
    assert.equal(lastEntryFor(SQUAT, [warmedUp, earlier])?.sets[0].loadKg, 90);
  });

  test('it is the last time for PREVIOUS and pre-fill', () => {
    const earlier = workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 90, 5)]]]);
    const skipped = { ...partway(), status: 'completed' as const, completedDate: '2026-10-15', completedAt: '2026-10-15T11:00:00.000Z' };
    assert.equal(lastEntryFor(SQUAT, [skipped, earlier])?.sets[0].loadKg, 100);
  });
});

describe('continuing a leftover unfinished workout (G3.6 review)', () => {
  test('one that was reopened continues as a reopen, with itself as the restore point', () => {
    const reopened = { ...workoutOn('2026-10-01', [[SQUAT, [lifted('2026-10-01', 100, 5)]]]), status: 'in_progress' as const };
    const how = continueAs(reopened);
    assert.equal(how.mode, 'reopen');
    assert.equal(how.original?.status, 'completed');
    assert.equal(how.original?.completedAt, reopened.completedAt);
  });

  test('a new one continues as new', () => {
    assert.deepEqual(continueAs(workoutOn(TODAY, [[SQUAT, [set()]]], 'in_progress')), { mode: 'new' });
  });
});

describe('bodyweight saved with a completed set (G3.6 review)', () => {
  const weighIns = [
    { id: 'w1', date: '2026-01-01', weightKg: 80, createdAt: '', updatedAt: '' },
    { id: 'w2', date: '2026-10-20', weightKg: 90, createdAt: '', updatedAt: '' },
  ];
  const old = workoutOn('2026-03-01', [[PULL_UP, [lifted('2026-03-01', 0, 8, 1, { loadKg: undefined })]]]);
  const loggedId = old.blocks[0].exercises[0].sets[0].id;

  test('a new workout uses the latest weigh-in', () => {
    assert.equal(bodyweightForSet(open(workoutOn(TODAY, [[PULL_UP, [set()]]], 'in_progress')), undefined, 'x', weighIns), 90);
  });

  test('in a reopen, a set logged the first time keeps what it had, even none', () => {
    assert.equal(bodyweightForSet(open(sessionForReopen(old), 'reopen'), old, loggedId, weighIns), undefined);
  });

  test('in a reopen, a set swapped to another exercise takes the weigh-in from that day', () => {
    const reopened = workoutReducer(open(sessionForReopen(old), 'reopen'), { type: 'swapExercise', entryId: 'e0', exerciseId: 'ex_chin_up' });
    assert.equal(bodyweightForSet(reopened!, old, loggedId, weighIns), 80);
  });

  test('in a reopen, a set first done now uses the weigh-in from that day or before', () => {
    assert.equal(bodyweightForSet(open(sessionForReopen(old), 'reopen'), old, 'added-now', weighIns), 80);
  });
});
