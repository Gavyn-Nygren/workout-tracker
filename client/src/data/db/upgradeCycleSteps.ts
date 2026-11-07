import { stepsFromSequence } from '../schedule';
import type { Plan } from '../types';
import { nowISO, putRow } from './rows';
import type { SqlDb } from './sql';

/**
 * A one-time update for cycle days that hold several workouts (owner's pick: "Push + Cardio, Legs,
 * Rest"). Before it, a rotating plan stored its cycle as `sequence: (ID | 'rest')[]`, one workout
 * a day; now it's `steps`, each day's list of workouts ([] for a rest day). This rewrites the old
 * shape in every live plan and every saved version, the versions of a deleted plan too (deletePlan
 * keeps them, and badges read them).
 *
 * - Order, length and workout ids are kept (stepsFromSequence), so every date runs the same
 *   workout as before: stored occurrence ids, pushes' keptIds and alongIds, and frozen weeks'
 *   plannedIds all still match.
 * - `version` and the JSON `updatedAt` are kept: occurrences point at `${id}@${version}`, and the
 *   program badge reads which version stood on a date from its updatedAt. Rows are rewritten the
 *   way any write is (new `updated_at`, an outbox entry), so a later sync carries the change.
 * - Rows are picked by their shape, so a second run finds nothing to change and no meta key is
 *   needed. The SQL only narrows to rows whose text has a `"sequence":` key, which only the old
 *   cycle shape has: a plain text match, so it can't fail on a malformed row the way json_extract
 *   would, and once everything is upgraded no row is parsed at launch. Each match is then parsed
 *   on its own, and one that can't be read is left as it is rather than stopping the app opening.
 * - Tombstones are never touched: putRow would bring them back.
 *
 * Readers also accept the old shape (cycleSteps in schedule.ts), so a row this misses still works.
 */

export type CycleStepsResult = {
  /** Plans rows rewritten. */
  plans: number;
  /** Plan version rows rewritten. */
  versions: number;
};

/** The plan with its cycle as steps, or undefined when it has none in the old shape (or can't be read). */
export function withCycleSteps(json: string): Plan | undefined {
  let plan: unknown;
  try {
    plan = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!plan || typeof plan !== 'object') return undefined;
  const schedule = (plan as { schedule?: unknown }).schedule as { type?: unknown; steps?: unknown; sequence?: unknown } | null | undefined;
  if (!schedule || typeof schedule !== 'object' || schedule.type !== 'rotating' || Array.isArray(schedule.steps)) return undefined;
  // Spread in place, so the row keeps its key order and only the schedule changes.
  return { ...(plan as Plan), schedule: { type: 'rotating', steps: stepsFromSequence(schedule.sequence) } };
}

const metaValue = (db: SqlDb, key: string) => db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;

/**
 * Runs at every repository creation (after `migrate`), before anything schedules a plan. Returns
 * how many rows it rewrote: none once the database is upgraded. Sample data stays out of the
 * outbox, like the rest of it.
 */
export function upgradeCycleSteps(db: SqlDb, at: string = nowISO()): CycleStepsResult {
  const result: CycleStepsResult = { plans: 0, versions: 0 };
  db.withTransactionSync(() => {
    const lastSeq = db.getFirstSync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM outbox', [])?.seq ?? 0;
    const live = `deleted_at IS NULL AND instr(data, '"sequence":') > 0`;

    for (const row of db.getAllSync<{ id: string; status: string; data: string }>(`SELECT id, status, data FROM plans WHERE ${live}`, [])) {
      const plan = withCycleSteps(row.data);
      if (plan && putRow(db, 'plans', row.id, plan, { status: row.status }, at)) result.plans++;
    }
    for (const row of db.getAllSync<{ id: string; plan_id: string; version: number; data: string }>(`SELECT id, plan_id, version, data FROM plan_versions WHERE ${live}`, [])) {
      const plan = withCycleSteps(row.data);
      if (plan && putRow(db, 'plan_versions', row.id, plan, { plan_id: row.plan_id, version: row.version }, at)) result.versions++;
    }

    // Sample data is never queued to sync (see sampleData.ts).
    if (result.plans + result.versions > 0 && metaValue(db, 'contents') === 'sample') db.runSync('DELETE FROM outbox WHERE seq > ?', [lastSeq]);
  });
  return result;
}
