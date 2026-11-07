import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formatNumber, parseNumber, shouldSyncText } from '../src/components/ui/numberText';
import { kgToLb, lbToKg } from '../src/data/units';

// The set row's weight field in pounds: what's typed is stored in kg, then shown back in lb to 2 decimals.
const shownInLb = (typedLb: number) => Math.round(kgToLb(lbToKg(typedLb)) * 100) / 100;

describe('number field text', () => {
  test('parses both decimal separators and formats to 2 decimals', () => {
    assert.equal(parseNumber('1,5', true), 1.5);
    assert.equal(parseNumber('100.', true), 100);
    assert.equal(parseNumber('.', true), undefined);
    assert.equal(parseNumber('', false), undefined);
    assert.equal(formatNumber(100.125), '100.13');
    assert.equal(formatNumber(undefined), '');
  });

  test('a field that is not focused always shows the value', () => {
    assert.equal(shouldSyncText('100', 95, true, false), true);
    assert.equal(shouldSyncText('95', 95, true, false), true);
  });

  test('PREVIOUS copied in while the field is focused replaces the typed number', () => {
    assert.equal(shouldSyncText('100', 95, true, true), true);
    // Typed, then PREVIOUS had no weight (a bodyweight set without added load).
    assert.equal(shouldSyncText('10', undefined, true, true), true);
    // Cleared, then PREVIOUS filled it.
    assert.equal(shouldSyncText('', 95, true, true), true);
    assert.equal(shouldSyncText('5', 8, false, true), true);
  });

  test('what the user is typing is never rewritten', () => {
    assert.equal(shouldSyncText('100.', 100, true, true), false);
    assert.equal(shouldSyncText('1,5', 1.5, true, true), false);
    assert.equal(shouldSyncText('100.125', 100.13, true, true), false);
    assert.equal(shouldSyncText('08', 8, false, true), false);
    assert.equal(shouldSyncText('', undefined, true, true), false);
    assert.equal(shouldSyncText('.', undefined, true, true), false);
  });

  test('the lb to kg round trip never rewrites what is typed', () => {
    for (let thousandths = 0; thousandths <= 500_000; thousandths += 5) {
      const text = String(thousandths / 1000);
      const typed = parseNumber(text, true)!;
      assert.equal(shouldSyncText(text, shownInLb(typed), true, true), false, text);
    }
  });
});
