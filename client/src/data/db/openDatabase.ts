import { openDatabaseSync } from 'expo-sqlite';

import { todayISO } from '../dates';
import { seedOnFirstRun } from './sampleData';
import { migrate } from './schema';
import type { SqlDb } from './sql';

const FILE_NAME = 'exercise-tracker.db';

/**
 * Opens the app's database on the phone, brings its schema up to date, and fills it with sample
 * data the first time. Runs once at startup; it's fast because the database is local and small.
 */
export function openAppDatabase(): SqlDb {
  const db: SqlDb = openDatabaseSync(FILE_NAME);
  migrate(db);
  seedOnFirstRun(db, todayISO());
  return db;
}
