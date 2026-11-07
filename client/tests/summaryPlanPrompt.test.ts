import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { defaultRounding } from '../src/data/preferences';
import type { ISODate, Plan, PlannedExercise, SessionExercise, WorkoutSession } from '../src/data/types';
import { planPromptFor } from '../src/features/summary/planDiff';
import { buildAgenda } from '../src/features/today/agenda';
import { sessionFromPlan } from '../src/features/workout/buildSession';
import { completionOf } from '../src/features/workout/workoutReducer';
import { openTestDatabase } from './support/nodeSqlite';

// The summary's "Update your plan?" (spec 2.6) compares with the prescription the workout was built
// from (spec 2.5), so a plan edit made since is never shown as a change or undone by saving.

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
const nameOf = (id: string) => exercisesById.get(id)!.name;
const MONDAY = '2026-10-19';
const STAMP = `${MONDAY}T08:00:00.000Z`;
const prefs = { units: 'metric' as const, roundingIncrements: defaultRounding.metric };

const planned = (id: string, exerciseId: string, sets: number): PlannedExercise => ({
  id,
  exerciseId,
  sets: Array.from({ length: sets }, () => ({ kind: 'normal' as const, modifiers: [], targetReps: 5 })),
});

const upperA = (): Plan => ({
  id: 'p1',
  name: 'Upper Lower',
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['w1'] }] },
  workouts: [
    {
      id: 'w1',
      name: 'Upper A',
      blocks: [
        { id: 'b1', type: 'single', exercises: [planned('pe_bench', 'ex_bench_press', 3)] },
        { id: 'b2', type: 'single', exercises: [planned('pe_row', 'ex_barbell_row', 3)] },
      ],
    },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
});

let today: ISODate;
let repo: SqliteRepository;

beforeEach(async () => {
  const db = openTestDatabase();
  migrate(db);
  eraseAllData(db);
  today = MONDAY;
  repo = createSqliteRepository(db, { today: () => today });
  await repo.savePlan(upperA());
});

/** A later day: the repository reads its date again. */
const goTo = (day: ISODate) => {
  today = day;
  repo.forgetCache();
};

/** Starts the plan's workout scheduled on `day`, as Today does, and saves it in progress. */
async function start(day: ISODate): Promise<WorkoutSession> {
  const agenda = buildAgenda({
    occurrences: await repo.listOccurrences({ from: day, to: day }),
    sessions: await repo.listSessions(),
    plans: await repo.listPlans(),
    planVersions: await repo.listPlanVersions(),
    today,
  });
  const item = agenda.get(day)![0];
  const session = sessionFromPlan({ item, history: [], exercisesById, preferences: prefs, today });
  await repo.saveSession(session);
  return session;
}

/** Logs every set and finishes the workout, as Finish does. */
async function finish(session: WorkoutSession): Promise<WorkoutSession> {
  const now = `${today}T18:00:00.000Z`;
  const logged: WorkoutSession = {
    ...session,
    blocks: session.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, loadKg: 60, reps: 5, completedAt: now })) })) })),
  };
  const finished: WorkoutSession = { ...logged, status: 'completed', completion: completionOf(logged), completedAt: now, completedDate: today };
  await repo.saveSession(finished);
  return finished;
}

/** What the summary reads for the prompt. */
async function promptFor(session: WorkoutSession) {
  const day = session.scheduledDate ?? today;
  const input = { plans: await repo.listPlans(), planVersions: await repo.listPlanVersions(), occurrences: await repo.listOccurrences({ from: day, to: day }) };
  return planPromptFor(session, input, exercisesById);
}

/** The plan's Upper A edited: bench to 4 sets, and leg curls added. */
async function editUpperA() {
  const plan = (await repo.listPlans())[0];
  const [w] = plan.workouts;
  await repo.savePlan({
    ...plan,
    workouts: [{ ...w, blocks: [{ ...w.blocks[0], exercises: [planned('pe_bench', 'ex_bench_press', 4)] }, w.blocks[1], { id: 'b3', type: 'single', exercises: [planned('pe_curl', 'ex_lying_leg_curl', 3)] }] }],
  });
}

const blocksOf = (session: WorkoutSession, change: (entries: SessionExercise[]) => SessionExercise[]): WorkoutSession => {
  const entries = change(session.blocks.flatMap((b) => b.exercises));
  return { ...session, blocks: entries.map((e, i) => ({ id: `block${i}`, type: 'single', exercises: [e] })) };
};

describe('summary: update your plan?', () => {
  test('a missed workout done as it was scheduled, after the plan was edited, asks nothing', async () => {
    goTo('2026-10-21');
    await editUpperA();
    // Monday's missed Upper A still opens with the prescription it was scheduled with.
    const session = await start(MONDAY);
    assert.deepEqual(session.blocks.flatMap((b) => b.exercises.map((e) => `${e.exerciseId} ×${e.sets.length}`)), ['ex_bench_press ×3', 'ex_barbell_row ×3']);
    assert.equal(await promptFor(await finish(session)), undefined);
  });

  test('a plan edited while the workout was in progress asks nothing', async () => {
    const session = await start(MONDAY);
    await editUpperA();
    assert.equal((await repo.listPlans())[0].version, 2);
    assert.equal(await promptFor(await finish(session)), undefined);
  });

  test('changes made during the workout ask, with what changed', async () => {
    const session = await start(MONDAY);
    // Row swapped for Pendlay Row, and a fourth bench set added.
    const changed = blocksOf(session, ([bench, row]) => [{ ...bench, sets: [...bench.sets, { ...bench.sets[0], id: 'extra' }] }, { ...row, exerciseId: 'ex_pendlay_row' }]);
    const prompt = await promptFor(await finish(changed));
    assert.deepEqual(prompt?.changes, [`${nameOf('ex_bench_press')}: 3 → 4 sets`, `Swapped ${nameOf('ex_barbell_row')} for ${nameOf('ex_pendlay_row')}`]);
    assert.deepEqual(prompt?.blocks.flatMap((b) => b.exercises.map((e) => `${e.exerciseId} ×${e.sets.length}`)), ['ex_bench_press ×4', 'ex_pendlay_row ×3']);
    assert.deepEqual([prompt?.plan.id, prompt?.workout.id], ['p1', 'w1']);
  });

  test('a plan edit that only moved the days still asks', async () => {
    const session = await start(MONDAY);
    const plan = (await repo.listPlans())[0];
    await repo.savePlan({ ...plan, schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['w1'] }, { weekday: 4, workoutIds: ['w1'] }] } });
    const added = blocksOf(session, (entries) => [...entries, { id: 'curl', exerciseId: 'ex_lying_leg_curl', skipped: false, sets: [{ id: 'c1', kind: 'normal', modifiers: [] }] }]);
    const prompt = await promptFor(await finish(added));
    assert.deepEqual(prompt?.changes, [`Added ${nameOf('ex_lying_leg_curl')}`]);
    // It saves onto the plan as it is now.
    assert.equal(prompt?.plan.version, 2);
  });

  test('a repeat uses the plan version stamped on it; an older one without a stamp, the plan as it is', async () => {
    const session = await start(MONDAY);
    assert.equal(session.planVersion, 1, 'a new workout is stamped with the version it was built from');
    await editUpperA();
    const stamped: WorkoutSession = { ...(await finish(session)), id: 'repeat', occurrenceId: undefined, scheduledDate: undefined };
    assert.equal(await promptFor(stamped), undefined);
    const unstamped: WorkoutSession = { ...stamped, planVersion: undefined };
    assert.deepEqual((await promptFor(unstamped))?.changes, [`${nameOf('ex_bench_press')}: 4 → 3 sets`, `Removed ${nameOf('ex_lying_leg_curl')}`]);
  });
});
