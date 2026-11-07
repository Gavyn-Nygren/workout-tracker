import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { WorkoutSession } from '../src/data/types';
import { lastDone } from '../src/features/plans/lastDone';

const SQUAT = 'ex_back_squat';

const session = (id: string, completedDate: string, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id,
  name: 'Legs',
  status: 'completed',
  completedDate,
  completedAt: `${completedDate}T18:00:00.000Z`,
  blocks: [
    {
      id: `${id}_b`,
      type: 'single',
      exercises: [{ id: `${id}_e`, exerciseId: SQUAT, skipped: false, sets: [{ id: `${id}_s`, kind: 'normal', modifiers: [], reps: 5, loadKg: 100, completedAt: `${completedDate}T17:30:00.000Z` }] }],
    },
  ],
  createdAt: `${completedDate}T17:00:00.000Z`,
  updatedAt: `${completedDate}T18:00:00.000Z`,
  ...extra,
});

describe('exercise screen: last done', () => {
  test('the latest finished workout with a completed set of it', () => {
    const sessions = [session('a', '2026-10-15'), session('b', '2026-10-20'), session('c', '2026-10-21', { status: 'skipped', completedAt: undefined })];
    assert.equal(lastDone(sessions, SQUAT)?.session.id, 'b');
    assert.equal(lastDone(sessions, 'ex_bench_press'), undefined);
  });

  test('a reopened workout still counts while it is open', () => {
    // Reopened: in progress again, completion time and date kept (reopen.ts).
    const sessions = [session('a', '2026-10-15'), session('b', '2026-10-20', { status: 'in_progress' })];
    assert.equal(lastDone(sessions, SQUAT)?.session.id, 'b');
  });

  test('a reopened workout counts as its copy from before the reopen, not its edits', () => {
    const before = session('b', '2026-10-20');
    const edits = (completedAt: string | undefined): WorkoutSession => ({
      ...before,
      status: 'in_progress',
      beforeReopen: before,
      blocks: [{ ...before.blocks[0], exercises: [{ ...before.blocks[0].exercises[0], sets: [{ ...before.blocks[0].exercises[0].sets[0], loadKg: 200, completedAt }] }] }],
    });
    const typed = lastDone([session('a', '2026-10-15'), edits('2026-10-20T17:30:00.000Z')], SQUAT);
    assert.equal(typed?.session.id, 'b');
    assert.equal(typed?.entry.sets[0].loadKg, 100);
    // Unticking the set mid-edit doesn't make the workout drop out.
    assert.equal(lastDone([session('a', '2026-10-15'), edits(undefined)], SQUAT)?.session.id, 'b');
  });

  test('a workout not finished yet does not', () => {
    const open = session('b', '2026-10-20', { status: 'in_progress', completedAt: undefined, completedDate: undefined });
    assert.equal(lastDone([session('a', '2026-10-15'), open], SQUAT)?.session.id, 'a');
  });
});
