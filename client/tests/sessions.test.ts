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
    const rest = { endsAtMs: Date.parse(STAMP) + 60_000, durationSec: 90, label: 'Squat' };
    const meta: ActiveWorkoutMeta = { sessionId: 's2', mode: 'reopen', rest };
    const found = sessionToResume(meta, [session('s1', 'in_progress', STAMP), session('s2', 'in_progress', STAMP), session('s3', 'completed', STAMP)]);
    assert.equal(found?.session.id, 's2');
    assert.equal(found?.meta.mode, 'reopen');
    assert.deepEqual(found?.meta.rest, rest);
  });

  test('if the note was lost, the most recently started unfinished workout is resumed', () => {
    const found = sessionToResume(null, [session('old', 'in_progress', '2026-10-18T08:00:00Z'), session('new', 'in_progress', '2026-10-19T08:00:00Z'), session('done', 'completed', '2026-10-20T08:00:00Z')]);
    assert.equal(found?.session.id, 'new');
    assert.equal(found?.meta.mode, 'new');
    assert.equal(found?.meta.original, undefined);
  });

  test('nothing to resume when no workout is unfinished', () => {
    assert.equal(sessionToResume({ sessionId: 'gone', mode: 'new', rest: null }, [session('done', 'completed', STAMP)]), null);
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
    assert.equal(repeat.planVersion, item.plan?.version, 'built from the plan version on its card');
    await repo.saveSession(complete(repeat));
    assert.equal((await repo.listSessions()).filter((s) => s.status === 'completed').length, 2);
    assert.equal((await itemOn(today)).session?.id, finished.id);
  });

  test('after its plan is deleted, a logged workout keeps its names on Today, and Repeat does its exercises', async () => {
    const finished = complete(start(await itemOn(today)));
    await repo.saveSession(finished);
    const late = complete(start(await itemOn(MONDAY))); // Monday's, done today
    await repo.saveSession(late);
    await repo.deletePlan('p');

    const cards = (await agenda()).get(today)!;
    const card = cards.find((i) => !i.extra)!;
    const extra = cards.find((i) => i.extra === 'late')!;
    assert.deepEqual([card.name, card.plan?.name, card.status, card.workout?.id], ['Squat Day', 'Strength', 'completed', 'a']);
    assert.deepEqual([extra.name, extra.plan?.name], ['Squat Day', 'Strength']);
    for (const item of [card, extra]) {
      const repeat = sessionFromPlan({ item, history: [late, finished], exercisesById, preferences: { ...defaultPreferences, units: 'metric' }, repeatOf: item.session });
      assert.equal(repeat.name, 'Squat Day');
      assert.deepEqual(
        repeat.blocks.flatMap((b) => b.exercises.map((e) => [e.exerciseId, e.sets.length, e.sets[0].loadKg])),
        [['ex_back_squat', 2, 100]],
      );
    }
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

  test('sets read back in their order after sets are removed and one is added (db-1)', async () => {
    const done = (id: string, loadKg: number) => ({ id, kind: 'normal' as const, modifiers: [], reps: 5, loadKg, completedAt: `${today}T09:00:00.000Z` });
    const session: WorkoutSession = {
      id: 'live',
      name: 'Squat Day',
      status: 'in_progress',
      startedAt: `${today}T08:30:00.000Z`,
      blocks: [
        {
          id: 'b',
          type: 'single',
          exercises: [{ id: 'e', exerciseId: 'ex_back_squat', skipped: false, sets: [{ id: 'w1', kind: 'warmup', modifiers: [] }, { id: 'w2', kind: 'warmup', modifiers: [] }, done('s1', 100), done('s2', 102.5), done('s3', 105)] }],
        },
      ],
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    // Each edit auto-saved, as the app does: both warm-ups removed, then a set added.
    let workout: ActiveWorkout | null = { mode: 'new', session };
    await repo.saveSession(session);
    for (const action of [
      { type: 'removeSet', entryId: 'e', setId: 'w1' },
      { type: 'removeSet', entryId: 'e', setId: 'w2' },
      { type: 'addSet', entryId: 'e' },
    ] as const) {
      workout = workoutReducer(workout, action);
      await repo.saveSession(workout!.session);
    }
    const order = workout!.session.blocks[0].exercises[0].sets.map((x) => x.id);
    assert.equal(order.length, 4);
    const setIds = (s: WorkoutSession | undefined) => s?.blocks[0].exercises[0].sets.map((x) => x.id);
    assert.deepEqual(setIds(await repo.getSession('live')), order);
    assert.deepEqual(setIds((await repo.listSessions()).find((x) => x.id === 'live')), order);
    const rows = db.getAllSync<{ id: string; position: number }>("SELECT id, position FROM logged_sets WHERE session_id = 'live' AND deleted_at IS NULL ORDER BY position", []);
    assert.deepEqual(
      rows.map(({ id, position }) => ({ id, position })),
      order.map((id, position) => ({ id, position })),
    );

    const outbox = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', [])!.n;
    const queued = outbox();
    await repo.saveSession(workout!.session);
    assert.equal(outbox(), queued, 'saving it unchanged writes nothing');
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

describe('Repeat (spec 2.5: the same exercises)', () => {
  const metric = { ...defaultPreferences, units: 'metric' as const };
  const range = { kind: 'normal' as const, modifiers: [], targetReps: { min: 8, max: 12 } };
  const upper: Plan = {
    ...plan,
    id: 'u',
    name: 'Upper Lower',
    workouts: [
      {
        id: 'ua',
        name: 'Upper A',
        blocks: [
          { id: 'ub1', type: 'single', exercises: [{ id: 'pe_squat', exerciseId: 'ex_back_squat', progression: { type: 'rep_range', incrementKg: 2.5, onMiss: { type: 'repeat' } }, sets: [range, range] }] },
          { id: 'ub2', type: 'single', exercises: [{ id: 'pe_bench', exerciseId: 'ex_bench_press', sets: [range, range] }] },
        ],
      },
    ],
  };
  const card = (session?: WorkoutSession): DayItem => ({ key: 'k', date: MONDAY, name: 'Upper A', status: session ? 'completed' : 'planned', plan: upper, workout: upper.workouts[0], session });

  test('it does what the workout did: its swap and the exercise added during it, pre-filled, and the plan’s rule for the planned ones', () => {
    // The source: bench swapped for incline bench and a leg curl added, every set done at 12 reps.
    let workout: ActiveWorkout | null = { mode: 'new', session: sessionFromPlan({ item: card(), history: [], exercisesById, preferences: metric }) };
    const bench = workout.session.blocks[1].exercises[0];
    workout = workoutReducer(workout, { type: 'swapExercise', entryId: bench.id, exerciseId: 'ex_incline_bench_press' });
    workout = workoutReducer(workout, { type: 'addExercise', exerciseId: 'ex_lying_leg_curl' });
    const loads: Record<string, number> = { ex_back_squat: 100, ex_incline_bench_press: 60, ex_lying_leg_curl: 40 };
    const done = `${MONDAY}T10:00:00.000Z`;
    const source: WorkoutSession = {
      ...workout!.session,
      status: 'completed',
      completion: 'full',
      completedAt: done,
      completedDate: MONDAY,
      blocks: workout!.session.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, reps: 12, loadKg: loads[e.exerciseId], completedAt: done })) })) })),
    };

    const repeat = sessionFromPlan({ item: card(source), history: [source], exercisesById, preferences: metric, repeatOf: source });
    const entries = repeat.blocks.flatMap((b) => b.exercises);
    assert.deepEqual(
      entries.map((e) => [e.exerciseId, e.plannedExerciseId, e.sets.length]),
      [
        ['ex_back_squat', 'pe_squat', 2],
        ['ex_incline_bench_press', 'pe_bench', 2],
        ['ex_lying_leg_curl', undefined, 3],
      ],
    );
    assert.equal(entries[0].suggestion?.kind, 'increase', 'the plan’s rule still moves the squat up');
    assert.ok(entries[0].sets.every((x) => x.loadKg! > 100));
    assert.deepEqual(
      entries.slice(1).map((e) => e.sets.map((x) => x.loadKg)),
      [
        [60, 60],
        [40, 40, 40],
      ],
      'the others start from what was done',
    );
    assert.deepEqual([repeat.name, repeat.planId, repeat.planWorkoutId, repeat.repeatedFromSessionId, repeat.occurrenceId], ['Upper A', 'u', 'ua', source.id, undefined]);
  });

  test('with its plan workout gone, it still does the same exercises, under the same name', () => {
    const done = `${MONDAY}T10:00:00.000Z`;
    const first = sessionFromPlan({ item: card(), history: [], exercisesById, preferences: metric });
    const source: WorkoutSession = {
      ...first,
      name: 'Upper B',
      status: 'completed',
      completedAt: done,
      completedDate: MONDAY,
      blocks: first.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, reps: 10, loadKg: 50, completedAt: done })) })) })),
    };
    const gone: DayItem = { key: 'k', date: MONDAY, name: 'Upper B', status: 'completed', session: source, extra: 'late' };
    const repeat = sessionFromPlan({ item: gone, history: [source], exercisesById, preferences: metric, repeatOf: source });
    assert.equal(repeat.name, 'Upper B');
    assert.deepEqual(
      repeat.blocks.flatMap((b) => b.exercises.map((e) => [e.exerciseId, e.plannedExerciseId, e.sets.map((x) => x.loadKg)])),
      [
        ['ex_back_squat', undefined, [50, 50]],
        ['ex_bench_press', undefined, [50, 50]],
      ],
    );
  });
});
