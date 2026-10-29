import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { importLegacyProgress, LEGACY_PROGRESS_KEYS } from '../src/data/db/importProgress';
import { eraseAllData, loadSampleData, SAMPLE_PROGRESS, seedOnFirstRun } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { INVALIDATES } from '../src/data/invalidation';
import { cleanProgress, DEFAULT_PIN_IDS, defaultPreferences, defaultProgress, withPreferenceDefaults } from '../src/data/preferences';
import type { Exercise, Preferences, ProgressPreferences } from '../src/data/types';
import {
  DEFAULT_RANGE,
  graphFor,
  isPinned,
  parseRange,
  pinFor,
  setPinned,
  shownGraphs,
  shownPins,
  togglePin,
  withGraph,
  withoutGraph,
} from '../src/features/progress/progressPrefs';
import { everythingJson } from '../src/features/settings/exportData';
import { openTestDatabase } from './support/nodeSqlite';

const TODAY = '2026-10-29';
const byId = new Map<string, Exercise>(builtinExercises.map((e) => [e.id, e]));
const progress = (pins: ProgressPreferences['pins'], graphs: ProgressPreferences['graphs'] = []): ProgressPreferences => ({ pins, graphs });

function emptyDb() {
  const db = openTestDatabase();
  migrate(db);
  eraseAllData(db);
  return db;
}
const storedRow = (db: ReturnType<typeof openTestDatabase>) => {
  const row = db.getFirstSync<{ data: string }>("SELECT data FROM preferences WHERE id = 'me' AND deleted_at IS NULL", []);
  return row ? (JSON.parse(row.data) as Partial<Preferences>) : undefined;
};

describe('Progress pins and graphs: defaults and what is read back', () => {
  test('a new account has the default pins (Squat, Bench, Deadlift, each marked default) and no saved graphs', () => {
    assert.deepEqual(DEFAULT_PIN_IDS, ['ex_back_squat', 'ex_bench_press', 'ex_deadlift']);
    assert.deepEqual(defaultPreferences.progress, {
      pins: [
        { exerciseId: 'ex_back_squat', isDefault: true },
        { exerciseId: 'ex_bench_press', isDefault: true },
        { exerciseId: 'ex_deadlift', isDefault: true },
      ],
      graphs: [],
    });
    for (const id of DEFAULT_PIN_IDS) assert.ok(byId.has(id), `${id} is a built-in exercise`);
  });

  test('preferences saved before G3.11 load with the defaults', () => {
    const { progress: _none, ...older } = defaultPreferences;
    assert.deepEqual(withPreferenceDefaults({ ...older, units: 'metric' }).progress, defaultProgress);
  });

  test('a value that is not pins and graphs reads as the defaults', () => {
    for (const junk of [null, undefined, 5, 'pins', true]) assert.deepEqual(cleanProgress(junk), defaultProgress);
    assert.deepEqual(cleanProgress({ pins: 'squat', graphs: 7 }), defaultProgress, 'a missing or broken list is the default');
    assert.deepEqual(cleanProgress({ pins: [], graphs: [] }), { pins: [], graphs: [] }, 'an empty list stays empty: every pin removed');
  });

  test('bad pins are dropped, one per exercise, and only a default lift can be a default pin', () => {
    const cleaned = cleanProgress({
      pins: [
        { exerciseId: 'ex_overhead_press' },
        'ex_pull_up',
        { exerciseId: '' },
        { exerciseId: 3 },
        null,
        7,
        { exerciseId: 'ex_overhead_press', isDefault: true },
        { exerciseId: 'ex_back_squat', isDefault: true },
        { exerciseId: 'ex_bench_press', isDefault: 'yes' },
        { exerciseId: 'ex_barbell_row', isDefault: true, extra: 1 },
      ],
    });
    assert.deepEqual(cleaned.pins, [
      { exerciseId: 'ex_overhead_press' },
      { exerciseId: 'ex_pull_up' },
      { exerciseId: 'ex_back_squat', isDefault: true },
      { exerciseId: 'ex_bench_press' },
      { exerciseId: 'ex_barbell_row' },
    ]);
  });

  test('bad graphs are dropped, one per id and per exercise and metric, extra fields stripped', () => {
    const cleaned = cleanProgress({
      graphs: [
        { id: 'g1', exerciseId: 'ex_back_squat', metric: 'volume', note: 'x' },
        { id: 'g1', exerciseId: 'ex_deadlift', metric: 'e1rm' },
        { id: 'g2', exerciseId: 'ex_back_squat', metric: 'volume' },
        { id: 'g3', exerciseId: 'ex_back_squat' },
        { id: 4, exerciseId: 'ex_back_squat', metric: 'reps' },
        'g5',
        null,
        { id: 'g6', exerciseId: 'ex_pull_up', metric: 'reps' },
      ],
    });
    assert.deepEqual(cleaned.graphs, [
      { id: 'g1', exerciseId: 'ex_back_squat', metric: 'volume' },
      { id: 'g6', exerciseId: 'ex_pull_up', metric: 'reps' },
    ]);
    assert.deepEqual(cleaned.pins, defaultProgress.pins);
  });

  test('a graph with a metric Progress does not know is left out (a renamed metric never crashes Progress)', () => {
    const p = progress([], [
      { id: 'a', exerciseId: 'ex_back_squat', metric: 'top_weight' },
      { id: 'b', exerciseId: 'ex_back_squat', metric: 'e1rm' },
      { id: 'c', exerciseId: 'ex_plank', metric: 'longest_hold' },
    ]);
    assert.deepEqual(shownGraphs(p).map((g) => g.id), ['b', 'c']);
  });

  test('a graph whose exercise no longer exists stays (it shows as Deleted exercise with Remove)', () => {
    const p = progress([], [{ id: 'gone', exerciseId: 'ex_custom_deleted', metric: 'volume' }]);
    assert.deepEqual(shownGraphs(p).map((g) => g.id), ['gone']);
  });

  test('stored ranges are checked', () => {
    assert.equal(DEFAULT_RANGE, '3M');
    assert.equal(parseRange('1Y'), '1Y');
    for (const bad of ['2Y', undefined, null, 3, '']) assert.equal(parseRange(bad), '3M');
  });
});

describe('pinning', () => {
  test('pins of exercises that no longer exist are left out once the exercises have loaded', () => {
    const p = progress([{ exerciseId: 'ex_back_squat', isDefault: true }, { exerciseId: 'ex_custom_deleted' }, { exerciseId: 'ex_overhead_press' }]);
    assert.deepEqual(shownPins(p, byId).map((x) => x.exerciseId), ['ex_back_squat', 'ex_overhead_press']);
    assert.equal(shownPins(p), p.pins, 'without the exercises, nothing is left out');
    assert.equal(shownPins(p, new Map()), p.pins, 'nor while they load');
    const clean = progress([{ exerciseId: 'ex_overhead_press' }]);
    assert.equal(shownPins(clean, byId), clean.pins, 'the same list when nothing is left out');
  });

  test('unpinning a default pin drops it; pinning that lift again makes it the user’s own pin, at the end', () => {
    const unpinned = togglePin(defaultProgress, 'ex_bench_press', byId);
    assert.deepEqual(unpinned.pins.map((p) => p.exerciseId), ['ex_back_squat', 'ex_deadlift']);
    assert.equal(isPinned(unpinned, 'ex_bench_press'), false);
    const repinned = togglePin(unpinned, 'ex_bench_press', byId);
    assert.deepEqual(repinned.pins, [{ exerciseId: 'ex_back_squat', isDefault: true }, { exerciseId: 'ex_deadlift', isDefault: true }, { exerciseId: 'ex_bench_press' }]);
    assert.deepEqual(pinFor(repinned, 'ex_bench_press'), { exerciseId: 'ex_bench_press' }, 'no longer a default pin: it always shows');
    assert.deepEqual(defaultProgress.pins.length, 3, 'the defaults are never changed in place');
  });

  test('pins the user adds go at the end in the order pinned, with no limit', () => {
    let p = defaultProgress;
    const added = ['ex_overhead_press', 'ex_pull_up', 'ex_dips', 'ex_barbell_row', 'ex_rdl'].filter((id) => byId.has(id));
    assert.ok(added.length >= 4);
    for (const id of added) p = togglePin(p, id, byId);
    assert.deepEqual(p.pins.map((x) => x.exerciseId), [...DEFAULT_PIN_IDS, ...added]);
    assert.ok(p.pins.length > 6, 'pins past 6 are kept');
    assert.ok(p.pins.slice(3).every((x) => !x.isDefault));
  });

  test('setPinned is idempotent, and a change drops the pins of missing exercises', () => {
    assert.equal(setPinned(defaultProgress, 'ex_back_squat', true, byId), defaultProgress);
    assert.equal(setPinned(defaultProgress, 'ex_overhead_press', false, byId), defaultProgress);
    const withGone = progress([{ exerciseId: 'ex_custom_deleted' }, { exerciseId: 'ex_back_squat', isDefault: true }]);
    assert.deepEqual(setPinned(withGone, 'ex_overhead_press', true, byId).pins, [{ exerciseId: 'ex_back_squat', isDefault: true }, { exerciseId: 'ex_overhead_press' }]);
    assert.deepEqual(togglePin(withGone, 'ex_custom_deleted', byId).pins, [{ exerciseId: 'ex_back_squat', isDefault: true }, { exerciseId: 'ex_custom_deleted' }], 'an exercise that is gone reads as unpinned');
  });
});

describe('saved graphs', () => {
  test('adding puts the graph at the end; the same exercise and metric again gives back the one saved', () => {
    const first = withGraph(defaultProgress, 'ex_back_squat', 'volume', 'g1');
    assert.deepEqual(first.graph, { id: 'g1', exerciseId: 'ex_back_squat', metric: 'volume' });
    const second = withGraph(first.progress, 'ex_pull_up', 'reps', 'g2');
    assert.deepEqual(second.progress.graphs.map((g) => g.id), ['g1', 'g2']);
    const again = withGraph(second.progress, 'ex_back_squat', 'volume', 'g3');
    assert.equal(again.progress, second.progress);
    assert.equal(again.graph.id, 'g1');
    assert.equal(graphFor(second.progress, 'ex_pull_up', 'reps')?.id, 'g2');
    assert.match(withGraph(defaultProgress, 'ex_deadlift', 'e1rm').graph.id, /^graph_/, 'a new id when none is given');
  });

  test('removing takes the graph out; removing one that is gone changes nothing', () => {
    const { progress: p } = withGraph(defaultProgress, 'ex_back_squat', 'volume', 'g1');
    assert.deepEqual(withoutGraph(p, 'g1').graphs, []);
    assert.equal(withoutGraph(p, 'nope'), p);
  });
});

describe('Progress pins and graphs in the database', () => {
  test('saving them keeps every other setting, cleans what is saved, and refreshes only the preferences', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    await repo.savePreferences({ ...defaultPreferences, units: 'metric', weekStartsOn: 7 });
    const next = withGraph(togglePin(defaultProgress, 'ex_overhead_press'), 'ex_back_squat', 'e1rm', 'g1').progress;
    await repo.saveProgressPreferences(next);
    const loaded = await repo.getPreferences();
    assert.deepEqual([loaded.units, loaded.weekStartsOn], ['metric', 7]);
    assert.deepEqual(loaded.progress, next);
    await repo.saveProgressPreferences({ pins: [{ exerciseId: '' }], graphs: [{ id: 'x' }] } as unknown as ProgressPreferences);
    assert.deepEqual((await repo.getPreferences()).progress, { pins: [], graphs: [] });
    assert.deepEqual(INVALIDATES.saveProgressPreferences, ['preferences']);
    // A later full settings save carries them along.
    await repo.savePreferences({ ...(await repo.getPreferences()), haptics: false });
    assert.deepEqual((await repo.getPreferences()).progress, { pins: [], graphs: [] });
    db.close();
  });

  test('saving them with nothing saved yet keeps the other settings at their defaults', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const next = progress([{ exerciseId: 'ex_overhead_press' }]);
    await repo.saveProgressPreferences(next);
    assert.deepEqual(await repo.getPreferences(), { ...defaultPreferences, progress: next });
    db.close();
  });

  test('a broken stored value reads as clean data instead of failing', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    db.runSync('INSERT INTO preferences (id, data, updated_at) VALUES (?, ?, ?)', ['me', JSON.stringify({ units: 'metric', progress: { pins: 'x', graphs: [1, { id: 'g', exerciseId: 'e', metric: 'reps' }] } }), TODAY]);
    const loaded = await repo.getPreferences();
    assert.equal(loaded.units, 'metric');
    assert.deepEqual(loaded.progress, { pins: defaultProgress.pins, graphs: [{ id: 'g', exerciseId: 'e', metric: 'reps' }] });
    db.close();
  });

  test('Erase all data puts them back to the defaults, keeping the other settings', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    await repo.savePreferences({ ...defaultPreferences, units: 'metric' });
    await repo.saveProgressPreferences(withGraph(progress([{ exerciseId: 'ex_overhead_press' }]), 'ex_overhead_press', 'e1rm', 'g1').progress);
    eraseAllData(db);
    repo.forgetCache();
    const loaded = await repo.getPreferences();
    assert.equal(loaded.units, 'metric');
    assert.deepEqual(loaded.progress, defaultProgress);
    // Only the settings it keeps are queued to sync (they're the user's own from here on).
    assert.deepEqual(
      db.getAllSync<{ entity: string; entity_id: string; op: string }>('SELECT entity, entity_id, op FROM outbox', []).map((o) => ({ ...o })),
      [{ entity: 'preferences', entity_id: 'me', op: 'upsert' }],
    );
    db.close();
  });

  test('Load sample data gives the sample its pins and graphs; the other settings stay', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    await repo.savePreferences({ ...defaultPreferences, units: 'metric' });
    await repo.saveProgressPreferences(progress([{ exerciseId: 'ex_overhead_press' }], [{ id: 'mine', exerciseId: 'ex_overhead_press', metric: 'e1rm' }]));
    loadSampleData(db, TODAY);
    repo.forgetCache();
    const loaded = await repo.getPreferences();
    assert.equal(loaded.units, 'metric');
    assert.deepEqual(loaded.progress, SAMPLE_PROGRESS);
    assert.deepEqual(SAMPLE_PROGRESS.pins, defaultProgress.pins);
    // The sample graphs plot data the sample has.
    const sessions = await repo.listSessions();
    for (const g of SAMPLE_PROGRESS.graphs) {
      assert.ok(sessions.some((s) => s.blocks.some((b) => b.exercises.some((e) => e.exerciseId === g.exerciseId && e.sets.some((x) => x.completedAt)))), g.exerciseId);
    }
    db.close();
  });

  test('a development first run starts with the sample pins and graphs; a release one with the defaults', async () => {
    const dev = openTestDatabase();
    migrate(dev);
    seedOnFirstRun(dev, TODAY, true);
    assert.deepEqual((await createSqliteRepository(dev, { today: () => TODAY }).getPreferences()).progress, SAMPLE_PROGRESS);
    const release = openTestDatabase();
    migrate(release);
    seedOnFirstRun(release, TODAY, false);
    assert.deepEqual((await createSqliteRepository(release, { today: () => TODAY }).getPreferences()).progress, defaultProgress);
    assert.equal(storedRow(release), undefined, 'nothing saved: the defaults apply');
    dev.close();
    release.close();
  });

  test('the JSON export includes them', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    const saved = withGraph(togglePin(defaultProgress, 'ex_overhead_press'), 'ex_overhead_press', 'top_set', 'g1').progress;
    await repo.saveProgressPreferences(saved);
    const exported = JSON.parse(
      everythingJson({ preferences: await repo.getPreferences(), exercises: await repo.listExercises(), plans: [], sessions: [], bodyweight: [], goals: [], formReports: [] }),
    ) as { preferences: Preferences };
    assert.deepEqual(exported.preferences.progress, saved);
    db.close();
  });
});

describe('moving pins and graphs out of the key-value store (one time, G3.11)', () => {
  const legacyGraphs = JSON.stringify([
    { id: 'graph_squat_volume', exerciseId: 'ex_back_squat', metric: 'volume' },
    { id: 'graph_pullup_reps', exerciseId: 'ex_pull_up', metric: 'reps' },
    { id: 'graph_mine', exerciseId: 'ex_overhead_press', metric: 'e1rm' },
    { id: 'graph_bad' },
  ]);

  test('the old keys are the ones versions before G3.11 used', () => {
    assert.deepEqual(LEGACY_PROGRESS_KEYS, { pinned: 'progress.pinned', graphs: 'progress.graphs' });
  });

  test('pins and graphs move into the preferences, minus the two untouched sample graphs; other settings stay', async () => {
    const db = emptyDb();
    const repo = createSqliteRepository(db, { today: () => TODAY });
    await repo.savePreferences({ ...defaultPreferences, units: 'metric' });
    const { progress: _none, ...older } = { ...defaultPreferences, units: 'metric' as const };
    db.runSync("UPDATE preferences SET data = ? WHERE id = 'me'", [JSON.stringify(older)]);
    assert.equal(importLegacyProgress(db, { pinned: JSON.stringify(['ex_back_squat', 'ex_deadlift', 'ex_overhead_press', 7]), graphs: legacyGraphs }), true);
    const loaded = await repo.getPreferences();
    assert.equal(loaded.units, 'metric');
    assert.deepEqual(loaded.progress, {
      // The default lifts the user kept stay default pins (shown once logged); Bench was unpinned.
      pins: [{ exerciseId: 'ex_back_squat', isDefault: true }, { exerciseId: 'ex_deadlift', isDefault: true }, { exerciseId: 'ex_overhead_press' }],
      graphs: [{ id: 'graph_mine', exerciseId: 'ex_overhead_press', metric: 'e1rm' }],
    });
    db.close();
  });

  test('pins never saved are the default pins; graphs never saved are none', () => {
    const db = emptyDb();
    importLegacyProgress(db, { pinned: null, graphs: legacyGraphs });
    assert.deepEqual(storedRow(db)?.progress, { pins: defaultProgress.pins, graphs: [{ id: 'graph_mine', exerciseId: 'ex_overhead_press', metric: 'e1rm' }] });
    const other = emptyDb();
    importLegacyProgress(other, { pinned: JSON.stringify([]), graphs: null });
    assert.deepEqual(storedRow(other)?.progress, { pins: [], graphs: [] }, 'every pin removed stays removed');
    db.close();
    other.close();
  });

  test('a sample graph id with a different exercise or metric is the user’s and is kept', () => {
    const db = emptyDb();
    importLegacyProgress(db, { pinned: null, graphs: JSON.stringify([{ id: 'graph_squat_volume', exerciseId: 'ex_back_squat', metric: 'reps' }]) });
    assert.deepEqual(storedRow(db)?.progress?.graphs, [{ id: 'graph_squat_volume', exerciseId: 'ex_back_squat', metric: 'reps' }]);
    db.close();
  });

  test('nothing stored writes nothing; unreadable values read as the defaults', () => {
    const db = emptyDb();
    assert.equal(importLegacyProgress(db, { pinned: null, graphs: null }), true);
    assert.equal(storedRow(db), undefined);
    assert.equal(importLegacyProgress(db, { pinned: '{not json', graphs: '"graphs"' }), true);
    assert.deepEqual(storedRow(db)?.progress, defaultProgress);
    db.close();
  });

  test('it happens once: with pins and graphs already in the preferences, old values are ignored', () => {
    const db = emptyDb();
    importLegacyProgress(db, { pinned: JSON.stringify(['ex_overhead_press']), graphs: null });
    importLegacyProgress(db, { pinned: JSON.stringify(['ex_pull_up']), graphs: legacyGraphs });
    assert.deepEqual(storedRow(db)?.progress, { pins: [{ exerciseId: 'ex_overhead_press' }], graphs: [] });
    const seeded = openTestDatabase();
    migrate(seeded);
    seedOnFirstRun(seeded, TODAY, true);
    importLegacyProgress(seeded, { pinned: JSON.stringify(['ex_overhead_press']), graphs: legacyGraphs });
    assert.deepEqual(storedRow(seeded)?.progress, SAMPLE_PROGRESS, 'a first run that seeded the sample data');
    db.close();
    seeded.close();
  });
});
