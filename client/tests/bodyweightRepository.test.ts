import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { eraseAllData, holdsSampleData, loadSampleData, markOldOnboardingWeighIn, seedOnFirstRun } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { INVALIDATES } from '../src/data/invalidation';
import { defaultPreferences } from '../src/data/preferences';
import type { BodyweightEntry, ISODate } from '../src/data/types';
import { openTestDatabase } from './support/nodeSqlite';

const TODAY = '2026-10-29';
const at = `${TODAY}T07:00:00.000Z`;
const entry = (id: string, date: ISODate, weightKg: number, extra: Partial<BodyweightEntry> = {}): BodyweightEntry => ({ id, date, weightKg, createdAt: at, updatedAt: at, ...extra });

let db: ReturnType<typeof openTestDatabase>;
let repo: SqliteRepository;
const raw = (id: string) => db.getFirstSync<{ date: string; deleted_at: string | null; data: string }>('SELECT date, deleted_at, data FROM bodyweight WHERE id = ?', [id]);
const outbox = () => db.getAllSync<{ entity: string; entity_id: string; op: string }>('SELECT entity, entity_id, op FROM outbox ORDER BY seq', []).map((o) => ({ ...o }));

function fresh({ sample = false } = {}) {
  db = openTestDatabase();
  migrate(db);
  seedOnFirstRun(db, TODAY, sample);
  repo = createSqliteRepository(db, { today: () => TODAY });
}

describe('fixing a weigh-in', () => {
  beforeEach(() => fresh());

  test('a new weight keeps its id, date, when it was made, and where it came from', async () => {
    await repo.saveBodyweight(entry('bw_a', TODAY, 82, { source: 'onboarding' }));
    await repo.updateBodyweight('bw_a', { weightKg: 81.2 });
    const [fixed] = await repo.listBodyweight();
    assert.deepEqual({ ...fixed, updatedAt: undefined }, { ...entry('bw_a', TODAY, 81.2, { source: 'onboarding' }), updatedAt: undefined });
    assert.notEqual(fixed.updatedAt, at);
    assert.deepEqual(outbox().slice(-1), [{ entity: 'bodyweight', entity_id: 'bw_a', op: 'upsert' }], 'queued to sync');
  });

  test('a new date moves it, and the list stays in date order', async () => {
    await repo.saveBodyweight(entry('bw_a', addDays(TODAY, -5), 80));
    await repo.saveBodyweight(entry('bw_b', addDays(TODAY, -3), 81));
    await repo.updateBodyweight('bw_a', { date: addDays(TODAY, -1), weightKg: 80.5 });
    assert.deepEqual(
      (await repo.listBodyweight()).map((e) => [e.id, e.date, e.weightKg]),
      [
        ['bw_b', addDays(TODAY, -3), 81],
        ['bw_a', addDays(TODAY, -1), 80.5],
      ],
    );
    assert.equal(raw('bw_a')?.date, addDays(TODAY, -1), 'the date column moves too, so date reads find it');
  });

  test('moving it onto a day that has a weigh-in replaces that one (one per day), in one write', async () => {
    await repo.saveBodyweight(entry('bw_a', addDays(TODAY, -2), 80));
    await repo.saveBodyweight(entry('bw_b', addDays(TODAY, -1), 90));
    const before = outbox().length;
    await repo.updateBodyweight('bw_a', { date: addDays(TODAY, -1) });
    const list = await repo.listBodyweight();
    assert.deepEqual(list.map((e) => [e.id, e.date, e.weightKg]), [['bw_a', addDays(TODAY, -1), 80]]);
    assert.ok(raw('bw_b')?.deleted_at, 'the one it replaced is a tombstone, so the delete syncs');
    assert.deepEqual(
      outbox().slice(before).map((o) => [o.entity_id, o.op]),
      [
        ['bw_b', 'delete'],
        ['bw_a', 'upsert'],
      ],
    );
  });

  test('a fix that fails changes nothing', async () => {
    await repo.saveBodyweight(entry('bw_a', addDays(TODAY, -2), 80));
    await repo.saveBodyweight(entry('bw_b', addDays(TODAY, -1), 90));
    await assert.rejects(repo.updateBodyweight('bw_a', { date: addDays(TODAY, -1), weightKg: 0 }), /needs a weight/);
    await assert.rejects(repo.updateBodyweight('bw_a', { date: '2026-02-30' }), /needs a date/);
    assert.deepEqual((await repo.listBodyweight()).map((e) => [e.id, e.weightKg]), [
      ['bw_a', 80],
      ['bw_b', 90],
    ]);
  });

  test('a deleted weigh-in can’t be fixed (it isn’t brought back)', async () => {
    await repo.saveBodyweight(entry('bw_a', TODAY, 80));
    await repo.deleteBodyweight('bw_a');
    await assert.rejects(repo.updateBodyweight('bw_a', { weightKg: 81 }), /deleted/);
    await assert.rejects(repo.updateBodyweight('bw_never', { weightKg: 81 }), /deleted/);
    assert.deepEqual(await repo.listBodyweight(), []);
  });

  test('a fix that changes nothing writes nothing', async () => {
    await repo.saveBodyweight(entry('bw_a', TODAY, 80));
    const before = outbox().length;
    await repo.updateBodyweight('bw_a', { date: TODAY, weightKg: 80 });
    assert.equal(outbox().length, before);
  });

  test('refreshes what a new weigh-in does', () => {
    assert.deepEqual(INVALIDATES.updateBodyweight, INVALIDATES.saveBodyweight);
  });

  test('a weigh-in needs a real weight and date', async () => {
    for (const weightKg of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) await assert.rejects(repo.saveBodyweight(entry('bw_x', TODAY, weightKg)), /needs a weight/);
    await assert.rejects(repo.saveBodyweight(entry('bw_x', '10/29/2026', 80)), /needs a date/);
    assert.deepEqual(await repo.listBodyweight(), []);
  });
});

describe('weigh-ins and the cached workouts', () => {
  test('a weigh-in keeps the workouts read (sets keep their own bodyweight); a workout save drops it', async () => {
    fresh({ sample: true });
    const sessions = await repo.listSessions();
    const records = await repo.listPersonalRecords();
    await repo.saveBodyweight(entry('bw_new', TODAY, 85));
    await repo.updateBodyweight('bw_new', { weightKg: 84 });
    await repo.deleteBodyweight('bw_new');
    await repo.saveProgressPreferences(defaultPreferences.progress);
    assert.equal(await repo.listSessions(), sessions, 'no rebuild from every workout');
    assert.deepEqual(await repo.listPersonalRecords(), records);
    await repo.saveSession(sessions.find((s) => s.status === 'completed')!);
    assert.notEqual(await repo.listSessions(), sessions);
  });
});

describe('sample data on first launch (G3.11)', () => {
  test('a release build starts empty, with the user’s own data, and is never seeded later', async () => {
    fresh({ sample: false });
    assert.equal(holdsSampleData(db), false);
    assert.equal(db.getFirstSync<{ value: string }>("SELECT value FROM meta WHERE key = 'contents'", [])?.value, 'user');
    assert.deepEqual(await repo.listSessions(), []);
    assert.deepEqual(await repo.listBodyweight(), []);
    assert.deepEqual(await repo.listPlans(), []);
    assert.deepEqual(await repo.listGoals(), []);
    assert.deepEqual(await repo.getPreferences(), defaultPreferences);
    seedOnFirstRun(db, TODAY, true);
    repo.forgetCache();
    assert.deepEqual(await repo.listSessions(), [], 'only the first launch decides');
  });

  test('a development build starts with the sample data', async () => {
    fresh({ sample: true });
    assert.ok(holdsSampleData(db));
    assert.ok((await repo.listSessions()).length > 20);
    assert.ok((await repo.listBodyweight()).length > 5);
  });
});

describe('the onboarding weigh-in survives the sample data tools (development)', () => {
  const onboarding = entry('bw_onboarding', TODAY, 95, { source: 'onboarding' });

  test('saved over the sample data, it replaces the sample weigh-in on its day', async () => {
    fresh({ sample: true });
    await repo.saveBodyweight(onboarding);
    assert.deepEqual((await repo.listBodyweight()).filter((e) => e.date === TODAY), [onboarding]);
  });

  test('erasing the sample data keeps it, and every weigh-in the user entered over the sample', async () => {
    fresh({ sample: true });
    const sampleIds = (await repo.listBodyweight()).map((e) => e.id);
    assert.ok(sampleIds.every((id) => /^bw_\d{4}-\d{2}-\d{2}$/.test(id)), 'sample weigh-ins have date ids');
    await repo.saveBodyweight(onboarding);
    // Saved before G3.11, so not marked as the onboarding weigh-in; an app id (newId).
    const unmarked = entry('bw_mgk2x1a9f3', addDays(TODAY, -12), 96);
    await repo.saveBodyweight(unmarked);
    await repo.saveBodyweight(entry('bw_old_onboarding', addDays(TODAY, -9), 96, { source: 'onboarding' }));
    await repo.deleteBodyweight('bw_old_onboarding');
    // A sample weigh-in the user fixed is still the sample's.
    await repo.updateBodyweight(sampleIds[0], { weightKg: 90 });
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual(await repo.listBodyweight(), [unmarked, onboarding]);
    assert.equal(raw('bw_old_onboarding'), null, 'a deleted one is gone for good');
    assert.equal(holdsSampleData(db), false);
    assert.deepEqual(await repo.listSessions(), []);
  });

  test('an unmarked onboarding weigh-in (saved before G3.11) is marked at the first launch, and kept by every erase', async () => {
    fresh({ sample: true });
    const unmarked = entry('bw_mgk2x1a9f3', addDays(TODAY, -12), 96);
    await repo.saveBodyweight(unmarked);
    await repo.saveBodyweight(entry('bw_later', addDays(TODAY, -2), 95, { createdAt: `${TODAY}T09:00:00.000Z` }));
    markOldOnboardingWeighIn(db);
    repo.forgetCache();
    const marked = (await repo.listBodyweight()).filter((e) => e.source === 'onboarding');
    assert.deepEqual(
      marked.map((e) => e.id),
      ['bw_mgk2x1a9f3'],
      'the earliest made is marked as the onboarding weigh-in',
    );
    // Erasing the sample keeps both; erasing again keeps only the onboarding one (the other is
    // the user's own data by then).
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual((await repo.listBodyweight()).map((e) => e.id).sort(), ['bw_later', 'bw_mgk2x1a9f3']);
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual(
      (await repo.listBodyweight()).map((e) => e.id),
      ['bw_mgk2x1a9f3'],
    );
  });

  test('an unmarked onboarding weigh-in survives Erase then Load sample data', async () => {
    fresh({ sample: true });
    await repo.saveBodyweight(entry('bw_mgk2x1a9f3', addDays(TODAY, -12), 96));
    markOldOnboardingWeighIn(db);
    eraseAllData(db);
    loadSampleData(db, TODAY);
    repo.forgetCache();
    assert.ok((await repo.listBodyweight()).some((e) => e.id === 'bw_mgk2x1a9f3' && e.source === 'onboarding'));
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual((await repo.listBodyweight()).map((e) => e.id), ['bw_mgk2x1a9f3']);
  });

  test('what Erase keeps is queued to sync, since it is the user’s own data from then on', async () => {
    fresh({ sample: true });
    await repo.saveBodyweight(onboarding);
    eraseAllData(db);
    assert.deepEqual(outbox(), [
      { entity: 'bodyweight', entity_id: 'bw_onboarding', op: 'upsert' },
      { entity: 'preferences', entity_id: 'me', op: 'upsert' },
    ]);
    // Load sample data (never syncs), then Erase: queued again from the rows themselves.
    loadSampleData(db, TODAY);
    assert.deepEqual(outbox(), []);
    eraseAllData(db);
    assert.deepEqual(
      outbox().filter((o) => o.entity === 'bodyweight'),
      [{ entity: 'bodyweight', entity_id: 'bw_onboarding', op: 'upsert' }],
    );
  });

  test('with the user’s own data, an unmarked onboarding weigh-in is marked at the first launch and kept', async () => {
    fresh({ sample: false });
    await repo.saveBodyweight(entry('bw_mgk2x1a9f3', addDays(TODAY, -12), 96));
    await repo.saveBodyweight(entry('bw_mine', addDays(TODAY, -2), 95, { createdAt: `${TODAY}T09:00:00.000Z` }));
    db.runSync('DELETE FROM outbox', []);
    markOldOnboardingWeighIn(db);
    assert.deepEqual(outbox(), [{ entity: 'bodyweight', entity_id: 'bw_mgk2x1a9f3', op: 'upsert' }], 'the mark syncs');
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual((await repo.listBodyweight()).map((e) => [e.id, e.source]), [['bw_mgk2x1a9f3', 'onboarding']]);
    loadSampleData(db, TODAY);
    repo.forgetCache();
    assert.ok((await repo.listBodyweight()).some((e) => e.id === 'bw_mgk2x1a9f3'), 'Load sample data keeps it too');
  });

  test('the first-launch mark runs once, and never when a weigh-in is already marked', async () => {
    fresh({ sample: false });
    markOldOnboardingWeighIn(db);
    // Saved after the mark ran (onboarding skipped): never guessed to be the onboarding one.
    await repo.saveBodyweight(entry('bw_mine', addDays(TODAY, -2), 95));
    markOldOnboardingWeighIn(db);
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual(await repo.listBodyweight(), []);

    fresh({ sample: false });
    await repo.saveBodyweight(entry('bw_early', addDays(TODAY, -30), 97));
    await repo.saveBodyweight(onboarding);
    markOldOnboardingWeighIn(db);
    repo.forgetCache();
    assert.deepEqual((await repo.listBodyweight()).filter((e) => e.source === 'onboarding').map((e) => e.id), ['bw_onboarding']);
  });

  test('erasing the user’s own data keeps only the onboarding weigh-in', async () => {
    fresh({ sample: false });
    await repo.saveBodyweight(onboarding);
    await repo.saveBodyweight(entry('bw_mgk2x1a9f3', addDays(TODAY, -1), 94));
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual(await repo.listBodyweight(), [onboarding]);
    eraseAllData(db);
    repo.forgetCache();
    assert.deepEqual(await repo.listBodyweight(), [onboarding], 'every time');
  });

  test('Load sample data keeps it, and leaves out the sample weigh-in on its day', async () => {
    fresh({ sample: false });
    const earlier = entry('bw_onb', addDays(TODAY, -20), 95, { source: 'onboarding' });
    await repo.saveBodyweight(earlier);
    await repo.saveBodyweight(entry('bw_mine', addDays(TODAY, -3), 94));
    loadSampleData(db, TODAY);
    repo.forgetCache();
    const list = await repo.listBodyweight();
    assert.deepEqual(list.filter((e) => e.date === earlier.date), [earlier]);
    assert.ok(list.length > 5, 'with the sample weigh-ins around it');
    assert.equal(list.some((e) => e.id === 'bw_mine'), false, 'other weigh-ins are replaced');
    assert.equal(new Set(list.map((e) => e.date)).size, list.length, 'still one per day');
    // Load again: still there, once.
    loadSampleData(db, TODAY);
    repo.forgetCache();
    assert.deepEqual((await repo.listBodyweight()).filter((e) => e.source === 'onboarding'), [earlier]);
    assert.equal(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', [])!.n, 0, 'sample data never syncs');
  });
});
