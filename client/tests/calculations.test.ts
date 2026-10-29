import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { countsAsWorkout, countsForPRs, countsForVolume, effectiveLoadKg, setE1RM, setVolumeKg } from '../src/data/calculations';
import { deriveBadges, type BadgeInput } from '../src/data/badges';
import { builtinExercises } from '../src/data/content';
import { deriveStreak } from '../src/data/progress';
import { derivePersonalRecords, deriveRecordBests, exerciseBests } from '../src/data/records';
import type { LoggedSet, PRType, SessionExercise, SetKind, SetModifier, WorkoutSession } from '../src/data/types';
import { epley1RM, lbToKg } from '../src/data/units';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
const SQUAT = exercisesById.get('ex_back_squat')!;
const PULL_UP = exercisesById.get('ex_pull_up')!;
const PLANK = exercisesById.get('ex_plank')!;

let nextId = 0;
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], completedAt: '2026-10-01T10:00:00Z', ...patch });

const session = (day: string, exerciseId: string, sets: LoggedSet[], status: WorkoutSession['status'] = 'completed'): WorkoutSession => ({
  id: `sess_${day}_${exerciseId}_${nextId++}`,
  name: day,
  status,
  completion: 'full',
  completedDate: status === 'completed' ? day : undefined,
  completedAt: status === 'completed' ? `${day}T10:00:00Z` : undefined,
  blocks: [{ id: 'b', type: 'single', exercises: [{ id: 'e', exerciseId, skipped: false, sets }] }],
  createdAt: `${day}T09:00:00Z`,
  updatedAt: `${day}T10:00:00Z`,
});
const recordsOf = (sessions: WorkoutSession[], type?: PRType) => derivePersonalRecords(sessions, exercisesById).filter((r) => !type || r.type === type);

describe('which sets count (spec 2.7)', () => {
  const kinds: [SetKind, SetModifier[], boolean, boolean][] = [
    // kind, modifiers, volume, PRs/e1RM
    ['warmup', [], false, false],
    ['normal', [], true, true],
    ['drop', [], true, true],
    ['assisted', [], true, true],
    ['normal', ['amrap'], true, true],
    ['normal', ['to_failure'], true, true],
    ['normal', ['shortened_partials'], true, false],
    ['normal', ['lengthened_partials'], true, false],
    ['timed_hold', [], false, false],
  ];
  for (const [kind, modifiers, volume, prs] of kinds) {
    test(`${kind}${modifiers.length ? ` + ${modifiers.join(', ')}` : ''}: volume ${volume ? 'yes' : 'no'}, PRs ${prs ? 'yes' : 'no'}`, () => {
      assert.equal(countsForVolume(set({ kind, modifiers })), volume);
      assert.equal(countsForPRs(set({ kind, modifiers })), prs);
    });
  }

  test('a set that was never completed counts for nothing', () => {
    const notDone = set({ loadKg: 100, reps: 5, completedAt: undefined });
    assert.equal(countsForVolume(notDone), false);
    assert.equal(setVolumeKg(notDone, SQUAT), 0);
    assert.equal(setE1RM(notDone, SQUAT), undefined);
  });
});

describe('volume and effective load', () => {
  test('volume is reps × effective load', () => {
    assert.equal(setVolumeKg(set({ loadKg: 100, reps: 5 }), SQUAT), 500);
    assert.equal(setVolumeKg(set({ bodyweightSnapshotKg: 80, addedLoadKg: 20, reps: 10 }), PULL_UP), 1000);
    assert.equal(setVolumeKg(set({ kind: 'assisted', bodyweightSnapshotKg: 80, assistanceKg: 30, reps: 10 }), PULL_UP), 500);
  });

  test('an override is the load that counts', () => {
    assert.equal(effectiveLoadKg(set({ bodyweightSnapshotKg: 80, addedLoadKg: 20, effectiveLoadOverrideKg: 50 }), PULL_UP), 50);
    assert.equal(setVolumeKg(set({ bodyweightSnapshotKg: 80, effectiveLoadOverrideKg: 50, reps: 10 }), PULL_UP), 500);
  });

  test('warm-ups and timed holds add no volume', () => {
    assert.equal(setVolumeKg(set({ kind: 'warmup', loadKg: 60, reps: 5 }), SQUAT), 0);
    assert.equal(setVolumeKg(set({ kind: 'timed_hold', durationSec: 60 }), PLANK), 0);
  });
});

describe('estimated 1RM (Epley, 12 reps or fewer)', () => {
  test('weight × (1 + reps / 30)', () => {
    assert.ok(Math.abs(epley1RM(100, 5)! - 116.6667) < 0.001);
    assert.ok(Math.abs(epley1RM(100, 12)! - 140) < 1e-9);
  });

  test('a single is its own 1RM', () => {
    assert.equal(epley1RM(140, 1), 140);
  });

  test('more than 12 reps (or none) gives no e1RM', () => {
    assert.equal(epley1RM(100, 13), undefined);
    assert.equal(epley1RM(100, 0), undefined);
    assert.equal(setE1RM(set({ loadKg: 100, reps: 15 }), SQUAT), undefined);
  });

  test('partial-rep sets and warm-ups give no e1RM', () => {
    assert.equal(setE1RM(set({ loadKg: 100, reps: 5, modifiers: ['lengthened_partials'] }), SQUAT), undefined);
    assert.equal(setE1RM(set({ kind: 'warmup', loadKg: 100, reps: 5 }), SQUAT), undefined);
  });
});

describe('personal records (spec 2.7)', () => {
  test('a first-ever lift sets the baseline; beating it is a record', () => {
    const first = session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]);
    assert.equal(recordsOf([first]).length, 0);
    const heavier = session('2026-10-08', 'ex_back_squat', [set({ loadKg: 110, reps: 5 })]);
    const types = recordsOf([first, heavier]).map((r) => r.type).sort();
    assert.deepEqual(types, ['e1rm', 'heaviest_weight', 'volume']);
  });

  test('heaviest weight records the old best it beat', () => {
    const records = recordsOf([session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]), session('2026-10-08', 'ex_back_squat', [set({ loadKg: 105, reps: 3 })])], 'heaviest_weight');
    assert.equal(records.length, 1);
    assert.equal(records[0].value, 105);
    assert.equal(records[0].previousValue, 100);
    assert.equal(records[0].achievedDate, '2026-10-08');
  });

  test('more reps at the same weight is a reps-at-weight record', () => {
    const records = recordsOf([session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]), session('2026-10-08', 'ex_back_squat', [set({ loadKg: 100, reps: 7 })])], 'reps_at_weight');
    assert.equal(records.length, 1);
    assert.equal(records[0].value, 7);
    assert.equal(records[0].atLoadKg, 100);
  });

  test('matching a best is not a record', () => {
    const same = [session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]), session('2026-10-08', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })])];
    assert.equal(recordsOf(same).length, 0);
  });

  test('highest volume compares the exercise’s total working volume per workout', () => {
    const records = recordsOf(
      [session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 }), set({ loadKg: 100, reps: 5 })]), session('2026-10-08', 'ex_back_squat', [set({ loadKg: 90, reps: 8 }), set({ loadKg: 90, reps: 8 })])],
      'volume',
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].value, 1440);
    assert.equal(records[0].previousValue, 1000);
  });

  test('longest timed hold is its own record', () => {
    const records = recordsOf([session('2026-10-01', 'ex_plank', [set({ kind: 'timed_hold', durationSec: 60 })]), session('2026-10-08', 'ex_plank', [set({ kind: 'timed_hold', durationSec: 75 })])]);
    assert.deepEqual(records.map((r) => [r.type, r.value]), [['longest_hold', 75]]);
  });

  test('warm-ups and partial-rep sets never set records', () => {
    const records = recordsOf([
      session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]),
      session('2026-10-08', 'ex_back_squat', [set({ kind: 'warmup', loadKg: 150, reps: 5 }), set({ loadKg: 150, reps: 5, modifiers: ['shortened_partials'] })]),
    ]);
    assert.ok(!records.some((r) => r.type !== 'volume'), 'only the partials’ volume can count');
  });

  test('unfinished and skipped workouts never count', () => {
    const records = recordsOf([
      session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]),
      session('2026-10-08', 'ex_back_squat', [set({ loadKg: 200, reps: 5 })], 'in_progress'),
      session('2026-10-09', 'ex_back_squat', [], 'skipped'),
    ]);
    assert.equal(records.length, 0);
  });

  test('without a weigh-in, a bodyweight set still sets added-weight records but no e1RM or volume', () => {
    const records = recordsOf([
      session('2026-10-01', 'ex_pull_up', [set({ bodyweightSnapshotKg: 80, reps: 8 })]),
      session('2026-10-08', 'ex_pull_up', [set({ addedLoadKg: 40, reps: 8 })]),
    ]);
    assert.deepEqual(records.map((r) => [r.type, r.value, r.addedLoad]), [['heaviest_weight', 40, true]]);
  });
});

/** A workout with several entries, for exercises done twice or skipped partway. */
const multi = (day: string, entries: Partial<SessionExercise>[], patch: Partial<WorkoutSession> = {}): WorkoutSession => ({
  ...session(day, 'ex_back_squat', []),
  blocks: entries.map((e, i) => ({ id: `b${i}`, type: 'single' as const, exercises: [{ id: `e${i}`, exerciseId: 'ex_back_squat', skipped: false, sets: [], ...e }] })),
  ...patch,
});

describe('one record per type per workout (G3.6)', () => {
  test('an exercise’s first workout only sets baselines, however its sets ramp up', () => {
    const first = session('2026-10-01', 'ex_bench_press', [set({ loadKg: 60, reps: 5 }), set({ loadKg: 80, reps: 5 }), set({ loadKg: 100, reps: 5 })]);
    assert.deepEqual(recordsOf([first]), []);
  });

  test('ramping past the old best makes one record per type, measured against the best before the workout', () => {
    const before = session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]);
    const today = session('2026-10-08', 'ex_back_squat', [set({ loadKg: 102.5, reps: 5 }), set({ loadKg: 105, reps: 5 }), set({ loadKg: 107.5, reps: 5 })]);
    const heaviest = recordsOf([before, today], 'heaviest_weight');
    assert.equal(heaviest.length, 1);
    assert.equal(heaviest[0].value, 107.5);
    assert.equal(heaviest[0].previousValue, 100);
    assert.equal(heaviest[0].setId, today.blocks[0].exercises[0].sets[2].id, 'points at the set that hit it');
    assert.equal(recordsOf([before, today], 'e1rm').length, 1);
  });

  test('more reps at the same weight, set after set, is one reps record', () => {
    const before = session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]);
    const today = session('2026-10-08', 'ex_back_squat', [set({ loadKg: 100, reps: 6 }), set({ loadKg: 100, reps: 7 }), set({ loadKg: 100, reps: 8 })]);
    const reps = recordsOf([before, today], 'reps_at_weight');
    assert.deepEqual(reps.map((r) => [r.value, r.previousValue]), [[8, 5]]);
  });

  test('workouts are compared in completion order, whatever order they’re passed in', () => {
    const before = session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]);
    const after = session('2026-10-08', 'ex_back_squat', [set({ loadKg: 110, reps: 5 })]);
    assert.deepEqual(recordsOf([after, before], 'heaviest_weight').map((r) => r.value), [110]);
  });
});

describe('highest volume', () => {
  test('sums every entry of the exercise in the workout', () => {
    const before = multi('2026-10-01', [{ sets: [set({ loadKg: 100, reps: 5 }), set({ loadKg: 100, reps: 5 })] }]);
    const today = multi('2026-10-08', [{ sets: [set({ loadKg: 100, reps: 5 })] }, { sets: [set({ loadKg: 80, reps: 8 })] }]);
    assert.deepEqual(recordsOf([before, today], 'volume').map((r) => [r.value, r.previousValue]), [[1140, 1000]]);
  });

  test('leaves partial-rep sets out, all-partial workouts included', () => {
    const base = session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]);
    const mixed = session('2026-10-08', 'ex_back_squat', [set({ loadKg: 60, reps: 5 }), set({ loadKg: 100, reps: 10, modifiers: ['lengthened_partials'] })]);
    const allPartial = session('2026-10-15', 'ex_back_squat', [
      set({ loadKg: 100, reps: 10, modifiers: ['lengthened_partials'] }),
      set({ loadKg: 100, reps: 10, modifiers: ['lengthened_partials'] }),
    ]);
    assert.deepEqual(recordsOf([base, mixed, allPartial], 'volume'), []);
    assert.equal(setVolumeKg(allPartial.blocks[0].exercises[0].sets[0], SQUAT), 1000, 'partials still count as session volume');
  });
});

describe('skipping an exercise after logging some of it', () => {
  test('the sets already done still count for records', () => {
    const before = session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]);
    const today = multi('2026-10-08', [{ skipped: true, sets: [set({ loadKg: 110, reps: 5 }), set({ loadKg: 110, reps: 5, completedAt: undefined })] }]);
    assert.equal(recordsOf([before, today], 'heaviest_weight').length, 1);
  });
});

describe('bodyweight lifts (G3.6 decision)', () => {
  test('a weigh-in alone never makes a heaviest-weight or reps record', () => {
    const records = recordsOf([
      session('2026-10-01', 'ex_pull_up', [set({ bodyweightSnapshotKg: 80, addedLoadKg: 10, reps: 8 })]),
      session('2026-10-08', 'ex_pull_up', [set({ bodyweightSnapshotKg: 80.5, addedLoadKg: 10, reps: 8 })]),
    ]);
    assert.ok(!records.some((r) => r.type === 'heaviest_weight' || r.type === 'reps_at_weight'));
  });

  test('more added weight is a heaviest-weight record, even at a lower bodyweight', () => {
    const records = recordsOf(
      [
        session('2026-10-01', 'ex_pull_up', [set({ bodyweightSnapshotKg: 80, addedLoadKg: 10, reps: 8 })]),
        session('2026-10-08', 'ex_pull_up', [set({ bodyweightSnapshotKg: 77, addedLoadKg: 12.5, reps: 8 })]),
      ],
      'heaviest_weight',
    );
    assert.deepEqual(records.map((r) => [r.value, r.previousValue, r.addedLoad]), [[12.5, 10, true]]);
  });

  test('less assistance is heavier', () => {
    const assisted = [...exercisesById.values()].find((e) => e.isAssisted);
    assert.ok(assisted, 'the library has an assisted machine');
    const records = recordsOf(
      [
        session('2026-10-01', assisted.id, [set({ kind: 'assisted', bodyweightSnapshotKg: 80, assistanceKg: 30, reps: 8 })]),
        session('2026-10-08', assisted.id, [set({ kind: 'assisted', bodyweightSnapshotKg: 80, assistanceKg: 20, reps: 8 })]),
      ],
      'heaviest_weight',
    );
    assert.deepEqual(records.map((r) => [r.value, r.previousValue]), [[-20, -30]]);
  });

  test('more reps with no added weight is a reps record at bodyweight', () => {
    const records = recordsOf(
      [session('2026-10-01', 'ex_pull_up', [set({ bodyweightSnapshotKg: 80, reps: 8 })]), session('2026-10-08', 'ex_pull_up', [set({ bodyweightSnapshotKg: 79.5, reps: 10 })])],
      'reps_at_weight',
    );
    assert.deepEqual(records.map((r) => [r.value, r.atLoadKg, r.addedLoad]), [[10, 0, true]]);
  });
});

describe('effective load edge cases', () => {
  test('a leftover counted-load override doesn’t change a plain-weight set', () => {
    assert.equal(effectiveLoadKg(set({ loadKg: 50, effectiveLoadOverrideKg: 120 }), SQUAT), 50);
  });

  test('only the field for the set’s kind counts', () => {
    assert.equal(effectiveLoadKg(set({ bodyweightSnapshotKg: 80, assistanceKg: 30 }), PULL_UP), 80, 'normal set ignores old assistance');
    assert.equal(effectiveLoadKg(set({ kind: 'assisted', bodyweightSnapshotKg: 80, addedLoadKg: 20, assistanceKg: 30 }), PULL_UP), 50, 'assisted set ignores old added load');
  });

  test('assistance above bodyweight counts as zero, never negative', () => {
    const s = set({ kind: 'assisted', bodyweightSnapshotKg: 50, assistanceKg: 60, reps: 10 });
    assert.equal(effectiveLoadKg(s, PULL_UP), 0);
    assert.equal(setVolumeKg(s, PULL_UP), 0);
  });

  test('sets are read by what was logged, so changing an exercise’s bodyweight setting doesn’t rewrite them', () => {
    assert.equal(effectiveLoadKg(set({ loadKg: 60, reps: 5 }), { ...SQUAT, isBodyweight: true }), 60);
    assert.equal(effectiveLoadKg(set({ bodyweightSnapshotKg: 80, addedLoadKg: 10 }), { ...PULL_UP, isBodyweight: false }), 90);
  });

  test('a bodyweight set logged with no weigh-in and nothing added keeps its records when the setting is turned off', () => {
    const custom = { ...PULL_UP, id: 'custom_dip', isCustom: true };
    const sessions = [session('2026-10-01', custom.id, [set({ reps: 10 })]), session('2026-10-08', custom.id, [set({ reps: 12 })])];
    for (const isBodyweight of [true, false]) {
      const byId = new Map([...exercisesById, [custom.id, { ...custom, isBodyweight }]]);
      assert.deepEqual(derivePersonalRecords(sessions, byId).map((r) => [r.type, r.value, r.addedLoad]), [['reps_at_weight', 12, true]], `isBodyweight ${isBodyweight}`);
    }
  });
});

describe('kg and lb rounding', () => {
  test('the same weight in the other unit over many reps isn’t a volume record', () => {
    const tens = (kg: number) => Array.from({ length: 5 }, () => set({ loadKg: kg, reps: 10 }));
    const records = recordsOf([session('2026-10-01', 'ex_back_squat', tens(100)), session('2026-10-08', 'ex_back_squat', tens(lbToKg(220.5)))], 'volume');
    assert.deepEqual(records, []);
  });

  test('the same weight entered in the other unit is not a record, and shares the reps bucket', () => {
    const records = recordsOf([
      session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]),
      session('2026-10-08', 'ex_back_squat', [set({ loadKg: lbToKg(220.5), reps: 6 })]),
    ]);
    assert.ok(!records.some((r) => r.type === 'heaviest_weight'));
    assert.deepEqual(records.filter((r) => r.type === 'reps_at_weight').map((r) => [r.value, r.previousValue]), [[6, 5]]);
  });
});

describe('changing a custom exercise’s “Counts bodyweight” after logging (G3.6 review)', () => {
  test('total-weight and added-weight bests are kept apart, both ways', () => {
    const custom = { ...SQUAT, id: 'custom_x', isCustom: true };
    const byId = new Map([...exercisesById, [custom.id, custom]]);
    const recordsFor = (sessions: WorkoutSession[]) => derivePersonalRecords(sessions, byId).filter((r) => r.type === 'heaviest_weight');
    const weighted = session('2026-10-01', custom.id, [set({ loadKg: 100, reps: 5 })]);
    const added = (day: string, kg: number) => session(day, custom.id, [set({ bodyweightSnapshotKg: 80, addedLoadKg: kg, reps: 5 })]);
    // Turned on after logging 100 kg: added weight is compared with added weight only.
    assert.deepEqual(recordsFor([weighted, added('2026-10-08', 30), added('2026-10-15', 40)]).map((r) => [r.value, r.previousValue, r.addedLoad]), [[40, 30, true]]);
    // Turned off after logging +10: 20 kg isn't a record over "+10".
    assert.deepEqual(recordsFor([added('2026-10-01', 10), session('2026-10-08', custom.id, [set({ loadKg: 20, reps: 5 })])]), []);
    // The history card reads bests the way the exercise counts now.
    const bests = deriveRecordBests([weighted, added('2026-10-08', 30)], byId);
    assert.equal(exerciseBests(bests, { ...custom, isBodyweight: true }).heaviest_weight?.value, 30);
    assert.equal(exerciseBests(bests, custom).heaviest_weight?.value, 100);
  });
});

describe('all-time bests (exercise history)', () => {
  test('include a best from the first workout that was never beaten', () => {
    const bests = deriveRecordBests(
      [session('2026-10-01', 'ex_back_squat', [set({ loadKg: 100, reps: 5 })]), session('2026-10-08', 'ex_back_squat', [set({ loadKg: 95, reps: 5 })])],
      exercisesById,
    );
    const squat = exerciseBests(bests, SQUAT);
    assert.equal(squat.heaviest_weight?.value, 100);
    assert.equal(squat.heaviest_weight?.achievedDate, '2026-10-01');
    assert.equal(squat.volume?.value, 500);
  });
});

// Weeks start on Monday: 2026-09-07, 09-14, 09-21, 09-28, 10-05, 10-12, 10-19, 10-26.
const workout = (day: string, sets: LoggedSet[] = [set({ loadKg: 100, reps: 5 })], patch: Partial<WorkoutSession> = {}): WorkoutSession => ({
  ...session(day, 'ex_back_squat', sets),
  ...patch,
});

describe('which workouts count toward the streak (spec 2.5)', () => {
  test('a partial workout needs a completed working set', () => {
    const warmupOnly = workout('2026-10-26', [set({ kind: 'warmup', loadKg: 60, reps: 5 }), set({ loadKg: 100, reps: 5, completedAt: undefined })], { completion: 'partial' });
    const oneWorkingSet = workout('2026-10-26', [set({ loadKg: 100, reps: 5 }), set({ loadKg: 100, reps: 5, completedAt: undefined })], { completion: 'partial' });
    const holdOnly = workout('2026-10-26', [set({ kind: 'timed_hold', durationSec: 60 })]);
    assert.equal(countsAsWorkout(warmupOnly), false);
    assert.equal(countsAsWorkout(oneWorkingSet), true);
    assert.equal(countsAsWorkout(holdOnly), true, 'a plank-only workout is still a workout');
    assert.equal(deriveStreak([warmupOnly], '2026-10-27', 1).thisWeekCompleted, 0);
    assert.equal(deriveStreak([oneWorkingSet], '2026-10-27', 1).thisWeekCompleted, 1);
  });

  test('an unmet current week doesn’t break the streak until it ends', () => {
    const sessions = ['2026-10-12', '2026-10-19'].map((d) => workout(d));
    assert.equal(deriveStreak(sessions, '2026-10-25', 1).currentWeeks, 2, 'Sunday: last week still counts');
    assert.equal(deriveStreak(sessions, '2026-10-26', 1).currentWeeks, 2, 'Monday: this week isn’t done yet');
    assert.equal(deriveStreak(sessions, '2026-11-02', 1).currentWeeks, 0, 'a whole week missed');
  });
});

describe('longest weekly streak record (spec 2.7)', () => {
  // 2 weeks, a missed week, then 3 weeks: the second streak beats the first.
  const sessions = ['2026-09-07', '2026-09-14', '2026-09-28', '2026-10-05', '2026-10-12'].map((d) => workout(d));

  test('the first streak is the baseline; a longer one later is a record', () => {
    const streak = deriveStreak(sessions, '2026-10-14', 1);
    assert.equal(streak.longestWeeks, 3);
    assert.equal(streak.currentWeeks, 3);
    assert.deepEqual(streak.records.map((r) => [r.weeks, r.previousWeeks, r.achievedDate]), [[3, 2, '2026-10-12']]);
    assert.equal(streak.records[0].sessionId, sessions[4].id);
    assert.deepEqual(streak.milestoneDates, ['2026-09-07', '2026-09-14', '2026-10-12']);
  });

  test('the record grows with the streak instead of repeating', () => {
    const streak = deriveStreak([...sessions, workout('2026-10-19')], '2026-10-20', 1);
    assert.deepEqual(streak.records.map((r) => [r.weeks, r.previousWeeks, r.achievedDate]), [[4, 2, '2026-10-19']]);
  });

  test('a week is met by the workout that reached the target', () => {
    const week = [workout('2026-09-07'), workout('2026-09-09'), workout('2026-09-10')];
    assert.deepEqual(deriveStreak(week, '2026-09-11', 2).milestoneDates, ['2026-09-09']);
  });

  test('deleting the workout that set it removes the record', () => {
    assert.deepEqual(deriveStreak(sessions.slice(0, 4), '2026-10-14', 1).records, []);
  });
});

describe('badges (recalculated on read)', () => {
  const fourWeeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((d) => workout(d));
  /** Badges from these workouts, with a target of 1 a week. */
  const badgesOf = (sessions: WorkoutSession[], today: string) => {
    const input: BadgeInput = {
      sessions,
      exercisesById,
      formReports: [],
      records: [],
      streak: deriveStreak(sessions, today, 1),
      occurrences: [],
      plans: [],
      bodyweight: [],
      units: 'imperial',
      weekStartsOn: 1,
      today,
    };
    return deriveBadges(input);
  };

  test('the 4-week streak badge is dated when the streak first reached 4 weeks, and stays there', () => {
    const badge = badgesOf([...fourWeeks, workout('2026-10-20')], '2026-10-26').find((b) => b.badgeKey === 'streak_4_weeks');
    assert.equal(badge?.earnedDate, '2026-09-28');
  });

  test('a warm-up-only workout doesn’t earn “first workout”', () => {
    const warmupOnly = workout('2026-10-26', [set({ kind: 'warmup', loadKg: 60, reps: 5 })], { completion: 'partial' });
    assert.ok(!badgesOf([warmupOnly], '2026-10-26').some((b) => b.badgeKey === 'first_workout'));
  });
});
