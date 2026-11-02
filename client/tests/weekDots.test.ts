// Home's day dots and target caption, moved out of WeeklySnapshot.tsx so "Your week" (G3.12) and
// Node tests share them. Home must read exactly as before.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { StreakTargetSource } from '../src/data/types';
import { dayStatus, targetCaption, type DayStatus } from '../src/features/home/weekDots';
import type { DayItemStatus } from '../src/features/today/agenda';

const ALL: DayItemStatus[] = ['planned', 'in_progress', 'completed', 'partial', 'missed', 'skipped'];

/** WeeklySnapshot.tsx's dayStatus before G3.12, copied verbatim. */
function homeDayStatusBefore(items: { status: DayItemStatus }[]): DayStatus {
  if (items.some((x) => x.status === 'completed')) return 'done';
  if (items.some((x) => x.status === 'partial')) return 'partial';
  if (items.some((x) => x.status === 'missed')) return 'missed';
  if (items.some((x) => x.status === 'planned' || x.status === 'in_progress')) return 'planned';
  return 'rest';
}

/** WeeklySnapshot.tsx's targetCaption before G3.12 (this week only), copied verbatim. */
function homeCaptionBefore(streak: { thisWeekSource: StreakTargetSource; thisWeekTarget: number; thisWeekPlanned: number }): string {
  switch (streak.thisWeekSource) {
    case 'goal':
      return `Weekly goal: ${streak.thisWeekTarget}`;
    case 'plan':
      return `${streak.thisWeekPlanned} planned this week`;
    case 'minimum':
      return 'Nothing planned this week';
    case 'legacy':
      return `Weekly target: ${streak.thisWeekTarget}`;
  }
}

describe('day dots', () => {
  test('match Home’s old rule for every mix of up to three items', () => {
    const mixes: DayItemStatus[][] = [[]];
    for (const a of ALL) {
      mixes.push([a]);
      for (const b of ALL) {
        mixes.push([a, b]);
        for (const c of ALL) mixes.push([a, b, c]);
      }
    }
    for (const mix of mixes) {
      const items = mix.map((status) => ({ status }));
      assert.equal(dayStatus(items), homeDayStatusBefore(items), mix.join(','));
    }
  });

  test('done beats partial beats missed beats planned; skipped alone is a rest day', () => {
    assert.equal(dayStatus([{ status: 'missed' }, { status: 'completed' }]), 'done');
    assert.equal(dayStatus([{ status: 'missed' }, { status: 'partial' }]), 'partial');
    assert.equal(dayStatus([{ status: 'planned' }, { status: 'missed' }]), 'missed');
    assert.equal(dayStatus([{ status: 'in_progress' }]), 'planned');
    assert.equal(dayStatus([{ status: 'skipped' }]), 'rest');
    assert.equal(dayStatus([]), 'rest');
  });
});

describe('target caption', () => {
  const sources: StreakTargetSource[] = ['goal', 'plan', 'minimum', 'legacy'];

  test('this week reads exactly as Home did', () => {
    for (const source of sources) {
      const streak = { thisWeekSource: source, thisWeekTarget: 4, thisWeekPlanned: 3 };
      assert.equal(targetCaption({ source, target: 4, planned: 3 }, { thisWeek: true }), homeCaptionBefore(streak));
    }
  });

  test('a past week says "that week"', () => {
    assert.equal(targetCaption({ source: 'plan', target: 3, planned: 3 }, { thisWeek: false }), '3 planned that week');
    assert.equal(targetCaption({ source: 'minimum', target: 1, planned: 0 }, { thisWeek: false }), 'Nothing planned that week');
    assert.equal(targetCaption({ source: 'goal', target: 4, planned: 3 }, { thisWeek: false }), 'Weekly goal: 4');
    assert.equal(targetCaption({ source: 'legacy', target: 2, planned: 0 }, { thisWeek: false }), 'Weekly target: 2');
  });
});
