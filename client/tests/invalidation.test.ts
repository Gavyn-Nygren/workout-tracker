import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { DATE_DEPENDENT, INVALIDATES, invalidateAfter, msUntilTomorrow, staleOnForeground, type Invalidator, type Mutation, type QueryRoot } from '../src/data/invalidation';
import { openTestDatabase } from './support/nodeSqlite';

const TODAY = '2026-10-21';
const writes = Object.keys(INVALIDATES) as Mutation[];
const includes = (mutation: Mutation, keys: QueryRoot[]) => {
  for (const key of keys) assert.ok(INVALIDATES[mutation].includes(key), `${mutation} refreshes ${key}`);
};

describe('what each write refreshes', () => {
  test('every repository write has an entry, and each refreshes something', () => {
    const db = openTestDatabase();
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const repoWrites = Object.keys(repo).filter((name) => /^(save|delete|update)/.test(name));
    assert.deepEqual([...repoWrites].sort(), [...writes].sort());
    for (const mutation of writes) assert.ok(INVALIDATES[mutation].length > 0, mutation);
  });

  test('session writes refresh records, the streak, and badges', () => {
    for (const mutation of ['saveSession', 'deleteSession'] as const) includes(mutation, ['sessions', 'occurrences', 'personalRecords', 'streak', 'badges']);
    // A deleted workout takes its form recordings and reports with it.
    includes('deleteSession', ['formReports', 'recordings']);
  });

  test('goal writes refresh the streak (its weekly target) and badges (which follow the streak)', () => {
    for (const mutation of ['saveGoal', 'deleteGoal'] as const) includes(mutation, ['goals', 'streak', 'badges']);
  });

  test('exercise writes refresh records (the bodyweight setting) and badges', () => {
    const exerciseWrites = writes.filter((m) => m.endsWith('Exercise'));
    assert.ok(exerciseWrites.length > 0);
    for (const mutation of exerciseWrites) includes(mutation, ['exercises', 'personalRecords', 'badges', 'streak']);
  });

  test('plan writes refresh plans, their versions, and the calendar', () => {
    for (const mutation of ['savePlan', 'deletePlan', 'updatePlanWorkout'] as const) includes(mutation, ['plans', 'planVersions', 'occurrences']);
  });

  test('invalidating marks each key stale once, as a key prefix', async () => {
    const calls: unknown[][] = [];
    const client: Invalidator = {
      invalidateQueries: async ({ queryKey }) => {
        calls.push([...queryKey]);
      },
    };
    await invalidateAfter(client, 'saveGoal');
    assert.deepEqual(calls, [['goals'], ['streak'], ['badges']]);
  });
});

describe('a new day', () => {
  test('coming back on the same day refreshes nothing', () => {
    assert.deepEqual(staleOnForeground(TODAY, TODAY), []);
  });

  test('coming back on a later day refreshes the streak, badges, and calendar', () => {
    assert.deepEqual([...staleOnForeground(TODAY, addDays(TODAY, 1))].sort(), ['badges', 'occurrences', 'streak']);
    assert.deepEqual(staleOnForeground(TODAY, addDays(TODAY, 9)), DATE_DEPENDENT);
  });

  test('a day that moved back (a time-zone change) also refreshes', () => {
    assert.deepEqual(staleOnForeground(TODAY, addDays(TODAY, -1)), DATE_DEPENDENT);
  });
});

describe('the midnight check (G3.6 review)', () => {
  test('fires just after the next local midnight', () => {
    const now = new Date(2026, 9, 25, 23, 59, 0);
    assert.equal(msUntilTomorrow(now), 61_000);
    assert.ok(msUntilTomorrow(new Date(2026, 9, 26, 0, 0, 1)) > 23 * 3600_000);
  });
});
