import { openDatabaseSync } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';

import { todayISO } from '../dates';
import { importLegacyProgress, LEGACY_PROGRESS_KEYS } from './importProgress';
import { markOldOnboardingWeighIn, seedOnFirstRun } from './sampleData';
import { migrate } from './schema';
import type { SqlDb } from './sql';

const FILE_NAME = 'exercise-tracker.db';

/**
 * Opens the app's database on the phone and brings its schema up to date. The first time,
 * development builds fill it with sample data and release builds start empty (G3.11). Runs once at
 * startup; it's fast because the database is local and small.
 */
export function openAppDatabase(): SqlDb {
  const db: SqlDb = openDatabaseSync(FILE_NAME);
  migrate(db);
  seedOnFirstRun(db, todayISO(), __DEV__);
  markOldOnboardingWeighIn(db);
  moveLegacyProgress(db);
  return db;
}

/** Moves Progress's pins and graphs out of the key-value store, once (importProgress.ts). */
function moveLegacyProgress(db: SqlDb): void {
  try {
    const legacy = { pinned: Storage.getItemSync(LEGACY_PROGRESS_KEYS.pinned), graphs: Storage.getItemSync(LEGACY_PROGRESS_KEYS.graphs) };
    if (importLegacyProgress(db, legacy)) {
      Storage.removeItemSync(LEGACY_PROGRESS_KEYS.pinned);
      Storage.removeItemSync(LEGACY_PROGRESS_KEYS.graphs);
    }
  } catch {
    // Not moved: Progress starts from the defaults, and the move is tried again at the next launch.
  }
}
