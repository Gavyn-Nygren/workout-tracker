// When NotificationSync's runs start (G3.12): the debounce after a burst of writes, its cap, and
// leaving the app, where a run still waiting starts at once because iOS stops JS timers once it
// suspends the app (a workout skipped, then the phone locked straight away).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { createSyncTimer, DEBOUNCE_MS, leftForeground, MAX_WAIT_MS, WORKOUT_DEBOUNCE_MS } from '../src/features/notifications/syncTimer';

const HERE = { workoutOpen: false, away: false };

describe('when a sync run starts', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
  afterEach(() => mock.timers.reset());

  function harness() {
    let runs = 0;
    const timer = createSyncTimer(() => runs++);
    return { timer, runs: () => runs };
  }

  test('a trigger runs once after the debounce; 3 s while a workout is open', () => {
    const h = harness();
    h.timer.trigger(HERE);
    mock.timers.tick(DEBOUNCE_MS - 1);
    assert.equal(h.runs(), 0);
    mock.timers.tick(1);
    assert.equal(h.runs(), 1);
    mock.timers.tick(10 * MAX_WAIT_MS);
    assert.equal(h.runs(), 1, 'only once');

    h.timer.trigger({ workoutOpen: true, away: false });
    mock.timers.tick(WORKOUT_DEBOUNCE_MS - 1);
    assert.equal(h.runs(), 1);
    mock.timers.tick(1);
    assert.equal(h.runs(), 2);
  });

  test('a burst restarts the debounce, but a run starts at most 10 s after the first trigger waiting', () => {
    const h = harness();
    h.timer.trigger(HERE);
    mock.timers.tick(DEBOUNCE_MS - 1);
    h.timer.trigger(HERE);
    mock.timers.tick(DEBOUNCE_MS - 1);
    assert.equal(h.runs(), 0, 'restarted');
    mock.timers.tick(1);
    assert.equal(h.runs(), 1);

    // Autosaves every 2.5 s during a workout would hold a 3 s debounce off for ever.
    for (let i = 0; i < 4; i++) {
      h.timer.trigger({ workoutOpen: true, away: false });
      mock.timers.tick(i < 3 ? 2500 : MAX_WAIT_MS - 3 * 2500 - 1);
    }
    assert.equal(h.runs(), 1, 'held off by the autosaves');
    mock.timers.tick(1);
    assert.equal(h.runs(), 2, '10 s after the first of them, though the last came only 2.5 s before');
    mock.timers.tick(10 * MAX_WAIT_MS);
    assert.equal(h.runs(), 2);
  });

  test('leaving the app runs what is still waiting, at once and only once', () => {
    const h = harness();
    h.timer.trigger(HERE); // Skip on today's workout…
    mock.timers.tick(300);
    h.timer.flush(); // …then the phone is locked
    assert.equal(h.runs(), 1, 'before iOS can suspend the app');
    mock.timers.tick(10 * MAX_WAIT_MS);
    assert.equal(h.runs(), 1, "the debounce's timer doesn't run it again");

    h.timer.flush();
    assert.equal(h.runs(), 1, 'nothing waiting, nothing runs');
  });

  test('a trigger while the app is away runs straight away (the autosave made on leaving, a late write)', () => {
    const h = harness();
    h.timer.trigger({ workoutOpen: true, away: true });
    assert.equal(h.runs(), 1);
    h.timer.trigger(HERE);
    h.timer.trigger({ workoutOpen: false, away: true });
    assert.equal(h.runs(), 2, 'the one waiting goes with it');
    mock.timers.tick(10 * MAX_WAIT_MS);
    assert.equal(h.runs(), 2);
  });

  test('cancel drops a run still waiting, and the next trigger waits from scratch', () => {
    const h = harness();
    h.timer.trigger(HERE);
    mock.timers.tick(DEBOUNCE_MS - 1);
    h.timer.cancel(); // the inputs aren't complete any more
    mock.timers.tick(10 * MAX_WAIT_MS);
    h.timer.flush();
    assert.equal(h.runs(), 0);

    h.timer.trigger(HERE);
    mock.timers.tick(DEBOUNCE_MS - 1);
    assert.equal(h.runs(), 0, 'the cap counts from this trigger, not the dropped one');
    mock.timers.tick(1);
    assert.equal(h.runs(), 1);
  });
});

test("only 'background' and 'inactive' count as leaving the app", () => {
  assert.equal(leftForeground('background'), true);
  assert.equal(leftForeground('inactive'), true);
  for (const state of ['active', 'unknown', 'extension', null, undefined]) assert.equal(leftForeground(state), false, String(state));
});
