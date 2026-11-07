import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { swapData } from '../src/features/settings/devData';

/** A swap with each step counted. */
function steps({ workoutOpen = false, confirmed = true, fails = false } = {}) {
  const calls = { confirm: 0, swap: 0 };
  return {
    calls,
    input: {
      workoutOpen,
      confirm: async () => {
        calls.confirm++;
        return confirmed;
      },
      swap: async () => {
        calls.swap++;
        if (fails) throw new Error('database is locked');
      },
    },
  };
}

describe('Load sample data and Erase all data (Profile → Developer)', () => {
  test('with a workout open, nothing is asked or swapped, so its autosave can’t bring it back', async () => {
    const { calls, input } = steps({ workoutOpen: true });
    assert.equal(await swapData(input), 'workout-open');
    assert.deepEqual(calls, { confirm: 0, swap: 0 });
  });

  test('asks first, and Cancel swaps nothing', async () => {
    const { calls, input } = steps({ confirmed: false });
    assert.equal(await swapData(input), 'cancelled');
    assert.deepEqual(calls, { confirm: 1, swap: 0 });
  });

  test('a confirmed swap runs once', async () => {
    const { calls, input } = steps();
    assert.equal(await swapData(input), 'done');
    assert.deepEqual(calls, { confirm: 1, swap: 1 });
  });

  test('a failed swap is reported, not thrown', async () => {
    const { calls, input } = steps({ fails: true });
    assert.equal(await swapData(input), 'failed');
    assert.deepEqual(calls, { confirm: 1, swap: 1 });
  });
});
