// The starter catalog as shipped (G3.13): the validator finds no problems in it, it covers what
// the plan promises, every program has a review entry, and every day version of every program
// copies into a plan that schedules, and builds sessions, the way the app will run it.
// tests/templateValidator.test.ts checks each validator rule on its own bad fixture.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises, starterTemplates } from '../src/data/content';
import { BUILTIN_EXERCISES } from '../src/data/content/exercises';
import { gearForSchedule } from '../src/data/content/gear';
import { RETIRED_TEMPLATE_IDS, STARTER_TEMPLATES } from '../src/data/content/templates';
import { TEMPLATE_REVIEW } from '../src/data/content/templates/review';
import { copyProblems, validateLibraryNames, validateTemplates } from '../src/data/content/validateTemplates';
import { defaultRounding } from '../src/data/preferences';
import { scheduleOccurrences, trainingDays } from '../src/data/schedule';
import type { Exercise, StarterTemplate, TemplateDayOption, UnitSystem } from '../src/data/types';
import { CATEGORY_LABEL } from '../src/features/plans/describe';
import { planFromTemplate, templateDayOptions } from '../src/features/plans/planEdits';
import { sessionFromPlan } from '../src/features/workout/buildSession';

const LIBRARY = new Map<string, Exercise>(BUILTIN_EXERCISES.map((e) => [e.id, e]));
/** A Monday. */
const MONDAY = '2026-11-02';
const TWO_WEEKS_LATER = '2026-11-15';

const exercisesIn = (t: StarterTemplate) => t.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises));
const versionsOf = (t: StarterTemplate): TemplateDayOption[] => [{ daysPerWeek: t.daysPerWeek, schedule: t.schedule }, ...(t.otherDays ?? [])];

describe('starter catalog: validation', () => {
  test('the validator finds no problems in the catalog', () => {
    assert.deepEqual(validateTemplates(STARTER_TEMPLATES, BUILTIN_EXERCISES), []);
  });

  test('no library name or alias uses a brand name', () => {
    assert.deepEqual(validateLibraryNames(BUILTIN_EXERCISES), []);
  });

  test('the app serves this catalog and this library', () => {
    assert.equal(starterTemplates, STARTER_TEMPLATES);
    assert.equal(builtinExercises, BUILTIN_EXERCISES);
  });
});

describe('starter catalog: coverage', () => {
  test('12 programs', () => {
    assert.equal(STARTER_TEMPLATES.length, 12);
  });

  test('every one of the 7 styles has a program', () => {
    const styles = Object.keys(CATEGORY_LABEL).sort();
    assert.equal(styles.length, 7);
    assert.deepEqual([...new Set(STARTER_TEMPLATES.map((t) => t.category))].sort(), styles);
  });

  test('weekly and fixed-length programs, and no rotating ones', () => {
    const types = new Set(STARTER_TEMPLATES.flatMap((t) => versionsOf(t).map((o) => o.schedule.type)));
    assert.ok(types.has('weekly'));
    assert.ok(types.has('fixed'));
    assert.ok(!types.has('rotating'));
  });

  test('a beginner program of 8 to 12 weeks, so beginners can earn Program Complete', () => {
    const fixed = STARTER_TEMPLATES.filter((t) => t.level === 'beginner' && t.schedule.type === 'fixed' && t.durationWeeks !== undefined && t.durationWeeks >= 8 && t.durationWeeks <= 12);
    assert.ok(fixed.length >= 1, 'no beginner fixed program of 8-12 weeks');
  });

  test('a program made for advanced lifters', () => {
    assert.ok(STARTER_TEMPLATES.some((t) => t.level === 'advanced'));
  });

  test('every program has at least one form-analysis exercise (spec 2.8)', () => {
    for (const t of STARTER_TEMPLATES) {
      assert.ok(
        exercisesIn(t).some((e) => LIBRARY.get(e.exerciseId)?.formAnalysis),
        `${t.id} has no form-analysis exercise`,
      );
    }
  });

  test('2, 3, 4, 5 and 6 days a week are all covered', () => {
    const days = new Set(STARTER_TEMPLATES.flatMap((t) => versionsOf(t).map((o) => o.daysPerWeek)));
    for (const d of [2, 3, 4, 5, 6]) assert.ok(days.has(d), `no program runs ${d} days a week`);
  });
});

describe('starter catalog: gear by day version', () => {
  test("each version's gear is part of alsoNeeds, and the versions together need all of it", () => {
    for (const t of STARTER_TEMPLATES) {
      const all = new Set<string>();
      for (const o of versionsOf(t)) {
        const gear = gearForSchedule(t.workouts, o.schedule);
        for (const g of gear) assert.ok((t.alsoNeeds ?? []).includes(g), `${t.id} ${o.daysPerWeek} days: ${g}`);
        gear.forEach((g) => all.add(g));
      }
      assert.deepEqual([...all].sort(), [...(t.alsoNeeds ?? [])].sort(), t.id);
    }
  });

  test('a version that drops a workout can need less: the program page and onboarding show that', () => {
    const byId = new Map(STARTER_TEMPLATES.map((t) => [t.id, t]));
    const gearAt = (id: string, days: number) => {
      const t = byId.get(id)!;
      return gearForSchedule(t.workouts, versionsOf(t).find((o) => o.daysPerWeek === days)!.schedule);
    };
    assert.deepEqual(gearAt('tpl_full_body_foundations', 3), ['bench']);
    assert.deepEqual(gearAt('tpl_full_body_foundations', 2), []);
    assert.deepEqual(gearAt('tpl_full_range_strength', 3), ['bench', 'box']);
    assert.deepEqual(gearAt('tpl_full_range_strength', 2), ['bench']);
  });
});

describe('starter catalog: coaching rules', () => {
  const repRange = (set: { targetReps?: number | { min: number; max: number } }) =>
    typeof set.targetReps === 'object' ? set.targetReps : undefined;

  test('every dumbbell lift with a rep-range rule spans at least 4 reps, since the next dumbbell is a big jump', () => {
    for (const t of STARTER_TEMPLATES)
      for (const e of exercisesIn(t)) {
        if (LIBRARY.get(e.exerciseId)?.equipment !== 'dumbbell' || e.progression?.type !== 'rep_range') continue;
        for (const s of e.sets.filter((x) => x.kind === 'normal')) {
          const range = repRange(s);
          assert.ok(range && range.max - range.min >= 4, `${t.id} ${e.exerciseId} ${JSON.stringify(s.targetReps)}`);
        }
      }
  });

  test('in beginner programs, light dumbbell presses, lunges, split squats and step-ups run to 15 reps', () => {
    const light = new Set(['ex_db_shoulder_press', 'ex_reverse_lunge', 'ex_split_squat', 'ex_bulgarian_split_squat', 'ex_step_up']);
    let count = 0;
    for (const t of STARTER_TEMPLATES.filter((x) => x.level === 'beginner'))
      for (const e of exercisesIn(t).filter((x) => light.has(x.exerciseId)))
        for (const s of e.sets.filter((x) => x.kind === 'normal')) {
          count++;
          assert.equal(repRange(s)?.max, 15, `${t.id} ${e.exerciseId}`);
        }
    assert.ok(count > 0);
  });

  test('a program with no machines never points to one', () => {
    for (const t of STARTER_TEMPLATES.filter((x) => !x.equipment.includes('machine')))
      for (const e of exercisesIn(t)) assert.ok(!/\bmachine\b/i.test(e.notes ?? ''), `${t.id} ${e.exerciseId}: ${e.notes}`);
  });

  test('no note asks for a shorter round rest, which a plan cannot save yet', () => {
    for (const t of STARTER_TEMPLATES) for (const e of exercisesIn(t)) assert.ok(!/round rest/i.test(e.notes ?? ''), `${t.id} ${e.exerciseId}: ${e.notes}`);
  });
});

describe('starter catalog: ids and review', () => {
  test('no retired template id comes back', () => {
    for (const t of STARTER_TEMPLATES) assert.ok(!RETIRED_TEMPLATE_IDS.includes(t.id), `${t.id} is retired`);
  });

  test('every program has a review entry, and nothing else does', () => {
    assert.deepEqual(Object.keys(TEMPLATE_REVIEW), STARTER_TEMPLATES.map((t) => t.id));
  });

  test('review entries have a known status and plain notes', () => {
    for (const [id, review] of Object.entries(TEMPLATE_REVIEW)) {
      assert.ok(['draft', 'approved', 'changes'].includes(review.status), `${id}: ${review.status}`);
      assert.ok(review.notes.length > 0, `${id} has no review notes`);
      for (const note of review.notes) assert.deepEqual(copyProblems(note), [], `${id}: ${note}`);
    }
  });
});

describe('starter catalog: every day version runs', () => {
  for (const t of STARTER_TEMPLATES) {
    for (const option of templateDayOptions(t)) {
      test(`${t.name}, ${option.daysPerWeek} days a week`, () => {
        const plan = planFromTemplate(t, MONDAY, { daysPerWeek: option.daysPerWeek });
        assert.equal(trainingDays(plan.schedule).count, option.daysPerWeek, 'training days');

        const occurrences = scheduleOccurrences(plan, MONDAY, TWO_WEEKS_LATER);
        assert.equal(occurrences.length, 2 * option.daysPerWeek, 'workouts over two weeks');
        const byId = new Map(plan.workouts.map((w) => [w.id, w]));
        for (const o of occurrences) assert.ok(byId.has(o.planWorkoutId), `${o.scheduledDate}: ${o.planWorkoutId} isn't a workout of the plan`);
        // Only the version's workouts are copied, so each one is on the calendar.
        assert.deepEqual(new Set(occurrences.map((o) => o.planWorkoutId)), new Set(byId.keys()), 'every copied workout is scheduled');

        for (const units of ['imperial', 'metric'] as UnitSystem[]) {
          const preferences = { units, roundingIncrements: { ...defaultRounding[units] }, weekStartsOn: 1 as const };
          for (const workout of plan.workouts) {
            const occurrence = occurrences.find((o) => o.planWorkoutId === workout.id);
            const session = sessionFromPlan({
              item: { key: `${workout.id}-${units}`, date: occurrence?.scheduledDate ?? MONDAY, name: workout.name, status: 'planned', plan, workout, occurrence },
              history: [],
              exercisesById: LIBRARY,
              preferences,
              today: occurrence?.scheduledDate ?? MONDAY,
            });
            const planned = workout.blocks.flatMap((b) => b.exercises);
            const entries = session.blocks.flatMap((b) => b.exercises);
            assert.equal(entries.length, planned.length, `${workout.name}: entries`);
            entries.forEach((entry, i) => {
              const where = `${workout.name} > ${LIBRARY.get(entry.exerciseId)?.name ?? entry.exerciseId} (${units})`;
              assert.equal(entry.sets.length, planned[i].sets.length, `${where}: sets`);
              for (const set of entry.sets) {
                if (set.kind === 'warmup') {
                  assert.equal(set.target?.targetLoadKg, undefined, `${where}: a warm-up has a typed load`);
                  assert.equal(set.loadKg ?? set.addedLoadKg ?? set.assistanceKg, undefined, `${where}: a warm-up starts with a load`);
                } else if (set.kind === 'timed_hold') {
                  assert.ok((set.durationSec ?? 0) > 0, `${where}: a hold has no duration`);
                } else {
                  assert.ok((set.reps ?? 0) > 0, `${where}: a ${set.kind} set has no reps`);
                }
                assert.equal(set.restSec, undefined, `${where}: a set carries a rest`);
                assert.equal(set.target?.restSec, undefined, `${where}: a planned set carries a rest`);
              }
            });
          }
        }
      });
    }
  }
});
