import { DatabaseSync } from 'node:sqlite';

import type { SqlDb, SqlValue } from '../../src/data/db/sql';

/** An in-memory database with the same interface the app gets from expo-sqlite. */
export function openTestDatabase(): SqlDb & { close(): void } {
  const db = new DatabaseSync(':memory:');
  const run = (sql: string, params: SqlValue[]) => {
    const result = db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  };
  const all = <T>(sql: string, params: SqlValue[]) => db.prepare(sql).all(...params) as T[];
  const first = <T>(sql: string, params: SqlValue[]) => (db.prepare(sql).get(...params) as T | undefined) ?? null;
  return {
    execSync: (sql) => db.exec(sql),
    runSync: run,
    getAllSync: all,
    getFirstSync: first,
    withTransactionSync: (task) => {
      db.exec('BEGIN');
      try {
        task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    getAllAsync: async (sql, params) => all(sql, params),
    getFirstAsync: async (sql, params) => first(sql, params),
    close: () => db.close(),
  };
}
