// The starter-template validator (G3.13): one good fixture that passes, and for every rule a bad
// fixture that triggers exactly that rule's message. tests/templates.test.ts runs it over the
// real catalog.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUILTIN_EXERCISES } from '../src/data/content/exercises';
import { EXERCISE_GEAR } from '../src/data/content/gear';
import { estimateMinutes } from '../src/data/content/templates/helpers';
import { RETIRED_TEMPLATE_IDS } from '../src/data/content/templates';
import {
  BANNED_BRANDS,
  copyProblems,
  validateLibraryNames,
  validateTemplate,
  validateTemplates,
  type ExercisesById,
} from '../src/data/content/validateTemplates';
import type { Exercise, PlannedExercise, PlanSchedule, PlanWorkout, SetPrescription, StarterTemplate, Weekday } from '../src/data/types';
import { lbToKg } from '../src/data/units';

const STAMP = '2026-11-02T08:00:00.000Z';

/** A custom hold exercise that isn't bodyweight, so "a rule with no rep sets" can fire on its own. */
const WEIGHTED_PLANK: Exercise = {
  id: 'ex_custom_weighted_plank',
  name: 'Weighted Plank',
  source: 'custom',
  baseMovementId: 'ex_plank',
  equipment: 'dumbbell',
  primaryMuscles: ['core'],
  category: 'isolation',
  isBodyweight: false,
  createdAt: STAMP,
  updatedAt: STAMP,
};
const EXERCISES: Exercise[] = [...BUILTIN_EXERCISES, WEIGHTED_PLANK];
const BY_ID: ExercisesById = new Map(EXERCISES.map((e) => [e.id, e]));

// --- Set and block builders (plain literals, so each fixture says exactly what it holds) ---

const reps = (min: number, max: number, rir = 2): SetPrescription => ({ kind: 'normal', modifiers: [], targetReps: { min, max }, targetRir: rir });
const warm = (n: number): SetPrescription => ({ kind: 'warmup', modifiers: [], targetReps: n });
const hold = (sec: number): SetPrescription => ({ kind: 'timed_hold', modifiers: [], targetDurationSec: sec });
const times = (n: number, make: () => SetPrescription) => Array.from({ length: n }, make);
const RR5 = { type: 'rep_range', incrementKg: lbToKg(5), onMiss: { type: 'deload', afterConsecutiveMisses: 3, percent: 10 } } as const;
const RR5_REPEAT = { type: 'rep_range', incrementKg: lbToKg(5), onMiss: { type: 'repeat' } } as const;

const weekly = (days: [Weekday, string][]): PlanSchedule => ({
  type: 'weekly',
  days: days.map(([weekday, id]) => ({ weekday, workoutIds: [id] })),
});
const fixed = (weeks: number, days: [Weekday, string][]): PlanSchedule => ({
  type: 'fixed',
  weeks,
  days: Array.from({ length: weeks }, (_, i) => days.map(([weekday, id]) => ({ week: i + 1, weekday, workoutIds: [id] }))).flat(),
});

function withMinutes(w: Omit<PlanWorkout, 'estimatedMinutes'>): PlanWorkout {
  return { ...w, estimatedMinutes: estimateMinutes(w.blocks, BY_ID) };
}

/** Recomputes every estimate, so a mutation only trips the rule it's aimed at. */
function refreshMinutes(t: StarterTemplate): void {
  for (const w of t.workouts) {
    if (w.blocks.some((b) => b.exercises.length) && w.blocks.every((b) => b.exercises.every((e) => EXERCISES.some((x) => x.id === e.exerciseId)))) {
      w.estimatedMinutes = estimateMinutes(w.blocks, BY_ID);
    }
  }
}

/**
 * The good fixture: weekly, beginner to intermediate, 3 days with a 2-day version. Singles, a
 * superset with a hold, a circuit, warm-ups, a tempo, notes and both miss rules.
 */
function good(): StarterTemplate {
  const dayA = withMinutes({
    id: 'tpl_fixture_a',
    name: 'Day A',
    blocks: [
      { id: 'tpl_fixture_a_b1', type: 'single', exercises: [{ id: 'tpl_fixture_a_e1', exerciseId: 'ex_goblet_squat', sets: [warm(8), ...times(3, () => reps(8, 12))], progression: RR5 }] },
      {
        id: 'tpl_fixture_a_b2',
        type: 'superset',
        roundRestSec: 60,
        exercises: [
          { id: 'tpl_fixture_a_e2', exerciseId: 'ex_lateral_raise', sets: times(2, () => reps(10, 20)), progression: RR5_REPEAT },
          { id: 'tpl_fixture_a_e3', exerciseId: 'ex_plank', sets: times(2, () => hold(30)) },
        ],
      },
    ],
  });
  const dayB = withMinutes({
    id: 'tpl_fixture_b',
    name: 'Day B',
    blocks: [
      { id: 'tpl_fixture_b_b1', type: 'single', exercises: [{ id: 'tpl_fixture_b_e1', exerciseId: 'ex_lat_pulldown', sets: times(3, () => ({ ...reps(8, 12), tempo: '3-1-1-0' })), progression: RR5 }] },
      { id: 'tpl_fixture_b_b2', type: 'single', exercises: [{ id: 'tpl_fixture_b_e2', exerciseId: 'ex_push_up', sets: times(3, () => reps(5, 15)), notes: 'Hands on a bench if you need to. Keep the heel of each hand under the shoulder.' }] },
      { id: 'tpl_fixture_b_b3', type: 'single', exercises: [{ id: 'tpl_fixture_b_e3', exerciseId: 'ex_pull_up', sets: times(3, () => reps(3, 8)) }] },
    ],
  });
  const dayC = withMinutes({
    id: 'tpl_fixture_c',
    name: 'Day C',
    blocks: [
      {
        id: 'tpl_fixture_c_b1',
        type: 'circuit',
        roundRestSec: 90,
        transitionRestSec: 10,
        exercises: [
          { id: 'tpl_fixture_c_e1', exerciseId: 'ex_kb_swing', sets: times(3, () => ({ kind: 'normal', modifiers: [], targetReps: 15 })), notes: 'One round is one set of each exercise.' },
          { id: 'tpl_fixture_c_e2', exerciseId: 'ex_push_up', sets: times(3, () => ({ kind: 'normal', modifiers: [], targetReps: 10 })) },
          { id: 'tpl_fixture_c_e3', exerciseId: 'ex_bodyweight_squat', sets: times(3, () => ({ kind: 'normal', modifiers: [], targetReps: 20 })) },
        ],
      },
    ],
  });
  return {
    id: 'tpl_fixture',
    name: 'Fixture Program',
    category: 'gym',
    level: 'beginner',
    levels: ['beginner', 'intermediate'],
    goals: ['general', 'strength'],
    daysPerWeek: 3,
    description: 'A small program for the validator tests, with a secure grip and a two-day version.',
    equipment: ['dumbbell', 'cable', 'kettlebell'],
    alsoNeeds: ['pull_up_bar'],
    schedule: weekly([[1, 'tpl_fixture_a'], [3, 'tpl_fixture_b'], [5, 'tpl_fixture_c']]),
    otherDays: [{ daysPerWeek: 2, schedule: weekly([[1, 'tpl_fixture_a'], [4, 'tpl_fixture_b']]) }],
    workouts: [dayA, dayB, dayC],
  };
}

/** The same program as a 4-week fixed one, with a weekly % rule on its first lift. */
function goodFixed(): StarterTemplate {
  const t = good();
  t.durationWeeks = 4;
  t.schedule = fixed(4, [[1, 'tpl_fixture_a'], [3, 'tpl_fixture_b'], [5, 'tpl_fixture_c']]);
  t.otherDays = [{ daysPerWeek: 2, schedule: fixed(4, [[1, 'tpl_fixture_a'], [4, 'tpl_fixture_b']]) }];
  exercise(t, 0, 0).progression = { type: 'percent_weekly', percent: 2.5, onMiss: { type: 'deload', afterConsecutiveMisses: 2, percent: 10 } };
  return t;
}

/** A bodyweight-only program, which declares ['bodyweight'] as its equipment. */
function goodBodyweight(): StarterTemplate {
  const t = good();
  t.workouts = [t.workouts[1], t.workouts[2]];
  t.workouts[0] = withMinutes({ ...t.workouts[0], blocks: t.workouts[0].blocks.slice(1) });
  t.workouts[1] = withMinutes({ ...t.workouts[1], blocks: [{ ...t.workouts[1].blocks[0], exercises: t.workouts[1].blocks[0].exercises.map((e, i) => (i === 0 ? { ...e, exerciseId: 'ex_diamond_push_up' } : e)) }] });
  t.equipment = ['bodyweight'];
  t.daysPerWeek = 2;
  t.schedule = weekly([[1, 'tpl_fixture_b'], [4, 'tpl_fixture_c']]);
  delete t.otherDays;
  return t;
}

function exercise(t: StarterTemplate, workout: number, block: number, index = 0): PlannedExercise {
  return t.workouts[workout].blocks[block].exercises[index];
}

/** Applies one mutation to the good fixture and returns the validator's problems. */
function problemsAfter(mutate: (t: StarterTemplate) => void, options: { from?: () => StarterTemplate; minutes?: boolean } = {}): string[] {
  const t = (options.from ?? good)();
  mutate(t);
  if (options.minutes !== false) refreshMinutes(t);
  return validateTemplate(t, BY_ID);
}

/** Exactly one problem, starting with the template id and matching the rule's message. */
function expectOnly(problems: string[], pattern: RegExp, id = 'tpl_fixture'): void {
  assert.equal(problems.length, 1, `expected exactly one problem, got:\n${problems.join('\n')}`);
  assert.ok(problems[0].startsWith(`${id}: `), problems[0]);
  assert.match(problems[0], pattern);
}

describe('good fixtures', () => {
  test('the good fixture, its fixed version and a bodyweight program pass', () => {
    assert.deepEqual(validateTemplate(good(), BY_ID), []);
    assert.deepEqual(validateTemplate(goodFixed(), BY_ID), []);
    assert.deepEqual(validateTemplate(goodBodyweight(), BY_ID), []);
    assert.deepEqual(validateTemplates([good()], EXERCISES), []);
  });

  test('the fixture uses gear from the shared map', () => {
    assert.deepEqual(EXERCISE_GEAR.ex_pull_up, ['pull_up_bar']);
    for (const id of ['ex_goblet_squat', 'ex_lateral_raise', 'ex_plank', 'ex_lat_pulldown', 'ex_push_up', 'ex_kb_swing', 'ex_bodyweight_squat', 'ex_diamond_push_up']) {
      assert.equal(EXERCISE_GEAR[id], undefined, id);
    }
  });

  test('assisted sets are fine on bodyweight exercises', () => {
    assert.deepEqual(problemsAfter((t) => (exercise(t, 1, 2).sets = times(3, () => ({ ...reps(3, 8), kind: 'assisted' })))), []);
  });
});

describe('ids and names', () => {
  test('ids look like tpl_name', () => {
    expectOnly(problemsAfter((t) => (t.id = 'tpl_Bad-Id')), /id must be tpl_ followed by lowercase letters/, 'tpl_Bad-Id');
    expectOnly(problemsAfter((t) => (t.id = 'fixture')), /id must be tpl_/, 'fixture');
  });

  test('retired ids are never reused', () => {
    assert.ok(RETIRED_TEMPLATE_IDS.length > 0);
    const id = RETIRED_TEMPLATE_IDS[0];
    expectOnly(problemsAfter((t) => (t.id = id)), /id is retired and can never be reused/, id);
  });

  test('ids and names are unique across templates', () => {
    const other = { ...good(), name: 'Another Program' };
    expectOnly(validateTemplates([good(), other], EXERCISES), /id is used by more than one template/);
    const renamed = { ...good(), id: 'tpl_fixture_two' };
    expectOnly(validateTemplates([good(), renamed], EXERCISES), /name "Fixture Program" is also used by tpl_fixture_two/);
  });

  test('names are 28 characters or fewer', () => {
    expectOnly(problemsAfter((t) => (t.name = 'A Program Name That Runs Long')), /name "A Program Name That Runs Long" is longer than 28 characters/);
    assert.deepEqual(problemsAfter((t) => (t.name = 'Twenty Eight Characters Name')), []);
  });
});

describe('tags', () => {
  test('levels include the headline level', () => {
    expectOnly(problemsAfter((t) => (t.level = 'advanced')), /levels \[beginner, intermediate\] must include its level, advanced/);
  });

  test('levels are neighbouring and listed once', () => {
    expectOnly(problemsAfter((t) => (t.levels = ['beginner', 'advanced'])), /must be neighbouring levels, each listed once/);
    expectOnly(problemsAfter((t) => (t.levels = ['beginner', 'beginner'])), /must be neighbouring levels, each listed once/);
    assert.deepEqual(problemsAfter((t) => (t.levels = ['intermediate', 'beginner'])), []);
  });

  test('goals are not empty and do not repeat', () => {
    expectOnly(problemsAfter((t) => (t.goals = [])), /goals must list at least one goal/);
    expectOnly(problemsAfter((t) => (t.goals = ['general', 'strength', 'general'])), /goal "general" is listed more than once/);
  });
});

describe('copy', () => {
  test('descriptions are 110 characters or fewer', () => {
    expectOnly(problemsAfter((t) => (t.description = `${'Long words here '.repeat(7)}end.`)), /description is longer than 110 characters/);
  });

  test('descriptions end with a full stop', () => {
    expectOnly(problemsAfter((t) => (t.description = 'No full stop at the end')), /description must end with a full stop/);
  });

  test('no emoji and no "!"', () => {
    expectOnly(problemsAfter((t) => (t.name = 'Fixture \u{1F4AA}')), /name: has an emoji/);
    expectOnly(problemsAfter((t) => (t.description = 'Lift heavy!.')), /description: has a "!"/);
    expectOnly(problemsAfter((t) => (exercise(t, 1, 1).notes = 'Go!')), /Day B > block 2 > Push-Up notes: has a "!"/);
  });

  test('brand names, on word boundaries and in any case', () => {
    expectOnly(problemsAfter((t) => (t.workouts[0].name = 'ATG Day')), /workout "ATG Day" name: uses the brand name "ATG"/);
    expectOnly(problemsAfter((t) => (t.description = 'Squats in the atg style.')), /description: uses the brand name "ATG"/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).notes = 'Let the knees over toes as you lower.')), /Goblet Squat \(Dumbbell\) notes: uses the brand name "Knees Over Toes"/);
    expectOnly(problemsAfter((t) => (t.name = 'Crossfit Style')), /uses the brand name "CrossFit"/);
    expectOnly(problemsAfter((t) => (t.description = 'Based on 5/3/1.')), /uses the brand name "5\/3\/1"/);
    expectOnly(problemsAfter((t) => (t.workouts[2].name = 'WOD')), /uses the brand name "WOD"/);
  });

  test('every brand name is caught', () => {
    for (const { word } of BANNED_BRANDS) assert.deepEqual(copyProblems(`Try the ${word} plan.`), [`uses the brand name "${word}"`], word);
  });

  test('words that only contain a banned word pass', () => {
    for (const text of ['A secure grip.', 'Weight on the heel.', 'A trip to Spain.', 'Matgo and batgirl.', 'Painted lines.', 'Heel-toe walks.', 'Good for your health.', 'Swods and wodka.', 'A phatic remark.']) {
      assert.deepEqual(copyProblems(text), [], text);
    }
    assert.deepEqual(problemsAfter((t) => (exercise(t, 1, 1).notes = 'A secure grip, weight on the heel.')), []);
  });

  test('pain, injury and medical words', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 1, 1).notes = 'Stay pain-free.')), /Push-Up notes: uses the injury word "pain"/);
    expectOnly(problemsAfter((t) => (t.description = 'Fewer injuries.')), /description: uses the injury word "injury"/);
    expectOnly(problemsAfter((t) => (t.description = 'It heals knees.')), /uses the injury word "heal"/);
    assert.deepEqual(copyProblems('Back pain cured.'), ['uses the injury word "pain"', 'uses the injury word "cure"']);
    assert.deepEqual(copyProblems('A rehab plan, bulletproof knees.'), ['uses the injury word "rehab"', 'uses the injury word "bulletproof"']);
  });
});

describe('equipment and gear', () => {
  test('equipment equals the exercises’ equipment', () => {
    expectOnly(problemsAfter((t) => (t.equipment = ['dumbbell', 'cable'])), /equipment is \[cable, dumbbell\], but its exercises need \[cable, dumbbell, kettlebell\]/);
    expectOnly(problemsAfter((t) => (t.equipment = ['dumbbell', 'cable', 'kettlebell', 'barbell'])), /equipment is \[.*\], but its exercises need/);
    expectOnly(problemsAfter((t) => (t.equipment = ['dumbbell', 'cable', 'kettlebell', 'bodyweight'])), /but its exercises need \[cable, dumbbell, kettlebell\]/);
  });

  test('bodyweight programs declare bodyweight', () => {
    expectOnly(problemsAfter((t) => (t.equipment = []), { from: goodBodyweight }), /equipment is \[\], but its exercises need \[bodyweight\]/);
  });

  test('never other', () => {
    expectOnly(problemsAfter((t) => (t.equipment = ['dumbbell', 'cable', 'kettlebell', 'other'])), /equipment lists 'other'/);
  });

  test('alsoNeeds equals the gear map over the exercises', () => {
    expectOnly(problemsAfter((t) => delete t.alsoNeeds), /alsoNeeds is \[\], but its exercises need \[pull_up_bar\]/);
    expectOnly(problemsAfter((t) => (t.alsoNeeds = ['pull_up_bar', 'bench'])), /alsoNeeds is \[bench, pull_up_bar\], but its exercises need \[pull_up_bar\]/);
  });
});

describe('schedules and day versions', () => {
  test('versions are all weekly or all fixed', () => {
    expectOnly(
      problemsAfter((t) => (t.otherDays = [{ daysPerWeek: 2, schedule: fixed(4, [[1, 'tpl_fixture_a'], [4, 'tpl_fixture_b']]) }])),
      /day versions mix weekly and fixed schedules/,
    );
  });

  test('no rotating schedules', () => {
    expectOnly(
      problemsAfter((t) => {
        t.schedule = { type: 'rotating', steps: [['tpl_fixture_a'], [], ['tpl_fixture_b'], [], ['tpl_fixture_c'], [], []].map((workoutIds) => ({ workoutIds })) };
        delete t.otherDays;
      }),
      /schedule \(3 days\): is rotating; starter templates are weekly or fixed/,
    );
  });

  test('durationWeeks is set exactly when fixed, and equals the weeks', () => {
    expectOnly(problemsAfter((t) => (t.durationWeeks = 8)), /durationWeeks is set, but the schedule is weekly/);
    expectOnly(problemsAfter((t) => delete t.durationWeeks, { from: goodFixed }), /durationWeeks must be set on a fixed-length program/);
    expectOnly(
      problemsAfter((t) => (t.otherDays = [{ daysPerWeek: 2, schedule: fixed(5, [[1, 'tpl_fixture_a'], [4, 'tpl_fixture_b']]) }]), { from: goodFixed }),
      /otherDays\[0\] \(2 days\): runs 5 weeks, but durationWeeks is 4/,
    );
  });

  test('every fixed week repeats week 1', () => {
    expectOnly(
      problemsAfter(
        (t) => {
          if (t.schedule.type !== 'fixed') throw new Error('fixed');
          t.schedule.days.find((d) => d.week === 3 && d.weekday === 5)!.workoutIds = ['tpl_fixture_a'];
        },
        { from: goodFixed },
      ),
      /schedule \(3 days\): week 3 doesn't repeat week 1's days/,
    );
    expectOnly(
      problemsAfter(
        (t) => {
          if (t.schedule.type !== 'fixed') throw new Error('fixed');
          t.schedule.days.push({ week: 5, weekday: 1, workoutIds: ['tpl_fixture_a'] });
        },
        { from: goodFixed },
      ),
      /has a day in week 5, outside its 4 weeks/,
    );
  });

  test('scheduled ids are workouts', () => {
    expectOnly(
      problemsAfter((t) => {
        if (t.schedule.type !== 'weekly') throw new Error('weekly');
        t.schedule.days[0].workoutIds = ['tpl_fixture_a', 'tpl_missing'];
      }),
      /schedule \(3 days\): schedules "tpl_missing", which isn't one of its workouts/,
    );
  });

  test('every workout is used by some version', () => {
    expectOnly(
      problemsAfter((t) => {
        const extra = structuredClone(t.workouts[0]);
        extra.id = 'tpl_fixture_x';
        extra.name = 'Extra';
        extra.blocks.forEach((b, i) => {
          b.id = `tpl_fixture_x_b${i}`;
          b.exercises.forEach((e, j) => (e.id = `tpl_fixture_x_b${i}_e${j}`));
        });
        t.workouts.push(extra);
      }),
      /workout "Extra": isn't scheduled in any day version/,
    );
  });

  test('days a week match the schedule', () => {
    expectOnly(problemsAfter((t) => (t.daysPerWeek = 4)), /schedule \(4 days\): says 4 days a week, but its schedule trains on 3/);
  });

  test('versions have different day counts', () => {
    expectOnly(problemsAfter((t) => (t.otherDays = [{ daysPerWeek: 3, schedule: structuredClone(t.schedule) }])), /more than one day version runs 3 days a week/);
  });

  test('programs that suit beginners run 4 days or fewer in every version', () => {
    const five = weekly([[1, 'tpl_fixture_a'], [2, 'tpl_fixture_b'], [3, 'tpl_fixture_c'], [4, 'tpl_fixture_a'], [5, 'tpl_fixture_b']]);
    expectOnly(problemsAfter((t) => (t.otherDays = [{ daysPerWeek: 5, schedule: five }])), /otherDays\[0\] \(5 days\): trains on 5 days a week; programs that suit beginners run 4 or fewer/);
    assert.deepEqual(
      problemsAfter((t) => {
        t.level = 'intermediate';
        t.levels = ['intermediate'];
        t.otherDays = [{ daysPerWeek: 5, schedule: five }];
      }),
      [],
    );
  });

  test('a weekday is listed once and has a workout', () => {
    expectOnly(
      problemsAfter((t) => {
        if (t.schedule.type !== 'weekly') throw new Error('weekly');
        t.schedule.days.push({ weekday: 1, workoutIds: ['tpl_fixture_a'] });
      }),
      /schedule \(3 days\): lists Monday more than once/,
    );
    expectOnly(
      problemsAfter((t) => {
        if (t.schedule.type !== 'weekly') throw new Error('weekly');
        t.schedule.days.push({ weekday: 7, workoutIds: [] });
      }),
      /schedule \(3 days\): has a Sunday with no workouts/,
    );
  });
});

describe('workouts', () => {
  test('ids inside a template are unique', () => {
    expectOnly(problemsAfter((t) => (t.workouts[1].blocks[0].id = 'tpl_fixture_a_b1')), /id "tpl_fixture_a_b1" is used more than once inside the template/);
  });

  test('names are 20 characters or fewer', () => {
    expectOnly(problemsAfter((t) => (t.workouts[0].name = 'A Very Long Day Name Here')), /workout "A Very Long Day Name Here": name is longer than 20 characters/);
  });

  test('names are unique', () => {
    expectOnly(problemsAfter((t) => (t.workouts[1].name = 'Day A')), /workout name "Day A" is used more than once/);
  });

  test('abbreviations are unique', () => {
    expectOnly(
      problemsAfter((t) => {
        t.workouts[0].name = 'Upper A';
        t.workouts[1].name = 'Upper Arms';
      }),
      /workouts "Upper A" and "Upper Arms" all abbreviate to "UA"/,
    );
  });

  test('estimatedMinutes equals estimateMinutes()', () => {
    expectOnly(problemsAfter((t) => (t.workouts[0].estimatedMinutes! += 5), { minutes: false }), /workout "Day A": estimatedMinutes is \d+, but estimateMinutes\(\) gives \d+/);
    expectOnly(problemsAfter((t) => delete t.workouts[0].estimatedMinutes, { minutes: false }), /estimatedMinutes is not set/);
  });

  test('minutes are between 10 and 90', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets = [warm(8), ...times(30, () => reps(8, 12))])), /workout "Day A": takes about \d+ min, outside 10-90/);
  });

  test('a workout has exercises', () => {
    expectOnly(
      problemsAfter((t) => {
        t.workouts[2].blocks = [];
        t.equipment = ['dumbbell', 'cable'];
      }),
      /workout "Day C": has no exercises/,
    );
  });

  test('exercises are in the library', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 1, 1).exerciseId = 'ex_not_there')), /Day B > block 2 > ex_not_there: exercise "ex_not_there" isn't in the library/);
  });
});

describe('blocks', () => {
  test('no warm-up blocks', () => {
    expectOnly(problemsAfter((t) => (t.workouts[1].blocks[1].type = 'warmup')), /Day B > block 2 \(warmup\): warm-up blocks are not used/);
  });

  test('a single holds 1 exercise, a superset 2, a circuit 3 or more', () => {
    expectOnly(
      problemsAfter((t) => t.workouts[1].blocks[1].exercises.push({ ...structuredClone(exercise(t, 1, 2)), id: 'tpl_fixture_b_e9' })),
      /Day B > block 2 \(single\): a single holds exactly 1 exercise, not 2/,
    );
    expectOnly(
      problemsAfter((t) => t.workouts[0].blocks[1].exercises.push({ id: 'tpl_fixture_a_e9', exerciseId: 'ex_push_up', sets: times(2, () => reps(5, 15)) })),
      /Day A > block 2 \(superset\): a superset holds exactly 2 exercises, not 3/,
    );
    expectOnly(problemsAfter((t) => t.workouts[2].blocks[0].exercises.pop()), /Day C > block 1 \(circuit\): a circuit holds 3 or more exercises, not 2/);
  });

  test('grouped blocks have a round rest', () => {
    expectOnly(problemsAfter((t) => delete t.workouts[0].blocks[1].roundRestSec), /Day A > block 2 \(superset\): needs a round rest/);
    expectOnly(problemsAfter((t) => (t.workouts[2].blocks[0].roundRestSec = 0)), /Day C > block 1 \(circuit\): needs a round rest/);
  });

  test('singles have no round or transition rest', () => {
    expectOnly(problemsAfter((t) => (t.workouts[1].blocks[0].roundRestSec = 60)), /Day B > block 1 \(single\): has a round or transition rest/);
  });

  test('grouped exercises have the same working-set count', () => {
    expectOnly(problemsAfter((t) => exercise(t, 2, 0, 1).sets.pop()), /Day C > block 1 \(circuit\): exercises have different working-set counts \(3, 2, 3\)/);
  });

  test('no warm-up sets in grouped blocks', () => {
    expectOnly(problemsAfter((t) => exercise(t, 0, 1).sets.unshift(warm(10))), /Day A > block 2 > Lateral Raise \(Dumbbell\): has warm-up sets inside a superset or circuit/);
  });
});

describe('sets', () => {
  test('at most 2 warm-ups', () => {
    expectOnly(problemsAfter((t) => exercise(t, 0, 0).sets.unshift(warm(10), warm(5))), /Day A > block 1 > Goblet Squat \(Dumbbell\): has 3 warm-up sets; at most 2/);
  });

  test('warm-ups come first', () => {
    expectOnly(
      problemsAfter((t) => {
        const sets = exercise(t, 0, 0).sets;
        sets.push(sets.shift()!);
      }),
      /Goblet Squat \(Dumbbell\) \(set 4\): warm-up sets must come before the working sets/,
    );
  });

  test('at least 1 working set', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 1, 1).sets = [warm(5)])), /Day B > block 2 > Push-Up: has no working sets/);
  });

  test('rep sets have a rep target with min no more than max', () => {
    expectOnly(problemsAfter((t) => delete exercise(t, 0, 0).sets[1].targetReps), /Goblet Squat \(Dumbbell\) \(set 2, normal\): needs a rep target in whole reps/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[1].targetReps = { min: 12, max: 8 })), /\(set 2, normal\): needs a rep target/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[0].targetReps = 0)), /\(set 1, warmup\): needs a rep target/);
    expectOnly(problemsAfter((t) => (exercise(t, 1, 1).sets[0] = { kind: 'drop', modifiers: ['to_failure'] })), /Push-Up \(set 1, drop\): needs a rep target/);
  });

  test('rep sets have no duration', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[1].targetDurationSec = 30)), /\(set 2, normal\): has a duration, but it isn't a hold/);
  });

  test('holds have a duration and no reps', () => {
    expectOnly(problemsAfter((t) => delete exercise(t, 0, 1, 1).sets[0].targetDurationSec), /Plank \(set 1, timed_hold\): a hold needs a duration in whole seconds/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 1, 1).sets[0].targetReps = 1)), /Plank \(set 1, timed_hold\): a hold has no rep target/);
  });

  test('holds only on hold exercises', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 1).sets[0] = hold(30))), /Lateral Raise \(Dumbbell\) \(set 1, timed_hold\): is a timed hold, but this exercise isn't a hold exercise/);
  });

  test('hold exercises use holds only', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 1, 1).sets[0] = reps(10, 20))), /Day A > block 2 > Plank: is a hold exercise, so every set must be a timed hold/);
  });

  test('assisted sets only on bodyweight exercises', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 1, 0).sets[0].kind = 'assisted')), /Lat Pulldown \(Cable\) \(set 1, assisted\): is assisted, but the exercise isn't a bodyweight one/);
  });

  test('tempo passes parseTempo, in its stored form', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 1, 0).sets[0].tempo = '3-1-1')), /Lat Pulldown \(Cable\) \(set 1, normal\): tempo "3-1-1" isn't valid/);
    expectOnly(problemsAfter((t) => (exercise(t, 1, 0).sets[0].tempo = '3110')), /tempo "3110" isn't valid; write it like 3-1-1-0/);
    assert.deepEqual(problemsAfter((t) => (exercise(t, 1, 0).sets[0].tempo = '2-0-X-0')), []);
  });

  test('RIR is a whole number from 0 to 5', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[1].targetRir = 6)), /\(set 2, normal\): RIR 6 must be a whole number from 0 to 5/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[1].targetRir = 1.5)), /RIR 1.5 must be a whole number/);
    assert.deepEqual(problemsAfter((t) => (exercise(t, 0, 0).sets[1].targetRir = 0)), []);
  });

  test('no rests on sets', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[1].restSec = 120)), /\(set 2, normal\): has a rest; template rests stay blank/);
  });

  test('no typed loads, warm-ups included', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[0].targetLoadKg = 20)), /\(set 1, warmup\): has a typed load/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).sets[1].targetLoadKg = 40)), /\(set 2, normal\): has a typed load/);
  });
});

describe('progression', () => {
  test('not on bodyweight exercises', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 1, 1).progression = RR5)), /Day B > block 2 > Push-Up: has a progression rule, but it's a bodyweight exercise/);
  });

  test('only on exercises with rep sets', () => {
    expectOnly(
      problemsAfter((t) => {
        t.workouts[0].blocks[1].exercises[1] = { id: 'tpl_fixture_a_e3', exerciseId: WEIGHTED_PLANK.id, sets: times(2, () => hold(30)), progression: RR5_REPEAT };
      }),
      /Day A > block 2 > Weighted Plank: has a progression rule, but no rep sets/,
    );
  });

  test('weekly % only in fixed programs, with a sane step', () => {
    expectOnly(
      problemsAfter((t) => (exercise(t, 0, 0).progression = { type: 'percent_weekly', percent: 2.5, onMiss: { type: 'repeat' } })),
      /Goblet Squat \(Dumbbell\): has a weekly % rule, which only fixed-length programs use/,
    );
    expectOnly(
      problemsAfter((t) => (exercise(t, 0, 0).progression = { type: 'percent_weekly', percent: 10, onMiss: { type: 'repeat' } }), { from: goodFixed }),
      /weekly % step 10 must be more than 0 and at most 5/,
    );
  });

  test('rep_range steps are 5 lb or 10 lb', () => {
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).progression = { ...RR5, incrementKg: 2.5 })), /rep_range step 2.5 kg must be lbToKg\(5\) or lbToKg\(10\)/);
    assert.deepEqual(problemsAfter((t) => (exercise(t, 0, 0).progression = { ...RR5, incrementKg: lbToKg(10) })), []);
  });

  test('deloads are 5-30% after 1-6 misses', () => {
    const deload = (percent: number, afterConsecutiveMisses: number) => ({ ...RR5, onMiss: { type: 'deload' as const, percent, afterConsecutiveMisses } });
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).progression = deload(40, 3))), /deload of 40% after 3 misses must be 5-30% after 1-6 misses/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).progression = deload(10, 0))), /deload of 10% after 0 misses/);
    expectOnly(problemsAfter((t) => (exercise(t, 0, 0).progression = deload(10, 7))), /deload of 10% after 7 misses/);
  });
});

describe('library names', () => {
  const entry = (name: string, aliases?: string[]): Exercise => ({ ...WEIGHTED_PLANK, id: 'ex_fixture', source: 'builtin', baseMovementId: undefined, name, aliases });

  test('brand names in exercise names and aliases are caught', () => {
    assert.deepEqual(validateLibraryNames([entry('Back Squat (Barbell)', ['Squat', 'ATG Squat'])]), ['ex_fixture: alias "ATG Squat" uses the brand name "ATG"']);
    assert.deepEqual(validateLibraryNames([entry('Tabata Squat')]), ['ex_fixture: name "Tabata Squat" uses the brand name "Tabata"']);
    assert.deepEqual(validateLibraryNames([entry('Wodka Curl', ['Batgirl Row'])]), []);
  });

  test('the built-in library is clean', () => {
    assert.deepEqual(validateLibraryNames(BUILTIN_EXERCISES), []);
  });
});
