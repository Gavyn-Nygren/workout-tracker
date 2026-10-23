/**
 * The slice of a SQLite connection the data layer uses. expo-sqlite's database satisfies it in the
 * app; tests use Node's built-in SQLite through a small adapter (tests/support/nodeSqlite.ts).
 *
 * Writes use the sync API inside one transaction, so a write is never interleaved with another
 * (JS runs it start to finish). Reads use the async API so large reads don't block the UI thread.
 */
export type SqlValue = string | number | null;

export interface SqlDb {
  execSync(sql: string): void;
  runSync(sql: string, params: SqlValue[]): { changes: number };
  getAllSync<T>(sql: string, params: SqlValue[]): T[];
  getFirstSync<T>(sql: string, params: SqlValue[]): T | null;
  withTransactionSync(task: () => void): void;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
}
