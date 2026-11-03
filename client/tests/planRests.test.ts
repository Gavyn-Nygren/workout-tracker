import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { starterTemplates } from '../src/data/content';
import { BLANK_PLAN_RESTS_META_KEY, blankAutoFilledPlanRests, LEGACY_SAMPLE_PLAN_RESTS_SEC, LEGACY_TEMPLATE_RESTS_SEC } from '../src/data/db/blankPlanRests';
import { holdsSampleData, seedOnFirstRun } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import type { SqlDb } from '../src/data/db/sql';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { fakePlans } from '../src/data/fake/plans';
import { trainingDays } from '../src/data/schedule';
import type { Exercise, Plan, PlannedBlock, PlannedExercise, PlanWorkout, SetPrescription, Weekday, WorkoutSession } from '../src/data/types';
import { autoRestHint, prescriptionSummary, spokenPrescription } from '../src/features/plans/describe';
import { addExercise, planFromTemplate, supersetWithNext, templateDayOptions, ungroup, withWarmupSet } from '../src/features/plans/planEdits';
import { restAfterSet } from '../src/features/workout/rest';
import { LEGACY_TEMPLATES } from './support/legacyTemplates';
import { openTestDatabase } from './support/nodeSqlite';

// G3.8, user's pick "Leave plan rest blank": new plan sets get no rest, so they use the exercise's
// remembered rest or the Settings default; rests the app filled into older plans are cleared once.

const MONDAY = '2026-10-19';
const STAMP = `${MONDAY}T08:00:00.000Z`;
const CLEANUP_AT = '2026-10-26T09:00:00.000Z';

// Prescriptions the way the app stores them: a blank rest has no restSec at all.
const normal = (restSec?: number): SetPrescription => ({ kind: 'normal', modifiers: [], targetReps: { min: 8, max: 12 }, targetRir: 2, ...(restSec === undefined ? {} : { restSec }) });
const warm = (restSec?: number): SetPrescription => ({ kind: 'warmup', modifiers: [], targetReps: 5, ...(restSec === undefined ? {} : { restSec }) });
const times = (n: number, set: SetPrescription): SetPrescription[] => Array.from({ length: n }, () => ({ ...set }));
const planned = (id: string, exerciseId: string, sets: SetPrescription[]): PlannedExercise => ({ id, exerciseId, sets });
const single = (id: string, p: PlannedExercise): PlannedBlock => ({ id, type: 'single', exercises: [p] });
const superset = (id: string, roundRestSec: number, exercises: PlannedExercise[]): PlannedBlock => ({ id, type: 'superset', roundRestSec, exercises });
const workout = (id: string, blocks: PlannedBlock[]): PlanWorkout => ({ id, name: `Workout ${id}`, blocks });
const plan = (id: string, workouts: PlanWorkout[], extra: Partial<Plan> = {}): Plan => ({
  id,
  name: `Plan ${id}`,
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule: { type: 'weekly', days: workouts.map((w, i) => ({ weekday: (i + 1) as Weekday, workoutIds: [w.id] })) },
  workouts,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const isGrouped = (b: PlannedBlock) => b.type === 'superset' || b.type === 'circuit';
const allSets = (workouts: PlanWorkout[]) => workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets)));
const hasRest = (s: SetPrescription) => Object.prototype.hasOwnProperty.call(s, 'restSec');
/** Each planned exercise's set rests, undefined where blank. */
const restsOf = (p: Plan) => Object.fromEntries(p.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises)).map((e) => [e.id, e.sets.map((s) => s.restSec)]));
const u = undefined;

/** Each block's own rests, in order: what a copy must keep. */
const blockRests = (w: PlanWorkout) => w.blocks.map((b) => [b.type, b.roundRestSec, b.transitionRestSec]);

describe('new plans leave rest blank', () => {
  const sources = [...starterTemplates, ...fakePlans];

  test('no starter template or sample plan sets a rest on any set', () => {
    assert.ok(starterTemplates.length > 0);
    for (const source of sources) {
      assert.ok(allSets(source.workouts).length > 0, `${source.id} has sets`);
      for (const set of allSets(source.workouts)) assert.equal(hasRest(set), false, `${source.id}: ${JSON.stringify(set)}`);
    }
  });

  test('every superset and circuit rests after each round', () => {
    const grouped = sources.flatMap((s) => s.workouts.flatMap((w) => w.blocks.filter(isGrouped).map((b) => ({ where: `${s.id} > ${w.name} > ${b.id}`, b }))));
    assert.ok(grouped.some(({ b }) => b.type === 'superset') && grouped.some(({ b }) => b.type === 'circuit'), 'there are supersets and circuits to check');
    for (const { where, b } of grouped) assert.ok((b.roundRestSec ?? 0) > 0, `${where} rests after each round`);
  });

  test('every day version of every template copies into a plan with no rests, keeping the block rests', () => {
    for (const template of starterTemplates) {
      for (const { daysPerWeek } of templateDayOptions(template)) {
        const where = `${template.id} (${daysPerWeek} days)`;
        const p = planFromTemplate(template, MONDAY, { daysPerWeek });
        assert.equal(trainingDays(p.schedule).count, daysPerWeek, `${where}: that version was copied`);
        assert.ok(allSets(p.workouts).length > 0, where);
        assert.ok(allSets(p.workouts).every((s) => !hasRest(s)), where);
        for (const w of p.workouts) {
          const source = template.workouts.find((tw) => tw.name === w.name);
          assert.ok(source, `${where}: ${w.name}`);
          assert.deepEqual(blockRests(w), blockRests(source), `${where}: ${w.name}`);
        }
      }
    }
  });

  test('Add exercise and Add warm-up leave rest blank', () => {
    const p = addExercise(plan('p', [workout('w', [])]), 'w', 'ex_lateral_raise');
    const added = p.workouts[0].blocks[0].exercises[0];
    assert.equal(added.sets.length, 3);
    const withWarmup = withWarmupSet(added);
    assert.equal(withWarmup.sets[0].kind, 'warmup');
    assert.ok(withWarmup.sets.every((s) => !hasRest(s)));
  });

  test("grouping leaves the sets' rests blank and keeps the round rest; ungrouping fills nothing in", () => {
    const p = plan('p', [workout('w', [single('b1', planned('a', 'ex_leg_press', [normal(120), normal()])), single('b2', planned('b', 'ex_leg_extension', [warm(45), normal()]))])]);
    const grouped = supersetWithNext(p, 'w', 0).workouts[0].blocks;
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].type, 'superset');
    assert.equal(grouped[0].roundRestSec, 90);
    assert.ok(allSets(supersetWithNext(p, 'w', 0).workouts).every((s) => !hasRest(s)), 'in a superset you rest after each round');

    // A superset saved before G3.8 (sets at 0), with a rest typed for one set since.
    const old = plan('o', [workout('w', [superset('ss', 75, [planned('a', 'ex_leg_press', [normal(0), normal(100)]), planned('b', 'ex_plank', [{ kind: 'timed_hold', modifiers: [], targetDurationSec: 30, restSec: 0 }])])])]);
    const singles = ungroup(old, 'w', 0);
    assert.deepEqual(singles.workouts[0].blocks.map((b) => b.type), ['single', 'single']);
    assert.deepEqual(restsOf(singles), { a: [u, 100], b: [u] }, 'no 1:15 or 1:30 filled in; the typed rest stays');
    assert.ok(allSets(singles.workouts).filter((s) => s.restSec === undefined).every((s) => !hasRest(s)));
  });

  test('summaries show a rest only when the plan sets one', () => {
    const blank = planned('a', 'ex_back_squat', [warm(), ...times(3, normal())]);
    assert.equal(prescriptionSummary(blank), '3 × 8–12 · 1 warm-up');
    assert.equal(spokenPrescription(blank), '3 sets of 8 to 12 reps, 1 warm-up');
    assert.equal(prescriptionSummary(planned('z', 'ex_back_squat', times(3, normal(0)))), '3 × 8–12', 'never "rest 0:00"');
    const typed = planned('t', 'ex_back_squat', times(3, normal(150)));
    assert.equal(prescriptionSummary(typed), '3 × 8–12 · rest 2:30');
    assert.equal(spokenPrescription(typed), '3 sets of 8 to 12 reps, rest 2 minutes 30 seconds');
  });
});

// ---------------------------------------------------------------------------
// The one-time cleanup of plans saved before G3.8

const LANDMINE: Exercise = {
  id: 'cx_landmine_press',
  name: 'Landmine Press',
  source: 'custom',
  category: 'compound',
  primaryMuscles: ['shoulders'],
  isBodyweight: false,
  createdAt: STAMP,
  updatedAt: STAMP,
};

/** Push / Pull / Legs' Push day as "Use template" copied it before G3.8. */
const oldPush = workout('push', [
  single('pb_bench', planned('pe_bench', 'ex_bench_press', [warm(60), warm(60), ...times(4, normal(150))])),
  single('pb_incline', planned('pe_incline', 'ex_incline_db_press', times(3, normal(120)))),
  single('pb_ohp', planned('pe_ohp', 'ex_overhead_press', times(3, normal(120)))),
  superset('pb_ss', 75, [planned('pe_lateral', 'ex_lateral_raise', times(3, normal(0))), planned('pe_pushdown', 'ex_triceps_pushdown', times(3, normal(0)))]),
]);

/** The same day after editing in the old app. */
const editedPush = workout('push', [
  // Typed 0:45 for the second warm-up and 2:45 for the first working set.
  single('pb_bench', planned('pe_bench', 'ex_bench_press', [warm(60), warm(45), normal(165), ...times(3, normal(150))])),
  // Typed 3:20 for every set.
  single('pb_incline', planned('pe_incline', 'ex_incline_db_press', times(3, normal(200)))),
  // Swapped to a custom exercise: the template's 2:00 came along.
  single('pb_ohp', planned('pe_ohp', LANDMINE.id, times(3, normal(120)))),
  // Ungrouped: the superset's 1:15 round rest went onto every set.
  single('pb_lateral', planned('pe_lateral', 'ex_lateral_raise', times(3, normal(75)))),
  single('pb_pushdown', planned('pe_pushdown', 'ex_triceps_pushdown', times(3, normal(75)))),
  // Added with Add exercise: the isolation default.
  single('pb_ext', planned('pe_ext', 'ex_leg_extension', times(3, normal(90)))),
]);

/** A plan built from scratch in the old editor, over three saves. */
const mine = (stage: 1 | 2 | 3): PlanWorkout => {
  const legPress = planned('pe_legpress', 'ex_leg_press', times(3, normal(stage === 1 ? 150 : stage === 2 ? 0 : 90)));
  const legExt = planned('pe_legext', 'ex_leg_extension', times(3, normal(stage === 1 ? 90 : stage === 2 ? 0 : 90)));
  return workout('day', [
    // Add exercise + Add warm-up.
    single('b_squat', planned('pe_squat', 'ex_back_squat', [warm(60), ...times(3, normal(150))])),
    single('b_curl', planned('pe_curl', 'ex_db_curl', times(3, normal(90)))),
    // Typed by the user: 2:00 on a compound, 2:30 on an isolation exercise, 1:30 on a compound that was never in a superset.
    single('b_row', planned('pe_row', 'ex_barbell_row', times(3, normal(120)))),
    single('b_raise', planned('pe_raise', 'ex_lateral_raise', times(3, normal(150)))),
    single('b_bench', planned('pe_bench2', 'ex_bench_press', times(3, normal(90)))),
    // Stage 1: added (2:30 compound, 1:30 isolation). Stage 2: grouped (0). Stage 3: ungrouped (1:30 each).
    ...(stage === 2 ? [superset('b_legs', 90, [legPress, legExt])] : [single('b_legpress', legPress), single('b_legext', legExt)]),
    // A superset with 0:45 typed for two sets and a warm-up added.
    superset('b_ss', 90, [planned('pe_pullup', 'ex_pull_up', [normal(45), normal(45), normal(0)]), planned('pe_dips', 'ex_dips', [warm(60), ...times(3, normal(0))])]),
  ]);
};

/** Only typed rests, none matching anything the app filled in. */
const typedOnly = workout('t', [single('b_t1', planned('pe_t_squat', 'ex_back_squat', times(3, normal(240)))), single('b_t2', planned('pe_t_curl', 'ex_db_curl', times(3, normal(75))))]);

/** A workout logged before G3.8: its sets' targets carry the old rests. */
const loggedSession: WorkoutSession = {
  id: 'sess_old',
  name: 'Push',
  planId: 'ppl',
  planWorkoutId: 'push',
  status: 'completed',
  completedDate: MONDAY,
  completedAt: STAMP,
  blocks: [{ id: 'sb', type: 'single', exercises: [{ id: 'se', exerciseId: 'ex_bench_press', plannedExerciseId: 'pe_bench', skipped: false, sets: [{ id: 'ls1', kind: 'normal', modifiers: [], target: normal(150), reps: 8, loadKg: 80, restSec: 148, completedAt: STAMP }] }] }],
  createdAt: STAMP,
  updatedAt: STAMP,
};

/**
 * A database as the old app left it: plans saved through the repository (so every version is
 * kept), a custom exercise, and a logged workout. Then the cleanup's mark is removed, as if it
 * were opened by the new app for the first time.
 */
async function oldDatabase(): Promise<SqlDb & { close(): void }> {
  const db = openTestDatabase();
  migrate(db);
  const repo = createSqliteRepository(db, { today: () => MONDAY });
  await repo.saveExercise(LANDMINE);
  await repo.savePlan(plan('ppl', [oldPush], { templateId: 'tpl_ppl' }));
  await repo.savePlan(plan('ppl', [editedPush], { templateId: 'tpl_ppl' }));
  for (const stage of [1, 2, 3] as const) await repo.savePlan(plan('mine', [mine(stage)]));
  await repo.savePlan(plan('typed', [typedOnly]));
  await repo.saveSession(loggedSession);
  db.runSync('DELETE FROM meta WHERE key = ?', [BLANK_PLAN_RESTS_META_KEY]);
  return db;
}

/** A sample plan or a plan made from a template, as the app stored it before G3.8: a rest on every set. */
const withOldRests = (p: Plan): Plan => {
  const legacy = (p.templateId ? LEGACY_TEMPLATE_RESTS_SEC[p.templateId] : undefined) ?? LEGACY_SAMPLE_PLAN_RESTS_SEC[p.id];
  return {
    ...p,
    workouts: p.workouts.map((w) => ({
      ...w,
      blocks: w.blocks.map((b) => ({
        ...b,
        exercises: b.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((s) => ({ ...s, restSec: isGrouped(b) || s.kind === 'timed_hold' ? 0 : s.kind === 'warmup' ? 60 : legacy[e.exerciseId] })),
        })),
      })),
    })),
  };
};

const openRepo = (db: SqlDb): SqliteRepository => createSqliteRepository(db, { today: () => MONDAY });
const versionOf = async (repo: SqliteRepository, planId: string, version: number) => (await repo.listPlanVersions()).find((v) => v.id === planId && v.version === version)!;
const planOutbox = (db: SqlDb, afterSeq = 0) =>
  db.getAllSync<{ entity: string; entity_id: string; op: string; at: string }>(
    "SELECT entity, entity_id, op, at FROM outbox WHERE seq > ? AND entity IN ('plan', 'plan_version') ORDER BY seq",
    [afterSeq],
  );
const lastSeq = (db: SqlDb) => db.getFirstSync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM outbox', [])?.seq ?? 0;

describe('clearing the rests old plans had filled in', () => {
  test('clears what the app filled in, in the plan and every saved version, and keeps what was typed', async () => {
    const db = await oldDatabase();
    // ppl: plan 16 + versions 18 and 16; mine: plan 18 + three versions of 18. See the comments above.
    assert.deepEqual(blankAutoFilledPlanRests(db, CLEANUP_AT), { plans: 2, versions: 5, sets: 122 });
    const repo = openRepo(db);

    const ppl = (await repo.getPlan('ppl'))!;
    assert.equal(ppl.version, 2, 'cleaned in place, not a new version');
    assert.deepEqual(restsOf(ppl), {
      pe_bench: [u, 45, 165, u, u, u],
      pe_incline: [200, 200, 200],
      pe_ohp: [u, u, u],
      pe_lateral: [u, u, u],
      pe_pushdown: [u, u, u],
      pe_ext: [u, u, u],
    });
    assert.deepEqual(await versionOf(repo, 'ppl', 2), ppl, "the plan's current version matches it");
    const pplFirst = await versionOf(repo, 'ppl', 1);
    assert.ok(allSets(pplFirst.workouts).every((s) => !hasRest(s)), 'the version straight from the template had nothing typed');
    assert.equal(pplFirst.workouts[0].blocks[3].roundRestSec, 75, 'the superset keeps its round rest');

    const expectedMine = {
      pe_squat: [u, u, u, u],
      pe_curl: [u, u, u],
      pe_row: [120, 120, 120],
      pe_raise: [150, 150, 150],
      pe_bench2: [90, 90, 90],
      pe_legpress: [u, u, u],
      pe_legext: [u, u, u],
      pe_pullup: [45, 45, u],
      pe_dips: [u, u, u, u],
    };
    const minePlan = (await repo.getPlan('mine'))!;
    assert.deepEqual(restsOf(minePlan), expectedMine);
    for (const version of [1, 2, 3]) assert.deepEqual(restsOf(await versionOf(repo, 'mine', version)), expectedMine, `version ${version}`);
    assert.equal(minePlan.workouts[0].blocks.find((b) => b.id === 'b_ss')?.roundRestSec, 90);

    assert.deepEqual(restsOf((await repo.getPlan('typed'))!), { pe_t_squat: [240, 240, 240], pe_t_curl: [75, 75, 75] });
    // Nothing is left as 0 or as a key with no value.
    for (const { data } of db.getAllSync<{ data: string }>('SELECT data FROM plans UNION ALL SELECT data FROM plan_versions', [])) assert.doesNotMatch(data, /"restSec":0[,}]/);
  });

  test('rewritten rows sync like any other write; untouched rows stay as they were', async () => {
    const db = await oldDatabase();
    const before = new Map(db.getAllSync<{ id: string; updated_at: string }>('SELECT id, updated_at FROM plans UNION ALL SELECT id, updated_at FROM plan_versions', []).map((r) => [r.id, r.updated_at]));
    const seq = lastSeq(db);
    blankAutoFilledPlanRests(db, CLEANUP_AT);

    const changed = ['ppl', 'mine', 'ppl@1', 'ppl@2', 'mine@1', 'mine@2', 'mine@3'];
    const after = db.getAllSync<{ id: string; updated_at: string; data: string }>('SELECT id, updated_at, data FROM plans UNION ALL SELECT id, updated_at, data FROM plan_versions', []);
    for (const row of after) {
      if (changed.includes(row.id)) {
        assert.equal(row.updated_at, CLEANUP_AT, row.id);
        assert.equal((JSON.parse(row.data) as Plan).updatedAt, CLEANUP_AT, row.id);
      } else {
        assert.equal(row.updated_at, before.get(row.id), `${row.id} is untouched`);
      }
    }
    assert.deepEqual(
      planOutbox(db, seq).map((o) => `${o.op} ${o.entity} ${o.entity_id} ${o.at}`).sort(),
      [
        ...['ppl', 'mine'].map((id) => `upsert plan ${id} ${CLEANUP_AT}`),
        ...['ppl@1', 'ppl@2', 'mine@1', 'mine@2', 'mine@3'].map((id) => `upsert plan_version ${id} ${CLEANUP_AT}`),
      ].sort(),
    );
  });

  test('logged workouts are never touched', async () => {
    const db = await oldDatabase();
    const sessionRows = () => db.getAllSync<{ data: string; updated_at: string }>('SELECT data, updated_at FROM sessions UNION ALL SELECT data, updated_at FROM logged_sets', []);
    const before = sessionRows();
    blankAutoFilledPlanRests(db, CLEANUP_AT);
    assert.deepEqual(sessionRows(), before);
    const set = (await openRepo(db).getSession('sess_old'))!.blocks[0].exercises[0].sets[0];
    assert.equal(set.target?.restSec, 150);
    assert.equal(set.restSec, 148);
  });

  test('runs once, at repository creation: a rest typed afterwards survives the next launch', async () => {
    const db = await oldDatabase();
    const repo = openRepo(db);
    assert.ok(db.getFirstSync('SELECT value FROM meta WHERE key = ?', [BLANK_PLAN_RESTS_META_KEY]));
    const cleaned = (await repo.getPlan('mine'))!;
    assert.deepEqual(restsOf(cleaned).pe_squat, [u, u, u, u]);

    // Now the user types 2:30 (the old compound default) for the squat's working sets.
    const typed: Plan = {
      ...cleaned,
      workouts: cleaned.workouts.map((w) => ({
        ...w,
        blocks: w.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => (e.id === 'pe_squat' ? { ...e, sets: e.sets.map((s) => (s.kind === 'warmup' ? s : { ...s, restSec: 150 })) } : e)) })),
      })),
    };
    await repo.savePlan(typed);
    const relaunched = openRepo(db);
    assert.deepEqual(restsOf((await relaunched.getPlan('mine'))!).pe_squat, [u, 150, 150, 150]);
    assert.equal(blankAutoFilledPlanRests(db), null);
  });

  test("a workout built from a cleaned version rests like the exercise: its remembered rest, else the Settings default", async () => {
    const db = await oldDatabase();
    const repo = openRepo(db);
    const target = (await versionOf(repo, 'ppl', 1)).workouts[0].blocks[0].exercises[0].sets[2];
    assert.equal(target.kind, 'normal');
    const session: WorkoutSession = {
      id: 's',
      name: 'Push',
      status: 'in_progress',
      blocks: [{ id: 'b', type: 'single', exercises: [{ id: 'e', exerciseId: 'ex_bench_press', skipped: false, sets: [{ id: 'x', kind: 'normal', modifiers: [], target }] }] }],
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    const lookup = new Map([['ex_bench_press', { name: 'Bench Press', category: 'compound' as const }]]);
    const defaults = { compound: 180, isolation: 90, warmup: 60 };
    assert.deepEqual(restAfterSet(session, { entryId: 'e', setId: 'x' }, lookup, { defaults, remembered: {} }), { durationSec: 180, source: 'default', learnable: true });
    assert.deepEqual(restAfterSet(session, { entryId: 'e', setId: 'x' }, lookup, { defaults, remembered: { ex_bench_press: 135 } }), { durationSec: 135, source: 'remembered', learnable: true });
  });

  test('an empty database is marked done with nothing written', () => {
    const db = openTestDatabase();
    migrate(db);
    openRepo(db);
    assert.ok(db.getFirstSync('SELECT value FROM meta WHERE key = ?', [BLANK_PLAN_RESTS_META_KEY]));
    assert.equal(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', [])!.n, 0);
    assert.equal(blankAutoFilledPlanRests(db), null);
  });

  test('a database started after this change (new sample data) has nothing to clear', () => {
    const db = openTestDatabase();
    migrate(db);
    seedOnFirstRun(db, MONDAY);
    const rows = () => db.getAllSync<{ id: string; data: string; updated_at: string }>('SELECT id, data, updated_at FROM plans UNION ALL SELECT id, data, updated_at FROM plan_versions', []);
    const before = rows();
    assert.deepEqual(blankAutoFilledPlanRests(db, CLEANUP_AT), { plans: 0, versions: 0, sets: 0 });
    assert.deepEqual(rows(), before);
    assert.equal(planOutbox(db).length, 0);
  });

  test("old sample data loses its filled-in rests, and nothing is queued to sync", async () => {
    const old = fakePlans.map(withOldRests);
    assert.ok(allSets(old.flatMap((p) => p.workouts)).every((s) => typeof s.restSec === 'number'));
    // Spot checks against the old sample data: Bench Press 3:00 and Deadlift 3:30 in Upper / Lower, calf raises 1:00.
    assert.deepEqual(restsOf(old[0]).pe_ua_bench, [60, 60, 180, 180, 180]);
    assert.deepEqual(restsOf(old[0]).pe_lb_deadlift, [60, 60, 210, 210, 210]);
    assert.deepEqual(restsOf(old[1]).pe_cc_standing, [60, 60, 60, 60]);

    const db = openTestDatabase();
    migrate(db);
    seedOnFirstRun(db, MONDAY);
    for (const p of old) {
      db.runSync('UPDATE plans SET data = ? WHERE id = ?', [JSON.stringify(p), p.id]);
      db.runSync('UPDATE plan_versions SET data = ? WHERE plan_id = ?', [JSON.stringify(p), p.id]);
    }
    const repo = openRepo(db);
    const withoutStamp = ({ updatedAt: _, ...p }: Plan) => p;
    assert.deepEqual((await repo.listPlans()).map(withoutStamp).sort((a, b) => a.id.localeCompare(b.id)), fakePlans.map(withoutStamp).sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual((await repo.listPlanVersions()).map(withoutStamp).sort((a, b) => a.id.localeCompare(b.id)), fakePlans.map(withoutStamp).sort((a, b) => a.id.localeCompare(b.id)));
    assert.equal(planOutbox(db).length, 0);
    assert.ok(holdsSampleData(db));
  });
});

// ---------------------------------------------------------------------------
// The cleanup goes by where each planned exercise came from (G3.8 review)

const plannedIn = (p: Plan) => p.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises));
const peFor = (p: Plan, exerciseId: string) => plannedIn(p).find((e) => e.exerciseId === exerciseId)!;
const workoutWith = (p: Plan, exerciseId: string) => p.workouts.find((w) => w.blocks.some((b) => b.exercises.some((e) => e.exerciseId === exerciseId)))!;
/** The plan with one planned exercise changed. */
const editPlanned = (p: Plan, peId: string, fn: (e: PlannedExercise) => PlannedExercise): Plan => ({
  ...p,
  workouts: p.workouts.map((w) => ({ ...w, blocks: w.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => (e.id === peId ? fn(e) : e)) })) })),
});
/** Typing a rest for every working set. */
const typeRest =
  (restSec: number) =>
  (e: PlannedExercise): PlannedExercise => ({ ...e, sets: e.sets.map((s) => (s.kind === 'warmup' ? s : { ...s, restSec })) });
/** The set-type sheet: changes one set's type and nothing else. */
const setKind =
  (index: number, kind: SetPrescription['kind']) =>
  (e: PlannedExercise): PlannedExercise => ({ ...e, sets: e.sets.map((s, i) => (i === index ? { ...s, kind } : s)) });
/** The old "Add exercise": three sets at its type's default rest. */
const oldAdd = (p: Plan, workoutId: string, peId: string, exerciseId: string, restSec: number): Plan => ({
  ...p,
  workouts: p.workouts.map((w) => (w.id === workoutId ? { ...w, blocks: [...w.blocks, single(`b_${peId}`, planned(peId, exerciseId, times(3, normal(restSec))))] } : w)),
});
/** The old "Ungroup": each set without a rest got the round rest, or 1:30 when there was none. */
const oldUngroup = (p: Plan, workoutId: string, blockId: string): Plan => ({
  ...p,
  workouts: p.workouts.map((w) =>
    w.id !== workoutId
      ? w
      : {
          ...w,
          blocks: w.blocks.flatMap((b) =>
            b.id !== blockId ? [b] : b.exercises.map((e) => single(`b_${e.id}`, { ...e, sets: e.sets.map((s) => ({ ...s, restSec: s.restSec || b.roundRestSec || 90 })) })),
          ),
        },
  ),
});
/** "Use template" before G3.8, on one of the stand-in templates of the time (tests/support/legacyTemplates.ts). */
const oldFromTemplate = (templateId: string) => withOldRests(planFromTemplate(LEGACY_TEMPLATES.find((t) => t.id === templateId)!, MONDAY));

/** Saves each stage through the repository as the old app did, then opens the database as the new app first does. */
async function cleanedAfter(stages: Plan[]): Promise<SqliteRepository> {
  const db = openTestDatabase();
  migrate(db);
  const old = openRepo(db);
  for (const stage of stages) await old.savePlan(stage);
  db.runSync('DELETE FROM meta WHERE key = ?', [BLANK_PLAN_RESTS_META_KEY]);
  return openRepo(db);
}

describe('the cleanup goes by where each planned exercise came from', () => {
  test("the frozen stand-in templates use exactly the exercises the cleanup's rest map lists for them", () => {
    assert.deepEqual(LEGACY_TEMPLATES.map((t) => t.id).sort(), ['tpl_calisthenics', 'tpl_ppl']);
    for (const template of LEGACY_TEMPLATES) {
      const used = new Set(template.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))));
      const listed = LEGACY_TEMPLATE_RESTS_SEC[template.id];
      assert.ok(listed, template.id);
      assert.deepEqual([...used].sort(), Object.keys(listed).sort(), template.id);
    }
  });

  test('a rest typed into a starter-template plan stays, even at the old 2:30 or 1:30', async () => {
    const v1 = oldFromTemplate('tpl_ppl');
    const squat = peFor(v1, 'ex_back_squat');
    const calves = peFor(v1, 'ex_standing_calf_raise');
    const bench = peFor(v1, 'ex_bench_press');
    assert.deepEqual(squat.sets.map((s) => s.restSec), [60, 60, 180, 180, 180, 180], 'as "Use template" saved it');
    assert.deepEqual(calves.sets.map((s) => s.restSec), [60, 60, 60, 60]);
    // The user typed 2:30 for the squat (the old compound default) and 1:30 for the calf raise (the old isolation default).
    const v2 = editPlanned(editPlanned(v1, squat.id, typeRest(150)), calves.id, typeRest(90));

    const repo = await cleanedAfter([v1, v2]);
    const live = restsOf((await repo.getPlan(v1.id))!);
    assert.deepEqual(live[squat.id], [u, u, 150, 150, 150, 150]);
    assert.deepEqual(live[calves.id], [90, 90, 90, 90]);
    assert.deepEqual(live[bench.id], [u, u, u, u, u, u], "the template's own 2:30 for bench press is still cleared");
    assert.deepEqual(restsOf(await versionOf(repo, v1.id, 2)), live);
    assert.ok(allSets((await versionOf(repo, v1.id, 1)).workouts).every((s) => !hasRest(s)));
  });

  test("an exercise added later keeps a typed rest that the template gave only the exercise it was swapped to", async () => {
    const v1 = oldFromTemplate('tpl_ppl');
    const legs = workoutWith(v1, 'ex_back_squat').id;
    // Added with the old defaults: Front Squat 2:30, Leg Extension 1:30.
    const v2 = oldAdd(oldAdd(v1, legs, 'pe_added', 'ex_front_squat', 150), legs, 'pe_left', 'ex_leg_extension', 90);
    // Swapped to Leg Press (which the template rests 2:00), then 2:00 typed.
    const v3 = editPlanned(v2, 'pe_added', (e) => ({ ...e, exerciseId: 'ex_leg_press' }));
    const v4 = editPlanned(v3, 'pe_added', typeRest(120));

    const repo = await cleanedAfter([v1, v2, v3, v4]);
    const live = restsOf((await repo.getPlan(v1.id))!);
    assert.deepEqual(live.pe_added, [120, 120, 120]);
    assert.deepEqual(live.pe_left, [u, u, u]);
    assert.deepEqual(live[peFor(v1, 'ex_leg_press').id], [u, u, u], "the template's own Leg Press is still cleared");
    assert.deepEqual(restsOf(await versionOf(repo, v1.id, 3)).pe_added, [u, u, u], 'before it was typed, the 2:30 was filled in');
  });

  test("after ungrouping, a typed 1:30 stays unless the superset had no round rest", async () => {
    // Bodyweight Basics' circuit rests 2:00 a round; ungrouping put 2:00 on every set.
    const v1 = oldFromTemplate('tpl_calisthenics');
    const day = workoutWith(v1, 'ex_push_up');
    const circuit = day.blocks.find((b) => b.type === 'circuit')!;
    const v2 = oldUngroup(v1, day.id, circuit.id);
    const pushUps = peFor(v2, 'ex_push_up');
    assert.deepEqual(pushUps.sets.map((s) => s.restSec), [120, 120, 120]);
    const v3 = editPlanned(v2, pushUps.id, typeRest(90));

    // A superset the workout summary saved without a round rest (its sets had no rest), then ungrouped: 1:30 each.
    const empty = plan('scratch', [workout('w', [])]);
    const fromSummary = plan('scratch', [workout('w', [{ id: 'ss', type: 'superset', exercises: [planned('pe_a', 'ex_bench_press', times(3, normal())), planned('pe_b', 'ex_barbell_row', times(3, normal()))] }])]);
    const ungrouped = oldUngroup(fromSummary, 'w', 'ss');
    assert.deepEqual(restsOf(ungrouped), { pe_a: [90, 90, 90], pe_b: [90, 90, 90] });

    const repo = await cleanedAfter([v1, v2, v3, empty, fromSummary, ungrouped]);
    const bodyweight = restsOf((await repo.getPlan(v1.id))!);
    assert.deepEqual(bodyweight[pushUps.id], [90, 90, 90]);
    assert.deepEqual(bodyweight[peFor(v1, 'ex_reverse_lunge').id], [u, u, u]);
    assert.deepEqual(restsOf((await repo.getPlan('scratch'))!), { pe_a: [u, u, u], pe_b: [u, u, u] });
  });

  test('a filled-in rest is cleared after the set-type sheet changed only its type', async () => {
    const empty = plan('mine', [workout('day', [])]);
    const v2 = oldAdd(oldAdd(oldAdd(oldAdd(empty, 'day', 'pe_squat', 'ex_back_squat', 150), 'day', 'pe_curl', 'ex_db_curl', 90), 'day', 'pe_row', 'ex_barbell_row', 150), 'day', 'pe_bench', 'ex_bench_press', 150);
    const v3 = [
      // Set 1 turned into a warm-up: it kept 2:30.
      (p: Plan) => editPlanned(p, 'pe_squat', setKind(0, 'warmup')),
      // Add warm-up (1:00).
      (p: Plan) => editPlanned(p, 'pe_curl', (e) => ({ ...e, sets: [warm(60), ...e.sets] })),
      // 1:00 typed for every set.
      (p: Plan) => editPlanned(p, 'pe_row', typeRest(60)),
      (p: Plan) => editPlanned(p, 'pe_bench', (e) => ({ ...e, sets: [warm(60), ...e.sets] })),
    ].reduce((p, change) => change(p), v2);
    const v4 = [
      // The warm-up turned into a working set: it kept 1:00.
      (p: Plan) => editPlanned(p, 'pe_curl', setKind(0, 'normal')),
      // The warm-up deleted, and 1:00 typed for the set that moved into its place.
      (p: Plan) => editPlanned(p, 'pe_bench', (e) => ({ ...e, sets: e.sets.slice(1).map((s, i) => (i === 0 ? { ...s, restSec: 60 } : s)) })),
    ].reduce((p, change) => change(p), v3);
    assert.deepEqual(restsOf(v4), { pe_squat: [150, 150, 150], pe_curl: [60, 90, 90, 90], pe_row: [60, 60, 60], pe_bench: [60, 150, 150] });
    assert.deepEqual(plannedIn(v4).map((e) => e.sets[0].kind), ['warmup', 'normal', 'normal', 'normal']);

    const repo = await cleanedAfter([empty, v2, v3, v4]);
    const expected = { pe_squat: [u, u, u], pe_curl: [u, u, u, u], pe_row: [60, 60, 60], pe_bench: [60, u, u] };
    assert.deepEqual(restsOf((await repo.getPlan('mine'))!), expected);
    assert.deepEqual(restsOf(await versionOf(repo, 'mine', 4)), expected);
    assert.deepEqual(restsOf(await versionOf(repo, 'mine', 3)), { pe_squat: [u, u, u], pe_curl: [u, u, u, u], pe_row: [60, 60, 60], pe_bench: [u, u, u, u] });
  });

  test('a plan edited before saved versions were kept falls back to guessing from the exercise', async () => {
    // Saved versions start at 3: the plan was made from Push / Pull / Legs and edited twice before G3.3.
    const v3: Plan = { ...oldFromTemplate('tpl_ppl'), version: 3 };
    const squat = peFor(v3, 'ex_back_squat');
    const calves = peFor(v3, 'ex_standing_calf_raise');
    const typed = editPlanned(editPlanned(v3, squat.id, typeRest(200)), calves.id, typeRest(90));
    // Added since: Front Squat at 2:30, swapped to Leg Press, then 2:00 typed.
    const legs = workoutWith(v3, 'ex_back_squat').id;
    const v4 = oldAdd(typed, legs, 'pe_added', 'ex_front_squat', 150);
    const v5 = editPlanned(editPlanned(v4, 'pe_added', (e) => ({ ...e, exerciseId: 'ex_leg_press' })), 'pe_added', typeRest(120));

    const repo = await cleanedAfter([typed, v4, v5]);
    assert.deepEqual((await repo.listPlanVersions()).map((v) => v.version), [3, 4, 5]);
    const live = restsOf((await repo.getPlan(v3.id))!);
    assert.deepEqual(live[squat.id], [u, u, 200, 200, 200, 200]);
    // Older than the saved versions, a typed 1:30 can't be told from the old isolation default.
    assert.deepEqual(live[calves.id], [u, u, u, u]);
    assert.deepEqual(live[peFor(v3, 'ex_bench_press').id], [u, u, u, u, u, u]);
    assert.deepEqual(live[peFor(v3, 'ex_leg_press').id], [u, u, u]);
    // Added after the first saved version, so its history is known.
    assert.deepEqual(live.pe_added, [120, 120, 120]);
  });
});

describe("the plan editor's note on Auto rest", () => {
  const working = times(3, normal());
  const withWarmups = [warm(), ...working];
  const pair = { type: 'superset' as const, roundRestSec: 90 };

  test('straight sets: the remembered rest or the default, and warm-ups their own default', () => {
    assert.equal(autoRestHint(working, undefined), 'Leave rest on Auto to use the rest remembered for this exercise, or your default in Profile → Workout defaults.');
    assert.equal(
      autoRestHint(withWarmups, undefined),
      'Working sets left on Auto use the rest remembered for this exercise, or your default in Profile → Workout defaults. Warm-ups left on Auto use your warm-up default.',
    );
  });

  test('supersets rest after each round', () => {
    assert.equal(autoRestHint(working, pair), 'In this superset, you rest 1:30 after each round.');
    assert.equal(autoRestHint(withWarmups, { type: 'circuit', roundRestSec: 120 }), 'In this circuit, you rest 2:00 after each round. Warm-ups left on Auto use your warm-up default in Profile → Workout defaults.');
  });

  test('VoiceOver hears the screen named in words, never an arrow or "greater than"', () => {
    for (const sets of [working, withWarmups]) {
      for (const group of [undefined, pair]) {
        const spoken = autoRestHint(sets, group, true);
        assert.doesNotMatch(spoken, /[>→]|Settings/);
        if (autoRestHint(sets, group).includes('Profile')) assert.match(spoken, /in Profile, Workout defaults\./);
      }
    }
    assert.equal(autoRestHint(working, pair, true), 'In this superset, you rest 1 minute 30 seconds after each round.');
  });
});
