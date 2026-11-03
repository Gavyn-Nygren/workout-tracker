import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUILTIN_EXERCISES } from '../src/data/content/exercises';
import { EXERCISE_GEAR, GEAR_LABEL, gearForExercises, gearList } from '../src/data/content/gear';
import {
  circuit,
  drop,
  estimateMinutes,
  estimateSeconds,
  ex,
  fixed,
  hold,
  isPerSide,
  ONE_SIDE,
  pct,
  RAMP_NOTE,
  rr,
  single,
  superset,
  version,
  versions,
  warmups,
  weekly,
  working,
  workout,
} from '../src/data/content/templates/helpers';
import { RETIRED_TEMPLATE_IDS, STARTER_TEMPLATES } from '../src/data/content/templates';
import { trainingDays, weekPattern } from '../src/data/schedule';
import type { PlanSchedule } from '../src/data/types';
import { lbToKg } from '../src/data/units';

const LIB = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
const sec = (...blocks: Parameters<typeof estimateSeconds>[0]) => estimateSeconds(blocks, LIB);

describe('template helpers: sets', () => {
  test('working sets: reps or a range, RIR 2 unless told otherwise, never a rest or a load', () => {
    assert.deepEqual(working(2, [8, 12]), [
      { kind: 'normal', modifiers: [], targetReps: { min: 8, max: 12 }, targetRir: 2 },
      { kind: 'normal', modifiers: [], targetReps: { min: 8, max: 12 }, targetRir: 2 },
    ]);
    assert.deepEqual(working(1, 5, { rir: null, tempo: '2-2-1-0' }), [{ kind: 'normal', modifiers: [], targetReps: 5, tempo: '2-2-1-0' }]);
    assert.deepEqual(working(1, 10, { rir: 1, modifiers: ['amrap'] }), [{ kind: 'normal', modifiers: ['amrap'], targetReps: 10, targetRir: 1 }]);
    // Each set is its own object.
    const sets = working(2, 5);
    assert.notEqual(sets[0], sets[1]);
    assert.notEqual(sets[0].modifiers, sets[1].modifiers);
  });

  test('warm-ups have falling reps and no load or effort; holds have a time only; a drop set goes to failure', () => {
    assert.deepEqual(warmups([8, 3]), [
      { kind: 'warmup', modifiers: [], targetReps: 8 },
      { kind: 'warmup', modifiers: [], targetReps: 3 },
    ]);
    assert.deepEqual(warmups([5]), [{ kind: 'warmup', modifiers: [], targetReps: 5 }]);
    assert.deepEqual(hold(2, 30), [
      { kind: 'timed_hold', modifiers: [], targetDurationSec: 30 },
      { kind: 'timed_hold', modifiers: [], targetDurationSec: 30 },
    ]);
    assert.deepEqual(drop(12), [{ kind: 'drop', modifiers: ['to_failure'], targetReps: 12 }]);
    for (const s of [...warmups([8, 3]), ...hold(1, 30), ...drop(12), ...working(1, 5)]) {
      assert.equal(s.restSec, undefined);
      assert.equal(s.targetLoadKg, undefined);
    }
  });

  test('ex() flattens set groups in order and adds no rule or notes unless asked', () => {
    const squat = ex('ex_goblet_squat', [warmups([8]), working(3, [8, 12])]);
    assert.deepEqual(
      squat.sets.map((s) => s.kind),
      ['warmup', 'normal', 'normal', 'normal'],
    );
    assert.deepEqual(Object.keys(squat).sort(), ['exerciseId', 'sets']);
    assert.deepEqual(ex('ex_plank', hold(2, 30)).sets, hold(2, 30));
  });
});

describe('template helpers: rules', () => {
  test('rr() stores the step as lbToKg; compound lifts deload 10% after 3 misses, isolation lifts repeat', () => {
    assert.deepEqual(ex('ex_back_squat', working(3, 5), { rule: rr(10) }).progression, {
      type: 'rep_range',
      incrementKg: lbToKg(10),
      onMiss: { type: 'deload', afterConsecutiveMisses: 3, percent: 10 },
    });
    assert.deepEqual(ex('ex_db_bench_press', working(3, [8, 12]), { rule: rr(5) }).progression, {
      type: 'rep_range',
      incrementKg: lbToKg(5),
      onMiss: { type: 'deload', afterConsecutiveMisses: 3, percent: 10 },
    });
    assert.deepEqual(ex('ex_lateral_raise', working(2, [10, 20]), { rule: rr(5) }).progression, {
      type: 'rep_range',
      incrementKg: lbToKg(5),
      onMiss: { type: 'repeat' },
    });
    assert.deepEqual(rr(5)('isolation').onMiss, { type: 'repeat' });
    assert.deepEqual(rr(5)('compound').onMiss, { type: 'deload', afterConsecutiveMisses: 3, percent: 10 });
  });

  test('pct() is +2.5% a week with a 10% deload after 2 misses, whatever the category', () => {
    const expected = { type: 'percent_weekly', percent: 2.5, onMiss: { type: 'deload', afterConsecutiveMisses: 2, percent: 10 } };
    assert.deepEqual(ex('ex_bench_press', working(3, [3, 5], { rir: null }), { rule: pct(2.5) }).progression, expected);
    assert.deepEqual(pct(2.5)('isolation'), expected);
  });
});

describe('template helpers: one side at a time', () => {
  test('one-side exercises get a per-side note after any other note; holds say time', () => {
    assert.equal(ex('ex_split_squat', working(3, [8, 12])).notes, 'Reps are per leg.');
    assert.equal(ex('ex_db_row', working(3, [8, 12]), { notes: 'Brace on the bench.' }).notes, 'Brace on the bench. Reps are per arm.');
    assert.equal(ex('ex_side_plank', hold(2, 30)).notes, 'Time is per side.');
    assert.equal(ex('ex_dead_bug', working(2, [8, 10])).notes, 'Reps are per side.');
    // Walking lunges count every step, and an override can turn the note on or off.
    assert.equal(ex('ex_walking_lunge_bw', working(3, [10, 16])).notes, undefined);
    assert.equal(ex('ex_db_row', working(1, 10), { side: false }).notes, undefined);
    assert.equal(ex('ex_db_snatch', working(1, 10), { side: 'arm' }).notes, 'Reps are per arm.');
    assert.equal(isPerSide('Go deep. Reps are per leg.'), true);
    assert.equal(isPerSide('5 per arm.'), false);
    assert.equal(isPerSide(undefined), false);
  });

  test('every one-side id is a built-in exercise', () => {
    for (const id of Object.keys(ONE_SIDE)) assert.ok(LIB.has(id), id);
  });
});

describe('template helpers: warm-ups', () => {
  test('a weighted lift with two warm-ups is told to raise the second one, before any other note', () => {
    assert.equal(RAMP_NOTE, 'Make the second warm-up heavier.');
    assert.equal(ex('ex_back_squat', [warmups([8, 3]), working(3, [5, 8])]).notes, RAMP_NOTE);
    assert.equal(ex('ex_push_press', [warmups([5, 3]), working(4, [3, 5])], { notes: 'Move the bar fast.' }).notes, `${RAMP_NOTE} Move the bar fast.`);
    assert.equal(ex('ex_bulgarian_split_squat', [warmups([8, 3]), working(3, [8, 12])]).notes, `${RAMP_NOTE} Reps are per leg.`);
  });

  test('one warm-up, no warm-ups or a bodyweight lift get no warm-up note', () => {
    assert.equal(ex('ex_overhead_press', [warmups([5]), working(3, [5, 8])]).notes, undefined);
    assert.equal(ex('ex_barbell_row', working(3, [6, 10])).notes, undefined);
    assert.equal(ex('ex_pull_up', [warmups([5, 3]), working(3, [5, 10])]).notes, undefined);
  });

  test('every catalog lift with two warm-ups carries the note', () => {
    let count = 0;
    for (const t of STARTER_TEMPLATES)
      for (const w of t.workouts)
        for (const b of w.blocks)
          for (const e of b.exercises) {
            if (e.sets.filter((s) => s.kind === 'warmup').length < 2) continue;
            count++;
            assert.ok(e.notes?.startsWith(RAMP_NOTE), `${t.id} ${w.name} ${e.exerciseId}`);
          }
    assert.ok(count > 0);
  });
});

describe('template helpers: time estimate', () => {
  test('straight sets: 40 s of work plus the default rest after each set', () => {
    // Compound, 2 warm-ups and 3 working sets: 5 × 40 + 2 × 60 + 3 × 180.
    assert.equal(sec(single(ex('ex_back_squat', [warmups([8, 3]), working(3, 5)]))), 860);
    // Isolation: 3 × 40 + 3 × 90.
    assert.equal(sec(single(ex('ex_leg_extension', working(3, [10, 15])))), 390);
    // A drop set is a set like any other: 3 × 40 + 3 × 90.
    assert.equal(sec(single(ex('ex_pec_deck', [working(2, [12, 15]), drop(12)]))), 390);
  });

  test('one side at a time doubles the work, for reps and holds', () => {
    // 3 × 80 + 3 × 180.
    assert.equal(sec(single(ex('ex_split_squat', working(3, [8, 12])))), 780);
    // Isolation hold per side: 2 × 60 + 2 × 90.
    assert.equal(sec(single(ex('ex_side_plank', hold(2, 30)))), 300);
    // The note decides, so turning it off counts one side: 3 × 40 + 3 × 180.
    assert.equal(sec(single(ex('ex_db_row', working(3, [8, 12]), { side: false }))), 660);
  });

  test('a hold counts its own time', () => {
    // 3 × 15 + 3 × 90.
    assert.equal(sec(single(ex('ex_l_sit', hold(3, 15)))), 315);
  });

  test('supersets: each round is both exercises plus the round rest', () => {
    // 2 rounds of (40 + 30 + 60).
    assert.equal(sec(superset(60, ex('ex_lateral_raise', working(2, [10, 20])), ex('ex_plank', hold(2, 30)))), 260);
    // Per side in a superset: 2 rounds of (60 + 80 + 60).
    assert.equal(sec(superset(60, ex('ex_side_plank', hold(2, 30)), ex('ex_bird_dog', working(2, [8, 10])))), 400);
  });

  test('circuits: work, a transition between exercises and the round rest, per round', () => {
    // 3 rounds of (40 + 80 + 40 + 2 × 15 + 120).
    const press = circuit(120, 15, ex('ex_db_thruster', working(3, 12)), ex('ex_kb_row', working(3, 10)), ex('ex_toes_to_bar', working(3, 8)));
    assert.equal(sec(press), 930);
    // 4 rounds of (4 × 40 + 3 × 10 + 90).
    const squat = circuit(90, 10, ex('ex_kb_swing', working(4, 15)), ex('ex_push_up', working(4, 10)), ex('ex_walking_lunge_bw', working(4, 20)), ex('ex_sit_up', working(4, 15)));
    assert.equal(sec(squat), 1120);
    // A round only counts the exercises that have a set in it.
    assert.equal(sec(circuit(60, 10, ex('ex_push_up', working(2, 10)), ex('ex_sit_up', working(2, 10)), ex('ex_burpee', working(1, 8)))), 2 * 60 + 3 * 40 + 2 * 10 + 2 * 40 + 10);
  });

  test('unknown exercises count as compound; a grouped block without a round rest uses the compound default', () => {
    assert.equal(sec(single(ex('ex_not_in_library', working(1, 5)))), 220);
    assert.equal(estimateSeconds([{ type: 'superset', exercises: [{ exerciseId: 'ex_plank', sets: hold(1, 30) }, { exerciseId: 'ex_crunch', sets: working(1, 10) }] }], LIB), 30 + 40 + 180);
  });

  test('minutes: plus 5, rounded to the nearest 5 (catalog workouts worked by hand)', () => {
    // Full Body A: 760 + 660 + 660 + 440 + 260 = 2780 s; 46.3 + 5 → 50.
    const fullBodyA = [
      single(ex('ex_goblet_squat', [warmups([8]), working(3, [8, 12])], { rule: rr(5) })),
      single(ex('ex_chest_press_machine', working(3, [8, 12]), { rule: rr(5) })),
      single(ex('ex_lat_pulldown', working(3, [8, 12]), { rule: rr(5) })),
      single(ex('ex_db_rdl', working(2, [10, 12]), { rule: rr(5) })),
      superset(60, ex('ex_lateral_raise', working(2, [10, 20]), { rule: rr(5) }), ex('ex_plank', hold(2, 30))),
    ];
    assert.equal(estimateSeconds(fullBodyA, LIB), 2780);
    assert.equal(estimateMinutes(fullBodyA, LIB), 50);
    // Full Body C: 780 + 660 + 780 + 440 + 360 = 3020 s; 50.3 + 5 → 55.
    const fullBodyC = [
      single(ex('ex_split_squat', working(3, [8, 12]))),
      single(ex('ex_db_bench_press', working(3, [8, 12]))),
      single(ex('ex_db_row', working(3, [8, 12]))),
      single(ex('ex_hip_thrust_db', working(2, [10, 15]))),
      superset(60, ex('ex_face_pull', working(2, [12, 15])), ex('ex_dead_bug', working(2, [8, 10]))),
    ];
    assert.equal(estimateSeconds(fullBodyC, LIB), 3020);
    assert.equal(estimateMinutes(fullBodyC, LIB), 55);
    // Calisthenics Lower A: 780 + 390 + 750 + 390 = 2310 s; 38.5 + 5 = 43.5 → 45.
    const lowerA = [
      single(ex('ex_pistol_squat', working(3, [3, 8]))),
      single(ex('ex_nordic_curl', working(3, [3, 6]))),
      superset(90, ex('ex_bulgarian_split_squat_bw', working(3, [10, 15])), ex('ex_single_leg_hip_thrust', working(3, [10, 15]))),
      single(ex('ex_calf_raise_bw', working(3, [15, 25]))),
    ];
    assert.equal(estimateSeconds(lowerA, LIB), 2310);
    assert.equal(estimateMinutes(lowerA, LIB), 45);
  });

  test('workout() sets estimatedMinutes from the built-in library', () => {
    const blocks = [single(ex('ex_back_squat', [warmups([8, 3]), working(3, 5)])), single(ex('ex_leg_extension', working(3, [10, 15])))];
    const w = workout('tw_t_a', 'Test A', blocks);
    // 860 + 390 = 1250 s; 20.8 + 5 → 25.
    assert.equal(w.estimatedMinutes, 25);
    assert.equal(w.estimatedMinutes, estimateMinutes(w.blocks, LIB));
  });
});

describe('template helpers: workouts and ids', () => {
  test('ids come from the workout id, so they are unique and prefixed per template', () => {
    const plank = ex('ex_plank', hold(2, 30));
    const w = workout('tw_fbf_a', 'Full Body A', [single(ex('ex_goblet_squat', working(3, [8, 12]))), superset(60, ex('ex_lateral_raise', working(2, [10, 20])), plank)]);
    assert.equal(w.id, 'tw_fbf_a');
    assert.equal(w.name, 'Full Body A');
    assert.deepEqual(
      w.blocks.map((b) => [b.id, b.type, b.roundRestSec, b.exercises.map((e) => e.id)]),
      [
        ['tb_fbf_a_1', 'single', undefined, ['tp_fbf_a_1_1']],
        ['tb_fbf_a_2', 'superset', 60, ['tp_fbf_a_2_1', 'tp_fbf_a_2_2']],
      ],
    );
    // Specs reused in another workout share nothing with the first.
    const other = workout('tw_fbf_b', 'Full Body B', [single(plank)]);
    assert.notEqual(other.blocks[0].exercises[0].sets, w.blocks[1].exercises[1].sets);
    assert.equal(other.blocks[0].exercises[0].id, 'tp_fbf_b_1_1');
  });

  test('circuits keep their transition; supersets have none', () => {
    const c = circuit(90, 10, ex('ex_kb_swing', working(4, 15)), ex('ex_push_up', working(4, 10)), ex('ex_sit_up', working(4, 15)));
    assert.equal(c.type, 'circuit');
    assert.equal(c.roundRestSec, 90);
    assert.equal(c.transitionRestSec, 10);
    const s = superset(90, ex('ex_push_up', working(3, 10)), ex('ex_inverted_row', working(3, 10)));
    assert.equal(s.transitionRestSec, undefined);
  });
});

describe('template helpers: schedules and versions', () => {
  const a = workout('tw_t_a', 'A', [single(ex('ex_push_up', working(1, 10)))]);
  const b = workout('tw_t_b', 'B', [single(ex('ex_bodyweight_squat', working(1, 10)))]);

  test('weekly() lists days Monday first, whatever order they were written in', () => {
    const s = weekly({ fri: a, mon: a, wed: [a, b] });
    assert.deepEqual(s, {
      type: 'weekly',
      days: [
        { weekday: 1, workoutIds: ['tw_t_a'] },
        { weekday: 3, workoutIds: ['tw_t_a', 'tw_t_b'] },
        { weekday: 5, workoutIds: ['tw_t_a'] },
      ],
    });
    assert.equal(trainingDays(s).count, 3);
  });

  test('fixed() repeats the week-1 pattern every week', () => {
    const s = fixed(8, { mon: a, thu: b });
    assert.equal(s.type, 'fixed');
    if (s.type !== 'fixed') return;
    assert.equal(s.weeks, 8);
    assert.equal(s.days.length, 16);
    const week1 = s.days.filter((d) => d.week === 1).map((d) => [d.weekday, d.workoutIds]);
    assert.deepEqual(week1, [
      [1, ['tw_t_a']],
      [4, ['tw_t_b']],
    ]);
    for (let week = 2; week <= 8; week++) {
      assert.deepEqual(
        s.days.filter((d) => d.week === week).map((d) => [d.weekday, d.workoutIds]),
        week1,
        `week ${week}`,
      );
    }
    assert.equal(trainingDays(s).count, 2);
    assert.deepEqual(weekPattern(s)[4], ['tw_t_b']);
  });

  test('versions(): the default gives daysPerWeek and schedule; the rest are otherDays', () => {
    const three: PlanSchedule = weekly({ mon: a, wed: b, fri: a });
    const two: PlanSchedule = weekly({ mon: a, thu: b });
    assert.deepEqual(version(3, three), { daysPerWeek: 3, schedule: three });
    assert.deepEqual(versions(version(3, three), version(2, two)), { daysPerWeek: 3, schedule: three, otherDays: [{ daysPerWeek: 2, schedule: two }] });
    const one = versions(version(3, three));
    assert.deepEqual(one, { daysPerWeek: 3, schedule: three });
    assert.equal('otherDays' in one, false);
  });
});

describe('gear', () => {
  test('gearList reads as a phrase, in a fixed order, each item once', () => {
    assert.equal(gearList([]), '');
    assert.equal(gearList(['bench']), 'a bench');
    assert.equal(gearList(['bench', 'rack']), 'a squat rack and a bench');
    assert.equal(gearList(['pull_up_bar', 'bench', 'rack', 'bench']), 'a squat rack, a bench and a pull-up bar');
    assert.equal(gearList(['low_bar', 'dip_bars', 'box']), 'dip bars, a box or step and a low bar or sturdy table');
  });

  test('gearForExercises is the union of the map, in order; exercises needing nothing add nothing', () => {
    assert.deepEqual(gearForExercises(['ex_pull_up', 'ex_bench_press', 'ex_back_squat', 'ex_goblet_squat']), ['rack', 'bench', 'pull_up_bar']);
    assert.deepEqual(gearForExercises(['ex_goblet_squat', 'ex_not_in_library', 'toString']), []);
    assert.deepEqual(gearForExercises(['ex_box_jump', 'ex_inverted_row', 'ex_dips']), ['dip_bars', 'box', 'low_bar']);
  });

  test('every mapped exercise is built in, lists each item once, and every label is plain', () => {
    for (const [id, gear] of Object.entries(EXERCISE_GEAR)) {
      assert.ok(LIB.has(id), id);
      assert.ok(gear.length > 0, id);
      assert.equal(new Set(gear).size, gear.length, id);
    }
    for (const label of Object.values(GEAR_LABEL)) assert.match(label, /^[a-z][a-z -]+$/, label);
  });
});

describe('starter catalog index', () => {
  test('12 programs in catalog order, none with a retired id', () => {
    assert.deepEqual(
      STARTER_TEMPLATES.map((t) => t.id),
      [
        'tpl_full_body_foundations',
        'tpl_dumbbell_full_body',
        'tpl_bodyweight_starter',
        'tpl_barbell_strength_base',
        'tpl_full_range_strength',
        'tpl_upper_lower',
        'tpl_five_day_muscle',
        'tpl_big_three_block',
        'tpl_calisthenics_strength',
        'tpl_strength_circuits',
        'tpl_athletic_base',
        'tpl_ppl',
      ],
    );
    assert.deepEqual([...RETIRED_TEMPLATE_IDS].sort(), ['tpl_atg', 'tpl_athlete', 'tpl_calisthenics', 'tpl_conditioning', 'tpl_powerbuilding']);
    for (const t of STARTER_TEMPLATES) assert.ok(!RETIRED_TEMPLATE_IDS.includes(t.id), t.id);
  });

  test('every workout carries the estimate the helper computes', () => {
    for (const t of STARTER_TEMPLATES) for (const w of t.workouts) assert.equal(w.estimatedMinutes, estimateMinutes(w.blocks, LIB), `${t.id} ${w.name}`);
  });
});
