import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { permissionSheetGuard, type AskSteps } from '../src/features/notifications/permissionSheet';

/** One iOS prompt that every pending request waits on, as requestPermissionsAsync does. */
function prompt() {
  const waiting: { resolve: (answer: string) => void; reject: (error: Error) => void }[] = [];
  return {
    request: () => new Promise<string>((resolve, reject) => waiting.push({ resolve, reject })),
    get pending() {
      return waiting.length;
    },
    answer: (answer: string) => waiting.splice(0).forEach((w) => w.resolve(answer)),
    fail: () => waiting.splice(0).forEach((w) => w.reject(new Error('no'))),
  };
}

/** The sheet's steps, counting each call. */
function sheet(request: () => Promise<string>) {
  const calls = { started: 0, answered: [] as string[], failed: 0, exit: 0 };
  const steps: AskSteps<string> = {
    request,
    started: () => calls.started++,
    answered: (a) => calls.answered.push(a),
    failed: () => calls.failed++,
    exit: () => calls.exit++,
  };
  return { calls, steps };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('notification permission sheet (spec 2.11)', () => {
  test('a double tap on Turn on asks once and closes the sheet once', async () => {
    const ios = prompt();
    const guard = permissionSheetGuard();
    guard.showing();
    const { calls, steps } = sheet(ios.request);
    const first = guard.allow(steps);
    const second = guard.allow(steps);
    assert.equal(ios.pending, 1);
    ios.answer('granted');
    await Promise.all([first, second]);
    assert.deepEqual(calls, { started: 1, answered: ['granted'], failed: 0, exit: 1 });
  });

  test('Not now while iOS asks: the answer still counts, but the sheet is not closed again', async () => {
    const ios = prompt();
    const guard = permissionSheetGuard();
    guard.showing();
    const { calls, steps } = sheet(ios.request);
    const asking = guard.allow(steps);
    guard.close(steps.exit);
    guard.close(steps.exit);
    ios.answer('granted');
    await asking;
    assert.deepEqual(calls, { started: 1, answered: ['granted'], failed: 0, exit: 1 });
    // Closed: a later tap doesn't ask.
    await guard.allow(steps);
    assert.equal(ios.pending, 0);
  });

  test('swiped down while iOS asks: a late answer closes nothing', async () => {
    const ios = prompt();
    const guard = permissionSheetGuard();
    const unmount = guard.showing();
    const { calls, steps } = sheet(ios.request);
    const asking = guard.allow(steps);
    unmount();
    ios.answer('denied');
    await asking;
    assert.deepEqual(calls, { started: 1, answered: ['denied'], failed: 0, exit: 0 });
  });

  test('a failed ask closes the sheet once', async () => {
    const ios = prompt();
    const guard = permissionSheetGuard();
    guard.showing();
    const { calls, steps } = sheet(ios.request);
    const asking = guard.allow(steps);
    void guard.allow(steps);
    ios.fail();
    await asking;
    await settle();
    assert.deepEqual(calls, { started: 1, answered: [], failed: 1, exit: 1 });
  });
});
