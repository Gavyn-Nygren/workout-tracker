import type { SqlDb } from './sql';

/**
 * Local database schema (roadmap G3.1). Every synced table has the same bookkeeping columns:
 *
 * - `id`: client-generated, so rows can be created offline and synced later (spec 3.1).
 * - `data`: the entity as JSON, in the shape of the types in `../types.ts`.
 * - `updated_at`: last local change; later sync resolves conflicts with it (spec 2.12).
 * - `deleted_at`: set instead of deleting the row (a tombstone), so deletes can sync too.
 *
 * Plain columns beside `data` exist only to index and filter. Sets live in their own table, so a
 * conflict is resolved per set and sets added on two devices are both kept (spec 2.12).
 *
 * The `outbox` records every change for the sync worker (Phase 5) to send.
 */
const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

  CREATE TABLE preferences (
    id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE custom_exercises (
    id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE plans (
    id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE occurrences (
    id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL, scheduled_date TEXT NOT NULL, session_id TEXT,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX occurrences_by_date ON occurrences (scheduled_date);
  CREATE INDEX occurrences_by_plan ON occurrences (plan_id, scheduled_date);

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL,
    -- The day a session counts on: its completion date, or its scheduled date until completed.
    day TEXT, completed_at TEXT, occurrence_id TEXT,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX sessions_by_day ON sessions (day);

  CREATE TABLE logged_sets (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL,
    -- The session exercise the set belongs to, and its order within it.
    entry_id TEXT NOT NULL, position INTEGER NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX logged_sets_by_session ON logged_sets (session_id);

  CREATE TABLE bodyweight (
    id TEXT PRIMARY KEY NOT NULL, date TEXT NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX bodyweight_by_date ON bodyweight (date);

  CREATE TABLE goals (
    id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE recordings (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE form_reports (
    id TEXT PRIMARY KEY NOT NULL, exercise_id TEXT NOT NULL, session_id TEXT NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX form_reports_by_exercise ON form_reports (exercise_id);

  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
    op TEXT NOT NULL, at TEXT NOT NULL
  );
  `,
  // 2: plan versions (G3.3). Each saved version of a plan is kept, so a workout keeps the
  // prescription it was scheduled with after the plan is edited (spec 2.5).
  `
  CREATE TABLE plan_versions (
    id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL, version INTEGER NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX plan_versions_by_plan ON plan_versions (plan_id, version);
  INSERT INTO plan_versions (id, plan_id, version, data, updated_at)
    SELECT id || '@' || json_extract(data, '$.version'), id, json_extract(data, '$.version'), data, updated_at
    FROM plans WHERE deleted_at IS NULL;
  `,
  // 3: plan shifts (G3.7). A "push forward" after a missed workout, kept so the plan's later
  // workouts land on their new dates as the calendar fills in, and so it can be undone.
  `
  CREATE TABLE plan_shifts (
    id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL,
    data TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX plan_shifts_by_plan ON plan_shifts (plan_id);
  `,
];

/** The tables that hold the user's data (everything except bookkeeping). */
export const USER_TABLES = [
  'preferences',
  'custom_exercises',
  'plans',
  'plan_versions',
  'plan_shifts',
  'occurrences',
  'sessions',
  'logged_sets',
  'bodyweight',
  'goals',
  'recordings',
  'form_reports',
] as const;
export type UserTable = (typeof USER_TABLES)[number];

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Brings the database up to the latest schema. Each migration runs once, in order, inside a
 * transaction; `PRAGMA user_version` records how far the database has got. Tests can stop at an
 * earlier `target` to check an upgrade.
 */
export function migrate(db: SqlDb, target = SCHEMA_VERSION): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  const current = db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema ${current} is newer than this app (${SCHEMA_VERSION}). Update the app.`);
  }
  for (let version = current; version < target; version++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[version]);
      db.execSync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
