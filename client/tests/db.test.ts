import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { eraseAllData, holdsSampleData, loadSampleData, seedOnFirstRun } from '../src/data/db/sampleData';
import { migrate, SCHEMA_VERSION } from '../src/data/db/schema';
import type { SqlDb } from '../src/data/db/sql';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { defaultPreferences } from '../src/data/preferences';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import type { Plan, WorkoutSession } from '../src/data/types';
import { openTestDatabase } from './support/nodeSqlite';

const TODAY = '2026-10-21'; // a Wednesday

let db: SqlDb & { close(): void };
let today: string;
let repo: SqliteRepository;

const outboxCount = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', [])!.n;
const rawRow = (table: string, id: string) => db.getFirstSync<{ deleted_at: string | null }>(`SELECT deleted_at FROM ${table} WHERE id = ?`, [id]);

function fresh({ sample = true } = {}) {
  db = openTestDatabase();
  today = TODAY;
  migrate(db);
  if (sample) seedOnFirstRun(db, TODAY);
  else eraseAllData(db);
  repo = createSqliteRepository(db, { today: () => today });
}

describe('schema', () => {
  test('migrates to the latest version, and running again changes nothing', () => {
    db = openTestDatabase();
    migrate(db);
    const version = () => db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])!.user_version;
    assert.equal(version(), SCHEMA_VERSION);
    migrate(db);
    assert.equal(version(), SCHEMA_VERSION);
    const tables = db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'", []).map((t) => t.name);
    for (const t of ['sessions', 'logged_sets', 'plans', 'occurrences', 'outbox', 'meta']) assert.ok(tables.includes(t), t);
  });

  test('refuses a database from a newer app version', () => {
    db = openTestDatabase();
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    assert.throws(() => migrate(db), /newer than this app/);
  });
});

describe('sample data', () => {
  beforeEach(() => fresh());

  test('the first run starts with sample history, and none of it is queued to sync', async () => {
    const other = openTestDatabase();
    migrate(other);
    seedOnFirstRun(other, TODAY);
    assert.equal(other.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', [])!.n, 0);
    assert.ok(holdsSampleData(db));
    assert.ok((await repo.listSessions()).length > 20);
    assert.ok((await repo.listPlans()).length > 0);
  });

  test('seeding only happens once', async () => {
    const before = (await repo.listSessions()).length;
    await repo.deleteGoal((await repo.listGoals())[0].id);
    seedOnFirstRun(db, TODAY);
    assert.equal((await repo.listSessions()).length, before);
    assert.equal((await repo.listGoals()).length, 4);
  });

  test('erase leaves an empty app with settings intact; load brings the samples back', async () => {
    await repo.savePreferences({ ...defaultPreferences, units: 'metric' });
    eraseAllData(db);
    repo = createSqliteRepository(db, { today: () => today });
    assert.equal((await repo.listSessions()).length, 0);
    assert.equal((await repo.listPlans()).length, 0);
    assert.equal((await repo.listOccurrences({ from: TODAY, to: addDays(TODAY, 30) })).length, 0);
    assert.equal((await repo.getPreferences()).units, 'metric');
    assert.equal(holdsSampleData(db), false);
    loadSampleData(db, TODAY);
    repo.forgetCache();
    assert.ok((await repo.listSessions()).length > 20);
    assert.equal((await repo.getPreferences()).units, 'metric');
  });

  test('derived progress (PRs, streak, badges) comes from the stored history', async () => {
    assert.ok((await repo.listPersonalRecords()).length > 0);
    const streak = await repo.getStreak();
    // The sample weekly goal, 5 a week.
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource], [5, 'goal']);
    assert.ok((await repo.listBadges()).some((b) => b.badgeKey === 'first_workout'));
  });
});

describe('sessions', () => {
  beforeEach(() => fresh());

  test('a session round-trips with its sets in order', async () => {
    const original = (await repo.listSessions()).find((s) => s.status === 'completed' && s.blocks[0].exercises[0].sets.length > 2)!;
    const loaded = await repo.getSession(original.id);
    assert.deepEqual(loaded, original);
  });

  test('saving records only what changed, and removed sets become tombstones', async () => {
    const original = (await repo.listSessions()).find((s) => s.status === 'completed' && s.blocks[0].exercises[0].sets.length > 2)!;
    // Finished weeks are stored on the first streak read or workout save (G3.10); that's done here first.
    await repo.getStreak();
    const queued = outboxCount();
    await repo.saveSession(original);
    assert.equal(outboxCount(), queued, 'an unchanged save writes nothing');

    const entry = original.blocks[0].exercises[0];
    const [first, removed, ...rest] = entry.sets;
    const edited: WorkoutSession = {
      ...original,
      blocks: original.blocks.map((b, i) => (i === 0 ? { ...b, exercises: b.exercises.map((e, j) => (j === 0 ? { ...e, sets: [{ ...first, reps: (first.reps ?? 0) + 1 }, ...rest] } : e)) } : b)),
    };
    await repo.saveSession(edited);
    const loaded = await repo.getSession(original.id);
    assert.deepEqual(loaded!.blocks[0].exercises[0].sets.map((s) => s.id), [first.id, ...rest.map((s) => s.id)]);
    assert.equal(loaded!.blocks[0].exercises[0].sets[0].reps, (first.reps ?? 0) + 1);
    assert.ok(rawRow('logged_sets', removed.id)?.deleted_at, 'the removed set is a tombstone');
    // The changed set, the sets after the deleted one (each moved up a place), the deleted set, and
    // the header (its set list changed) are queued for sync.
    const ops = db.getAllSync<{ entity: string; op: string }>('SELECT entity, op FROM outbox WHERE seq > ?', [queued]);
    assert.deepEqual(ops.filter((o) => o.entity === 'logged_set').map((o) => o.op).sort(), ['delete', ...rest.map(() => 'upsert'), 'upsert']);
  });

  test('a session started from the calendar links to its occurrence', async () => {
    const occ = (await repo.listOccurrences({ from: TODAY, to: addDays(TODAY, 7) })).find((o) => !o.sessionId)!;
    const plan = (await repo.getPlan(occ.planId))!;
    const session: WorkoutSession = {
      id: 'session_test',
      name: 'Test',
      occurrenceId: occ.id,
      planId: plan.id,
      planWorkoutId: occ.planWorkoutId,
      status: 'in_progress',
      scheduledDate: occ.scheduledDate,
      startedAt: `${occ.scheduledDate}T10:00:00.000Z`,
      blocks: [],
      createdAt: `${occ.scheduledDate}T10:00:00.000Z`,
      updatedAt: `${occ.scheduledDate}T10:00:00.000Z`,
    };
    await repo.saveSession(session);
    const linked = (await repo.listOccurrences({ from: occ.scheduledDate, to: occ.scheduledDate })).find((o) => o.id === occ.id);
    assert.equal(linked?.sessionId, 'session_test');
  });

  test('sessions are listed by the day they count on', async () => {
    const week = await repo.listSessions({ from: addDays(TODAY, -6), to: TODAY });
    assert.ok(week.length > 0);
    for (const s of week) {
      const day = s.completedDate ?? s.scheduledDate!;
      assert.ok(day >= addDays(TODAY, -6) && day <= TODAY);
    }
  });
});

describe('plans and the calendar', () => {
  beforeEach(() => fresh());

  test('the calendar is generated ahead, and keeps rolling forward as days pass', async () => {
    const plan = (await repo.listPlans()).find((p) => p.status === 'active')!;
    const horizon = addDays(TODAY, SCHEDULE_AHEAD_DAYS);
    const ahead = await repo.listOccurrences({ from: addDays(horizon, -6), to: horizon });
    assert.ok(ahead.some((o) => o.planId === plan.id), 'there are workouts near the horizon');

    today = addDays(TODAY, 14);
    const later = await repo.listOccurrences({ from: addDays(horizon, 1), to: addDays(today, SCHEDULE_AHEAD_DAYS) });
    assert.ok(later.some((o) => o.planId === plan.id), 'the horizon moved with today');
  });

  test('editing a plan rebuilds only unstarted future workouts', async () => {
    const plan = (await repo.listPlans()).find((p) => p.status === 'active' && p.schedule.type === 'weekly')!;
    const past = (await repo.listOccurrences({ from: addDays(TODAY, -14), to: addDays(TODAY, -1) })).filter((o) => o.planId === plan.id);
    assert.ok(past.length > 0);

    // Move every workout to Mondays only.
    const firstWorkout = plan.workouts[0].id;
    const edited: Plan = { ...plan, schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: [firstWorkout] }] } };
    await repo.savePlan(edited);

    const saved = (await repo.getPlan(plan.id))!;
    assert.equal(saved.version, plan.version + 1);
    const future = (await repo.listOccurrences({ from: TODAY, to: addDays(TODAY, SCHEDULE_AHEAD_DAYS) })).filter((o) => o.planId === plan.id);
    assert.ok(future.length > 0);
    for (const o of future) {
      if (o.sessionId) continue;
      assert.equal(new Date(`${o.scheduledDate}T12:00:00Z`).getUTCDay(), 1, `${o.scheduledDate} is a Monday`);
      assert.equal(o.planVersion, saved.version);
    }
    const pastAfter = (await repo.listOccurrences({ from: addDays(TODAY, -14), to: addDays(TODAY, -1) })).filter((o) => o.planId === plan.id);
    assert.deepEqual(pastAfter.map((o) => o.id), past.map((o) => o.id), 'history is untouched');
  });

  test('deleting a plan removes its upcoming workouts but keeps history', async () => {
    const plan = (await repo.listPlans()).find((p) => p.status === 'active')!;
    const sessionsBefore = (await repo.listSessions()).filter((s) => s.planId === plan.id).length;
    await repo.deletePlan(plan.id);
    assert.equal(await repo.getPlan(plan.id), undefined);
    const future = (await repo.listOccurrences({ from: TODAY, to: addDays(TODAY, 60) })).filter((o) => o.planId === plan.id && !o.sessionId);
    assert.equal(future.length, 0);
    assert.equal((await repo.listSessions()).filter((s) => s.planId === plan.id).length, sessionsBefore);
    // Rolling the calendar forward doesn't bring them back.
    today = addDays(TODAY, 3);
    assert.equal((await repo.listOccurrences({ from: TODAY, to: addDays(TODAY, 60) })).filter((o) => o.planId === plan.id && !o.sessionId).length, 0);
  });

  test('updating one plan workout bumps the plan version', async () => {
    const plan = (await repo.listPlans())[0];
    const workout = plan.workouts[0];
    await repo.updatePlanWorkout(plan.id, workout.id, workout.blocks.slice(0, 1));
    const saved = (await repo.getPlan(plan.id))!;
    assert.equal(saved.version, plan.version + 1);
    assert.equal(saved.workouts[0].blocks.length, 1);
  });
});

describe('other records', () => {
  beforeEach(() => fresh());

  test('one weigh-in per day: a second one on the same date replaces it', async () => {
    const at = `${TODAY}T08:00:00.000Z`;
    await repo.saveBodyweight({ id: 'bw_a', date: TODAY, weightKg: 82, createdAt: at, updatedAt: at });
    await repo.saveBodyweight({ id: 'bw_b', date: TODAY, weightKg: 81.5, createdAt: at, updatedAt: at });
    const onDay = (await repo.listBodyweight()).filter((e) => e.date === TODAY);
    assert.deepEqual(onDay.map((e) => e.id), ['bw_b']);
    await repo.deleteBodyweight('bw_b');
    assert.equal((await repo.listBodyweight()).filter((e) => e.date === TODAY).length, 0);
  });

  test('deleting a form report removes its recording and unlinks the set', async () => {
    const report = (await repo.listFormReports())[0];
    await repo.deleteFormReport(report.id);
    assert.equal(await repo.getFormReport(report.id), undefined);
    assert.equal(await repo.getRecording(report.recordingId), undefined);
    const session = (await repo.getSession(report.sessionId))!;
    const sets = session.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets));
    assert.ok(!sets.some((s) => s.recordingId === report.recordingId));
    assert.ok(sets.some((s) => s.id === report.setId), 'the set itself stays');
  });

  test('deleting a video keeps the report and its metrics', async () => {
    const report = (await repo.listFormReports()).find((r) => r.hasReplay)!;
    await repo.deleteRecordingVideo(report.recordingId);
    const after = (await repo.getFormReport(report.id))!;
    assert.equal(after.hasReplay, false);
    assert.equal(after.reps.length, report.reps.length);
    assert.equal((await repo.getRecording(report.recordingId))!.videoUri, undefined);
  });

  test('custom exercises are stored; built-ins ship with the app and can’t be edited', async () => {
    const builtin = (await repo.listExercises()).find((e) => e.source === 'builtin')!;
    await assert.rejects(repo.saveExercise({ ...builtin, name: 'Renamed' }), /Built-in/);
    const at = `${TODAY}T08:00:00.000Z`;
    await repo.saveExercise({ ...builtin, id: 'custom_x', source: 'custom', name: 'My Lift', createdAt: at, updatedAt: at });
    assert.equal((await repo.getExercise('custom_x'))?.name, 'My Lift');
  });

  test('preferences default until saved, and new settings fall back to defaults', async () => {
    fresh({ sample: false });
    assert.deepEqual(await repo.getPreferences(), defaultPreferences);
    const { haptics: _dropped, ...older } = defaultPreferences;
    db.runSync('INSERT INTO preferences (id, data, updated_at) VALUES (?, ?, ?)', ['me', JSON.stringify({ ...older, units: 'metric' }), TODAY]);
    const loaded = await repo.getPreferences();
    assert.equal(loaded.units, 'metric');
    assert.equal(loaded.haptics, defaultPreferences.haptics);
  });

  test('the weekly target follows the frequency goal', async () => {
    const goal = (await repo.listGoals()).find((g) => g.type === 'frequency')!;
    await repo.saveGoal({ ...goal, workoutsPerWeek: 3 } as typeof goal);
    assert.equal((await repo.getStreak()).thisWeekTarget, 3);
  });

  test('a failed write changes nothing', async () => {
    const before = (await repo.listPlans()).length;
    await assert.rejects(repo.updatePlanWorkout('missing_plan', 'w', []), /not found/);
    assert.equal((await repo.listPlans()).length, before);
  });
});
