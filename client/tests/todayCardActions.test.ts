import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ScheduledOccurrence } from '../src/data/types';
import type { DayItemStatus } from '../src/features/today/agenda';
import { cardMenu } from '../src/features/today/cardMenu';
import { startButton } from '../src/features/today/startButton';

const TODAY = '2026-10-22';
const SATURDAY = '2026-10-24';
const TUESDAY = '2026-10-20';

describe('Today card start button', () => {
  const button = (status: DayItemStatus, date: string, index = 0, total = 1) => startButton({ status, date }, TODAY, index, total);

  test('a workout started early and still open says Resume, not Start early', () => {
    assert.deepEqual(button('in_progress', SATURDAY), { title: 'Resume Workout', accessibilityLabel: undefined, main: true });
    assert.deepEqual(button('in_progress', SATURDAY, 1, 2), { title: 'Resume Workout 2/2', accessibilityLabel: 'Resume workout 2 of 2', main: true });
  });

  test('a future workout not started yet says Start early', () => {
    assert.deepEqual(button('planned', SATURDAY), { title: 'Start early', accessibilityLabel: undefined, main: false });
    assert.deepEqual(button('planned', SATURDAY, 0, 3), { title: 'Start early 1/3', accessibilityLabel: 'Start workout 1 of 3 early', main: false });
  });

  test("today's, a missed and a skipped workout", () => {
    assert.equal(button('planned', TODAY)?.title, 'Start Workout');
    assert.equal(button('in_progress', TODAY)?.title, 'Resume Workout');
    assert.equal(button('missed', TUESDAY)?.title, 'Start Workout');
    assert.deepEqual(button('skipped', TUESDAY, 0, 2), { title: 'Start anyway 1/2', accessibilityLabel: 'Start workout 1 of 2 anyway', main: false });
  });

  test('a finished workout has no start button', () => {
    assert.equal(button('completed', TUESDAY), undefined);
    assert.equal(button('partial', TUESDAY), undefined);
  });
});

describe('Today card menu', () => {
  const occurrence = (planId: string): ScheduledOccurrence => ({ id: `occ_${planId}_${TUESDAY}_a`, planId, planVersion: 1, planWorkoutId: 'a', scheduledDate: TUESDAY });
  const plans = new Map([['p1', 'active'], ['paused', 'paused'], ['archived', 'archived']] as const);
  const menu = (status: DayItemStatus, planId: string, date = TUESDAY) => cardMenu({ status, date, occurrence: occurrence(planId) }, plans, TODAY);

  test('skip a planned or missed workout, unskip a skipped one', () => {
    assert.equal(menu('planned', 'p1', SATURDAY), 'skip');
    assert.equal(menu('missed', 'p1'), 'skip');
    assert.equal(menu('skipped', 'p1'), 'unskip');
    assert.equal(menu('skipped', 'p1', SATURDAY), 'unskip');
  });

  test('no Unskip once the plan is deleted, since the workout would vanish', () => {
    assert.equal(menu('skipped', 'gone'), undefined);
  });

  test('no Unskip from today on while the plan is paused or archived; a past skip can still be undone', () => {
    for (const planId of ['paused', 'archived']) {
      assert.equal(menu('skipped', planId, TODAY), undefined, planId);
      assert.equal(menu('skipped', planId, SATURDAY), undefined, planId);
      assert.equal(menu('skipped', planId, TUESDAY), 'unskip', planId);
    }
  });

  test('no menu for started or finished workouts, or ones not on a plan', () => {
    for (const status of ['in_progress', 'completed', 'partial'] as const) assert.equal(menu(status, 'p1'), undefined, status);
    assert.equal(cardMenu({ status: 'skipped', date: TUESDAY }, plans, TODAY), undefined);
  });
});
