import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { badgeProgress, type BadgeInput } from '../src/data/badges';
import { builtinExercises } from '../src/data/content';
import { derivePersonalRecords, deriveRecordBests, exerciseBests } from '../src/data/records';
import type { LoggedSet, PersonalRecord, SessionExercise, StreakRecord, WorkoutSession } from '../src/data/types';
import { lbToKg } from '../src/data/units';
import { buildWins } from '../src/features/home/wins';
import { exerciseSeries } from '../src/features/progress/series';
import { workoutsCsv } from '../src/features/settings/exportData';
import { buildSummary } from '../src/features/summary/summarize';
import { summarizeSession } from '../src/features/today/agenda';
import { sessionLines } from '../src/features/today/cardLines';
import { formatAddedLoad, spokenAddedLoad } from '../src/lib/format';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));
const nameOf = (id: string) => exercisesById.get(id)!.name;

let nextId = 0;
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], completedAt: '2026-10-01T10:00:00Z', ...patch });
const entry = (exerciseId: string, sets: LoggedSet[], skipped = false): SessionExercise => ({ id: `entry${nextId++}`, exerciseId, skipped, sets });
const session = (day: string, exercises: SessionExercise[], patch: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: `sess_${day}_${nextId++}`,
  name: 'Lower',
  status: 'completed',
  completion: 'full',
  completedDate: day,
  startedAt: `${day}T09:00:00Z`,
  completedAt: `${day}T10:00:00Z`,
  blocks: [{ id: 'b', type: 'single', exercises }],
  createdAt: `${day}T09:00:00Z`,
  updatedAt: `${day}T10:00:00Z`,
  ...patch,
});

describe('workout summary', () => {
  test('sets done before an exercise was skipped count for volume and its best set', () => {
    const workout = session(
      '2026-10-08',
      [
        entry('ex_back_squat', [set({ loadKg: 100, reps: 5 }), set({ loadKg: 100, reps: 5 })]),
        entry('ex_bench_press', [set({ loadKg: 60, reps: 8 }), set({ loadKg: 60, reps: 8, completedAt: undefined })], true),
      ],
      { completion: 'partial' },
    );
    const summary = buildSummary(workout, [workout], exercisesById);
    assert.equal(summary.volumeKg, 1000 + 480);
    const bench = summary.exercises[1];
    assert.equal(bench.skipped, true);
    assert.deepEqual(bench.best, { kind: 'load', loadKg: 60, reps: 8 });
    // Skipping skips what's left: the pending set isn't owed.
    assert.deepEqual([bench.setsDone, bench.setsTotal], [1, 1]);
    assert.deepEqual([summary.setsDone, summary.setsTotal], [3, 3]);
  });

  test('the sets count leaves out warm-ups', () => {
    const workout = session('2026-10-08', [
      entry('ex_back_squat', [set({ kind: 'warmup', loadKg: 60, reps: 5 }), set({ loadKg: 100, reps: 5 }), set({ loadKg: 100, reps: 5, completedAt: undefined })]),
    ]);
    const summary = buildSummary(workout, [workout], exercisesById);
    assert.deepEqual([summary.setsDone, summary.setsTotal], [1, 2]);
    assert.deepEqual([summary.exercises[0].setsDone, summary.exercises[0].setsTotal], [1, 2]);
    assert.equal(summary.volumeKg, 500);
  });

  test('an assisted best set is the one with the least assistance, and less assistance is an increase', () => {
    const assisted = (assistanceKg: number, reps: number) => set({ kind: 'assisted', assistanceKg, bodyweightSnapshotKg: 80, reps });
    const before = session('2026-10-01', [entry('ex_assisted_pull_up', [assisted(40, 8)])]);
    const workout = session('2026-10-08', [entry('ex_assisted_pull_up', [assisted(40, 8), assisted(30, 6), assisted(30, 8)])]);
    const summary = buildSummary(workout, [before, workout], exercisesById);
    const pullUp = summary.exercises[0];
    assert.deepEqual(pullUp.best, { kind: 'bodyweight', addedKg: -30, reps: 8 });
    assert.deepEqual(pullUp.delta, { amount: 10, kind: 'bodyweight' });
  });

  test('ramping up to a new best makes one record per type, compared with the best before the workout', () => {
    const first = session('2026-10-01', [entry('ex_back_squat', [set({ loadKg: 100, reps: 5 })])]);
    const ramp = session('2026-10-08', [entry('ex_back_squat', [set({ loadKg: 105, reps: 5 }), set({ loadKg: 110, reps: 5 }), set({ loadKg: 115, reps: 5 })])]);
    const summary = buildSummary(ramp, [first, ramp], exercisesById);
    assert.deepEqual(summary.records.map((r) => r.type).sort(), ['e1rm', 'heaviest_weight', 'volume']);
    const heaviest = summary.records.find((r) => r.type === 'heaviest_weight')!;
    assert.deepEqual([heaviest.value, heaviest.previousValue], [115, 100]);
    assert.deepEqual(summary.exercises[0].prTypes.sort(), ['e1rm', 'heaviest_weight', 'volume']);
  });
});

describe("Today card's workout stats", () => {
  const first = session('2026-10-01', [entry('ex_back_squat', [set({ loadKg: 100, reps: 5 })])]);
  const workout = session(
    '2026-10-08',
    [
      entry('ex_back_squat', [set({ loadKg: 105, reps: 5 }), set({ loadKg: 110, reps: 5 })]),
      entry('ex_bench_press', [set({ loadKg: 60, reps: 8 })], true),
      entry('ex_barbell_row', [set({ loadKg: 60, reps: 8, completedAt: undefined })], true),
      entry('ex_deadlift', [set({ loadKg: 140, reps: 5, completedAt: undefined })]),
    ],
    { completion: 'partial' },
  );
  const records = derivePersonalRecords([first, workout], exercisesById);
  const stats = summarizeSession(workout, exercisesById, records);

  test('an exercise is done once it has a completed set, even if skipped afterwards', () => {
    assert.deepEqual([stats.exercisesDone, stats.exercisesTotal], [2, 4]);
  });

  test('the PR count is the number of records, not the number of sets that set them', () => {
    const own = records.filter((r) => r.sessionId === workout.id);
    assert.ok(new Set(own.map((r) => r.setId)).size < own.length);
    assert.equal(stats.prCount, own.length);
  });

  test('volume comes from completed sets only', () => {
    assert.equal(stats.volumeKg, 525 + 550 + 480);
  });
});

describe("Today card's exercise lines", () => {
  test('pre-filled sets that were never logged and warm-ups are left out', () => {
    const lines = sessionLines(
      [
        entry('ex_back_squat', [set({ kind: 'warmup', loadKg: 60, reps: 5 }), set({ loadKg: 100, reps: 5 }), set({ loadKg: 140, reps: 5, completedAt: undefined })]),
        entry('ex_bench_press', [set({ loadKg: 60, reps: 8, completedAt: undefined }), set({ loadKg: 60, reps: 8, completedAt: undefined })]),
        entry('ex_assisted_pull_up', [set({ kind: 'assisted', assistanceKg: 30, bodyweightSnapshotKg: 80, reps: 8 })]),
        entry('ex_plank', [set({ kind: 'timed_hold', durationSec: 60 }), set({ kind: 'timed_hold', durationSec: 90, completedAt: undefined })]),
        entry('ex_barbell_row', [set({ loadKg: 60, reps: 8 })], true),
        entry('ex_deadlift', [], true),
      ],
      exercisesById,
      'metric',
    );
    assert.deepEqual(
      lines.map((l) => [l.detail, Boolean(l.muted)]),
      [
        ['1 set · 100 kg × 5', false],
        ['Not logged', true],
        ['1 set · −30 kg × 8', false],
        ['1 × 60 s', false],
        ['Skipped · 1 set · 60 kg × 8', true],
        ['Skipped', true],
      ],
    );
    assert.equal(lines[2].spokenDetail, '1 set, best 30 kilograms of assistance for 8 reps');
  });

  test('the top set matches the summary’s best set', () => {
    const workout = session('2026-10-08', [entry('ex_back_squat', [set({ loadKg: 100, reps: 3 }), set({ loadKg: 100, reps: 5 }), set({ loadKg: 90, reps: 8 })])]);
    const [line] = sessionLines(workout.blocks[0].exercises, exercisesById, 'metric');
    const { best } = buildSummary(workout, [workout], exercisesById).exercises[0];
    assert.deepEqual(best, { kind: 'load', loadKg: 100, reps: 5 });
    assert.equal(line.detail, '3 sets · 100 kg × 5');
  });
});

describe('volume agrees everywhere', () => {
  test('summary, Today card, and graph volume match for one workout', () => {
    const workout = session(
      '2026-10-08',
      [
        entry('ex_back_squat', [set({ kind: 'warmup', loadKg: 60, reps: 5 }), set({ loadKg: 100, reps: 5 }), set({ loadKg: 80, reps: 10, modifiers: ['shortened_partials'] })]),
        entry('ex_bench_press', [set({ loadKg: 60, reps: 8 }), set({ loadKg: 60, reps: 8, completedAt: undefined })], true),
        entry('ex_pull_up', [set({ bodyweightSnapshotKg: 80, addedLoadKg: 10, reps: 6 })]),
        entry('ex_plank', [set({ kind: 'timed_hold', durationSec: 60, bodyweightSnapshotKg: 80 })]),
        entry('ex_back_squat', [set({ loadKg: 100, reps: 3 })]),
      ],
      { completion: 'partial' },
    );
    const expected = 500 + 800 + 480 + 540 + 300;
    const summary = buildSummary(workout, [workout], exercisesById);
    const card = summarizeSession(workout, exercisesById, []);
    const exerciseIds = new Set(workout.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)));
    const graphs = [...exerciseIds]
      .flatMap((exerciseId) => exerciseSeries({ exerciseId, metric: 'volume', sessions: [workout], exercisesById }))
      .filter((p) => p.sessionId === workout.id)
      .reduce((sum, p) => sum + p.value, 0);
    assert.equal(summary.volumeKg, expected);
    assert.equal(card.volumeKg, expected);
    assert.equal(graphs, expected);
  });
});

describe('bodyweight loads', () => {
  test('added load reads as bodyweight, plus, or minus for assistance', () => {
    assert.equal(formatAddedLoad(0, 'imperial'), 'Bodyweight');
    assert.equal(formatAddedLoad(0, 'imperial', 'bodyweight'), 'bodyweight');
    assert.equal(formatAddedLoad(lbToKg(20), 'imperial'), '+20 lb');
    assert.equal(formatAddedLoad(-lbToKg(20), 'imperial'), '−20 lb');
    assert.equal(spokenAddedLoad(0, 'metric'), 'bodyweight');
    assert.equal(spokenAddedLoad(lbToKg(20), 'imperial'), 'bodyweight plus 20 pounds');
    assert.equal(spokenAddedLoad(-lbToKg(20), 'imperial'), '20 pounds of assistance');
  });

  test('an exercise’s bests include its first workout, with bodyweight lifts by added load', () => {
    const only = session('2026-10-01', [entry('ex_pull_up', [set({ bodyweightSnapshotKg: 80, addedLoadKg: 10, reps: 6 })])]);
    const bests = exerciseBests(deriveRecordBests([only], exercisesById), exercisesById.get('ex_pull_up')!);
    assert.equal(derivePersonalRecords([only], exercisesById).length, 0);
    assert.equal(bests.heaviest_weight?.value, 10);
    assert.equal(bests.heaviest_weight?.addedLoad, true);
    assert.equal(bests.volume?.value, 540);
  });
});

describe('Home recent wins', () => {
  const base = { formReports: [], badges: [], exercisesById, units: 'metric' as const, today: '2026-10-26' };
  const streak: StreakRecord = { id: 'streak_2026-09-21', weeks: 5, previousWeeks: 4, achievedDate: '2026-10-20', sessionId: 's1' };

  test('a longest-streak record within the window is a win', () => {
    const old: StreakRecord = { id: 'streak_2026-01-05', weeks: 3, previousWeeks: 2, achievedDate: '2026-02-01', sessionId: 's0' };
    const wins = buildWins({ ...base, records: [], streakRecords: [old, streak] });
    assert.equal(wins.length, 1);
    assert.deepEqual(
      { title: wins[0].title, detail: wins[0].detail, icon: wins[0].icon, kind: wins[0].kind, date: wins[0].date },
      { title: 'Longest streak · 5 weeks', detail: 'was 4 weeks', icon: 'flame.fill', kind: 'pr', date: '2026-10-20' },
    );
  });

  test('a streak record is never dropped as a minor win', () => {
    const reps: PersonalRecord = { id: 'r1', exerciseId: 'ex_back_squat', type: 'reps_at_weight', value: 8, atLoadKg: 100, previousValue: 6, sessionId: 's2', setId: 'x', achievedDate: '2026-10-24' };
    const wins = buildWins({ ...base, records: [reps], streakRecords: [streak], limit: 1 });
    assert.deepEqual(wins.map((w) => w.title), ['Longest streak · 5 weeks']);
  });

  test('bodyweight weight records show added load', () => {
    const records: PersonalRecord[] = [
      { id: 'r1', exerciseId: 'ex_assisted_pull_up', type: 'heaviest_weight', addedLoad: true, value: -20, previousValue: -30, sessionId: 's1', setId: 'a', achievedDate: '2026-10-24' },
      { id: 'r2', exerciseId: 'ex_pull_up', type: 'reps_at_weight', addedLoad: true, value: 8, atLoadKg: 0, previousValue: 6, sessionId: 's1', setId: 'b', achievedDate: '2026-10-24' },
    ];
    const details = buildWins({ ...base, records }).map((w) => w.detail).sort();
    assert.deepEqual(details, ['8 reps at bodyweight (was 6)', '−20 kg (was −30 kg)']);
  });
});

describe('workout counts', () => {
  test('a finished workout with only warm-ups done is not a workout', () => {
    const sessions = [
      session('2026-10-01', [entry('ex_back_squat', [set({ loadKg: 100, reps: 5 })])]),
      session('2026-10-02', [entry('ex_back_squat', [set({ kind: 'warmup', loadKg: 60, reps: 5 }), set({ loadKg: 100, reps: 5, completedAt: undefined })])], { completion: 'partial' }),
    ];
    const input: BadgeInput = {
      sessions,
      exercisesById,
      formReports: [],
      records: [],
      streak: { currentWeeks: 0, milestoneDates: [] },
      occurrences: [],
      plans: [],
      bodyweight: [],
      units: 'metric',
      weekStartsOn: 1,
      today: '2026-10-02',
    };
    const badge = badgeProgress(input).find((b) => b.badgeKey === 'workouts_10');
    assert.equal(badge?.current, 1);
  });
});

describe('CSV export', () => {
  test('bodyweight sets export assistance, bodyweight, and the load they counted as', () => {
    const workout = session('2026-10-08', [
      // A leftover added load from switching kinds isn't exported for an assisted set.
      entry('ex_assisted_pull_up', [set({ kind: 'assisted', assistanceKg: 30, addedLoadKg: 5, bodyweightSnapshotKg: 80, reps: 8 })]),
      entry('ex_pull_up', [set({ bodyweightSnapshotKg: 80, addedLoadKg: 10, effectiveLoadOverrideKg: 85, reps: 5 })]),
      entry('ex_back_squat', [set({ loadKg: 100, reps: 5, rir: 2 })]),
    ]);
    const [header, ...rows] = workoutsCsv([workout], exercisesById, [], 'metric').split('\n');
    assert.equal(header, 'date,workout,plan,completion,exercise,set,set_type,modifiers,weight_kg,added_kg,assistance_kg,bodyweight_kg,counted_load_kg,reps,seconds,rpe,rest_s,tempo,notes');
    assert.deepEqual(rows, [
      `2026-10-08,Lower,,full,${nameOf('ex_assisted_pull_up')},1,assisted,,,,30,80,50,8,,,,,`,
      `2026-10-08,Lower,,full,${nameOf('ex_pull_up')},1,normal,,,10,,80,85,5,,,,,`,
      `2026-10-08,Lower,,full,${nameOf('ex_back_squat')},1,normal,,100,,,,100,5,,8,,,`,
    ]);
  });

  test('columns are in the user’s unit', () => {
    const workout = session('2026-10-08', [entry('ex_pull_up', [set({ bodyweightSnapshotKg: lbToKg(180), addedLoadKg: lbToKg(20), reps: 5 })])]);
    const [header, row] = workoutsCsv([workout], exercisesById, [], 'imperial').split('\n');
    assert.ok(header.includes('assistance_lb,bodyweight_lb,counted_load_lb'));
    assert.ok(row.includes(',20,,180,200,5,'));
  });
});

describe('Today card exercises done (G3.6 review)', () => {
  test('an exercise with only a warm-up done isn’t done', () => {
    const s = session('2026-10-01', [entry('ex_back_squat', [set({ kind: 'warmup', loadKg: 60, reps: 5 })]), entry('ex_bench_press', [set({ loadKg: 60, reps: 8 })])], { completion: 'partial' });
    assert.equal(summarizeSession(s, exercisesById, []).exercisesDone, 1);
  });
});
