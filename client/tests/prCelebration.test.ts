import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { badgeCelebration, JUST_COMPLETED_MS } from '../src/components/ui/prCelebration';

const now = Date.parse('2026-11-06T18:00:00.000Z');
const justNow = new Date(now - 300).toISOString();
const earlier = new Date(now - JUST_COMPLETED_MS - 1).toISOString();
const base = { celebrate: true, celebrations: true, completedAt: justNow, now, reducedMotion: false };

describe('PR badge celebration', () => {
  test('a PR set just completed pops in with the success haptic', () => {
    assert.deepEqual(badgeCelebration(base), { haptic: true, animate: true });
  });

  test('with PR celebrations off in Settings, the badge is static and silent', () => {
    assert.deepEqual(badgeCelebration({ ...base, celebrations: false }), { haptic: false, animate: false });
  });

  test('a badge for a set completed earlier, or on opening, stays quiet', () => {
    assert.deepEqual(badgeCelebration({ ...base, completedAt: earlier }), { haptic: false, animate: false });
  });

  test('Reduce Motion keeps the haptic and drops the animation', () => {
    assert.deepEqual(badgeCelebration({ ...base, reducedMotion: true }), { haptic: true, animate: false });
    assert.deepEqual(badgeCelebration({ ...base, reducedMotion: true, celebrations: false }), { haptic: false, animate: false });
  });

  test('a badge that is not asked to celebrate never does', () => {
    assert.deepEqual(badgeCelebration({ ...base, celebrate: false }), { haptic: false, animate: false });
  });
});
