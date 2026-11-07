import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { elapsedSeconds } from '../src/features/workout/elapsed';

const startedAt = '2026-11-03T17:00:00.000Z';
const completedAt = '2026-11-03T17:52:10.000Z';
// Friday, three days after Tuesday's workout.
const friday = Date.parse('2026-11-06T19:12:05.000Z');

describe('workout clock', () => {
  test('a new workout counts from its start', () => {
    const now = Date.parse('2026-11-03T17:12:05.000Z');
    assert.equal(elapsedSeconds({ mode: 'new', session: { startedAt } }, now), 12 * 60 + 5);
  });

  test('a reopened workout shows how long it took, not the days since it started', () => {
    assert.equal(elapsedSeconds({ mode: 'reopen', session: { startedAt, completedAt } }, friday), 52 * 60 + 10);
  });

  test('a reopened workout stays frozen as time passes', () => {
    const clock = { mode: 'reopen' as const, session: { startedAt, completedAt } };
    assert.equal(elapsedSeconds(clock, friday + 60_000), elapsedSeconds(clock, friday));
  });

  test('no start time reads 0', () => {
    assert.equal(elapsedSeconds({ mode: 'new', session: {} }, friday), 0);
    assert.equal(elapsedSeconds({ mode: 'reopen', session: { completedAt } }, friday), 0);
  });
});
