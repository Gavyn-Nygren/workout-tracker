import type { LoggedSet, WorkoutSession } from '../types';
import type { UserTable } from './schema';
import type { SqlDb, SqlValue } from './sql';

/** The entity name each table syncs as (used in the outbox). */
const ENTITY: Record<UserTable, string> = {
  preferences: 'preferences',
  custom_exercises: 'exercise',
  plans: 'plan',
  plan_versions: 'plan_version',
  plan_shifts: 'plan_shift',
  occurrences: 'occurrence',
  sessions: 'session',
  logged_sets: 'logged_set',
  bodyweight: 'bodyweight',
  goals: 'goal',
  recordings: 'recording',
  form_reports: 'form_report',
  streak_weeks: 'streak_week',
};

export const nowISO = () => new Date().toISOString();

function recordChange(db: SqlDb, table: UserTable, id: string, op: 'upsert' | 'delete', at: string) {
  db.runSync('INSERT INTO outbox (entity, entity_id, op, at) VALUES (?, ?, ?, ?)', [ENTITY[table], id, op, at]);
}

/**
 * Inserts or updates a row, reviving it if it was a tombstone. Does nothing (and records nothing
 * for sync) when the stored row is already identical. Returns whether it wrote.
 */
export function putRow(db: SqlDb, table: UserTable, id: string, data: object, columns: Record<string, SqlValue> = {}, at = nowISO()): boolean {
  const json = JSON.stringify(data);
  const existing = db.getFirstSync<{ data: string; deleted_at: string | null }>(`SELECT data, deleted_at FROM ${table} WHERE id = ?`, [id]);
  if (existing && existing.data === json && existing.deleted_at === null) return false;
  const extra = Object.keys(columns);
  const names = ['id', ...extra, 'data', 'updated_at', 'deleted_at'];
  const updates = [...extra, 'data', 'updated_at', 'deleted_at'].map((c) => `${c} = excluded.${c}`).join(', ');
  db.runSync(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
    [id, ...extra.map((c) => columns[c]), json, at, null],
  );
  recordChange(db, table, id, 'upsert', at);
  return true;
}

/** Inserts a row only if no row (live or tombstone) has this id. Returns whether it wrote. */
export function insertRowIfMissing(db: SqlDb, table: UserTable, id: string, data: object, columns: Record<string, SqlValue> = {}, at = nowISO()): boolean {
  const extra = Object.keys(columns);
  const names = ['id', ...extra, 'data', 'updated_at'];
  const { changes } = db.runSync(`INSERT OR IGNORE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`, [
    id,
    ...extra.map((c) => columns[c]),
    JSON.stringify(data),
    at,
  ]);
  if (changes) recordChange(db, table, id, 'upsert', at);
  return changes > 0;
}

/** Marks a row deleted (a tombstone, so the delete can sync). Returns whether it was live. */
export function tombstone(db: SqlDb, table: UserTable, id: string, at = nowISO()): boolean {
  const { changes } = db.runSync(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [at, at, id]);
  if (changes) recordChange(db, table, id, 'delete', at);
  return changes > 0;
}

const where = (clause?: string) => `WHERE deleted_at IS NULL${clause ? ` AND (${clause})` : ''}`;

/** Live rows of a table, parsed. */
export async function readAll<T>(db: SqlDb, table: UserTable, clause?: string, params: SqlValue[] = [], order?: string): Promise<T[]> {
  const rows = await db.getAllAsync<{ data: string }>(`SELECT data FROM ${table} ${where(clause)}${order ? ` ORDER BY ${order}` : ''}`, params);
  return rows.map((r) => JSON.parse(r.data) as T);
}

export function readAllSync<T>(db: SqlDb, table: UserTable, clause?: string, params: SqlValue[] = [], order?: string): T[] {
  const rows = db.getAllSync<{ data: string }>(`SELECT data FROM ${table} ${where(clause)}${order ? ` ORDER BY ${order}` : ''}`, params);
  return rows.map((r) => JSON.parse(r.data) as T);
}

export async function readOne<T>(db: SqlDb, table: UserTable, id: string): Promise<T | undefined> {
  const row = await db.getFirstAsync<{ data: string }>(`SELECT data FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? (JSON.parse(row.data) as T) : undefined;
}

export function readOneSync<T>(db: SqlDb, table: UserTable, id: string): T | undefined {
  const row = db.getFirstSync<{ data: string }>(`SELECT data FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? (JSON.parse(row.data) as T) : undefined;
}

// Sessions are stored as a header row plus one row per set, so sync can merge per set (spec 2.12).

export type SetRow = { id: string; entryId: string; position: number; set: LoggedSet };

/** Splits a session into its header (exercises with no sets) and its set rows. */
export function splitSession(session: WorkoutSession): { header: WorkoutSession; sets: SetRow[] } {
  const sets: SetRow[] = [];
  const header: WorkoutSession = {
    ...session,
    blocks: session.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((entry) => {
        entry.sets.forEach((set, position) => sets.push({ id: set.id, entryId: entry.id, position, set }));
        return { ...entry, sets: [] };
      }),
    })),
  };
  return { header, sets };
}

/** Puts set rows back into their session headers. */
export function joinSessions(headers: WorkoutSession[], sets: { session_id: string; entry_id: string; position: number; data: string }[]): WorkoutSession[] {
  const byEntry = new Map<string, { position: number; set: LoggedSet }[]>();
  for (const row of sets) {
    const key = `${row.session_id}:${row.entry_id}`;
    const list = byEntry.get(key) ?? [];
    list.push({ position: row.position, set: JSON.parse(row.data) as LoggedSet });
    byEntry.set(key, list);
  }
  return headers.map((session) => ({
    ...session,
    blocks: session.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((entry) => ({
        ...entry,
        sets: (byEntry.get(`${session.id}:${entry.id}`) ?? []).sort((a, b) => a.position - b.position).map((s) => s.set),
      })),
    })),
  }));
}
