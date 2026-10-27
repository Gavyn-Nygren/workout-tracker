import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { migrate } from '../src/data/db/schema';
import { eraseAllData } from '../src/data/db/sampleData';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { clampRestSec, defaultPreferences, REST_LIMITS_SEC, withPreferenceDefaults, withRememberedRests } from '../src/data/preferences';
import type { LoggedSet, Preferences, SessionBlock, SessionExercise, WorkoutSession } from '../src/data/types';
import { addExercise, defaultSets } from '../src/features/plans/planEdits';
import { restoredRest, type ActiveWorkoutMeta } from '../src/features/workout/persistence';
import {
  adjustedRest,
  describeNextUp,
  exerciseRest,
  followsLastSet,
  LATE_END_MS,
  learnedRest,
  nextUp,
  presetRest,
  restAfterSet,
  restAlarmTimeMs,
  restEnd,
  restOverAnnouncement,
  restRemainingMs,
  shownNextUp,
  startedRest,
  toggledPause,
  withCurrentNext,
  type RestChoice,
  type RestSettings,
  type RestTimer,
} from '../src/features/workout/rest';
import { CONTEXT_ABOVE, coveredBelow, GAP_BELOW, scrollOffsetToShow, SETTLE_MAX_MS, SETTLE_MS, settleDelayMs } from '../src/features/workout/scrollTarget';
import { workoutReducer, type ActiveWorkout, type WorkoutAction } from '../src/features/workout/workoutReducer';
import { openTestDatabase } from './support/nodeSqlite';

const NOW = Date.parse('2026-10-26T18:00:00.000Z');
const DONE_AT = '2026-10-26T17:59:00.000Z';

const exercises = new Map([
  ['squat', { name: 'Squat', category: 'compound' as const }],
  ['bench', { name: 'Bench Press', category: 'compound' as const }],
  ['row', { name: 'Barbell Row', category: 'compound' as const }],
  ['curl', { name: 'Curl', category: 'isolation' as const }],
  ['raise', { name: 'Lateral Raise', category: 'isolation' as const }],
]);

const settings = (remembered: Record<string, number> = {}): RestSettings => ({ defaults: { compound: 180, isolation: 90, warmup: 60 }, remembered });

// Sets are named by their entry: 'sq1' is the squat's first set, 'sqw1' its first warm-up.
const set = (id: string, patch: Partial<LoggedSet> = {}): LoggedSet => ({ id, kind: 'normal', modifiers: [], ...patch });
const warmup = (id: string, patch: Partial<LoggedSet> = {}) => set(id, { kind: 'warmup', ...patch });
const done = (id: string, patch: Partial<LoggedSet> = {}) => set(id, { completedAt: DONE_AT, ...patch });
const entry = (id: string, exerciseId: string, sets: LoggedSet[], patch: Partial<SessionExercise> = {}): SessionExercise => ({ id, exerciseId, skipped: false, sets, ...patch });
const single = (id: string, e: SessionExercise): SessionBlock => ({ id, type: 'single', exercises: [e] });
const superset = (id: string, entries: SessionExercise[], patch: Partial<SessionBlock> = {}): SessionBlock => ({ id, type: 'superset', exercises: entries, ...patch });
const session = (...blocks: SessionBlock[]): WorkoutSession => ({ id: 's', name: 'Today', status: 'in_progress', blocks, createdAt: DONE_AT, updatedAt: DONE_AT });

/** The rest after completing `setId` in `entryId`, given the session before the completion. */
const restAfter = (s: WorkoutSession, entryId: string, setId: string, remembered: Record<string, number> = {}) => restAfterSet(s, { entryId, setId }, exercises, settings(remembered));
const next = (s: WorkoutSession, entryId: string, setId: string) => {
  const found = nextUp(s, { entryId, setId }, exercises);
  return found && describeNextUp(found);
};

describe('which rest follows a set', () => {
  const squats = (sets: LoggedSet[]) => session(single('b1', entry('sq', 'squat', sets)));

  test('straight sets: the plan rest wins, then the remembered rest, then the type default', () => {
    const planned = squats([set('sq1', { target: { kind: 'normal', modifiers: [], restSec: 120 } }), set('sq2')]);
    // Adjusting a plan rest still teaches the exercise (decision B); the plan keeps its own rest.
    assert.deepEqual(restAfter(planned, 'sq', 'sq1', { squat: 150 }), { durationSec: 120, source: 'plan', learnable: true });
    assert.deepEqual(restAfter(planned, 'sq', 'sq2', { squat: 150 }), { durationSec: 150, source: 'remembered', learnable: true });
    assert.deepEqual(restAfter(planned, 'sq', 'sq2'), { durationSec: 180, source: 'default', learnable: true });
    const curls = session(single('b1', entry('cu', 'curl', [set('cu1')])));
    assert.deepEqual(restAfter(curls, 'cu', 'cu1'), { durationSec: 90, source: 'default', learnable: true });
  });

  test('a plan rest of 0 counts as no plan rest', () => {
    const s = squats([set('sq1', { target: { kind: 'normal', modifiers: [], restSec: 0 } })]);
    assert.equal(restAfter(s, 'sq', 'sq1')?.source, 'default');
  });

  test('warm-ups rest like warm-ups, never teach, and ignore the remembered rest', () => {
    const s = squats([warmup('sqw1'), warmup('sqw2', { target: { kind: 'warmup', modifiers: [], restSec: 45 } }), set('sq1')]);
    assert.deepEqual(restAfter(s, 'sq', 'sqw1', { squat: 150 }), { durationSec: 60, source: 'warmup', learnable: false });
    assert.deepEqual(restAfter(s, 'sq', 'sqw2'), { durationSec: 45, source: 'plan', learnable: false });
  });

  test('drop sets and other working kinds rest like working sets', () => {
    const s = squats([set('sq1'), set('sq2', { kind: 'drop' }), set('sq3', { kind: 'timed_hold' })]);
    assert.equal(restAfter(s, 'sq', 'sq2')?.learnable, true);
    assert.equal(restAfter(s, 'sq', 'sq3')?.source, 'default');
  });

  test('an unknown set has no rest', () => {
    assert.equal(restAfter(squats([set('sq1')]), 'sq', 'missing'), null);
    assert.equal(restAfter(squats([set('sq1')]), 'missing', 'sq1'), null);
  });

  test('an unknown exercise rests like a compound lift', () => {
    const s = session(single('b1', entry('x', 'mystery', [set('x1')])));
    assert.deepEqual(restAfter(s, 'x', 'x1'), { durationSec: 180, source: 'default', learnable: true });
  });
});

describe('superset and circuit rounds', () => {
  const ab = (a: LoggedSet[], b: LoggedSet[], patch: Partial<SessionBlock> = {}) => session(superset('ss', [entry('a', 'squat', a), entry('b', 'bench', b)], patch));

  test("a round's last exercise gets the round rest; the others the transition (none by default)", () => {
    const s = ab([set('a1'), set('a2')], [set('b1'), set('b2')]);
    assert.deepEqual(restAfter(s, 'a', 'a1'), { durationSec: 0, source: 'transition', learnable: false });
    const afterA1 = workoutReducer({ mode: 'new', session: s }, { type: 'completeSet', entryId: 'a', setId: 'a1', completedAt: DONE_AT })!.session;
    assert.deepEqual(restAfter(afterA1, 'b', 'b1'), { durationSec: 180, source: 'round', learnable: false });
  });

  test("the block's own round and transition rests win, and the plan's set rest doesn't apply inside a superset", () => {
    const planned = { kind: 'normal' as const, modifiers: [], restSec: 240 };
    const s = ab([done('a1', { target: planned }), set('a2', { target: planned })], [set('b1', { target: planned })], { roundRestSec: 120, transitionRestSec: 15 });
    assert.deepEqual(restAfter(s, 'a', 'a2'), { durationSec: 120, source: 'round', learnable: false }, 'B has no second set, so A2 finishes round 2');
    assert.deepEqual(restAfter(s, 'b', 'b1'), { durationSec: 120, source: 'round', learnable: false });
    const fresh = ab([set('a1')], [set('b1')], { roundRestSec: 120, transitionRestSec: 15 });
    assert.deepEqual(restAfter(fresh, 'a', 'a1'), { durationSec: 15, source: 'transition', learnable: false });
  });

  test('the remembered rest never changes a superset rest', () => {
    const s = ab([done('a1')], [set('b1')]);
    assert.equal(restAfter(s, 'b', 'b1', { bench: 30, squat: 30 })?.durationSec, 180);
  });

  test('out of order: the round ends with whichever exercise finishes it', () => {
    const s = ab([set('a1'), set('a2')], [set('b1'), set('b2')]);
    assert.equal(restAfter(s, 'b', 'b1')?.source, 'transition', 'B1 first: A1 is still to do');
    const bFirst = ab([set('a1'), set('a2')], [done('b1'), set('b2')]);
    assert.equal(restAfter(bFirst, 'a', 'a1')?.source, 'round', 'then A1 finishes round 1');
  });

  test('the completed set counts whether or not the session already shows it done', () => {
    const before = ab([done('a1')], [set('b1')]);
    const after = ab([done('a1')], [done('b1')]);
    assert.deepEqual(restAfter(before, 'b', 'b1'), restAfter(after, 'b', 'b1'));
  });

  test('uneven set counts: a round waits only for the exercises that have a set in it', () => {
    const s = ab([done('a1'), done('a2'), done('a3'), set('a4')], [done('b1'), done('b2'), done('b3')]);
    assert.equal(restAfter(s, 'a', 'a4')?.source, 'round');
    const three = session({ id: 'c', type: 'circuit', exercises: [entry('a', 'squat', [set('a1'), set('a2')]), entry('b', 'bench', [set('b1')]), entry('c', 'row', [set('c1'), set('c2')])] });
    assert.equal(restAfter(three, 'a', 'a2')?.source, 'transition', 'C2 is still to do in round 2');
    const almost = session({ id: 'c', type: 'circuit', exercises: [entry('a', 'squat', [done('a1'), set('a2')]), entry('b', 'bench', [done('b1')]), entry('c', 'row', [done('c1'), done('c2')])] });
    assert.equal(restAfter(almost, 'a', 'a2')?.source, 'round', 'B has no second set');
  });

  test('warm-ups sit outside the rounds: they rest like warm-ups and never end a round', () => {
    const s = ab([warmup('aw1'), set('a1')], [set('b1')]);
    assert.deepEqual(restAfter(s, 'a', 'aw1'), { durationSec: 60, source: 'warmup', learnable: false });
    const warmedUp = ab([done('aw1', { kind: 'warmup' }), set('a1')], [warmup('bw1'), set('b1')]);
    assert.equal(restAfter(warmedUp, 'a', 'a1')?.source, 'transition', "A1 is round 1 even after A's warm-up; B1 is still to do");
  });

  test('drop sets take a place in the rounds, numbered like the set table', () => {
    const s = ab([done('a1'), set('a2', { kind: 'drop' })], [done('b1'), set('b2')]);
    assert.equal(restAfter(s, 'a', 'a2')?.source, 'transition', "A's drop set is round 2, with B2");
  });

  test('a skipped exercise is left out of the rounds', () => {
    const s = session(superset('ss', [entry('a', 'squat', [set('a1')]), entry('b', 'bench', [set('b1')], { skipped: true })]));
    assert.equal(restAfter(s, 'a', 'a1')?.source, 'round');
  });
});

describe("what's next", () => {
  test('straight sets: the next set not done, then sets skipped past, then the next block', () => {
    const s = session(single('b1', entry('sq', 'squat', [warmup('sqw1'), set('sq1'), set('sq2'), set('sq3')])), single('b2', entry('cu', 'curl', [set('cu1'), set('cu2')])));
    assert.equal(next(s, 'sq', 'sqw1'), 'Squat, set 1');
    assert.equal(next(s, 'sq', 'sq1'), 'Squat, set 2');
    const skippedPast = session(single('b1', entry('sq', 'squat', [done('sq1'), set('sq2'), done('sq3')])), single('b2', entry('cu', 'curl', [set('cu1')])));
    assert.equal(next(skippedPast, 'sq', 'sq3'), 'Squat, set 2');
    const squatDone = session(single('b1', entry('sq', 'squat', [done('sq1'), set('sq2')])), single('b2', entry('cu', 'curl', [done('cu1'), set('cu2')])));
    assert.equal(next(squatDone, 'sq', 'sq2'), 'Curl, set 2');
  });

  test('past the end it wraps round to sets left undone earlier; null when everything is done', () => {
    const s = session(single('b1', entry('sq', 'squat', [done('sq1'), set('sq2')])), single('b2', entry('cu', 'curl', [done('cu1'), set('cu2')])));
    assert.equal(next(s, 'cu', 'cu2'), 'Squat, set 2');
    const all = session(single('b1', entry('sq', 'squat', [done('sq1')])), single('b2', entry('cu', 'curl', [set('cu1')])));
    assert.equal(nextUp(all, { entryId: 'cu', setId: 'cu1' }, exercises), null);
  });

  test('skipped exercises are passed over', () => {
    const s = session(
      single('b1', entry('sq', 'squat', [set('sq1')])),
      single('b2', entry('cu', 'curl', [set('cu1')], { skipped: true })),
      single('b3', entry('ra', 'raise', [set('ra1')])),
    );
    assert.equal(next(s, 'sq', 'sq1'), 'Lateral Raise, set 1');
  });

  test('in a superset round: the next exercise, wrapping round, whose set this round is not done', () => {
    const s = session(superset('ss', [entry('a', 'squat', [set('a1'), set('a2')]), entry('b', 'bench', [set('b1'), set('b2')]), entry('c', 'row', [set('c1'), set('c2')])]));
    assert.equal(next(s, 'a', 'a1'), 'Bench Press, set 1');
    assert.equal(next(s, 'c', 'c1'), 'Squat, set 1', 'C1 first: wraps round to A1');
    const bDone = session(superset('ss', [entry('a', 'squat', [set('a1')]), entry('b', 'bench', [done('b1')]), entry('c', 'row', [set('c1')])]));
    assert.equal(next(bDone, 'a', 'a1'), 'Barbell Row, set 1', 'B1 is done already');
  });

  test("after a round: the next round's first set not done, then the next block", () => {
    const s = session(
      superset('ss', [entry('a', 'squat', [done('a1'), set('a2')]), entry('b', 'bench', [set('b1'), set('b2')])]),
      single('b2', entry('cu', 'curl', [set('cu1')])),
    );
    assert.equal(next(s, 'b', 'b1'), 'Squat, set 2');
    const lastRound = session(
      superset('ss', [entry('a', 'squat', [done('a1'), done('a2')]), entry('b', 'bench', [done('b1'), set('b2')])]),
      single('b2', entry('cu', 'curl', [set('cu1')])),
    );
    assert.equal(next(lastRound, 'b', 'b2'), 'Curl, set 1');
    const aStarted = session(superset('ss', [entry('a', 'squat', [done('a1'), done('a2')]), entry('b', 'bench', [set('b1'), set('b2')])]));
    assert.equal(next(aStarted, 'b', 'b1'), 'Bench Press, set 2', "A2 is done ahead of time, so round 2 starts with B2");
  });

  test('uneven set counts: the extra rounds hold only the exercises with sets left', () => {
    const s = session(superset('ss', [entry('a', 'squat', [done('a1'), done('a2'), set('a3')]), entry('b', 'bench', [done('b1'), set('b2')])]));
    assert.equal(next(s, 'b', 'b2'), 'Squat, set 3');
  });

  test('superset warm-ups: the next warm-up, exercise by exercise, then round 1', () => {
    const s = session(superset('ss', [entry('a', 'squat', [warmup('aw1'), warmup('aw2'), set('a1')]), entry('b', 'bench', [warmup('bw1'), set('b1')])]));
    assert.equal(next(s, 'a', 'aw1'), 'Squat, warm-up set 2');
    assert.equal(next(s, 'a', 'aw2'), 'Bench Press, warm-up set 1');
    assert.equal(next(s, 'b', 'bw1'), 'Squat, warm-up set 1', 'wraps to the warm-ups left before the rounds');
    const warm = session(superset('ss', [entry('a', 'squat', [done('aw1', { kind: 'warmup' }), set('a1')]), entry('b', 'bench', [warmup('bw1'), set('b1')])]));
    assert.equal(next(warm, 'b', 'bw1'), 'Squat, set 1');
  });

  test('labels number sets like the set table, warm-ups separately', () => {
    const s = session(single('b1', entry('sq', 'squat', [warmup('w1'), warmup('w2'), set('n1'), set('n2', { kind: 'drop' })])));
    const found = nextUp(s, { entryId: 'sq', setId: 'w1' }, exercises);
    assert.deepEqual(found, { entryId: 'sq', setId: 'w2', exerciseId: 'squat', exerciseName: 'Squat', setLabel: 'warm-up set 2' });
    assert.equal(nextUp(s, { entryId: 'sq', setId: 'n1' }, exercises)?.setLabel, 'set 2');
    const unknown = session(single('b1', entry('x', 'mystery', [set('x1'), set('x2')])));
    assert.equal(next(unknown, 'x', 'x1'), 'Exercise, set 2');
  });
});

describe('changing the running rest', () => {
  const choice = (patch: Partial<RestChoice> = {}): RestChoice => ({ durationSec: 180, source: 'default', learnable: true, ...patch });
  const about = { label: 'Squat · set 1', after: { entryId: 'sq', setId: 'sq1', exerciseId: 'squat' } };
  const running = (patch: Partial<RestTimer> = {}) => ({ ...startedRest(choice(), about, NOW)!, ...patch });

  test('a rest starts from a choice and carries what it follows; no rest for 0', () => {
    const rest = startedRest(choice(), about, NOW);
    assert.deepEqual(rest, { endsAtMs: NOW + 180_000, durationSec: 180, label: 'Squat · set 1', after: about.after, source: 'default', learnable: true, next: undefined });
    assert.equal(startedRest(choice({ durationSec: 0, source: 'transition', learnable: false }), about, NOW), null);
  });

  test('±15 s moves the end and the total together, running or paused, and never ends in the past', () => {
    const rest = running();
    assert.deepEqual([adjustedRest(rest, 15, NOW).endsAtMs, adjustedRest(rest, 15, NOW).durationSec], [NOW + 195_000, 195]);
    const nearlyOver = running({ endsAtMs: NOW + 5_000 });
    assert.equal(adjustedRest(nearlyOver, -15, NOW).endsAtMs, NOW);
    const paused = toggledPause(rest, NOW + 60_000);
    const longer = adjustedRest(paused, 15, NOW + 90_000);
    assert.deepEqual([longer.pausedRemainingMs, longer.durationSec], [135_000, 195]);
    assert.equal(adjustedRest(paused, -600, NOW).pausedRemainingMs, 0);
    assert.equal(adjustedRest(running({ durationSec: 10 }), -15, NOW).durationSec, 1);
  });

  test('pause keeps what is left; resume counts it down from then', () => {
    const paused = toggledPause(running(), NOW + 60_000);
    assert.equal(paused.pausedRemainingMs, 120_000);
    assert.equal(restRemainingMs(paused, NOW + 999_000), 120_000, 'time stands still while paused');
    const resumed = toggledPause(paused, NOW + 500_000);
    assert.deepEqual([resumed.pausedRemainingMs, resumed.endsAtMs], [undefined, NOW + 620_000]);
  });

  test('a preset restarts the running rest at that length, keeps what it follows, and resumes it', () => {
    const paused = toggledPause(running(), NOW + 10_000);
    const preset = presetRest(paused, 120, NOW + 20_000);
    assert.deepEqual([preset.endsAtMs, preset.durationSec, preset.pausedRemainingMs, preset.learnable, preset.after], [NOW + 140_000, 120, undefined, true, about.after]);
    const manual = presetRest(null, 90, NOW);
    assert.deepEqual(manual, { endsAtMs: NOW + 90_000, durationSec: 90, label: 'manual timer' });
  });

  test("adjusting a learnable rest teaches its exercise the new length; nothing else teaches", () => {
    assert.deepEqual(learnedRest(adjustedRest(running(), 15, NOW)), { exerciseId: 'squat', sec: 195 });
    assert.deepEqual(learnedRest(presetRest(running(), 240, NOW)), { exerciseId: 'squat', sec: 240 });
    assert.equal(learnedRest(running({ learnable: false, source: 'warmup' })), null);
    assert.equal(learnedRest(running({ learnable: false, source: 'round' })), null);
    assert.equal(learnedRest(presetRest(null, 120, NOW)), null, 'a manual timer');
    assert.equal(learnedRest({ endsAtMs: NOW, durationSec: 90, label: 'Squat · set 1' }), null, 'a rest saved before G3.8');
    assert.equal(learnedRest(null), null);
  });

  test('what it teaches stays inside the limits', () => {
    assert.equal(learnedRest(running({ durationSec: 1 }))?.sec, REST_LIMITS_SEC.min);
    assert.equal(learnedRest(running({ durationSec: 1200 }))?.sec, REST_LIMITS_SEC.max);
  });

  test('only superset and circuit rests show the next set', () => {
    const nextSet = { entryId: 'b', setId: 'b1', exerciseId: 'bench', exerciseName: 'Bench Press', setLabel: 'set 1' };
    assert.equal(shownNextUp(running({ source: 'transition', next: nextSet })), nextSet);
    assert.equal(shownNextUp(running({ source: 'round', next: nextSet })), nextSet);
    assert.equal(shownNextUp(running({ source: 'default', next: nextSet })), undefined);
  });

  test('a whole workout: an adjustment is used for the next set and survives into the next workout, until the plan sets a rest', () => {
    const s = session(single('b1', entry('sq', 'squat', [set('sq1'), set('sq2'), set('sq3', { target: { kind: 'normal', modifiers: [], restSec: 120 } })])));
    let preferences: Preferences = defaultPreferences;
    const remembered = () => ({ defaults: preferences.restDefaultsSec, remembered: preferences.restByExerciseSec });
    const first = restAfterSet(s, { entryId: 'sq', setId: 'sq1' }, exercises, remembered())!;
    assert.equal(first.durationSec, 180);
    const lesson = learnedRest(adjustedRest(adjustedRest(startedRest(first, about, NOW)!, -15, NOW), -15, NOW))!;
    preferences = withRememberedRests(preferences, { [lesson.exerciseId]: lesson.sec });
    assert.deepEqual(restAfterSet(s, { entryId: 'sq', setId: 'sq2' }, exercises, remembered()), { durationSec: 150, source: 'remembered', learnable: true });
    assert.equal(restAfterSet(s, { entryId: 'sq', setId: 'sq3' }, exercises, remembered())?.source, 'plan');
  });

  test('a plan workout: adjusting a plan rest teaches the exercise, but the plan keeps its rest (decision B)', () => {
    const planned = (sec: number) => ({ kind: 'normal' as const, modifiers: [], restSec: sec });
    const s = session(single('b1', entry('sq', 'squat', [set('sq1', { target: planned(150) }), set('sq2', { target: planned(150) })])));
    let preferences: Preferences = defaultPreferences;
    const remembered = () => ({ defaults: preferences.restDefaultsSec, remembered: preferences.restByExerciseSec });
    const first = restAfterSet(s, { entryId: 'sq', setId: 'sq1' }, exercises, remembered())!;
    assert.deepEqual(first, { durationSec: 150, source: 'plan', learnable: true });
    const lesson = learnedRest(adjustedRest(startedRest(first, about, NOW)!, 15, NOW))!;
    assert.deepEqual(lesson, { exerciseId: 'squat', sec: 165 });
    preferences = withRememberedRests(preferences, { [lesson.exerciseId]: lesson.sec });
    // The exercise's page shows it, and a set the plan leaves blank uses it...
    assert.deepEqual(exerciseRest('squat', 'compound', remembered()), { durationSec: 165, source: 'remembered' });
    const quick = session(single('b1', entry('sq', 'squat', [set('sq1')])));
    assert.equal(restAfterSet(quick, { entryId: 'sq', setId: 'sq1' }, exercises, remembered())?.durationSec, 165);
    // ...but a rest set in the plan always wins.
    assert.equal(restAfterSet(s, { entryId: 'sq', setId: 'sq2' }, exercises, remembered())?.durationSec, 150);
  });

  test('an exercise added to a plan has no plan rest, so its Settings default and its memory apply', () => {
    assert.ok(defaultSets().every((s) => s.restSec === undefined));
    const plan = addExercise({ id: 'p', name: 'Mine', workouts: [{ id: 'w', name: 'A', blocks: [] }] } as unknown as Parameters<typeof addExercise>[0], 'w', 'squat');
    const sets = plan.workouts[0].blocks[0].exercises[0].sets;
    // A session set built from the plan carries the prescription as its target.
    const s = session(single('b1', entry('sq', 'squat', sets.map((target, i) => set(`sq${i + 1}`, { target })))));
    assert.deepEqual(restAfter(s, 'sq', 'sq1'), { durationSec: 180, source: 'default', learnable: true }, 'the compound default, not 2:30');
    assert.deepEqual(restAfterSet(s, { entryId: 'sq', setId: 'sq1' }, exercises, { defaults: { compound: 120, isolation: 60, warmup: 45 }, remembered: {} }), { durationSec: 120, source: 'default', learnable: true }, 'Settings changes it');
    assert.deepEqual(restAfter(s, 'sq', 'sq1', { squat: 135 }), { durationSec: 135, source: 'remembered', learnable: true });
  });
});

describe("what's next, while the rest runs", () => {
  const ss = () =>
    session(
      superset('ss', [entry('a', 'squat', [set('a1'), set('a2')]), entry('b', 'bench', [set('b1'), set('b2')]), entry('c', 'curl', [set('c1'), set('c2')])], { transitionRestSec: 30, roundRestSec: 120 }),
    );
  /** Completes a set and starts its rest the way ActiveWorkoutProvider does. */
  const complete = (w: ActiveWorkout, entryId: string, setId: string) => {
    const after = workoutReducer(w, { type: 'completeSet', entryId, setId, completedAt: DONE_AT })!;
    const done = { entryId, setId };
    const choice = restAfterSet(after.session, done, exercises, settings())!;
    const rest = startedRest(choice, { label: 'x', after: { ...done, exerciseId: 'squat' }, next: nextUp(after.session, done, exercises) }, NOW)!;
    return { workout: after, rest };
  };
  const edit = (w: ActiveWorkout, ...actions: WorkoutAction[]) => actions.reduce((acc, action) => workoutReducer(acc, action)!, w);
  const nextOf = (rest: RestTimer | null) => (rest?.next ? describeNextUp(rest.next) : rest?.next);

  test('nothing edited: the same rest comes back', () => {
    const { workout, rest } = complete({ mode: 'new', session: ss() }, 'a', 'a1');
    assert.equal(nextOf(rest), 'Bench Press, set 1');
    assert.equal(withCurrentNext(rest, workout.session, exercises), rest);
    assert.equal(withCurrentNext(rest, edit(workout, { type: 'updateSet', entryId: 'b', setId: 'b1', patch: { reps: 8 } }).session, exercises), rest, 'typing in a set changes nothing');
  });

  test('the next exercise swapped during the rest: it names the new one', () => {
    const { workout, rest } = complete({ mode: 'new', session: ss() }, 'a', 'a1');
    const swapped = edit(workout, { type: 'swapExercise', entryId: 'b', exerciseId: 'row' });
    assert.equal(nextOf(withCurrentNext(rest, swapped.session, exercises)), 'Barbell Row, set 1');
  });

  test('the next exercise skipped or removed: it moves on to the one after', () => {
    const { workout, rest } = complete({ mode: 'new', session: ss() }, 'a', 'a1');
    assert.equal(nextOf(withCurrentNext(rest, edit(workout, { type: 'toggleSkip', entryId: 'b' }).session, exercises)), 'Curl, set 1');
    assert.equal(nextOf(withCurrentNext(rest, edit(workout, { type: 'removeExercise', entryId: 'b' }).session, exercises)), 'Curl, set 1');
  });

  test('a set deleted during the rest: it moves on, and set numbers follow the table', () => {
    let w: ActiveWorkout = { mode: 'new', session: ss() };
    w = complete(w, 'a', 'a1').workout;
    w = complete(w, 'b', 'b1').workout;
    const round = complete(w, 'c', 'c1');
    assert.equal(round.rest.source, 'round');
    assert.equal(nextOf(round.rest), 'Squat, set 2');
    // Squat's set 2 deleted during the 2:00 round rest: Bench Press is first in round 2 now.
    const fewer = edit(round.workout, { type: 'removeSet', entryId: 'a', setId: 'a2' });
    assert.equal(nextOf(withCurrentNext(round.rest, fewer.session, exercises)), 'Bench Press, set 2');

    // Straight sets: set 1 was skipped past, set 2 done; next is set 3, until set 1 is deleted and it becomes set 2.
    const straight = complete({ mode: 'new', session: session(single('b1', entry('sq', 'squat', [set('sq1'), set('sq2'), set('sq3')]))) }, 'sq', 'sq2');
    assert.equal(nextOf(straight.rest), 'Squat, set 3');
    const renumbered = edit(straight.workout, { type: 'removeSet', entryId: 'sq', setId: 'sq1' });
    assert.equal(nextOf(withCurrentNext(straight.rest, renumbered.session, exercises)), 'Squat, set 2');
  });

  test('the exercise the rest follows was removed: what comes next is no longer known', () => {
    const { workout, rest } = complete({ mode: 'new', session: ss() }, 'a', 'a1');
    const updated = withCurrentNext(rest, edit(workout, { type: 'removeExercise', entryId: 'a' }).session, exercises);
    assert.equal(updated?.next, undefined);
  });

  test('a set added after the last set: the rest names it instead of saying it was the last', () => {
    const s = session(single('b1', entry('sq', 'squat', [done('sq1'), set('sq2')])));
    const { workout, rest } = complete({ mode: 'new', session: s }, 'sq', 'sq2');
    assert.equal(rest.next, null);
    assert.ok(followsLastSet(rest));
    const added = edit(workout, { type: 'addSet', entryId: 'sq' });
    const updated = withCurrentNext(rest, added.session, exercises)!;
    assert.equal(nextOf(updated), 'Squat, set 3');
    assert.equal(followsLastSet(updated), false);
  });

  test('a manual timer, or a note saved before G3.8, is left as it is', () => {
    const manual = presetRest(null, 90, NOW);
    assert.equal(withCurrentNext(manual, ss(), exercises), manual);
    assert.equal(withCurrentNext(null, ss(), exercises), null);
  });
});

describe('what the end says', () => {
  const nextSet = { entryId: 'b', setId: 'b1', exerciseId: 'bench', exerciseName: 'Bench Press', setLabel: 'set 1' };
  const base: RestTimer = { endsAtMs: NOW, durationSec: 90, label: 'Squat · set 1', after: { entryId: 'sq', setId: 'sq1', exerciseId: 'squat' }, source: 'default' };

  test('a superset rest names the next set; a straight-set rest says to go on', () => {
    assert.equal(restOverAnnouncement({ ...base, source: 'round', next: nextSet }), 'Rest over. Next: Bench Press, set 1.');
    assert.equal(restOverAnnouncement({ ...base, next: nextSet }), 'Rest over. Time for your next set.');
  });

  test("after the workout's last set it doesn't send you to a next set", () => {
    assert.equal(restOverAnnouncement({ ...base, next: null }), 'Rest over. That was your last set.');
    assert.equal(followsLastSet({ ...base, next: null }), true);
    assert.equal(followsLastSet({ ...base, next: undefined }), false, 'not known is not the same as nothing left');
    assert.equal(followsLastSet(presetRest(null, 60, NOW)), false);
  });
});

describe('when the rest ends', () => {
  const rest = (patch: Partial<RestTimer> = {}): RestTimer => ({ endsAtMs: NOW, durationSec: 90, label: 'Squat · set 1', ...patch });

  const open = { awaySinceMs: null };
  /** Back in the app, having left at `sinceMs`. */
  const back = (sinceMs: number) => ({ awaySinceMs: sinceMs, returning: true });
  /** Still in the background since `sinceMs` (a JS timer can still fire there for a moment). */
  const away = (sinceMs: number) => ({ awaySinceMs: sinceMs });

  test('nothing to end without a rest, while paused, or before its time', () => {
    assert.equal(restEnd(null, NOW, open), 'none');
    assert.equal(restEnd(rest({ pausedRemainingMs: 0 }), NOW + 60_000, open), 'running');
    assert.equal(restEnd(rest(), NOW - 1_000, open), 'running');
    assert.equal(restEnd(rest(), NOW - 10, open), 'alert', 'a timer a hair early counts');
  });

  test('ending with the app open alerts; noticed late, it passes quietly', () => {
    assert.equal(restEnd(rest(), NOW, open), 'alert');
    assert.equal(restEnd(rest(), NOW + LATE_END_MS, open), 'alert');
    assert.equal(restEnd(rest(), NOW + LATE_END_MS + 1, open), 'quiet');
    assert.equal(restEnd(rest(), NOW + 1_000, back(NOW + 500)), 'alert', 'ended just before going away, and the timer fired late');
  });

  test('ending while the app is still in the background leaves the rest for the alarm', () => {
    // Locked 3 s before the end; iOS still runs JS timers for a moment, so the end timer fires.
    assert.equal(restEnd(rest(), NOW, away(NOW - 3_000)), 'away');
    assert.equal(restEnd(rest(), NOW + 60_000, away(NOW - 3_000)), 'away');
    assert.equal(restEnd(rest({ pausedRemainingMs: 5_000 }), NOW, away(NOW - 3_000)), 'running');
  });

  test('back after the alarm rang: quiet; back before it could: the app marks the end itself', () => {
    const ending = rest({ endsAtMs: NOW + 400 });
    const alarmAt = restAlarmTimeMs(ending.endsAtMs);
    assert.equal(alarmAt, NOW + 1_000, 'the alarm rings at the next whole second');
    assert.equal(restEnd(ending, NOW + 700, back(NOW - 3_000)), 'alert', 'between the end and the alarm');
    assert.equal(restEnd(ending, alarmAt, back(NOW - 3_000)), 'quiet', 'the alarm has had its time');
    assert.equal(restEnd(ending, NOW + 30_000, back(NOW - 3_000)), 'quiet');
    assert.equal(restEnd(rest(), NOW + 500, back(NOW - 30_000)), 'quiet', 'ended on a whole second while locked, back within a second');
    assert.equal(restEnd(rest(), NOW, back(NOW)), 'quiet', 'went away at the very moment');
  });
});

describe('the rest across restarts', () => {
  const older = { endsAtMs: NOW + 30_000, durationSec: 90, label: 'Squat · set 2' };

  test('a note saved before G3.8 still restores, running or paused, and just never teaches', () => {
    assert.deepEqual(restoredRest(older, NOW), older);
    assert.deepEqual(restoredRest({ ...older, endsAtMs: NOW - 60_000, pausedRemainingMs: 40_000 }, NOW + 3_600_000), { ...older, endsAtMs: NOW - 60_000, pausedRemainingMs: 40_000 });
    assert.equal(learnedRest(restoredRest(older, NOW)), null);
  });

  test('what a rest follows survives the note; one that ran out meanwhile is dropped', () => {
    const meta: ActiveWorkoutMeta = { sessionId: 's', mode: 'new', rest: { ...older, after: { entryId: 'sq', setId: 'sq2', exerciseId: 'squat' }, source: 'default', learnable: true } };
    const restored = restoredRest(JSON.parse(JSON.stringify(meta)).rest, NOW);
    assert.deepEqual(learnedRest(restored), { exerciseId: 'squat', sec: 90 });
    assert.equal(restoredRest(meta.rest, NOW + 30_000), null);
  });

  test('an unreadable note restores nothing', () => {
    assert.equal(restoredRest(undefined, NOW), null);
    assert.equal(restoredRest({ ...older, endsAtMs: Number.NaN }, NOW), null);
    assert.equal(restoredRest({ ...older, pausedRemainingMs: Number.NaN }, NOW), null);
  });
});

describe('remembered rests in preferences', () => {
  test("an exercise's rest: remembered, else its type's default", () => {
    assert.deepEqual(exerciseRest('squat', 'compound', settings({ squat: 135 })), { durationSec: 135, source: 'remembered' });
    assert.deepEqual(exerciseRest('curl', 'isolation', settings({ squat: 135 })), { durationSec: 90, source: 'default' });
    assert.deepEqual(exerciseRest('squat', 'compound', settings({ squat: Number.NaN })), { durationSec: 180, source: 'default' });
  });

  test('set and reset, kept inside the limits', () => {
    const set1 = withRememberedRests(defaultPreferences, { squat: 135, curl: 5, row: 9_999 });
    assert.deepEqual(set1.restByExerciseSec, { squat: 135, curl: REST_LIMITS_SEC.min, row: REST_LIMITS_SEC.max });
    assert.deepEqual(withRememberedRests(set1, { squat: null, curl: null }).restByExerciseSec, { row: REST_LIMITS_SEC.max });
    assert.deepEqual(defaultPreferences.restByExerciseSec, {}, 'the defaults are never changed in place');
    assert.equal(clampRestSec(134.6), 135);
  });

  test('older saved preferences load without them, and junk is dropped', () => {
    const { restByExerciseSec: _none, ...older } = defaultPreferences;
    assert.deepEqual(withPreferenceDefaults(older).restByExerciseSec, {});
    const junk = withPreferenceDefaults({ ...defaultPreferences, restByExerciseSec: { squat: 120, a: 'x', b: -5, c: Number.POSITIVE_INFINITY, d: 2_000 } as unknown as Record<string, number> });
    assert.deepEqual(junk.restByExerciseSec, { squat: 120, d: REST_LIMITS_SEC.max });
    assert.equal(withPreferenceDefaults(null), defaultPreferences);
  });

  test('they round-trip through the database, and a row saved before them still loads', async () => {
    const db = openTestDatabase();
    migrate(db);
    eraseAllData(db);
    const repo = createSqliteRepository(db, { today: () => '2026-10-26' });
    const { restByExerciseSec: _none, ...older } = defaultPreferences;
    db.runSync('INSERT INTO preferences (id, data, updated_at) VALUES (?, ?, ?)', ['me', JSON.stringify({ ...older, units: 'metric' }), '2026-10-26']);
    const loaded = await repo.getPreferences();
    assert.deepEqual([loaded.units, loaded.restByExerciseSec], ['metric', {}]);
    await repo.savePreferences(withRememberedRests(loaded, { squat: 150 }));
    assert.deepEqual((await repo.getPreferences()).restByExerciseSec, { squat: 150 });
    db.close();
  });
});

describe('keeping the next set in view', () => {
  const view = { rowHeight: 50, scrollY: 1000, viewportHeight: 700, contentHeight: 4000, coveredBelow: 100 };

  test('a row already in view above the bar stays put', () => {
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 1000 }), null);
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 1550 }), null, 'its bottom just clears the bar');
  });

  test('a row behind the bar or below scrolls up just enough to sit above the bar', () => {
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 1580 }), 1580 + 50 - 600 + GAP_BELOW);
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 3000 }), 3000 + 50 - 600 + GAP_BELOW);
  });

  test('a row above comes down with room for its exercise header', () => {
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 800 }), 800 - CONTEXT_ABOVE);
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 40 }), 0);
  });

  test('never past the end of the content', () => {
    assert.equal(scrollOffsetToShow({ ...view, rowTop: 3950, contentHeight: 4000 }), 3300);
  });

  // iPhone-sized: a 742 pt scroll view, 34 pt home indicator, a 250 pt number pad, and the bar (74 + 8 gap) riding on it.
  const phone = { viewportHeight: 742, contentHeight: 2400, rowHeight: 52, scrollY: 0 };
  const withKeyboard = { ...phone, coveredBelow: coveredBelow({ safeAreaBottom: 34, keyboardHeight: 250, barSpace: 82 }), keyboardInset: 250 };
  /** Where the row's bottom lands on screen after the scroll (or staying put). */
  const rowBottomAfter = (m: Parameters<typeof scrollOffsetToShow>[0]) => m.rowTop + m.rowHeight - (scrollOffsetToShow(m) ?? m.scrollY);

  test('the bar sits on the keyboard while it is up, else on the home indicator', () => {
    assert.equal(coveredBelow({ safeAreaBottom: 34, keyboardHeight: 0, barSpace: 82 }), 116);
    assert.equal(coveredBelow({ safeAreaBottom: 34, keyboardHeight: 250, barSpace: 82 }), 332);
  });

  test('with the number pad up, a row behind it scrolls up above the keyboard and the bar', () => {
    const visibleBottom = 742 - 332;
    // Just below the keyboard's top: it used to count as visible and stay hidden.
    const behind = { ...withKeyboard, rowTop: 742 - 34 - 72 - 60 };
    assert.notEqual(scrollOffsetToShow(behind), null);
    assert.ok(rowBottomAfter(behind) <= visibleBottom);
    // Below the scroll view: it used to land behind the keyboard.
    const below = { ...withKeyboard, rowTop: 900 };
    assert.equal(rowBottomAfter(below), visibleBottom - GAP_BELOW);
  });

  test('with the number pad up, the content scrolls as far as the keyboard inset allows', () => {
    // The last row, above the content's bottom padding (home indicator + bar + gap = 140 pt).
    // Without the inset the clamp would stop 250 pt short and leave it under the keyboard.
    const last = { ...withKeyboard, rowTop: 2400 - 140 - 52 };
    assert.equal(scrollOffsetToShow(last), 2260 - (742 - 332) + GAP_BELOW);
    assert.equal(scrollOffsetToShow({ ...last, keyboardInset: 0 }), 2400 - 742, 'what it did before');
    assert.equal(scrollOffsetToShow({ ...last, rowTop: 2348 }), 2400 + 250 - 742, 'never past the end, inset included');
  });

  test('the scroll uses the bar as measured after it appears, so the row clears a taller bar', () => {
    // A two-line "Next" transition bar at default text (110 pt), and the stacked bar at large text (199 pt).
    for (const bar of [110, 199]) {
      const m = { ...phone, rowTop: 900, rowHeight: 78, coveredBelow: coveredBelow({ safeAreaBottom: 34, keyboardHeight: 0, barSpace: bar }) };
      assert.ok(rowBottomAfter(m) <= 742 - 34 - bar, `bar ${bar}`);
    }
  });

  test('the scroll waits for the layout to settle, but never long', () => {
    assert.equal(settleDelayMs(NOW, NOW + SETTLE_MAX_MS), SETTLE_MS);
    assert.equal(settleDelayMs(NOW + SETTLE_MAX_MS - 10, NOW + SETTLE_MAX_MS), 10, 'each layout report waits a little longer, up to the deadline');
    assert.equal(settleDelayMs(NOW + SETTLE_MAX_MS + 5, NOW + SETTLE_MAX_MS), 0);
  });
});
