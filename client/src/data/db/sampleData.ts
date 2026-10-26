import { buildFakeDataset } from '../fake';
import type { ISODate } from '../types';
import { putRow, splitSession } from './rows';
import { USER_TABLES } from './schema';
import type { SqlDb } from './sql';

/**
 * Sample data for building and testing Phase 3 (user's pick: start with sample data, erasable).
 * Profile → Developer → Component gallery has "Erase all data" and "Load sample data".
 */

const getMeta = (db: SqlDb, key: string) => db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;
const setMeta = (db: SqlDb, key: string, value: string) =>
  db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);

/** Removes every workout, plan, weigh-in, goal, and recording. Settings stay. */
export function eraseAllData(db: SqlDb): void {
  db.withTransactionSync(() => {
    for (const table of USER_TABLES) if (table !== 'preferences') db.runSync(`DELETE FROM ${table}`, []);
    db.runSync('DELETE FROM outbox', []);
    setMeta(db, 'contents', 'user');
  });
}

/** Replaces everything with eight weeks of sample history ending today. Settings stay. */
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
    for (const b of data.bodyweight) putRow(db, 'bodyweight', b.id, b, { date: b.date });
    for (const g of data.goals) putRow(db, 'goals', g.id, g);
    for (const r of data.recordings) putRow(db, 'recordings', r.id, r, { session_id: r.sessionId });
    for (const r of data.formReports) putRow(db, 'form_reports', r.id, r, { exercise_id: r.exerciseId, session_id: r.sessionId });
    // Sample data must never sync to an account.
    db.runSync('DELETE FROM outbox', []);
    setMeta(db, 'contents', 'sample');
  });
}

/** The first time the app opens with a database, it starts with the sample data. */
export function seedOnFirstRun(db: SqlDb, today: ISODate): void {
  if (getMeta(db, 'contents') === undefined) loadSampleData(db, today);
}

/** Whether the database currently holds the sample data rather than the user's own. */
export function holdsSampleData(db: SqlDb): boolean {
  return getMeta(db, 'contents') === 'sample';
}
