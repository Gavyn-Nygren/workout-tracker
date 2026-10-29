import { buildFakeDataset } from '../fake';
import { defaultProgress } from '../preferences';
import type { ISODate, Preferences, ProgressPreferences } from '../types';
import { nowISO, PREFERENCES_ID, putRow, readOneSync, splitSession } from './rows';
import { USER_TABLES } from './schema';
import type { SqlDb } from './sql';
import { G310_UPGRADE_META_KEY, LEGACY_STREAK_META_KEY } from './upgradeG310';

/**
 * Sample data for building and testing Phase 3 (user's pick: start with sample data, erasable).
 * Only development builds start with it (G3.11); release builds start empty. Profile → Developer
 * (development builds) has "Erase all data" and "Load sample data".
 *
 * Both keep the user's bodyweight (keptWeighIns), so trying the sample data never costs them the
 * weigh-in from onboarding, which the app never asks for again (spec 2.6). Both reset Progress's
 * pins and graphs (Preferences.progress); the other settings stay.
 */

const getMeta = (db: SqlDb, key: string) => db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;
const setMeta = (db: SqlDb, key: string, value: string) =>
  db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);

/** Progress with the sample data: the default pins, and two graphs to show Your graphs. */
export const SAMPLE_PROGRESS: ProgressPreferences = {
  pins: defaultProgress.pins,
  graphs: [
    { id: 'graph_sample_squat_volume', exerciseId: 'ex_back_squat', metric: 'volume' },
    { id: 'graph_sample_pullup_reps', exerciseId: 'ex_pull_up', metric: 'reps' },
  ],
};

/** The ids fake/history.ts gives sample weigh-ins ('bw_' and the date); the app's own (newId) never look like this. */
const SAMPLE_WEIGH_IN_ID = /^bw_\d{4}-\d{2}-\d{2}$/;

/**
 * The weigh-ins Erase all data and Load sample data keep: the one from onboarding (marked), and
 * while the sample data is loaded, every weigh-in the user entered on top of it. Deleted ones
 * aren't kept.
 */
function keptWeighIns(db: SqlDb): string[] {
  const sample = holdsSampleData(db);
  return db
    .getAllSync<{ id: string; source: string | null }>("SELECT id, json_extract(data, '$.source') AS source FROM bodyweight WHERE deleted_at IS NULL", [])
    .filter((row) => row.source === 'onboarding' || (sample && !SAMPLE_WEIGH_IN_ID.test(row.id)))
    .map((row) => row.id);
}

/** Set once markOldOnboardingWeighIn has run. */
export const ONBOARDING_MARK_META_KEY = 'g311_onboarding_weigh_in';

/**
 * Runs once, at the first launch with G3.11. Before G3.11, onboarding saved its weigh-in without
 * marking it. When no weigh-in is marked yet, this marks the earliest made of the user's own
 * (never a sample one), so Erase all data and Load sample data keep it, in either mode. Weigh-ins
 * saved after this never get guessed at.
 */
export function markOldOnboardingWeighIn(db: SqlDb): void {
  if (getMeta(db, ONBOARDING_MARK_META_KEY) !== undefined) return;
  db.withTransactionSync(() => {
    const rows = db.getAllSync<{ id: string; date: string; data: string; source: string | null }>(
      "SELECT id, date, data, json_extract(data, '$.source') AS source FROM bodyweight WHERE deleted_at IS NULL ORDER BY json_extract(data, '$.createdAt'), updated_at, id",
      [],
    );
    const first = rows.find((row) => !SAMPLE_WEIGH_IN_ID.test(row.id));
    if (first && !rows.some((row) => row.source === 'onboarding')) {
      const now = nowISO();
      putRow(db, 'bodyweight', first.id, { ...JSON.parse(first.data), source: 'onboarding', updatedAt: now }, { date: first.date }, now);
    }
    setMeta(db, ONBOARDING_MARK_META_KEY, '1');
  });
}

/** Sets Progress's pins and graphs, keeping every other setting. `always`: also when nothing is saved yet. */
function putProgress(db: SqlDb, progress: ProgressPreferences, always: boolean): void {
  const stored = readOneSync<Partial<Preferences>>(db, 'preferences', PREFERENCES_ID);
  if (stored || always) putRow(db, 'preferences', PREFERENCES_ID, { ...stored, progress });
}

/**
 * Removes every workout, plan, weigh-in, goal, and recording, but keeps the user's bodyweight
 * (keptWeighIns). Settings stay, but Progress's pins and graphs go back to the defaults.
 */
export function eraseAllData(db: SqlDb): void {
  db.withTransactionSync(() => {
    const keep = keptWeighIns(db);
    for (const table of USER_TABLES) {
      if (table === 'preferences') continue;
      if (table === 'bodyweight') db.runSync(`DELETE FROM bodyweight WHERE id NOT IN (${keep.map(() => '?').join(', ')})`, keep);
      else db.runSync(`DELETE FROM ${table}`, []);
    }
    putProgress(db, defaultProgress, false);
    db.runSync('DELETE FROM outbox', []);
    // What's kept is the user's own from here on, so it's queued to sync again (the outbox was
    // just cleared of everything erased, and of the sample data's history).
    db.runSync("INSERT INTO outbox (entity, entity_id, op, at) SELECT 'bodyweight', id, 'upsert', updated_at FROM bodyweight WHERE deleted_at IS NULL ORDER BY date", []);
    db.runSync("INSERT INTO outbox (entity, entity_id, op, at) SELECT 'preferences', id, 'upsert', updated_at FROM preferences WHERE deleted_at IS NULL", []);
    // The workouts and goals from before G3.10 are gone, and with them what they meant then.
    db.runSync('DELETE FROM meta WHERE key IN (?, ?)', [LEGACY_STREAK_META_KEY, G310_UPGRADE_META_KEY]);
    setMeta(db, 'contents', 'user');
  });
}

/**
 * Replaces everything with eight weeks of sample history ending today, keeping the user's
 * bodyweight (keptWeighIns; a sample weigh-in on a kept one's day is left out: one per day).
 * Settings stay; Progress gets the sample's pins and graphs.
 */
export function loadSampleData(db: SqlDb, today: ISODate): void {
  const data = buildFakeDataset(today);
  eraseAllData(db);
  db.withTransactionSync(() => {
    for (const e of data.exercises) if (e.source === 'custom') putRow(db, 'custom_exercises', e.id, e);
    for (const p of data.plans) {
      putRow(db, 'plans', p.id, p, { status: p.status });
      putRow(db, 'plan_versions', `${p.id}@${p.version}`, p, { plan_id: p.id, version: p.version });
    }
    for (const o of data.occurrences) putRow(db, 'occurrences', o.id, o, { plan_id: o.planId, scheduled_date: o.scheduledDate, session_id: o.sessionId ?? null });
    for (const s of data.sessions) {
      const { header, sets } = splitSession(s);
      putRow(db, 'sessions', s.id, header, { status: s.status, day: s.completedDate ?? s.scheduledDate ?? null, completed_at: s.completedAt ?? null, occurrence_id: s.occurrenceId ?? null });
      for (const row of sets) putRow(db, 'logged_sets', row.id, row.set, { session_id: s.id, entry_id: row.entryId, position: row.position });
    }
    const kept = new Set(db.getAllSync<{ date: string }>('SELECT date FROM bodyweight WHERE deleted_at IS NULL', []).map((r) => r.date));
    for (const b of data.bodyweight) if (!kept.has(b.date)) putRow(db, 'bodyweight', b.id, b, { date: b.date });
    for (const g of data.goals) putRow(db, 'goals', g.id, g);
    for (const r of data.recordings) putRow(db, 'recordings', r.id, r, { session_id: r.sessionId });
    for (const r of data.formReports) putRow(db, 'form_reports', r.id, r, { exercise_id: r.exerciseId, session_id: r.sessionId });
    putProgress(db, SAMPLE_PROGRESS, true);
    // Sample data must never sync to an account.
    db.runSync('DELETE FROM outbox', []);
    setMeta(db, 'contents', 'sample');
  });
}

/**
 * The first time the app opens with a database: development builds (`sample`, __DEV__ in the app)
 * start with the sample data, release builds start empty with the user's own (G3.11).
 */
export function seedOnFirstRun(db: SqlDb, today: ISODate, sample = true): void {
  if (getMeta(db, 'contents') !== undefined) return;
  if (sample) loadSampleData(db, today);
  else setMeta(db, 'contents', 'user');
}

/** Whether the database currently holds the sample data rather than the user's own. */
export function holdsSampleData(db: SqlDb): boolean {
  return getMeta(db, 'contents') === 'sample';
}
