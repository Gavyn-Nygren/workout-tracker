import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { addDays } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { defaultPreferences } from '../src/data/preferences';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import type { Plan, WorkoutSession } from '../src/data/types';
import { buildAgenda, type DayItem } from '../src/features/today/agenda';
import { sessionForReopen, sessionFromPlan } from '../src/features/workout/buildSession';
import { discardPlan, restoredRest, sessionToResume, type ActiveWorkoutMeta } from '../src/features/workout/persistence';
import { workoutReducer, type ActiveWorkout } from '../src/features/workout/workoutReducer';
import { openTestDatabase } from './support/nodeSqlite';

const MONDAY = '2026-10-19';
const STAMP = `${MONDAY}T08:00:00.000Z`;
const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));

const plan: Plan = {
  id: 'p',
  name: 'Strength',
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule: { type: 'weekly', days: ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({ weekday, workoutIds: ['a'] })) },
  workouts: [
    {
      id: 'a',
      name: 'Squat Day',
      blocks: [{ id: 'b1', type: 'single', exercises: [{ id: 'pe1', exerciseId: 'ex_back_squat', sets: [{ kind: 'normal', modifiers: [], targetReps: 5 }, { kind: 'normal', modifiers: [], targetReps: 5 }] }] }],
    },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
};

describe('resuming an unfinished workout', () => {
  const session = (id: string, status: WorkoutSession['status'], startedAt: string): WorkoutSession => ({ id, name: id, status, startedAt, blocks: [], createdAt: startedAt, updatedAt: startedAt });

  test('the remembered workout is resumed with its mode and rest timer', () => {
    const meta: ActiveWorkoutMeta = { sessionId: 's2', mode: 'reopen', rest: null, prSetIds: ['set9'] };
    const found = sessionToResume(meta, [session('s1', 'in_progress', STAMP), session('s2', 'in_progress', STAMP), session('s3', 'completed', STAMP)]);
    assert.equal(found?.session.id, 's2');
    assert.equal(found?.meta.mode, 'reopen');
    assert.deepEqual(found?.meta.prSetIds, ['set9']);
  });

  test('if the note was lost, the most recently started unfinished workout is resumed', () => {
    const found = sessionToResume(null, [session('old', 'in_progress', '2026-10-18T08:00:00Z'), session('new', 'in_progress', '2026-10-19T08:00:00Z'), session('done', 'completed', '2026-10-20T08:00:00Z')]);
    assert.equal(found?.session.id, 'new');
    assert.equal(found?.meta.mode, 'new');
  });

  test('nothing to resume when no workout is unfinished', () => {
    assert.equal(sessionToResume({ sessionId: 'gone', mode: 'new', rest: null, prSetIds: [] }, [session('done', 'completed', STAMP)]), null);
  });

  test('a running rest timer survives a restart; one that ran out does not; a paused one always does', () => {
    const now = Date.parse(STAMP);
    assert.ok(restoredRest({ endsAtMs: now + 30_000, durationSec: 90, label: 'Squat' }, now));
    assert.equal(restoredRest({ endsAtMs: now - 1, durationSec: 90, label: 'Squat' }, now), null);
    assert.ok(restoredRest({ endsAtMs: now - 60_000, durationSec: 90, pausedRemainingMs: 40_000, label: 'Squat' }, now));
  });

  test('resuming never replaces a workout started in the meantime', () => {
    const started: ActiveWorkout = { mode: 'new', session: session('fresh', 'in_progress', STAMP) };
    const resumed: ActiveWorkout = { mode: 'new', session: session('old', 'in_progress', STAMP) };
    assert.equal(workoutReducer(null, { type: 'resume', workout: resumed })?.session.id, 'old');
    assert.equal(workoutReducer(started, { type: 'resume', workout: resumed })?.session.id, 'fresh');
  });

  test('discarding deletes a new workout but restores a reopened one', () => {
    const original = session('s', 'completed', STAMP);
    assert.deepEqual(discardPlan({ mode: 'new' }, 's'), { kind: 'delete', sessionId: 's' });
    assert.deepEqual(discardPlan({ mode: 'reopen', original }, 's'), { kind: 'restore', session: original });
  });
});

describe('workout lifecycle in the database', () => {
  let db: ReturnType<typeof openTestDatabase>;
  let today: string;
  let repo: SqliteRepository;

  beforeEach(async () => {
    db = openTestDatabase();
    migrate(db);
    eraseAllData(db);
    today = addDays(MONDAY, 2);
    repo = createSqliteRepository(db, { today: () => today });
    // Created on Monday, so Monday and Tuesday are now in the past.
    const created = createSqliteRepository(db, { today: () => MONDAY });
    await created.savePlan(plan);
  });

  const agenda = async () => {
    const [occurrences, sessions, plans, planVersions] = await Promise.all([
      repo.listOccurrences({ from: MONDAY, to: addDays(today, SCHEDULE_AHEAD_DAYS) }),
      repo.listSessions(),
      repo.listPlans(),
      repo.listPlanVersions(),
    ]);
    return buildAgenda({ occurrences, sessions, plans, planVersions, today });
  };
  const itemOn = async (date: string): Promise<DayItem> => (await agenda()).get(date)![0];
  const start = (item: DayItem, history: WorkoutSession[] = []) =>
    sessionFromPlan({ item, history, exercisesById, preferences: defaultPreferences });
  const complete = (s: WorkoutSession): WorkoutSession => ({
    ...s,
    status: 'completed',
    completion: 'full',
    completedAt: `${today}T09:00:00.000Z`,
    completedDate: today,
    blocks: s.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, reps: 5, loadKg: 100, completedAt: `${today}T09:00:00.000Z` })) })) })),
  });

  test('an auto-saved workout is in progress on the calendar, then completed when finished', async () => {
    const item = await itemOn(today);
    assert.equal(item.status, 'planned');
    const session = start(item);
    await repo.saveSession(session); // what auto-save does
    assert.equal((await itemOn(today)).status, 'in_progress');
    await repo.saveSession(complete(session));
    const done = await itemOn(today);
    assert.equal(done.status, 'completed');
    assert.equal(done.session?.id, session.id);
  });

  test('discarding a new workout frees its day again', async () => {
    const session = start(await itemOn(today));
    await repo.saveSession(session);
    await repo.deleteSession(session.id);
    const item = await itemOn(today);
    assert.equal(item.status, 'planned');
    assert.equal(item.occurrence?.sessionId, undefined);
    assert.equal(await repo.getSession(session.id), undefined);
  });

  test('skipping marks the workout skipped; unskipping brings it back as missed or planned', async () => {
    for (const [date, back] of [[addDays(MONDAY, 1), 'missed'], [addDays(today, 1), 'planned']] as const) {
      const item = await itemOn(date);
      const skip: WorkoutSession = { id: `skip_${date}`, name: item.name, occurrenceId: item.occurrence!.id, planId: 'p', planWorkoutId: 'a', status: 'skipped', scheduledDate: date, blocks: [], createdAt: STAMP, updatedAt: STAMP };
      await repo.saveSession(skip);
      assert.equal((await itemOn(date)).status, 'skipped');
      await repo.deleteSession(skip.id);
      assert.equal((await itemOn(date)).status, back);
    }
  });

  test('skipped workouts never count toward history, records, or the streak', async () => {
    const item = await itemOn(today);
    await repo.saveSession({ id: 'skip', name: item.name, occurrenceId: item.occurrence!.id, planId: 'p', planWorkoutId: 'a', status: 'skipped', scheduledDate: today, blocks: [], createdAt: STAMP, updatedAt: STAMP });
    assert.equal((await repo.listPersonalRecords()).length, 0);
    assert.equal((await repo.getStreak()).thisWeekCompleted, 0);
  });

  test('"start anyway" on a skipped workout turns the skip into the workout', async () => {
    const item = await itemOn(today);
    await repo.saveSession({ id: 'skip', name: item.name, occurrenceId: item.occurrence!.id, planId: 'p', planWorkoutId: 'a', status: 'skipped', scheduledDate: today, blocks: [], createdAt: STAMP, updatedAt: STAMP });
    const skippedItem = await itemOn(today);
    const fresh = start(skippedItem);
    await repo.saveSession({ ...fresh, id: skippedItem.session!.id, createdAt: skippedItem.session!.createdAt });
    const now = await itemOn(today);
    assert.equal(now.status, 'in_progress');
    assert.equal(now.session?.id, 'skip');
  });

  test('reopening keeps the same session and its date; discarding the reopen restores it exactly', async () => {
    const finished = complete(start(await itemOn(today)));
    await repo.saveSession(finished);
    const original = (await repo.getSession(finished.id))!;

    today = addDays(today, 3); // reopened three days later
    const reopened = sessionForReopen(original);
    assert.equal(reopened.id, original.id);
    await repo.saveSession({ ...reopened, blocks: [] }); // edits auto-saved mid-reopen
    assert.equal((await repo.getSession(original.id))!.status, 'in_progress');

    await repo.saveSession(original); // discard: restore
    assert.deepEqual(await repo.getSession(original.id), original);
    assert.equal((await repo.listSessions()).filter((s) => s.status === 'completed')[0].completedDate, original.completedDate);
  });

  test('repeat is a new session, linked to the original and counted separately', async () => {
    const finished = complete(start(await itemOn(today)));
    await repo.saveSession(finished);
    const item = await itemOn(today);
    const repeat = sessionFromPlan({ item, history: [finished], exercisesById, preferences: defaultPreferences, repeatOf: finished });
    assert.notEqual(repeat.id, finished.id);
    assert.equal(repeat.repeatedFromSessionId, finished.id);
    assert.equal(repeat.occurrenceId, undefined, 'the scheduled workout stays with the original');
    await repo.saveSession(complete(repeat));
    assert.equal((await repo.listSessions()).filter((s) => s.status === 'completed').length, 2);
    assert.equal((await itemOn(today)).session?.id, finished.id);
  });

  test('deleting a finished workout removes it everywhere and recalculates', async () => {
    // A first lift sets the baseline (it isn't a record yet); a heavier second one is a PR.
    const baseline = complete(start(await itemOn(today)));
    await repo.saveSession(baseline);
    const item = await itemOn(addDays(today, 1));
    const heavier = complete(start(item));
    const finished: WorkoutSession = { ...heavier, blocks: heavier.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, loadKg: 120 })) })) })) };
    await repo.saveSession(finished);
    assert.ok((await repo.listPersonalRecords()).some((r) => r.sessionId === finished.id));
    assert.equal((await repo.getStreak()).thisWeekCompleted, 2);

    await repo.deleteSession(finished.id);
    assert.equal(await repo.getSession(finished.id), undefined);
    assert.ok(!(await repo.listPersonalRecords()).some((r) => r.sessionId === finished.id));
    assert.equal((await repo.getStreak()).thisWeekCompleted, 1);
    assert.equal((await itemOn(addDays(today, 1))).status, 'planned');
    const liveSets = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM logged_sets WHERE session_id = ? AND deleted_at IS NULL', [finished.id])!.n;
    assert.equal(liveSets, 0);
  });

  test('deleting a workout also removes its form recordings and reports', async () => {
    const finished = complete(start(await itemOn(today)));
    await repo.saveSession(finished);
    const setId = finished.blocks[0].exercises[0].sets[0].id;
    db.runSync('INSERT INTO recordings (id, session_id, data, updated_at) VALUES (?, ?, ?, ?)', ['rec1', finished.id, JSON.stringify({ id: 'rec1', sessionId: finished.id, setId, exerciseId: 'ex_back_squat', recordedAt: STAMP, orientation: 'portrait', durationSec: 20 }), STAMP]);
    db.runSync('INSERT INTO form_reports (id, exercise_id, session_id, data, updated_at) VALUES (?, ?, ?, ?, ?)', ['rep1', 'ex_back_squat', finished.id, JSON.stringify({ id: 'rep1', recordingId: 'rec1', sessionId: finished.id, setId, exerciseId: 'ex_back_squat', createdAt: STAMP, updatedAt: STAMP }), STAMP]);
    await repo.deleteSession(finished.id);
    assert.equal(await repo.getRecording('rec1'), undefined);
    assert.equal(await repo.getFormReport('rep1'), undefined);
  });
});
