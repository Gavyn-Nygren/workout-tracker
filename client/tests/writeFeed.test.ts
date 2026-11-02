import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { withDevFaults } from '../src/data/devFaults';
import { WRITE_NAME } from '../src/data/invalidation';
import { defaultPreferences } from '../src/data/preferences';
import type { DataRepository } from '../src/data/repository';
import type { Plan, WorkoutSession } from '../src/data/types';
import { withWriteFeed } from '../src/data/writeFeed';
import { openTestDatabase } from './support/nodeSqlite';

const MONDAY = '2026-10-19';
const STAMP = `${MONDAY}T08:00:00.000Z`;

function realRepository() {
  const db = openTestDatabase();
  migrate(db);
  return createSqliteRepository(db, { today: () => MONDAY });
}

/** Every repository method, by the real repository's own names, so a new write is covered without editing this test. */
const methodNames = Object.keys(realRepository()).filter((name) => name !== 'forgetCache');
const writeNames = methodNames.filter((name) => WRITE_NAME.test(name));
const readNames = methodNames.filter((name) => !WRITE_NAME.test(name) && name !== 'today');

type Call = { name: string; args: unknown[] };

/** A stand-in repository: every method resolves with what it was called with, and `today` is a plain string. */
function fakeRepository(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const calls: Call[] = [];
  const methods: Record<string, unknown> = { today: () => MONDAY };
  for (const name of methodNames.filter((n) => n !== 'today')) {
    methods[name] = async (...args: unknown[]) => {
      calls.push({ name, args });
      return { name, args };
    };
  }
  Object.assign(methods, overrides);
  return { repo: methods as unknown as DataRepository, calls };
}

const call = (repo: DataRepository, name: string, ...args: unknown[]) => (repo as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);

const plan: Plan = {
  id: 'p',
  name: 'Strength',
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule: { type: 'weekly', days: ([1, 3, 5] as const).map((weekday) => ({ weekday, workoutIds: ['a'] })) },
  workouts: [
    {
      id: 'a',
      name: 'Squat Day',
      blocks: [{ id: 'b1', type: 'single', exercises: [{ id: 'pe1', exerciseId: 'ex_back_squat', sets: [{ kind: 'normal', modifiers: [], targetReps: 5 }] }] }],
    },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
};

describe('the repository write feed', () => {
  test('the real repository has writes and reads to cover', () => {
    assert.ok(writeNames.includes('saveSession'));
    assert.ok(writeNames.includes('pushPlanForward'));
    assert.ok(readNames.includes('listOccurrences'));
    assert.ok(methodNames.includes('today'));
  });

  test('every write bumps the version exactly once, after it settles, and keeps its result and arguments', async () => {
    const { repo, calls } = fakeRepository();
    const feed = withWriteFeed(repo);
    for (const name of writeNames) {
      const before = feed.getVersion();
      const result = await call(feed.repository, name, 'x', 2);
      assert.equal(feed.getVersion(), before + 1, name);
      assert.deepEqual(result, { name, args: ['x', 2] }, name);
    }
    assert.deepEqual(
      calls.map((c) => c.name),
      writeNames,
    );
  });

  test('a write bumps only once it has settled, not when it starts', async () => {
    let finish: () => void = () => {};
    const { repo } = fakeRepository({ saveSession: () => new Promise<void>((resolve) => (finish = resolve)) });
    const feed = withWriteFeed(repo);
    const saving = feed.repository.saveSession({} as WorkoutSession);
    await Promise.resolve();
    assert.equal(feed.getVersion(), 0);
    finish();
    await saving;
    assert.equal(feed.getVersion(), 1);
  });

  test('reads and today are the very same functions, so they never bump and today stays synchronous', async () => {
    const { repo } = fakeRepository();
    const feed = withWriteFeed(repo);
    const original = repo as unknown as Record<string, unknown>;
    const proxied = feed.repository as unknown as Record<string, unknown>;
    for (const name of [...readNames, 'today']) assert.equal(proxied[name], original[name], name);
    for (const name of readNames) await call(feed.repository, name);
    assert.equal(feed.repository.today(), MONDAY);
    assert.equal(feed.getVersion(), 0);
  });

  test('reading a write twice gives the same wrapper', () => {
    const feed = withWriteFeed(fakeRepository().repo);
    assert.equal(feed.repository.saveSession, feed.repository.saveSession);
    assert.notEqual(feed.repository.saveSession, feed.repository.deleteSession);
  });

  test('a failing write still bumps, and rejects with the same error', async () => {
    const failure = new Error('disk full');
    const { repo } = fakeRepository({
      savePlan: async () => {
        throw failure;
      },
      // Not async: a write that throws before returning a promise is reported the same way.
      deletePlan: () => {
        throw failure;
      },
    });
    const feed = withWriteFeed(repo);
    await assert.rejects(feed.repository.savePlan(plan), (error) => error === failure);
    assert.equal(feed.getVersion(), 1);
    await assert.rejects(feed.repository.deletePlan('p'), (error) => error === failure);
    assert.equal(feed.getVersion(), 2);
  });

  test('subscribers hear every bump until they unsubscribe, and bump() works by hand', async () => {
    const feed = withWriteFeed(fakeRepository().repo);
    let a = 0;
    let b = 0;
    const stopA = feed.subscribe(() => a++);
    const stopB = feed.subscribe(() => b++);
    feed.bump();
    assert.equal(feed.getVersion(), 1);
    await feed.repository.saveGoal({} as never);
    assert.deepEqual([a, b], [2, 2]);
    stopA();
    feed.bump();
    assert.deepEqual([a, b], [2, 3]);
    stopB();
    await feed.repository.deleteGoal('g');
    assert.deepEqual([a, b], [2, 3]);
    assert.equal(feed.getVersion(), 4);
    // Unsubscribing twice is harmless.
    stopB();
  });

  test('a listener can unsubscribe while being told, without upsetting the others', () => {
    const feed = withWriteFeed(fakeRepository().repo);
    const heard: string[] = [];
    const stopFirst = feed.subscribe(() => {
      heard.push('first');
      stopFirst();
    });
    feed.subscribe(() => heard.push('second'));
    feed.bump();
    feed.bump();
    assert.deepEqual(heard, ['first', 'second', 'second']);
  });

  test('on the real repository: writes bump; reads, including the calendar fill in listOccurrences, do not', async () => {
    const store = realRepository();
    const feed = withWriteFeed(store);
    const repo = feed.repository;
    assert.equal(typeof repo.today(), 'string');

    await repo.savePlan(plan);
    assert.equal(feed.getVersion(), 1);

    // The first read fills in the plan's calendar (ensureSchedule), which writes rows but isn't a write.
    const occurrences = await repo.listOccurrences({ from: MONDAY, to: addDays(MONDAY, 6) });
    assert.equal(occurrences.length, 3);
    await repo.listPlans();
    await repo.listSessions();
    await repo.getStreak();
    await repo.getPreferences();
    assert.equal(feed.getVersion(), 1);

    await repo.savePreferences({ ...defaultPreferences, units: 'imperial' });
    assert.equal(feed.getVersion(), 2);
    assert.equal((await repo.getPreferences()).units, 'imperial');

    await assert.rejects(repo.pushPlanForward('not-a-workout', 'shift'));
    assert.equal(feed.getVersion(), 3);
  });

  test('through the developer faults too: today stays a string, and writes still bump', async () => {
    const feed = withWriteFeed(realRepository());
    const repo = withDevFaults(feed.repository);
    assert.equal(repo.today(), MONDAY);
    await repo.savePlan(plan);
    await repo.listOccurrences({ from: MONDAY, to: addDays(MONDAY, 6) });
    assert.equal(feed.getVersion(), 1);
  });
});
