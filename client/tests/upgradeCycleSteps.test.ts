// The one-time update of cycles stored one workout a day (`sequence`) to steps, each day's list of
// workouts (db/upgradeCycleSteps.ts). Old rows are written straight into the tables, as the old app
// left them: never through savePlan, which already runs the new engine.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays, daysBetween } from '../src/data/dates';
import { putRow, tombstone } from '../src/data/db/rows';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import type { SqlDb, SqlValue } from '../src/data/db/sql';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { upgradeCycleSteps, withCycleSteps } from '../src/data/db/upgradeCycleSteps';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import { workoutsOn } from '../src/data/schedule';
import type { ISODate, Plan, PlanSchedule } from '../src/data/types';
import { openTestDatabase } from './support/nodeSqlite';

const MONDAY = '2026-10-19';
const TODAY = '2026-10-26';
/** When the old app saved the rows. */
const OLD_AT = '2026-10-20T08:00:00.000Z';

/** A cycle in the shape stored before steps. */
type OldCycle = { type: 'rotating'; sequence: string[] };
/** A plan as stored then: anything but its schedule as today. */
type OldPlan = Omit<Plan, 'schedule'> & { schedule: OldCycle | PlanSchedule };

const SEQUENCE = ['a', 'rest', 'b', 'a', 'rest'];

const plan = (id: string, schedule: OldPlan['schedule'], extra: Partial<OldPlan> = {}): OldPlan => ({
  id,
  name: `Plan ${id}`,
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule,
  workouts: ['a', 'b'].map((w) => ({ id: w, name: `Workout ${w.toUpperCase()}`, blocks: [] })),
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: OLD_AT,
  ...extra,
});

/** The live cycle plan (version 2) and its first version, which had only three days. */
const cyc = plan('cyc', { type: 'rotating', sequence: SEQUENCE }, { version: 2 });
const cycV1 = plan('cyc', { type: 'rotating', sequence: ['a', 'rest', 'b'] }, { updatedAt: '2026-10-01T08:00:00.000Z' });
/** A cycle plan that was deleted: its row is a tombstone, but deletePlan kept its saved version. */
const gone = plan('gone', { type: 'rotating', sequence: ['b', 'rest'] });
/** Already in the new shape, and a weekly plan: neither needs anything. */
const fresh = plan('fresh', { type: 'rotating', steps: [{ workoutIds: ['a', 'b'] }, { workoutIds: [] }] });
const weekly = plan('weekly', { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }] });
/** Rows that can't be read: broken JSON, and JSON that isn't a plan. */
const BROKEN = '{"schedule":{"type":"rotating","sequence":["a"';
const NOT_A_PLAN = '["rotating"]';

/** What the old engine put on a date: the step's one workout, or nothing on 'rest'. */
function oldWorkoutsOn(sequence: string[], startDate: ISODate, date: ISODate): string[] {
  const offset = daysBetween(startDate, date);
  if (offset < 0 || !sequence.length) return [];
  const step = sequence[offset % sequence.length];
  return step === 'rest' ? [] : [step];
}

/** The occurrences the old app stored for the live cycle plan, from its start to 4 weeks after today. */
function oldOccurrences() {
  const list = [];
  for (let date = MONDAY; date <= addDays(TODAY, SCHEDULE_AHEAD_DAYS); date = addDays(date, 1)) {
    for (const w of oldWorkoutsOn(SEQUENCE, MONDAY, date)) {
      list.push({ id: `occ_cyc_${date}_${w}`, planId: 'cyc', planVersion: 2, planWorkoutId: w, scheduledDate: date });
    }
  }
  return list;
}

const putPlan = (db: SqlDb, p: OldPlan) => putRow(db, 'plans', p.id, p, { status: p.status }, OLD_AT);
const putVersion = (db: SqlDb, p: OldPlan) => putRow(db, 'plan_versions', `${p.id}@${p.version}`, p, { plan_id: p.id, version: p.version }, OLD_AT);
const rawInsert = (db: SqlDb, table: 'plans' | 'plan_versions', id: string, data: string) =>
  table === 'plans'
    ? db.runSync("INSERT INTO plans (id, status, data, updated_at) VALUES (?, 'archived', ?, ?)", [id, data, OLD_AT])
    : db.runSync('INSERT INTO plan_versions (id, plan_id, version, data, updated_at) VALUES (?, ?, 1, ?, ?)', [id, id.split('@')[0], data, OLD_AT]);

/** A database as the old app left it, with an empty outbox so only what opening it writes shows. */
function oldDatabase({ sample = false } = {}): SqlDb & { close(): void } {
  const db = openTestDatabase();
  migrate(db);
  eraseAllData(db);
  if (sample) db.runSync("UPDATE meta SET value = 'sample' WHERE key = 'contents'", []);
  putPlan(db, cyc);
  putVersion(db, cycV1);
  putVersion(db, cyc);
  putPlan(db, gone);
  putVersion(db, gone);
  tombstone(db, 'plans', 'gone', OLD_AT);
  // A deleted version of an old cycle: it must stay a tombstone.
  putVersion(db, plan('dropped', { type: 'rotating', sequence: ['a'] }));
  tombstone(db, 'plan_versions', 'dropped@1', OLD_AT);
  putPlan(db, fresh);
  putVersion(db, fresh);
  putPlan(db, weekly);
  putVersion(db, weekly);
  rawInsert(db, 'plans', 'broken', BROKEN);
  rawInsert(db, 'plan_versions', 'broken@1', BROKEN);
  rawInsert(db, 'plan_versions', 'odd@1', NOT_A_PLAN);
  for (const o of oldOccurrences()) putRow(db, 'occurrences', o.id, o, { plan_id: o.planId, scheduled_date: o.scheduledDate, session_id: null }, OLD_AT);
  db.runSync('DELETE FROM outbox', []);
  return db;
}

const open = (db: SqlDb) => createSqliteRepository(db, { today: () => TODAY });
type Row = { data: string; updated_at: string; deleted_at: string | null };
const row = (db: SqlDb, table: 'plans' | 'plan_versions', id: string) => db.getFirstSync<Row>(`SELECT data, updated_at, deleted_at FROM ${table} WHERE id = ?`, [id])!;
const stored = (db: SqlDb, table: 'plans' | 'plan_versions', id: string) => JSON.parse(row(db, table, id).data) as Plan;
const outbox = (db: SqlDb) => db.getAllSync<{ entity: string; entity_id: string; op: string }>('SELECT entity, entity_id, op FROM outbox ORDER BY seq', []).map((e) => ({ ...e }));
const planOutbox = (db: SqlDb) => outbox(db).filter((e) => e.entity === 'plan' || e.entity === 'plan_version');
const lastSeq = (db: SqlDb) => db.getFirstSync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM outbox', [])?.seq ?? 0;

const STEPS = [{ workoutIds: ['a'] }, { workoutIds: [] }, { workoutIds: ['b'] }, { workoutIds: ['a'] }, { workoutIds: [] }];

describe('upgrading cycles stored one workout a day', () => {
  test('opening the app converts every live plan and saved version, the versions of a deleted plan too', () => {
    const db = oldDatabase();
    open(db);
    assert.deepEqual(stored(db, 'plans', 'cyc').schedule, { type: 'rotating', steps: STEPS });
    assert.deepEqual(stored(db, 'plan_versions', 'cyc@2').schedule, { type: 'rotating', steps: STEPS });
    assert.deepEqual(stored(db, 'plan_versions', 'cyc@1').schedule, { type: 'rotating', steps: [{ workoutIds: ['a'] }, { workoutIds: [] }, { workoutIds: ['b'] }] });
    assert.deepEqual(stored(db, 'plan_versions', 'gone@1').schedule, { type: 'rotating', steps: [{ workoutIds: ['b'] }, { workoutIds: [] }] });
    // Written like any write, so a later sync carries it.
    assert.deepEqual(planOutbox(db), [
      { entity: 'plan', entity_id: 'cyc', op: 'upsert' },
      { entity: 'plan_version', entity_id: 'cyc@1', op: 'upsert' },
      { entity: 'plan_version', entity_id: 'cyc@2', op: 'upsert' },
      { entity: 'plan_version', entity_id: 'gone@1', op: 'upsert' },
    ]);
    assert.ok(row(db, 'plans', 'cyc').updated_at > OLD_AT, 'the row gets a new updated_at');
    db.close();
  });

  test('only the schedule changes: version and updatedAt stay, so occurrences and badges still find their version', () => {
    const db = oldDatabase();
    open(db);
    for (const [table, id, before] of [['plans', 'cyc', cyc], ['plan_versions', 'cyc@1', cycV1], ['plan_versions', 'cyc@2', cyc], ['plan_versions', 'gone@1', gone]] as const) {
      const after = stored(db, table, id);
      assert.deepEqual({ ...after, schedule: undefined }, { ...before, schedule: undefined }, id);
      assert.deepEqual(Object.keys(after), Object.keys(before), `${id} keeps its key order`);
    }
    db.close();
  });

  test('tombstones stay tombstones, untouched', () => {
    const db = oldDatabase();
    const before = { gone: row(db, 'plans', 'gone'), dropped: row(db, 'plan_versions', 'dropped@1') };
    open(db);
    assert.deepEqual(row(db, 'plans', 'gone'), before.gone);
    assert.deepEqual(row(db, 'plan_versions', 'dropped@1'), before.dropped);
    assert.ok(before.gone.deleted_at && before.dropped.deleted_at);
    db.close();
  });

  test("a row that can't be read is left as it is, and the app still opens", () => {
    const db = oldDatabase();
    const before = { plan: row(db, 'plans', 'broken'), version: row(db, 'plan_versions', 'broken@1'), odd: row(db, 'plan_versions', 'odd@1') };
    const repo = open(db);
    assert.ok(repo, 'the repository opens');
    assert.deepEqual({ plan: row(db, 'plans', 'broken'), version: row(db, 'plan_versions', 'broken@1'), odd: row(db, 'plan_versions', 'odd@1') }, before);
    db.close();
  });

  test('rows already in the new shape, and other plan types, are left alone', () => {
    const db = oldDatabase();
    const before = ['fresh', 'weekly'].flatMap((id) => [row(db, 'plans', id), row(db, 'plan_versions', `${id}@1`)]);
    open(db);
    assert.deepEqual(['fresh', 'weekly'].flatMap((id) => [row(db, 'plans', id), row(db, 'plan_versions', `${id}@1`)]), before);
    assert.ok(!planOutbox(db).some((e) => e.entity_id.startsWith('fresh') || e.entity_id.startsWith('weekly')));
    db.close();
  });

  test('every date runs the same workouts as before, over two cycles', () => {
    const db = oldDatabase();
    open(db);
    const upgraded = stored(db, 'plans', 'cyc');
    const legacy = cyc.schedule as unknown as PlanSchedule;
    for (let date = addDays(MONDAY, -1); date <= addDays(MONDAY, SEQUENCE.length * 2); date = addDays(date, 1)) {
      const before = oldWorkoutsOn(SEQUENCE, MONDAY, date);
      assert.deepEqual(workoutsOn(upgraded.schedule, MONDAY, date), before, date);
      // A row the upgrade never reached still schedules the same (cycleSteps reads the old shape).
      assert.deepEqual(workoutsOn(legacy, MONDAY, date), before, `${date}, not upgraded`);
    }
    db.close();
  });

  test('the stored calendar keeps its occurrence ids: nothing is added or removed', async () => {
    const db = oldDatabase();
    const repo = open(db);
    const old = oldOccurrences();
    const now = (await repo.listOccurrences({ from: MONDAY, to: addDays(TODAY, SCHEDULE_AHEAD_DAYS) })).filter((o) => o.planId === 'cyc');
    assert.deepEqual(now.map((o) => o.id).sort(), old.map((o) => o.id).sort());
    assert.ok(!outbox(db).some((e) => e.entity === 'occurrence' && e.entity_id.startsWith('occ_cyc_')), 'no occurrence of the cycle was rewritten');
    db.close();
  });

  test('opening again writes nothing', () => {
    const db = oldDatabase();
    open(db);
    const seq = lastSeq(db);
    const rows = db.getAllSync('SELECT id, data, updated_at, deleted_at FROM plans UNION ALL SELECT id, data, updated_at, deleted_at FROM plan_versions ORDER BY id', []);
    open(db);
    assert.equal(lastSeq(db), seq, 'nothing new in the outbox');
    // Once upgraded, a launch reads only rows still in the old shape: here the unreadable one in each table.
    const read: number[] = [];
    const counting: SqlDb = {
      ...db,
      getAllSync<T>(sql: string, params: SqlValue[]) {
        const found = db.getAllSync<T>(sql, params);
        read.push(found.length);
        return found;
      },
    };
    assert.deepEqual(upgradeCycleSteps(counting), { plans: 0, versions: 0 });
    assert.deepEqual(read, [1, 1], 'only the broken rows are read from plans and plan_versions');
    assert.deepEqual(db.getAllSync('SELECT id, data, updated_at, deleted_at FROM plans UNION ALL SELECT id, data, updated_at, deleted_at FROM plan_versions ORDER BY id', []), rows);
    db.close();
  });

  test('it counts what it rewrote, stamped with the time given', () => {
    const db = oldDatabase();
    const at = '2026-10-26T09:00:00.000Z';
    assert.deepEqual(upgradeCycleSteps(db, at), { plans: 1, versions: 3 });
    assert.equal(row(db, 'plan_versions', 'gone@1').updated_at, at);
    db.close();
  });

  test('sample data is converted but stays out of the outbox', () => {
    const db = oldDatabase({ sample: true });
    open(db);
    assert.deepEqual(stored(db, 'plans', 'cyc').schedule, { type: 'rotating', steps: STEPS });
    assert.deepEqual(planOutbox(db), []);
    db.close();
  });
});

describe('withCycleSteps', () => {
  test('converts an old-shaped cycle; anything else gives undefined', () => {
    assert.deepEqual(withCycleSteps(JSON.stringify(cyc))?.schedule, { type: 'rotating', steps: STEPS });
    // Rotating without a sequence: an empty cycle, which schedules nothing, as before.
    assert.deepEqual(withCycleSteps('{"schedule":{"type":"rotating"}}'), { schedule: { type: 'rotating', steps: [] } });
    for (const json of [BROKEN, NOT_A_PLAN, 'null', '"rotating"', '{}', '{"schedule":null}', JSON.stringify(fresh), JSON.stringify(weekly)]) {
      assert.equal(withCycleSteps(json), undefined, json);
    }
  });
});
