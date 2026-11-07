import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { firstParam, numberParam } from '../src/lib/params';

describe('route params from links', () => {
  test('firstParam: a missing param is empty, and a repeated one gives its first value', () => {
    assert.equal(firstParam(undefined), '');
    assert.equal(firstParam('a@b.co'), 'a@b.co');
    assert.equal(firstParam(['a@b.co', 'c@d.co']), 'a@b.co');
    assert.equal(firstParam([]), '');
  });

  test('numberParam: the recording countdown stays 5-10 seconds, and a bad link counts down from 5 (spec 2.8)', () => {
    const countdown = (value: string | string[] | undefined) => numberParam(value, { min: 5, max: 10, fallback: 5 });
    assert.equal(countdown('5'), 5);
    assert.equal(countdown('10'), 10);
    assert.equal(countdown(undefined), 5);
    assert.equal(countdown('x'), 5, 'not a number: never NaN, which froze the countdown');
    assert.equal(countdown(''), 5);
    assert.equal(countdown('0'), 5);
    assert.equal(countdown('-3'), 5);
    assert.equal(countdown('99'), 10);
    assert.equal(countdown('7.6'), 8);
    assert.equal(countdown(['10', '5']), 10);
  });
});
