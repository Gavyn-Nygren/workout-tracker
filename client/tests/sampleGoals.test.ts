// The sample data shows every goal state and a mix of badges whichever day it's loaded (G3.10):
// goals are set relative to today, like the history.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { badgeEarnedText, badgeState } from '../src/data/badges';
import { addDays } from '../src/data/dates';
import { loadSampleData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { buildFakeDataset } from '../src/data/fake';
import type { GoalInput } from '../src/data/goals';
import type { ISODate, PersonalRecord } from '../src/data/types';
import { homeGoals } from '../src/features/home/goals';
import { buildWins } from '../src/features/home/wins';
import { openTestDatabase } from './support/nodeSqlite';

// A whole week (every weekday as "today"), plus a month and a year boundary.
const DATES: ISODate[] = [...Array.from({ length: 7 }, (_, i) => addDays('2026-10-26', i)), '2026-12-01', '2027-01-01'];

function sample(today: ISODate) {
  const data = buildFakeDataset(today);
  const exercisesById = new Map(data.exercises.map((e) => [e.id, e]));
  const input: GoalInput = { sessions: data.sessions, exercisesById, bodyweight: data.bodyweight, formReports: data.formReports, streak: data.streak, today };
  const goals = homeGoals(data.goals, input);
  const status = (id: string) => goals.all.find((g) => g.goal.id === id)!.progress;
  return { data, exercisesById, goals, status };
}

describe('sample goals show every state', () => {
  for (const today of DATES) {
    test(`on ${today}`, () => {
      const { goals, status } = sample(today);

      const weight = status('goal_bodyweight');
      assert.deepEqual([weight.reached, weight.reachedDate, weight.archived], [true, addDays(today, -2), false], 'reached two days ago, still on Home');
      const ohp = status('goal_ohp');
      assert.ok(ohp.reached && ohp.archived && ohp.reachedDate! <= addDays(today, -7), 'reached over a week ago: Completed goals');
      assert.deepEqual(goals.completed.map((g) => g.goal.id), ['goal_ohp']);
      assert.ok(goals.active.some((g) => g.goal.id === 'goal_bodyweight'));

      const weekly = status('goal_frequency');
      assert.deepEqual([weekly.mode, weekly.total, weekly.pace, weekly.reached], ['total', 40, 'on_track', false]);
      assert.ok(weekly.daysLeft! > 0 && weekly.done! > 0);

      const bench = status('goal_bench');
      assert.ok(!bench.reached && (bench.pace === 'behind' || bench.pace === 'on_track') && bench.daysLeft! > 0);
      assert.ok(bench.fraction > 0 && bench.fraction < 1);

      const depth = status('goal_squat_depth');
      assert.ok(!depth.reached && depth.fraction > 0 && depth.fraction < 1 && depth.pace === undefined);
    });
  }
});

describe('the sample streak', () => {
  for (const today of DATES) {
    test(`on ${today}, this week follows the weekly goal; weeks before it, the plans`, () => {
      const { streak } = buildFakeDataset(today);
      assert.deepEqual([streak.thisWeekTarget, streak.thisWeekSource, streak.thisWeekPlanned], [5, 'goal', 7]);
      const ended = streak.weeks.slice(0, -1);
      assert.ok(ended.some((w) => w.source === 'plan' && w.target === 7 && w.met));
      assert.ok(ended.every((w) => w.met));
      assert.ok(streak.currentWeeks >= 7);
    });
  }
});

describe('sample badges', () => {
  for (const today of DATES) {
    test(`on ${today}, several are earned and several are next up`, () => {
      const { data, exercisesById } = sample(today);
      const state = badgeState(
        {
          sessions: data.sessions,
          exercisesById,
          formReports: data.formReports,
          records: data.personalRecords,
          streak: data.streak,
          occurrences: data.occurrences,
          plans: data.plans,
          planVersions: data.plans,
          bodyweight: data.bodyweight,
          units: data.preferences.units,
          weekStartsOn: data.preferences.weekStartsOn,
          today,
        },
        Infinity,
      );
      assert.ok(state.earned.length >= 10, `${state.earned.length} earned`);
      assert.ok(state.nextUp.length >= 5, `${state.nextUp.length} next up`);
      assert.deepEqual(data.badges.map((b) => b.badgeKey), state.earned.map((b) => b.badgeKey));
      for (const key of ['first_workout', 'workouts_50', 'squat_2_plate', 'streak_4_weeks', 'perfect_week', 'first_analysis']) {
        assert.ok(state.earned.some((b) => b.badgeKey === key), key);
      }
    });
  }

  test('through the database: the same badges, and Next up for Home', async () => {
    const today = '2026-10-27';
    const db = openTestDatabase();
    migrate(db);
    loadSampleData(db, today);
    const repo = createSqliteRepository(db, { today: () => today });
    const { earned, nextUp } = await repo.getBadges();
    assert.deepEqual(earned.map((b) => b.badgeKey), buildFakeDataset(today).badges.map((b) => b.badgeKey));
    assert.deepEqual(
      nextUp.slice(0, 3).map((b) => b.badgeKey),
      ['squat_bodyweight_1_5x', 'deadlift_bodyweight_2x', 'bench_2_plate'],
    );
  });
});

describe('Recent wins: goals reached', () => {
  test('the sample goals reached in the last three weeks are wins on the day they were reached', () => {
    const today = '2026-10-27';
    const { data, exercisesById, goals } = sample(today);
    const wins = buildWins({ records: data.personalRecords, formReports: data.formReports, badges: data.badges, goals: goals.all, exercisesById, units: 'imperial', today, limit: 50 });
    assert.deepEqual(
      wins.filter((w) => w.kind === 'goal').map((w) => [w.title, w.date, w.detail]),
      [
        ['Goal reached: Reach 181 lb', '2026-10-25', 'Reached 18 days after you set it'],
        ['Goal reached: Overhead Press 115 × 6', '2026-10-19', 'Reached 27 days after you set it'],
      ],
    );
  });

  test('like badges, a reached goal always makes the list; one reached before the window or not yet reached doesn’t', () => {
    const today = '2026-10-27';
    const { goals } = sample(today);
    const records: PersonalRecord[] = Array.from({ length: 12 }, (_, i) => ({
      id: `pr${i}`,
      exerciseId: 'ex_bench_press',
      type: 'heaviest_weight',
      value: 100 + i,
      sessionId: `s${i}`,
      setId: `set${i}`,
      achievedDate: addDays(today, -i),
    }));
    const wins = buildWins({ records, formReports: [], badges: [], goals: goals.all, exercisesById: new Map(), units: 'imperial', today, limit: 8 });
    assert.equal(wins.length, 8);
    assert.equal(wins.filter((w) => w.kind === 'goal').length, 2);
    assert.deepEqual(buildWins({ records: [], formReports: [], badges: [], goals: goals.all, exercisesById: new Map(), units: 'imperial', today: addDays(today, 30) }), []);
  });

  test('at the default limit, goals reached outrank older badges and form wins; badges say what was done (G3.10 review)', () => {
    const today = '2026-10-27';
    const { data, exercisesById, goals } = sample(today);
    const all = buildWins({ records: data.personalRecords, formReports: data.formReports, badges: data.badges, goals: goals.all, exercisesById, units: 'imperial', today, limit: 50 });
    assert.ok(all.filter((w) => w.kind !== 'pr').length > 8, 'more rare wins than fit');
    const wins = buildWins({ records: data.personalRecords, formReports: data.formReports, badges: data.badges, goals: goals.all, exercisesById, units: 'imperial', today });
    assert.equal(wins.length, 8);
    assert.deepEqual(wins.filter((w) => w.kind === 'goal').map((w) => w.date), ['2026-10-25', '2026-10-19']);
    // The rest are the newest of the other rare wins, and the list stays newest first.
    const kept = new Set(wins.map((w) => w.id));
    const oldestKept = wins.filter((w) => w.kind !== 'goal').at(-1)!.date;
    assert.ok(all.filter((w) => (w.kind === 'form' || w.kind === 'badge') && !kept.has(w.id)).every((w) => w.date <= oldestKept));
    assert.deepEqual(wins.map((w) => w.date), [...wins.map((w) => w.date)].sort().reverse());
    for (const badge of data.badges.filter((b) => all.some((w) => w.id === `badge_${b.id}`))) {
      const win = all.find((w) => w.id === `badge_${badge.id}`)!;
      assert.equal(win.detail, badgeEarnedText(badge.badgeKey, 'imperial'));
      assert.notEqual(win.detail, badge.description);
    }
    assert.ok(all.some((w) => w.kind === 'badge' && w.detail === 'Completed 50 workouts.'));
  });
});
