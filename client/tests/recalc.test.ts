// Recalculation after an edit, delete, or reopen (spec 2.5, 2.7; roadmap G3.6), through the real
// repository on SQLite: records, streak, and badges are derived on read from what's stored.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import type { SqlDb, SqlValue } from '../src/data/db/sql';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { newRecords } from '../src/data/records';
import type { Goal, ISODate, LoggedSet, PRType, WorkoutSession } from '../src/data/types';
import { epley1RM } from '../src/data/units';
import { sessionForReopen } from '../src/features/workout/buildSession';
import { discardPlan } from '../src/features/workout/persistence';
import { workoutReducer, type ActiveWorkout } from '../src/features/workout/workoutReducer';
import { openTestDatabase } from './support/nodeSqlite';

// Mondays, oldest first; weeks start on Monday.
const WEEKS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
const STAMP = '2026-09-01T08:00:00.000Z';

let db: SqlDb & { close(): void };
let today: ISODate;
let repo: SqliteRepository;

function fresh(wrap: (db: SqlDb) => SqlDb = (d) => d) {
  db = openTestDatabase();
  migrate(db);
  eraseAllData(db);
  today = '2026-10-21';
  repo = createSqliteRepository(wrap(db), { today: () => today });
}

/** A finished squat workout: one entry, 5-rep working sets unless a set says otherwise. */
function workout(id: string, day: ISODate, sets: Partial<LoggedSet>[], options: { skipped?: boolean } = {}): WorkoutSession {
  return {
    id,
    name: 'Squat Day',
    status: 'completed',
    completion: options.skipped ? 'partial' : 'full',
    startedAt: `${day}T09:00:00.000Z`,
    completedAt: `${day}T10:00:00.000Z`,
    completedDate: day,
    blocks: [
      {
        id: `${id}_block`,
        type: 'single',
        exercises: [
          {
            id: `${id}_entry`,
            exerciseId: 'ex_back_squat',
            skipped: options.skipped ?? false,
            sets: sets.map((patch, i) => ({ id: `${id}_set${i}`, kind: 'normal', modifiers: [], reps: 5, completedAt: `${day}T09:${10 + i}:00.000Z`, ...patch })),
          },
        ],
      },
    ],
    createdAt: `${day}T09:00:00.000Z`,
    updatedAt: `${day}T10:00:00.000Z`,
  };
}
const squat = (id: string, day: ISODate, loadKg: number) => workout(id, day, [{ loadKg }]);

const weeklyGoal = (workoutsPerWeek: number): Goal => ({ id: 'goal_weekly', type: 'frequency', title: 'Train every week', workoutsPerWeek, createdAt: STAMP, updatedAt: STAMP });

const recordsOf = async (type: PRType) =>
  (await repo.listPersonalRecords()).filter((r) => r.type === type).map((r) => ({ sessionId: r.sessionId, value: r.value, previousValue: r.previousValue }));
const badge = async (key: string) => (await repo.listBadges()).find((b) => b.badgeKey === key);
const assertNear = (actual: number | undefined, expected: number | undefined) => assert.ok(Math.abs((actual ?? NaN) - (expected ?? NaN)) < 1e-9, `${actual} ≈ ${expected}`);

/** What Finish does with a reopened workout: completed again, keeping its completion date (spec 2.5). */
const finish = (session: WorkoutSession): WorkoutSession => ({ ...session, status: 'completed', completion: 'full' });

describe('reopening a finished workout', () => {
  beforeEach(async () => {
    fresh();
    await repo.saveSession(squat('w1', '2026-10-19', 100));
    await repo.saveSession(squat('w2', '2026-10-20', 110));
    await repo.saveSession(squat('w3', '2026-10-21', 115));
  });

  const reopen = async (sessionId: string, loadKg: number) => {
    const original = (await repo.getSession(sessionId))!;
    const entry = original.blocks[0].exercises[0];
    const reopened: ActiveWorkout = { mode: 'reopen', session: sessionForReopen(original) };
    const edited = workoutReducer(reopened, { type: 'updateSet', entryId: entry.id, setId: entry.sets[0].id, patch: { loadKg } })!;
    await repo.saveSession(edited.session); // auto-save while it's open
    return { original, edited: edited.session };
  };

  test('editing a set heavier and finishing updates that record and the later one it now sets up', async () => {
    assert.deepEqual(await recordsOf('heaviest_weight'), [
      { sessionId: 'w2', value: 110, previousValue: 100 },
      { sessionId: 'w3', value: 115, previousValue: 110 },
    ]);
    const before = await repo.listPersonalRecords();

    const { original, edited } = await reopen('w2', 112.5);
    await repo.saveSession(finish(edited));
    assert.equal((await repo.getSession('w2'))!.completedDate, original.completedDate);

    assert.deepEqual(await recordsOf('heaviest_weight'), [
      { sessionId: 'w2', value: 112.5, previousValue: 100 },
      { sessionId: 'w3', value: 115, previousValue: 112.5 },
    ]);
    const e1rm = await recordsOf('e1rm');
    assertNear(e1rm[0].value, epley1RM(112.5, 5));
    assertNear(e1rm[0].previousValue, epley1RM(100, 5));
    assertNear(e1rm[1].previousValue, epley1RM(112.5, 5));
    assert.deepEqual(await recordsOf('volume'), [
      { sessionId: 'w2', value: 562.5, previousValue: 500 },
      { sessionId: 'w3', value: 575, previousValue: 562.5 },
    ]);

    // Only what the edit changed is new: w3's records kept their values, so they aren't celebrated again.
    const celebrated = newRecords(before, await repo.listPersonalRecords());
    assert.deepEqual(celebrated.map((r) => `${r.sessionId}:${r.type}`).sort(), ['w2:e1rm', 'w2:heaviest_weight', 'w2:volume']);
  });

  test('discarding the reopen restores the old records exactly', async () => {
    const records = await repo.listPersonalRecords();
    const streak = await repo.getStreak();

    const { original } = await reopen('w2', 140);
    assert.notDeepEqual(await repo.listPersonalRecords(), records, 'the auto-saved edit is in the database');

    const plan = discardPlan({ mode: 'reopen', original }, original.id);
    assert.equal(plan.kind, 'restore');
    if (plan.kind === 'restore') await repo.saveSession(plan.session);
    assert.deepEqual(await repo.listPersonalRecords(), records);
    assert.deepEqual(await repo.getStreak(), streak);
  });
});

describe('deleting a finished workout', () => {
  beforeEach(() => fresh());

  test('removes its records, shortens the streak, and un-earns the badge it helped earn', async () => {
    await repo.saveGoal(weeklyGoal(1));
    const days = WEEKS.slice(3); // four weeks in a row, ending this week
    for (const [i, day] of days.entries()) await repo.saveSession(squat(`w${i + 1}`, day, 100 + 5 * i));
    assert.ok((await repo.listPersonalRecords()).some((r) => r.sessionId === 'w2'));
    assert.equal((await repo.getStreak()).currentWeeks, 4);
    assert.equal((await badge('streak_4_weeks'))?.earnedDate, days[3]);

    await repo.deleteSession('w2');
    assert.ok(!(await repo.listPersonalRecords()).some((r) => r.sessionId === 'w2'));
    // The next workout is now measured against the one before the deleted one.
    assert.deepEqual((await recordsOf('heaviest_weight'))[0], { sessionId: 'w3', value: 110, previousValue: 100 });
    const streak = await repo.getStreak();
    assert.equal(streak.currentWeeks, 2);
    assert.equal(streak.longestWeeks, 2);
    assert.equal(await badge('streak_4_weeks'), undefined);
    assert.ok(await badge('first_workout'), 'badges that don’t depend on it stay');
  });
});

describe('a skipped exercise', () => {
  beforeEach(() => fresh());

  test('skipped after a completed set, that set still makes records and the workout still counts', async () => {
    await repo.saveSession(squat('w1', '2026-10-19', 100));
    await repo.saveSession(workout('w2', '2026-10-20', [{ loadKg: 120 }, { loadKg: 120, completedAt: undefined }], { skipped: true }));
    assert.deepEqual(await recordsOf('heaviest_weight'), [{ sessionId: 'w2', value: 120, previousValue: 100 }]);
    assertNear((await recordsOf('e1rm'))[0].value, epley1RM(120, 5));
    assert.equal((await repo.getStreak()).thisWeekCompleted, 2);
  });
});

describe('the weekly target and streak badges', () => {
  beforeEach(() => fresh());

  test('saving and deleting a frequency goal changes the weekly target and the streak badge', async () => {
    for (const [i, day] of WEEKS.slice(3).entries()) await repo.saveSession(squat(`w${i + 1}`, day, 100));
    const fallback = (await repo.getStreak()).thisWeekTarget;
    assert.notEqual(fallback, 1);
    assert.equal(await badge('streak_4_weeks'), undefined);

    await repo.saveGoal(weeklyGoal(1));
    assert.equal((await repo.getStreak()).thisWeekTarget, 1);
    assert.equal((await badge('streak_4_weeks'))?.earnedDate, WEEKS[6]);

    await repo.deleteGoal('goal_weekly');
    assert.equal((await repo.getStreak()).thisWeekTarget, fallback);
    assert.equal(await badge('streak_4_weeks'), undefined);
  });

  test('the 4-week streak badge keeps the day it was earned as later workouts are added', async () => {
    await repo.saveGoal(weeklyGoal(1));
    today = '2026-10-13';
    for (const [i, day] of WEEKS.slice(2, 6).entries()) await repo.saveSession(squat(`w${i + 1}`, day, 100));
    assert.equal((await badge('streak_4_weeks'))?.earnedDate, '2026-10-12');

    today = '2026-10-21';
    await repo.saveSession(squat('w5', '2026-10-14', 100));
    await repo.saveSession(squat('w6', '2026-10-19', 100));
    await repo.saveSession(squat('w7', '2026-10-21', 100));
    assert.equal((await repo.getStreak()).currentWeeks, 5);
    assert.equal((await badge('streak_4_weeks'))?.earnedDate, '2026-10-12');
  });

  test('a longer run after a break is a longest-streak record', async () => {
    await repo.saveGoal(weeklyGoal(1));
    // Two weeks, a week off, then two more: tying the longest isn't a record.
    today = '2026-10-07';
    for (const day of [WEEKS[0], WEEKS[1], WEEKS[3], WEEKS[4]]) await repo.saveSession(squat(`w_${day}`, day, 100));
    assert.deepEqual((await repo.getStreak()).records, []);

    // A third week makes the run the longest yet.
    today = '2026-10-14';
    await repo.saveSession(squat('w_long', WEEKS[5], 100));
    const streak = await repo.getStreak();
    assert.equal(streak.longestWeeks, 3);
    assert.deepEqual(
      streak.records.map(({ weeks, previousWeeks, achievedDate, sessionId }) => ({ weeks, previousWeeks, achievedDate, sessionId })),
      [{ weeks: 3, previousWeeks: 2, achievedDate: WEEKS[5], sessionId: 'w_long' }],
    );
  });
});

describe('a failed read', () => {
  test('isn’t cached, so trying again reads the database again', async () => {
    let failNext = false;
    fresh((inner) => ({
      ...inner,
      getAllAsync: async <T>(sql: string, params: SqlValue[]): Promise<T[]> => {
        if (failNext) {
          failNext = false;
          throw new Error('disk I/O error');
        }
        return inner.getAllAsync<T>(sql, params);
      },
    }));
    await repo.saveSession(squat('w1', '2026-10-19', 100));

    failNext = true;
    await assert.rejects(repo.listSessions(), /disk I\/O error/);
    assert.deepEqual((await repo.listSessions()).map((s) => s.id), ['w1']);

    // Derived reads share that cache and recover the same way.
    await repo.saveSession(squat('w2', '2026-10-20', 100));
    failNext = true;
    await assert.rejects(repo.getStreak(), /disk I\/O error/);
    assert.equal((await repo.getStreak()).thisWeekCompleted, 2);
  });
});
