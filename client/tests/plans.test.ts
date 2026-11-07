import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { builtinExercises, starterTemplates } from '../src/data/content';
import { addDays, isoWeekday } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository, type SqliteRepository } from '../src/data/db/sqliteRepository';
import { roundingIncrementFor } from '../src/data/logging';
import { defaultRounding } from '../src/data/preferences';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import { scheduledWorkoutIds, scheduleOccurrences, trainingDays } from '../src/data/schedule';
import type {
  Equipment,
  LoggedSet,
  MissBehavior,
  Plan,
  PlannedExercise,
  PlanSchedule,
  PlanWorkout,
  ProgressionRule,
  SetPrescription,
  StarterTemplate,
  TemplateDayOption,
  UnitSystem,
  Weekday,
  WorkoutSession,
} from '../src/data/types';
import { kgToLb, lbToKg } from '../src/data/units';
import { CATEGORY_LABEL, describeProgression, shownIncrement, templateMeta } from '../src/features/plans/describe';
import { planFromTemplate, templateDayOption, templateDayOptions } from '../src/features/plans/planEdits';
import { buildAgenda } from '../src/features/today/agenda';
import { progressionFor } from '../src/features/workout/progression';
import { cycle } from './support/cycles';
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
    const p = plan('r', cycle(['a'], ['b'], []), [workout('a'), workout('b')], { startDate: addDays(MONDAY, 2) });
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
    await repo.savePlan(plan('cond', cycle(['run']), [workout('run')]));
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
    const scheduled = [...scheduledWorkoutIds(p.schedule)];
    assert.ok(scheduled.length > 0 && scheduled.every((id) => ids.has(id)));
    // Editing the plan never reaches the template.
    p.workouts[0].blocks[0].exercises[0].sets[0].targetReps = 99;
    if (p.workouts[0].blocks[0].exercises[0].progression) (p.workouts[0].blocks[0].exercises[0].progression as unknown as { kind: string }).kind = 'changed';
    assert.equal(JSON.stringify(template), before);
  });
});

// ---------------------------------------------------------------------------
// Day versions (G3.13): a template can run its workouts on more than one number of days a week.

const tplWorkout = (id: string, name: string): PlanWorkout => ({
  id,
  name,
  estimatedMinutes: 45,
  blocks: [
    {
      id: `tb_${id}`,
      type: 'single',
      exercises: [
        {
          id: `tp_${id}`,
          exerciseId: 'ex_back_squat',
          sets: [{ kind: 'normal', modifiers: [], targetReps: { min: 5, max: 8 }, targetRir: 2 }],
          progression: { type: 'rep_range', incrementKg: lbToKg(10), onMiss: { type: 'repeat' } },
        },
      ],
    },
  ],
});

const weeklyOn = (days: [Weekday, string][]): PlanSchedule => ({ type: 'weekly', days: days.map(([weekday, id]) => ({ weekday, workoutIds: [id] })) });

/** Three workouts: A, B, C on Mon, Wed, Fri by default, or A and B on Mon and Thu. */
const versioned = (extra: Partial<StarterTemplate> = {}): StarterTemplate => ({
  id: 'tpl_test',
  name: 'Test Program',
  category: 'gym',
  level: 'beginner',
  levels: ['beginner', 'intermediate'],
  goals: ['general'],
  daysPerWeek: 3,
  description: 'A test program.',
  equipment: ['barbell'],
  schedule: weeklyOn([
    [1, 'tw_a'],
    [3, 'tw_b'],
    [5, 'tw_c'],
  ]),
  otherDays: [
    {
      daysPerWeek: 2,
      schedule: weeklyOn([
        [1, 'tw_a'],
        [4, 'tw_b'],
      ]),
    },
  ],
  workouts: [tplWorkout('tw_a', 'Day A'), tplWorkout('tw_b', 'Day B'), tplWorkout('tw_c', 'Day C')],
  ...extra,
});

const fourDays = (): TemplateDayOption => ({
  daysPerWeek: 4,
  schedule: weeklyOn([
    [1, 'tw_a'],
    [2, 'tw_b'],
    [4, 'tw_c'],
    [5, 'tw_a'],
  ]),
});

/** Weekday and the plan workouts' names, for weekly and fixed schedules. */
const scheduledNames = (p: Plan): [Weekday, string[]][] => {
  if (p.schedule.type === 'rotating') return [];
  const byId = new Map(p.workouts.map((w) => [w.id, w.name]));
  return p.schedule.days.map((d) => [d.weekday, d.workoutIds.map((id) => byId.get(id) ?? `missing ${id}`)]);
};

describe('template day versions', () => {
  test('templateDayOptions lists the default and the other versions, fewest days first', () => {
    const template = versioned();
    const options = templateDayOptions(template);
    assert.deepEqual(
      options.map((o) => o.daysPerWeek),
      [2, 3],
    );
    assert.equal(options[1].schedule, template.schedule, 'the default is the template’s own schedule');
    assert.equal(options[0].schedule, template.otherDays![0].schedule);
    assert.deepEqual(
      templateDayOptions(versioned({ otherDays: undefined })).map((o) => o.daysPerWeek),
      [3],
      'one version, one option',
    );
    const unsorted = versioned({ otherDays: [fourDays(), versioned().otherDays![0]] });
    assert.deepEqual(
      templateDayOptions(unsorted).map((o) => o.daysPerWeek),
      [2, 3, 4],
    );
    assert.deepEqual(
      unsorted.otherDays!.map((o) => o.daysPerWeek),
      [4, 2],
      'the template’s own list is left as it is',
    );
  });

  test('templateDayOption picks a version by its days, and the default otherwise', () => {
    const template = versioned();
    assert.equal(templateDayOption(template, 2).schedule, template.otherDays![0].schedule);
    for (const days of [undefined, 3, 5, 0]) assert.equal(templateDayOption(template, days).schedule, template.schedule, `days ${days}`);
    assert.equal(templateDayOption(template).daysPerWeek, 3);
  });

  test('a version copies only the workouts it schedules, on its own days, with fresh ids', () => {
    const template = versioned();
    const p = planFromTemplate(template, MONDAY, { daysPerWeek: 2 });
    assert.deepEqual(
      p.workouts.map((w) => w.name),
      ['Day A', 'Day B'],
    );
    assert.deepEqual(scheduledNames(p), [
      [1, ['Day A']],
      [4, ['Day B']],
    ]);
    assert.equal(trainingDays(p.schedule).count, 2);
    assert.equal(p.name, template.name);
    assert.equal(p.templateId, template.id);
    const templateIds = new Set(template.workouts.flatMap((w) => [w.id, ...w.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]));
    for (const w of p.workouts) {
      assert.ok(!templateIds.has(w.id));
      for (const b of w.blocks) {
        assert.ok(!templateIds.has(b.id));
        for (const e of b.exercises) assert.ok(!templateIds.has(e.id));
      }
    }
    // Two weeks from a Monday: each workout twice, all of them the plan's own.
    const occurrences = scheduleOccurrences(p, MONDAY, addDays(MONDAY, 13));
    assert.equal(occurrences.length, 4);
    assert.ok(occurrences.every((o) => p.workouts.some((w) => w.id === o.planWorkoutId)));
  });

  test('without a version, or with a count no version has, the default is copied', () => {
    const template = versioned();
    for (const opts of [undefined, {}, { daysPerWeek: 3 }, { daysPerWeek: 5 }]) {
      const p = planFromTemplate(template, MONDAY, opts);
      assert.deepEqual(
        p.workouts.map((w) => w.name),
        ['Day A', 'Day B', 'Day C'],
        JSON.stringify(opts),
      );
      assert.deepEqual(scheduledNames(p), [
        [1, ['Day A']],
        [3, ['Day B']],
        [5, ['Day C']],
      ]);
    }
  });

  test('a fixed-length version keeps its weeks', () => {
    const fixed = (weeks: number, days: [Weekday, string][]): PlanSchedule => ({
      type: 'fixed',
      weeks,
      days: Array.from({ length: weeks }, (_, w) => days.map(([weekday, id]) => ({ week: w + 1, weekday, workoutIds: [id] }))).flat(),
    });
    const template = versioned({
      durationWeeks: 8,
      schedule: fixed(8, [
        [1, 'tw_a'],
        [3, 'tw_b'],
        [5, 'tw_c'],
      ]),
      otherDays: [
        {
          daysPerWeek: 2,
          schedule: fixed(8, [
            [1, 'tw_a'],
            [4, 'tw_b'],
          ]),
        },
      ],
    });
    const p = planFromTemplate(template, MONDAY, { daysPerWeek: 2 });
    assert.ok(p.schedule.type === 'fixed');
    assert.equal(p.schedule.weeks, 8);
    assert.equal(p.schedule.days.length, 16);
    assert.deepEqual(
      p.workouts.map((w) => w.name),
      ['Day A', 'Day B'],
    );
    assert.equal(scheduleOccurrences(p, MONDAY, addDays(MONDAY, 13)).length, 4);
  });

  test('the copy is still deep: editing a version’s plan never reaches the template', () => {
    const template = versioned();
    const before = JSON.stringify(template);
    for (const daysPerWeek of [2, 3]) {
      const p = planFromTemplate(template, MONDAY, { daysPerWeek });
      p.workouts[0].name = 'Changed';
      p.workouts[0].blocks[0].exercises[0].sets[0].targetReps = 99;
      p.workouts[0].blocks[0].exercises[0].progression = undefined;
      if (p.schedule.type !== 'rotating') {
        p.schedule.days[0].workoutIds.push('pw_other');
        p.schedule.days[0].weekday = 7;
      }
    }
    assert.equal(JSON.stringify(template), before);
  });

  test('the starter catalog’s day versions each copy into a plan of their own days', () => {
    for (const template of starterTemplates) {
      for (const option of templateDayOptions(template)) {
        const label = `${template.id} on ${option.daysPerWeek} days`;
        const p = planFromTemplate(template, MONDAY, { daysPerWeek: option.daysPerWeek });
        assert.equal(trainingDays(p.schedule).count, trainingDays(option.schedule).count, label);
        const scheduled = scheduledWorkoutIds(p.schedule);
        assert.deepEqual(new Set(p.workouts.map((w) => w.id)), scheduled, `${label} copies only what it schedules`);
      }
    }
  });
});

describe('template meta line', () => {
  test('lists every version’s days, or the chosen one’s', () => {
    assert.equal(templateMeta(versioned()), 'Beginner  ·  2 or 3 days/week  ·  Ongoing');
    assert.equal(templateMeta(versioned(), { daysPerWeek: 2 }), 'Beginner  ·  2 days/week  ·  Ongoing');
    assert.equal(templateMeta(versioned(), templateDayOption(versioned(), 3)), 'Beginner  ·  3 days/week  ·  Ongoing');
    assert.equal(templateMeta(versioned({ otherDays: undefined, level: 'intermediate', durationWeeks: 8 })), 'Intermediate  ·  3 days/week  ·  8 weeks');
    assert.equal(templateMeta(versioned({ otherDays: [fourDays(), versioned().otherDays![0]], level: 'advanced' })), 'Advanced  ·  2, 3 or 4 days/week  ·  Ongoing');
    assert.equal(templateMeta(versioned(), { daysPerWeek: 1 }), 'Beginner  ·  1 day/week  ·  Ongoing');
  });

  test('the full-range style is labelled Full range', () => {
    assert.equal(CATEGORY_LABEL.atg, 'Full range');
  });
});

// ---------------------------------------------------------------------------
// Progression steps in the user's units: the step the engine takes, not the stored kg.

describe('progression steps as shown', () => {
  const rounding = (units: UnitSystem, equipment: Equipment) => defaultRounding[units][equipment]!;

  test('shownIncrement rounds the stored step to whole rounding steps, at least one', () => {
    assert.equal(shownIncrement(lbToKg(5), 'imperial', rounding('imperial', 'barbell')), 5);
    assert.equal(shownIncrement(lbToKg(5), 'metric', rounding('metric', 'barbell')), 2.5);
    assert.equal(shownIncrement(lbToKg(5), 'metric', rounding('metric', 'machine')), 2.5);
    assert.equal(shownIncrement(lbToKg(5), 'metric', rounding('metric', 'dumbbell')), 2);
    assert.equal(shownIncrement(lbToKg(5), 'metric', rounding('metric', 'kettlebell')), 4);
    assert.equal(shownIncrement(lbToKg(10), 'imperial', rounding('imperial', 'barbell')), 10);
    assert.equal(shownIncrement(lbToKg(10), 'metric', rounding('metric', 'barbell')), 5);
    assert.equal(shownIncrement(lbToKg(10), 'metric', rounding('metric', 'dumbbell')), 4);
    assert.equal(shownIncrement(2.5, 'imperial', rounding('imperial', 'barbell')), 5, 'a kg step after switching to lb');
    assert.equal(shownIncrement(5, 'imperial', rounding('imperial', 'barbell')), 10);
    assert.equal(shownIncrement(lbToKg(1), 'metric', 2.5), 2.5, 'never less than one step');
    assert.equal(shownIncrement(lbToKg(2.5), 'imperial', 5), 5, 'half a step rounds up');
    // The plan editor's half-step grid.
    assert.equal(shownIncrement(lbToKg(5), 'metric', 1.25), 2.5);
    assert.equal(shownIncrement(lbToKg(5), 'metric', 1), 2);
    assert.equal(shownIncrement(lbToKg(2.5), 'imperial', 2.5), 2.5);
    assert.equal(shownIncrement(1.25, 'metric', 1.25), 1.25);
    // No rounding step: the stored step in the user's units, without the kg/lb noise.
    assert.equal(shownIncrement(lbToKg(5), 'imperial', 0), 5);
    assert.equal(shownIncrement(2.5, 'metric', 0), 2.5);
    // Taking assistance off rounds an exact half step down, as the engine does.
    assert.equal(shownIncrement(3.75, 'metric', 2.5), 5);
    assert.equal(shownIncrement(3.75, 'metric', 2.5, -1), 2.5);
    assert.equal(shownIncrement(lbToKg(5), 'metric', 2.5, -1), 2.5);
  });

  /** What the engine adds (or takes off) after every set hit the top of 8-12 at `lifted`, in the user's units. */
  function engineStep(exerciseId: string, rule: ProgressionRule, units: UnitSystem, lifted: number): number {
    const exercise = builtinExercises.find((e) => e.id === exerciseId)!;
    const assisted = exercise.isAssisted === true;
    const sets: SetPrescription[] = [1, 2, 3].map(() => ({ kind: 'normal', modifiers: [], targetReps: { min: 8, max: 12 } }));
    const planned: PlannedExercise = { id: 'pe1', exerciseId, sets, progression: rule };
    const liftedKg = units === 'imperial' ? lbToKg(lifted) : lifted;
    const done = '2026-10-12';
    const logged: LoggedSet[] = [1, 2, 3].map((n) => ({
      id: `s${n}`,
      kind: assisted ? 'assisted' : 'normal',
      modifiers: [],
      reps: 12,
      ...(assisted ? { assistanceKg: liftedKg } : { loadKg: liftedKg }),
      completedAt: `${done}T10:00:00.000Z`,
    }));
    const entry = { id: 'e1', exerciseId, plannedExerciseId: 'pe1', skipped: false, sets: logged };
    const session: WorkoutSession = {
      id: 'sess1',
      name: 'Past',
      status: 'completed',
      completion: 'full',
      planId: 'plan1',
      planWorkoutId: 'pw1',
      completedDate: done,
      completedAt: `${done}T10:00:00.000Z`,
      blocks: [{ id: 'b1', type: 'single', exercises: [entry] }],
      createdAt: `${done}T09:00:00.000Z`,
      updatedAt: `${done}T10:00:00.000Z`,
    };
    const preferences = { units, roundingIncrements: defaultRounding[units], weekStartsOn: 1 as const };
    const result = progressionFor({ planned, exercise, history: [{ session, entry }], preferences, today: MONDAY });
    assert.equal(result.suggestion?.kind, 'increase', `${exerciseId} in ${units}`);
    const shown = (kg: number) => (units === 'imperial' ? kgToLb(kg) : kg);
    return Math.round(Math.abs(shown(result.suggestedKg) - shown(liftedKg)) * 1e4) / 1e4;
  }

  test('shownIncrement is the step the engine takes', () => {
    const rule = (incrementKg: number): ProgressionRule => ({ type: 'rep_range', incrementKg, onMiss: { type: 'repeat' } });
    const cases: [string, number, UnitSystem, number, number][] = [
      ['ex_back_squat', lbToKg(5), 'imperial', 135, 5],
      ['ex_back_squat', lbToKg(10), 'imperial', 135, 10],
      ['ex_back_squat', lbToKg(5), 'metric', 60, 2.5],
      ['ex_back_squat', lbToKg(10), 'metric', 60, 5],
      ['ex_back_squat', 2.5, 'imperial', 135, 5],
      ['ex_back_squat', 3.75, 'metric', 60, 5],
      ['ex_db_curl', lbToKg(5), 'metric', 12, 2],
      ['ex_db_curl', lbToKg(10), 'metric', 12, 4],
      ['ex_kb_row', lbToKg(5), 'metric', 16, 4],
      ['ex_leg_press', lbToKg(10), 'metric', 100, 5],
      ['ex_cable_curl', lbToKg(5), 'imperial', 40, 5],
      ['ex_assisted_pull_up', lbToKg(5), 'metric', 30, 2.5],
      ['ex_assisted_pull_up', 3.75, 'metric', 30, 2.5],
      ['ex_assisted_pull_up', lbToKg(10), 'imperial', 60, 10],
    ];
    for (const [exerciseId, incrementKg, units, lifted, expected] of cases) {
      const exercise = builtinExercises.find((e) => e.id === exerciseId)!;
      const step = roundingIncrementFor(exercise.equipment, { units, roundingIncrements: defaultRounding[units] });
      const label = `${exerciseId}, ${incrementKg} kg step, in ${units}`;
      assert.equal(engineStep(exerciseId, rule(incrementKg), units, lifted), expected, `engine: ${label}`);
      assert.equal(shownIncrement(incrementKg, units, step, exercise.isAssisted ? -1 : 1), expected, `shown: ${label}`);
    }
  });

  test('describeProgression with a rounding step reads the step the engine takes', () => {
    const range = (incrementKg: number, onMiss: MissBehavior = { type: 'repeat' }): ProgressionRule => ({ type: 'rep_range', incrementKg, onMiss });
    const sets: SetPrescription[] = [1, 2, 3].map(() => ({ kind: 'normal', modifiers: [], targetReps: { min: 8, max: 12 } }));
    const deload: MissBehavior = { type: 'deload', afterConsecutiveMisses: 3, percent: 10 };
    assert.equal(describeProgression(range(lbToKg(5), deload), 'metric', sets, undefined, 2.5), '+2.5 kg at top of range · deload 10% after 3 misses');
    assert.equal(describeProgression(range(lbToKg(5)), 'metric', sets, undefined, 2), '+2 kg at top of range · repeat on a miss');
    assert.equal(describeProgression(range(lbToKg(5)), 'metric', sets, undefined, 4), '+4 kg at top of range · repeat on a miss');
    assert.equal(describeProgression(range(lbToKg(10)), 'metric', sets, undefined, 2.5), '+5 kg at top of range · repeat on a miss');
    assert.equal(describeProgression(range(lbToKg(5)), 'imperial', sets, undefined, 5), '+5 lb at top of range · repeat on a miss');
    assert.equal(describeProgression(range(2.5), 'imperial', sets, undefined, 5), '+5 lb at top of range · repeat on a miss', 'a kg step after switching to lb');
    assert.equal(describeProgression(range(1.25), 'metric', sets, undefined, 1.25), '+1.25 kg at top of range · repeat on a miss');
    // Fixed reps and assistance read as before, with the rounded step.
    const fives: SetPrescription[] = [1, 2, 3].map(() => ({ kind: 'normal', modifiers: [], targetReps: 5 }));
    assert.equal(describeProgression(range(lbToKg(10)), 'metric', fives, undefined, 2.5), '+5 kg when every set hits 5 · repeat on a miss');
    const assistedMachine = builtinExercises.find((e) => e.id === 'ex_assisted_pull_up')!;
    assert.equal(describeProgression(range(lbToKg(5), deload), 'metric', sets, assistedMachine, 2.5), '2.5 kg less assistance at top of range · 10% more assistance after 3 misses');
    // A weekly % has no step to round.
    assert.equal(describeProgression({ type: 'percent_weekly', percent: 2.5, onMiss: { type: 'repeat' } }, 'metric', sets, undefined, 2.5), '+2.5% a week · repeat on a miss');
  });

  test('without a rounding step, describeProgression shows the stored step as before', () => {
    const range: ProgressionRule = { type: 'rep_range', incrementKg: lbToKg(5), onMiss: { type: 'repeat' } };
    assert.equal(describeProgression(range, 'metric'), '+2.3 kg at top of range · repeat on a miss');
    assert.equal(describeProgression(range, 'imperial'), '+5 lb at top of range · repeat on a miss');
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
