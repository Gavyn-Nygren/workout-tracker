import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { starterTemplates } from '../src/data/content';
import { addDays, isoWeekday } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import { scheduleOccurrences } from '../src/data/schedule';
import type { Plan, PlanSchedule, PlanWorkout, WorkoutSession } from '../src/data/types';
import { planFromTemplate } from '../src/features/plans/planEdits';
import { buildAgenda } from '../src/features/today/agenda';
import { openTestDatabase } from './support/nodeSqlite';

const MONDAY = '2026-10-19';
const STAMP = `${MONDAY}T08:00:00.000Z`;

const workout = (id: string, reps = 5): PlanWorkout => ({
  id,
  name: `Workout ${id}`,
  blocks: [{ id: `b_${id}`, type: 'single', exercises: [{ id: `pe_${id}`, exerciseId: 'ex_back_squat', sets: [{ kind: 'normal', modifiers: [], targetReps: reps }] }] }],
});

const plan = (id: string, schedule: PlanSchedule, workouts: PlanWorkout[], extra: Partial<Plan> = {}): Plan => ({
  id,
  name: `Plan ${id}`,
  version: 1,
  status: 'active',
  startDate: MONDAY,
  schedule,
  workouts,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const every = (ids: string[]) => ({ type: 'weekly' as const, days: ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({ weekday, workoutIds: ids })) });

describe('scheduling the three plan types', () => {
  test('weekly plans repeat on their weekdays', () => {
    const p = plan('w', { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }, { weekday: 3, workoutIds: ['b'] }, { weekday: 5, workoutIds: ['a'] }] }, [workout('a'), workout('b')]);
    const occ = scheduleOccurrences(p, MONDAY, addDays(MONDAY, 13));
    assert.deepEqual(occ.map((o) => [isoWeekday(o.scheduledDate), o.planWorkoutId]), [[1, 'a'], [3, 'b'], [5, 'a'], [1, 'a'], [3, 'b'], [5, 'a']]);
  });

  test('fixed-length programs follow their week-by-week layout and then end', () => {
    const p = plan('f', { type: 'fixed', weeks: 2, days: [{ week: 1, weekday: 1, workoutIds: ['heavy'] }, { week: 2, weekday: 1, workoutIds: ['light'] }] }, [workout('heavy'), workout('light')]);
    const occ = scheduleOccurrences(p, MONDAY, addDays(MONDAY, 27));
    assert.deepEqual(occ.map((o) => [o.scheduledDate, o.planWorkoutId]), [[MONDAY, 'heavy'], [addDays(MONDAY, 7), 'light']]);
  });

  test('rotating cycles repeat by day, whatever the weekday', () => {
    const p = plan('r', { type: 'rotating', sequence: ['a', 'b', 'rest'] }, [workout('a'), workout('b')], { startDate: addDays(MONDAY, 2) });
    const occ = scheduleOccurrences(p, MONDAY, addDays(MONDAY, 8));
    // Nothing before the start date; then A, B, rest, A, B, rest, A.
    assert.deepEqual(occ.map((o) => [o.scheduledDate, o.planWorkoutId]), [
      [addDays(MONDAY, 2), 'a'],
      [addDays(MONDAY, 3), 'b'],
      [addDays(MONDAY, 5), 'a'],
      [addDays(MONDAY, 6), 'b'],
      [addDays(MONDAY, 8), 'a'],
    ]);
  });

  test('paused and archived plans schedule nothing', () => {
    for (const status of ['paused', 'archived'] as const) {
      assert.equal(scheduleOccurrences(plan('p', every(['a']), [workout('a')], { status }), MONDAY, addDays(MONDAY, 6)).length, 0);
    }
  });
});

describe('plans on the calendar', () => {
  let db: ReturnType<typeof openTestDatabase>;
  let today: string;
  let repo: SqliteRepository;

  beforeEach(() => {
    db = openTestDatabase();
    migrate(db);
    eraseAllData(db);
    today = MONDAY;
    repo = createSqliteRepository(db, { today: () => today });
  });

  const occurrencesOn = async (date: string) => repo.listOccurrences({ from: date, to: date });
  const agendaOn = async (date: string) => {
    const [occurrences, sessions, plans, planVersions] = await Promise.all([
      repo.listOccurrences({ from: addDays(today, -14), to: addDays(today, SCHEDULE_AHEAD_DAYS) }),
      repo.listSessions(),
      repo.listPlans(),
      repo.listPlanVersions(),
    ]);
    return buildAgenda({ occurrences, sessions, plans, planVersions, today }).get(date) ?? [];
  };

  test('several active plans merge onto the same day', async () => {
    await repo.savePlan(plan('lift', every(['squat']), [workout('squat')]));
    await repo.savePlan(plan('cond', { type: 'rotating', sequence: ['run'] }, [workout('run')]));
    const day = addDays(MONDAY, 3);
    assert.deepEqual((await occurrencesOn(day)).map((o) => o.planId).sort(), ['cond', 'lift']);
    assert.equal((await agendaOn(day)).length, 2);
  });

  test('editing a plan leaves missed workouts as they were scheduled, and changes the future', async () => {
    await repo.savePlan(plan('p', every(['a']), [workout('a', 5)]));
    // Three days pass without training: those workouts are now missed.
    today = addDays(MONDAY, 3);
    const p = (await repo.getPlan('p'))!;
    await repo.updatePlanWorkout('p', 'a', workout('a', 8).blocks);

    const missed = (await agendaOn(addDays(MONDAY, 1)))[0];
    assert.equal(missed.status, 'missed');
    assert.equal(missed.occurrence?.planVersion, p.version);
    assert.equal(missed.workout?.blocks[0].exercises[0].sets[0].targetReps, 5, 'the missed workout keeps its original prescription');

    const upcoming = (await agendaOn(addDays(today, 1)))[0];
    assert.equal(upcoming.occurrence?.planVersion, p.version + 1);
    assert.equal(upcoming.workout?.blocks[0].exercises[0].sets[0].targetReps, 8, 'future workouts use the edit');

    assert.deepEqual((await repo.listPlanVersions()).map((v) => v.version), [p.version, p.version + 1]);
  });

  test('a workout in progress keeps its own copy of the prescription', async () => {
    await repo.savePlan(plan('p', every(['a']), [workout('a', 5)]));
    const occ = (await occurrencesOn(MONDAY))[0];
    const session: WorkoutSession = {
      id: 's1',
      name: 'Workout a',
      occurrenceId: occ.id,
      planId: 'p',
      planWorkoutId: 'a',
      status: 'in_progress',
      scheduledDate: MONDAY,
      startedAt: STAMP,
      blocks: [{ id: 'sb', type: 'single', exercises: [{ id: 'se', exerciseId: 'ex_back_squat', skipped: false, sets: [{ id: 'set1', kind: 'normal', modifiers: [], target: { kind: 'normal', modifiers: [], targetReps: 5 } }] }] }],
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    await repo.saveSession(session);
    await repo.updatePlanWorkout('p', 'a', workout('a', 8).blocks);
    const kept = (await occurrencesOn(MONDAY))[0];
    assert.equal(kept.sessionId, 's1', 'the started workout stays linked');
    assert.equal((await repo.getSession('s1'))!.blocks[0].exercises[0].sets[0].target?.targetReps, 5);
  });

  test('pausing clears upcoming workouts; resuming brings them back from today', async () => {
    await repo.savePlan(plan('p', every(['a']), [workout('a')]));
    const p = (await repo.getPlan('p'))!;
    await repo.savePlan({ ...p, status: 'paused' });
    assert.equal((await repo.listOccurrences({ from: MONDAY, to: addDays(MONDAY, 20) })).length, 0);
    today = addDays(MONDAY, 5);
    await repo.savePlan({ ...(await repo.getPlan('p'))!, status: 'active' });
    const back = await repo.listOccurrences({ from: MONDAY, to: addDays(MONDAY, 20) });
    assert.ok(back.length > 0);
    assert.ok(back.every((o) => o.scheduledDate >= today));
  });

  test('deleting a plan removes its missed and upcoming workouts from the calendar', async () => {
    await repo.savePlan(plan('p', every(['a']), [workout('a')]));
    today = addDays(MONDAY, 3);
    await repo.deletePlan('p');
    assert.equal((await repo.listOccurrences({ from: MONDAY, to: addDays(MONDAY, 30) })).length, 0);
    assert.equal((await agendaOn(addDays(MONDAY, 1))).length, 0);
  });
});

describe('templates', () => {
  test('using a template copies it: fresh ids, matching schedule, nothing shared', () => {
    const template = starterTemplates.find((t) => t.workouts.length > 1)!;
    const before = JSON.stringify(template);
    const p = planFromTemplate(template, MONDAY);
    assert.equal(p.templateId, template.id);
    assert.equal(p.status, 'active');
    assert.equal(p.version, 1);
    // Fresh ids for workouts, blocks, and exercises.
    const templateIds = new Set(template.workouts.flatMap((w) => [w.id, ...w.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]));
    for (const w of p.workouts) {
      assert.ok(!templateIds.has(w.id));
      for (const b of w.blocks) {
        assert.ok(!templateIds.has(b.id));
        for (const e of b.exercises) assert.ok(!templateIds.has(e.id));
      }
    }
    // The schedule points at the plan's own workouts.
    const ids = new Set(p.workouts.map((w) => w.id));
    const scheduled = p.schedule.type === 'rotating' ? p.schedule.sequence.filter((s) => s !== 'rest') : p.schedule.days.flatMap((d) => d.workoutIds);
    assert.ok(scheduled.length > 0 && scheduled.every((id) => ids.has(id)));
    // Editing the plan never reaches the template.
    p.workouts[0].blocks[0].exercises[0].sets[0].targetReps = 99;
    if (p.workouts[0].blocks[0].exercises[0].progression) (p.workouts[0].blocks[0].exercises[0].progression as { kind: string }).kind = 'changed';
    assert.equal(JSON.stringify(template), before);
  });
});

describe('upgrading an existing database', () => {
  test('plans saved before versioning get their current version recorded', async () => {
    const db = openTestDatabase();
    migrate(db, 1);
    db.runSync("INSERT INTO meta (key, value) VALUES ('contents', 'user')", []);
    const p = plan('old', every(['a']), [workout('a')], { version: 3 });
    db.runSync('INSERT INTO plans (id, status, data, updated_at) VALUES (?, ?, ?, ?)', [p.id, p.status, JSON.stringify(p), STAMP]);
    migrate(db);
    const repo = createSqliteRepository(db, { today: () => MONDAY });
    const versions = await repo.listPlanVersions();
    assert.deepEqual(versions.map((v) => [v.id, v.version]), [['old', 3]]);
  });
});
