// Updating a database from before G3.10 (G3.10 review): the update itself doesn't change what the
// user's history meant. Weeks that ended before it keep G3.9's streak rule (the weekly goal, else 4),
// and weight × reps goals on bodyweight exercises turn their total-load target into added weight.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { putRow, splitSession } from '../src/data/db/rows';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { legacyStreakRule } from '../src/data/db/upgradeG310';
import { goalStatus, liftGoalFormKind } from '../src/data/goals';
import type { BodyweightEntry, FormReport, Goal, ISODate, Joint, LoggedSet, ScheduledOccurrence, WorkoutSession } from '../src/data/types';
import { openTestDatabase } from './support/nodeSqlite';

const TODAY = '2026-10-27'; // Tuesday; the update happens today
const MONDAY0 = '2026-09-21'; // five finished weeks: Sep 21 to Oct 25
const at = (date: ISODate) => `${date}T17:00:00.000Z`;
const STAMP = '2026-09-01T08:00:00.000Z';

type Db = ReturnType<typeof openTestDatabase>;

function workout(id: string, date: ISODate, occurrence?: ScheduledOccurrence, set: Partial<LoggedSet> = {}, exerciseId = 'ex_bench_press'): WorkoutSession {
  const done: LoggedSet = { id: `${id}_s`, kind: 'normal', modifiers: [], reps: 5, loadKg: 100, completedAt: at(date), ...set };
  return {
    id,
    name: 'Workout',
    status: 'completed',
    completion: 'full',
    startedAt: at(date),
    completedAt: at(date),
    completedDate: date,
    occurrenceId: occurrence?.id,
    planId: occurrence?.planId,
    planWorkoutId: occurrence?.planWorkoutId,
    scheduledDate: occurrence?.scheduledDate,
    blocks: [{ id: `${id}_b`, type: 'single', exercises: [{ id: `${id}_e`, exerciseId, skipped: false, sets: [done] }] }],
    createdAt: at(date),
    updatedAt: at(date),
  };
}

/** Stores rows the way G3.9 did, before migration 4. */
function storeSession(db: Db, session: WorkoutSession) {
  const { header, sets } = splitSession(session);
  putRow(db, 'sessions', session.id, header, { status: 'completed', day: session.completedDate!, completed_at: session.completedAt!, occurrence_id: session.occurrenceId ?? null });
  for (const row of sets) putRow(db, 'logged_sets', row.id, row.set, { session_id: session.id, entry_id: row.entryId, position: row.position });
}
const storeOccurrence = (db: Db, occ: ScheduledOccurrence) => putRow(db, 'occurrences', occ.id, occ, { plan_id: occ.planId, scheduled_date: occ.scheduledDate, session_id: occ.sessionId ?? null });
const storeGoal = (db: Db, goal: Goal) => putRow(db, 'goals', goal.id, goal);

/**
 * A G3.9 database: a Monday-to-Friday plan stored through this week, done Monday to Thursday for
 * five finished weeks. With no weekly goal, G3.9 needed 4 a week: a 5-week streak.
 */
function g39Database(goals: Goal[] = []): Db {
  const db = openTestDatabase();
  migrate(db, 3);
  for (let w = 0; w < 6; w++) {
    for (let d = 0; d < 5; d++) {
      const date = addDays(MONDAY0, w * 7 + d);
      const occ: ScheduledOccurrence = { id: `occ_${date}`, planId: 'p', planVersion: 1, planWorkoutId: `w${d}`, scheduledDate: date };
      if (w < 5 && d < 4) {
        const done = workout(`s_${date}`, date, occ);
        occ.sessionId = done.id;
        storeSession(db, done);
      }
      storeOccurrence(db, occ);
    }
  }
  for (const goal of goals) storeGoal(db, goal);
  return db;
}

describe('streak weeks that ended before the update', () => {
  test("keep G3.9's target, so the update doesn't break a streak or take its badges; later weeks use the new rules", async () => {
    const db = g39Database();
    migrate(db);
    let today = TODAY;
    const repo = createSqliteRepository(db, { today: () => today });
    assert.deepEqual(legacyStreakRule(db), { before: TODAY, target: 4 });

    const streak = await repo.getStreak();
    assert.equal(streak.currentWeeks, 5);
    assert.ok(streak.weeks.slice(0, 5).every((w) => w.target === 4 && w.source === 'legacy' && w.planned === 5 && w.met && w.frozen));
    // This week is live, under the new rules: the plan's 5.
    assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource], [5, 'plan']);
    assert.ok((await repo.listBadges()).some((b) => b.badgeKey === 'streak_4_weeks'));

    // The week of the update ends under the new rules: 4 of 5 doesn't meet it.
    for (const date of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']) await repo.saveSession(workout(`late_${date}`, date));
    today = '2026-11-03';
    repo.forgetCache();
    const next = await repo.getStreak();
    const updateWeek = next.weeks.find((w) => w.weekStart === '2026-10-26');
    assert.deepEqual(updateWeek && [updateWeek.target, updateWeek.source, updateWeek.completed, updateWeek.met], [5, 'plan', 4, false]);
    assert.equal(next.currentWeeks, 0);
    assert.equal(next.longestWeeks, 5);
  });

  test("use the newest weekly goal as the update found it, as G3.9 did", async () => {
    const weekly = (id: string, workoutsPerWeek: number, updatedAt: string): Goal => ({ id, type: 'frequency', title: `Train ${workoutsPerWeek}×`, workoutsPerWeek, createdAt: STAMP, updatedAt });
    const db = g39Database([weekly('older', 2, STAMP), weekly('newer', 3, '2026-10-20T08:00:00.000Z')]);
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    assert.deepEqual(legacyStreakRule(db), { before: TODAY, target: 3 });
    // A goal edit after the update reaches neither those weeks nor this one's rule for them.
    await repo.saveGoal(weekly('newer', 6, '2026-10-27T09:00:00.000Z'));
    const streak = await repo.getStreak();
    assert.ok(streak.weeks.slice(0, 5).every((w) => w.target === 3 && w.source === 'legacy' && w.met));
    assert.equal(streak.thisWeekTarget, 6);
  });

  test('only a database that had workouts or goals is marked; erasing everything drops the old rule', async () => {
    const fresh = openTestDatabase();
    migrate(fresh);
    createSqliteRepository(fresh, { today: () => TODAY });
    assert.equal(legacyStreakRule(fresh), undefined);
    assert.equal(fresh.getFirstSync('SELECT value FROM meta WHERE key = ?', ['g310_upgrade']), null);

    const db = g39Database();
    migrate(db);
    createSqliteRepository(db, { today: () => TODAY });
    assert.ok(legacyStreakRule(db));
    eraseAllData(db);
    assert.equal(legacyStreakRule(db), undefined);
  });
});

describe('lift goals on bodyweight exercises from before the update', () => {
  const weighIn: BodyweightEntry = { id: 'bw1', date: '2026-09-15', weightKg: 80, createdAt: at('2026-09-15'), updatedAt: at('2026-09-15') };
  const lift = (id: string, exerciseId: string, target: Extract<Goal, { type: 'lift' }>['target'], title = id): Goal => ({
    id,
    type: 'lift',
    title,
    exerciseId,
    target,
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  });

  function upgraded(goals: Goal[]) {
    const db = openTestDatabase();
    migrate(db, 3);
    putRow(db, 'bodyweight', weighIn.id, weighIn, { date: weighIn.date });
    for (const goal of goals) storeGoal(db, goal);
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    return { db, repo };
  }

  test('a total-load target becomes added weight: the total minus bodyweight when the goal was set', async () => {
    const { repo } = upgraded([
      lift('pull', 'ex_pull_up', { kind: 'load_reps', loadKg: 100, reps: 8 }, 'Pull-Up 220.5 × 8'),
      lift('assisted', 'ex_assisted_pull_up', { kind: 'load_reps', loadKg: 60, reps: 8 }),
      lift('dip', 'ex_assisted_dip', { kind: 'load_reps', loadKg: 90, reps: 8 }),
      lift('bench', 'ex_bench_press', { kind: 'load_reps', loadKg: 100, reps: 5 }, 'Bench Press 220.5 × 5'),
      lift('e1rm', 'ex_pull_up', { kind: 'e1rm', loadKg: 110 }, 'Pull-Up e1RM 242.5 lb'),
    ]);
    const byId = new Map((await repo.listGoals()).map((g) => [g.id, g]));
    const shape = (id: string) => {
      const g = byId.get(id)!;
      return g.type === 'lift' ? [g.title, g.target.loadKg] : [];
    };
    assert.deepEqual(shape('pull'), ['Pull-Up +44.1 lb × 8', 20]);
    assert.deepEqual(shape('assisted'), ['Assisted Pull-Up (Machine) −44.1 lb × 8', -20]);
    // An assisted machine can't go past no assistance.
    assert.deepEqual(shape('dip'), ['Assisted Dip (Machine) × 8, no assistance', 0]);
    // Plain lifts and e1RM targets always meant total load.
    assert.deepEqual(shape('bench'), ['Bench Press 220.5 × 5', 100]);
    assert.deepEqual(shape('e1rm'), ['Pull-Up e1RM 242.5 lb', 110]);
  });

  test('a goal G3.9 showed as done is still reached, and the change runs once', async () => {
    const { db, repo } = upgraded([lift('pull', 'ex_pull_up', { kind: 'load_reps', loadKg: 100, reps: 8 })]);
    await repo.saveSession(workout('s1', '2026-10-15', undefined, { loadKg: undefined, addedLoadKg: 20, bodyweightSnapshotKg: 80, reps: 8 }, 'ex_pull_up'));
    const goal = (await repo.listGoals())[0];
    const status = goalStatus(goal, { sessions: await repo.listSessions(), exercisesById: new Map((await repo.listExercises()).map((e) => [e.id, e])), bodyweight: [], formReports: [], today: TODAY });
    assert.deepEqual([status.reached, status.reachedDate, status.addedLoad, status.target], [true, '2026-10-15', true, 20]);

    createSqliteRepository(db, { today: () => TODAY });
    const again = (await repo.listGoals())[0];
    assert.equal(again.type === 'lift' && again.target.loadKg, 20);
  });

  test('an e1RM goal on a bodyweight exercise stays e1RM, and the goal form keeps it so (G3.10 review)', async () => {
    const { repo } = upgraded([lift('e1rm', 'ex_pull_up', { kind: 'e1rm', loadKg: 110 }, 'Pull-Up e1RM 242.5 lb')]);
    const goal = (await repo.listGoals())[0];
    assert.ok(goal.type === 'lift');
    const pullUp = (await repo.getExercise('ex_pull_up'))!;
    // Editing only its deadline: the form's kind for it is still e1RM, so its target keeps its meaning.
    assert.equal(liftGoalFormKind(goal.target.kind, pullUp, goal), 'e1rm');
  });

  test('without a weigh-in, the bodyweight saved with the set logged nearest the goal is used', async () => {
    const db = openTestDatabase();
    migrate(db, 3);
    storeSession(db, workout('early', '2026-08-01', undefined, { loadKg: undefined, addedLoadKg: 5, bodyweightSnapshotKg: 84, reps: 8 }, 'ex_pull_up'));
    storeSession(db, workout('near', '2026-09-22', undefined, { loadKg: undefined, addedLoadKg: 10, bodyweightSnapshotKg: 82, reps: 8 }, 'ex_pull_up'));
    storeGoal(db, lift('pull', 'ex_pull_up', { kind: 'load_reps', loadKg: 100, reps: 8 }));
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const goal = (await repo.listGoals())[0];
    assert.equal(goal.type === 'lift' && goal.target.loadKg, 18);
  });
});

describe('form goals from before the update (G3.10 review)', () => {
  /** A ready Back Squat report with these trusted bottom angles. */
  const report = (id: string, date: ISODate, angles: Record<Joint, number>, exerciseId = 'ex_back_squat'): FormReport => ({
    id,
    recordingId: `rec_${id}`,
    sessionId: 'sess',
    setId: `set_${id}`,
    exerciseId,
    family: 'squat',
    status: 'ready',
    modelVersion: 'test',
    ruleVersion: 'test',
    primaryJoint: 'knee',
    quality: { framing: 'good', warnings: [] },
    detectedReps: 1,
    reps: [
      {
        index: 0,
        durationSec: 2,
        confidence: 'high',
        angles: { knee: { minDeg: angles.knee, maxDeg: 170 }, hip: { minDeg: angles.hip, maxDeg: 170 }, ankle: { minDeg: angles.ankle, maxDeg: 150 } },
        romDeg: 90,
        partial: false,
      },
    ],
    observations: [],
    hasReplay: false,
    createdAt: at(date),
    updatedAt: at(date),
  });
  const reports = [
    report('r1', '2026-09-22', { knee: 85, hip: 66, ankle: 64 }),
    report('r2', '2026-09-29', { knee: 80, hip: 63, ankle: 65 }),
    report('r3', '2026-10-06', { knee: 75, hip: 61, ankle: 66 }),
  ];
  const form = (id: string, joint: Joint, targetDeg: number, startDeg: number, created: string, exerciseId = 'ex_back_squat'): Goal => ({
    id,
    type: 'form',
    title: id,
    exerciseId,
    joint,
    targetDeg,
    startDeg,
    createdAt: created,
    updatedAt: '2026-10-20T08:00:00.000Z',
  });

  test("a hip goal G3.9's form aimed up with the knee's default target gets G3.10's target and starts over; others stay", async () => {
    const db = openTestDatabase();
    migrate(db, 3);
    for (const r of reports) putRow(db, 'form_reports', r.id, r, { exercise_id: r.exerciseId, session_id: r.sessionId });
    for (const goal of [
      // G3.9's default target was the knee's latest − 5 whatever the joint: 70 from a hip start of 61.
      form('hip', 'hip', 70, 61, '2026-10-20T08:00:00.000Z'),
      // A sample goal edited into a hip goal kept its Aug 1 set date.
      form('edited', 'hip', 70, 61, '2026-08-01T08:00:00.000Z'),
      // A knee target above the start was typed, not leaked: left as it is.
      form('knee', 'knee', 80, 75, '2026-10-20T08:00:00.000Z'),
      // G3.9 showed this one achieved (a knee goal moved to the ankle, aiming down to 70 from 83): left as it is.
      form('achieved', 'ankle', 70, 83, '2026-10-20T08:00:00.000Z'),
      // No recordings of a deadlift: the start was the form's guess (target + 10).
      form('guess', 'hip', 80, 90, '2026-10-20T08:00:00.000Z', 'ex_deadlift'),
    ]) {
      storeGoal(db, goal);
    }
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const byId = new Map((await repo.listGoals()).map((g) => [g.id, g]));
    const brief = (id: string) => {
      const g = byId.get(id)!;
      return g.type === 'form' ? { title: g.title, targetDeg: g.targetDeg, startDeg: g.startDeg, startedOver: g.createdAt > '2026-10-21' } : undefined;
    };
    assert.deepEqual(brief('hip'), { title: 'Back Squat (Barbell): 56° hip angle', targetDeg: 56, startDeg: 61, startedOver: true });
    assert.deepEqual(brief('edited'), { title: 'Back Squat (Barbell): 56° hip angle', targetDeg: 56, startDeg: 61, startedOver: true });
    assert.deepEqual(brief('knee'), { title: 'knee', targetDeg: 80, startDeg: 75, startedOver: false });
    assert.deepEqual(brief('achieved'), { title: 'achieved', targetDeg: 70, startDeg: 83, startedOver: false });
    assert.deepEqual(brief('guess'), { title: 'guess', targetDeg: 80, startDeg: undefined, startedOver: false });

    // Read by joint, the old hip target would have been met by the Sep 29 recording and moved straight to Completed goals.
    const input = { sessions: [], exercisesById: new Map((await repo.listExercises()).map((e) => [e.id, e])), bodyweight: [], formReports: await repo.listFormReports(), today: TODAY };
    const status = goalStatus(byId.get('edited')!, input);
    assert.deepEqual([status.reached, status.archived, status.fraction], [false, false, 0]);
  });

  /** Updates a G3.9 database holding these reports and goals; the goals and their status after. */
  async function update(rows: FormReport[], goals: Goal[]) {
    const db = openTestDatabase();
    migrate(db, 3);
    for (const r of rows) putRow(db, 'form_reports', r.id, r, { exercise_id: r.exerciseId, session_id: r.sessionId });
    for (const goal of goals) storeGoal(db, goal);
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const input = { sessions: [], exercisesById: new Map((await repo.listExercises()).map((e) => [e.id, e])), bodyweight: [], formReports: await repo.listFormReports(), today: TODAY };
    return new Map((await repo.listGoals()).map((g) => [g.id, { goal: g, status: goalStatus(g, input) }]));
  }

  test('a rebuilt goal starts from the latest recording at the update, at 0%, even one newer than its last save (G3.10 review 3)', async () => {
    // Saved Oct 20, when the latest hip angle was 61. A recording on Oct 22 reached 54: past 56, the
    // target 5° past 61. The rebuilt goal starts from 54 instead.
    const after = await update([...reports, report('r4', '2026-10-22', { knee: 72, hip: 54, ankle: 66 })], [form('hip', 'hip', 70, 61, '2026-10-20T08:00:00.000Z')]);
    const { goal, status } = after.get('hip')!;
    assert.deepEqual(goal.type === 'form' && [goal.title, goal.startDeg, goal.targetDeg], ['Back Squat (Barbell): 49° hip angle', 54, 49]);
    assert.deepEqual([status.start, status.current, status.fraction, status.reached], [54, 54, 0, false]);
  });

  test('a goal set before the first recording of its lift and joint loses its guessed start, even when recordings came later (G3.10 review 3)', async () => {
    const after = await update(reports, [
      // Set Sep 1, before the first recording (Sep 22): G3.9 guessed the start as target + 10.
      form('before', 'knee', 70, 80, '2026-09-01T08:00:00.000Z'),
      // Set Oct 1, after two recordings: its start was the latest recording then. It stays.
      form('after', 'knee', 70, 80, '2026-10-01T08:00:00.000Z'),
    ]);
    const before = after.get('before')!;
    assert.equal(before.goal.type === 'form' && before.goal.startDeg, undefined);
    // The first recording since it was set is the start: 85 → 75 of the way to 70.
    assert.deepEqual([before.status.start, before.status.current, before.status.fraction], [85, 75, 10 / 15]);
    const kept = after.get('after')!;
    assert.deepEqual([kept.goal.type === 'form' && kept.goal.startDeg, kept.status.fraction], [80, 0.5]);
  });
});
