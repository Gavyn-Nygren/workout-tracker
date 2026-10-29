import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { lbToKg } from '../src/data/units';
import {
  deltaDirection,
  describeChange,
  formatMetric,
  formatMetricDelta,
  metricDecimals,
  roundDelta,
  spokenMetric,
  spokenMetricDelta,
  valueTicks,
  type ShownMetric,
} from '../src/features/progress/progressFormat';
import type { Point } from '../src/features/progress/series';
import { formatLongDateYear, formatMonthDayYear, formatShortDateYear } from '../src/lib/format';

const today = '2026-10-29';
const pt = (date: string, value: number): Point => ({ date, value });

describe('metric values', () => {
  test('top set shows the logged weight: one decimal, no trailing .0, grouped from 1,000', () => {
    assert.equal(formatMetric(102.5, 'top_set', 'metric'), '102.5 kg');
    assert.equal(formatMetric(100, 'top_set', 'metric'), '100 kg');
    assert.equal(formatMetric(227.5, 'top_set', 'imperial'), '227.5 lb');
    assert.equal(formatMetric(61.25, 'top_set', 'metric'), '61.3 kg');
    assert.equal(formatMetric(1000.4, 'top_set', 'imperial'), '1,000 lb');
    assert.equal(formatMetric(102.5, 'top_set', 'metric', false), '102.5');
  });

  test('e1RM and volume are whole numbers', () => {
    assert.equal(formatMetric(116.67, 'e1rm', 'metric'), '117 kg');
    assert.equal(formatMetric(12345.4, 'volume', 'imperial'), '12,345 lb');
    assert.equal(formatMetric(999.6, 'volume', 'metric', false), '1,000');
  });

  test('bodyweight lifts read added weight', () => {
    assert.equal(formatMetric(20, 'top_set', 'imperial', true, { added: true }), '+20 lb');
    assert.equal(formatMetric(0, 'top_set', 'imperial', true, { added: true }), 'Bodyweight');
    assert.equal(formatMetric(0.04, 'top_set', 'imperial', true, { added: true }), 'Bodyweight');
    assert.equal(formatMetric(-20, 'top_set', 'imperial', true, { added: true }), '−20 lb');
    assert.equal(formatMetric(2.5, 'top_set', 'metric', true, { added: true }), '+2.5 kg');
    // On an axis: signed numbers, 0 for bodyweight.
    assert.deepEqual([20, 0, -20].map((v) => formatMetric(v, 'top_set', 'imperial', false, { added: true })), ['+20', '0', '−20']);
  });

  test('reps, sets and holds count in whole units, singular for one', () => {
    assert.equal(formatMetric(1, 'reps', 'metric'), '1 rep');
    assert.equal(formatMetric(12, 'reps', 'metric'), '12 reps');
    assert.equal(formatMetric(1, 'sets', 'metric'), '1 set');
    assert.equal(formatMetric(3, 'sets', 'metric'), '3 sets');
    assert.equal(formatMetric(3, 'sets', 'metric', false), '3');
    assert.equal(formatMetric(75, 'longest_hold', 'metric'), '75 s');
    assert.equal(formatMetric(75, 'longest_hold', 'metric', false), '75');
  });

  test('bodyweight keeps one decimal', () => {
    assert.equal(formatMetric(180.25, 'bodyweight', 'imperial'), '180.3 lb');
    assert.equal(formatMetric(80, 'bodyweight', 'metric'), '80 kg');
  });
});

describe('spoken values', () => {
  test('weights with singular units', () => {
    assert.equal(spokenMetric(225, 'e1rm', 'imperial'), '225 pounds');
    assert.equal(spokenMetric(1, 'top_set', 'metric'), '1 kilogram');
    assert.equal(spokenMetric(102.5, 'top_set', 'metric'), '102.5 kilograms');
    assert.equal(spokenMetric(12, 'reps', 'metric'), '12 reps');
    assert.equal(spokenMetric(1, 'sets', 'metric'), '1 set');
  });

  test('added weight and holds', () => {
    assert.equal(spokenMetric(20, 'top_set', 'imperial', { added: true }), 'bodyweight plus 20 pounds');
    assert.equal(spokenMetric(-20, 'top_set', 'imperial', { added: true }), '20 pounds of assistance');
    assert.equal(spokenMetric(0, 'top_set', 'imperial', { added: true }), 'bodyweight');
    assert.equal(spokenMetric(75, 'longest_hold', 'metric'), '1 minute 15 seconds');
  });
});

describe('changes', () => {
  test('a change that rounds to zero is no change: no arrow, never +0 or −0', () => {
    assert.equal(formatMetricDelta(0.33, 'e1rm', 'metric'), 'No change');
    assert.equal(formatMetricDelta(-1e-9, 'e1rm', 'metric'), 'No change');
    assert.equal(formatMetricDelta(0.04, 'top_set', 'metric'), 'No change');
    assert.equal(formatMetricDelta(-0.04, 'bodyweight', 'imperial'), 'No change');
    assert.equal(deltaDirection(0.33, 'e1rm'), 'none');
    assert.equal(spokenMetricDelta(0.33, 'e1rm', 'metric'), 'no change');
    assert.equal(roundDelta(-0.0001, 'e1rm'), 0);
    assert.ok(!Object.is(roundDelta(-0.0001, 'e1rm'), -0));
  });

  test('signed changes at the shown precision', () => {
    assert.equal(formatMetricDelta(0.06, 'top_set', 'metric'), '+0.1 kg');
    assert.equal(formatMetricDelta(2.5, 'top_set', 'metric'), '+2.5 kg');
    assert.equal(formatMetricDelta(-5.4, 'e1rm', 'imperial'), '−5 lb');
    assert.equal(formatMetricDelta(1, 'sets', 'metric'), '+1 set');
    assert.equal(formatMetricDelta(-1, 'reps', 'metric'), '−1 rep');
    assert.equal(formatMetricDelta(15, 'longest_hold', 'metric'), '+15 s');
    assert.equal(deltaDirection(0.6, 'e1rm'), 'up');
    assert.equal(deltaDirection(-0.06, 'top_set'), 'down');
    assert.equal(spokenMetricDelta(15, 'e1rm', 'imperial'), 'up 15 pounds');
    assert.equal(spokenMetricDelta(-1, 'reps', 'metric'), 'down 1 rep');
  });

  test('the change line for a card and the graph readout', () => {
    const latest = pt('2026-10-26', 105);
    assert.deepEqual(describeChange({ kind: 'change', delta: 5, since: '2026-10-01', base: pt('2026-10-01', 100), latest }, 'e1rm', 'metric', today), {
      text: '+5 kg since Oct 1',
      spoken: 'Up 5 kilograms since Thursday, October 1',
      direction: 'up',
    });
    // Stored in kg, shown in lb.
    assert.equal(describeChange({ kind: 'change', delta: lbToKg(10), since: '2026-10-01', base: latest, latest }, 'e1rm', 'imperial', today)?.text, '+10 lb since Oct 1');
    assert.deepEqual(describeChange({ kind: 'change', delta: 0.2, since: '2025-12-20', base: latest, latest }, 'e1rm', 'metric', today), {
      text: 'No change since Dec 20, 2025',
      spoken: 'No change since Saturday, December 20, 2025',
      direction: 'none',
    });
    assert.deepEqual(describeChange({ kind: 'last_logged', date: '2026-08-20', latest }, 'e1rm', 'metric', today), {
      text: 'Last logged Aug 20',
      spoken: 'Last logged Thursday, August 20',
      direction: 'none',
    });
    assert.equal(describeChange({ kind: 'first_logged', date: '2026-10-20', latest }, 'sets', 'metric', today)?.text, 'First logged Oct 20');
    // The lift is logged, but the metric's value is older, or newer, than its sessions.
    assert.deepEqual(describeChange({ kind: 'metric_last', date: '2026-09-19', latest }, 'e1rm', 'metric', today), {
      text: 'Last e1RM Sep 19',
      spoken: 'Last estimated one-rep max on Saturday, September 19',
      direction: 'none',
    });
    assert.equal(describeChange({ kind: 'metric_first', date: '2025-10-28', latest }, 'top_set', 'metric', today)?.text, 'First top set Oct 28, 2025');
    assert.equal(describeChange({ kind: 'none' }, 'e1rm', 'metric', today), undefined);
  });
});

describe('y-axis ticks', () => {
  const label = (metric: ShownMetric, added = false) => (v: number) => formatMetric(v, metric, 'imperial', false, { added });

  test('a flat line gets whole-unit room, and no tick past zero that nobody logged', () => {
    // Pull-ups always at bodyweight (Top set as added weight: all 0).
    for (const values of [[0, 0, 0], [0]]) {
      const ticks = valueTicks(values, 'top_set');
      assert.deepEqual(ticks.map(label('top_set', true)), ['0', '+1', '+2']);
    }
    for (const values of [[1, 1], [5, 5]]) {
      const ticks = valueTicks(values, 'top_set');
      assert.ok(ticks.every((t) => t >= 0), JSON.stringify(ticks));
      assert.ok(ticks[1] - ticks[0] >= 0.5, JSON.stringify(ticks));
    }
    const assisted = valueTicks([-20, -20], 'top_set');
    assert.ok(assisted.every((t) => t <= 0) && assisted[1] - assisted[0] >= 1, JSON.stringify(assisted));
    assert.ok(valueTicks([3, 3], 'sets').every(Number.isInteger));
    assert.ok(valueTicks([30], 'reps').every(Number.isInteger));
    assert.deepEqual(valueTicks([100, 100], 'e1rm'), [95, 100, 105]);
  });

  test('labels never repeat and always match their gridline', () => {
    const cases: [ShownMetric, number[], boolean?][] = [
      ['sets', [3, 3, 3]],
      ['reps', [10, 11, 12]],
      ['e1rm', [100, 100.6, 101]],
      ['top_set', [100, 102.5, 110]],
      ['top_set', [-20, 0, 20], true],
      ['top_set', [995, 1003]],
      ['volume', [12000, 16500]],
      ['longest_hold', [60, 61]],
      ['bodyweight', [180.2, 180.4]],
      ['bodyweight', [180.3, 180.3]],
    ];
    for (const [metric, values, added] of cases) {
      const ticks = valueTicks(values, metric);
      const labels = ticks.map(label(metric, added));
      assert.equal(new Set(labels).size, labels.length, `${metric} ${values}: ${labels}`);
      // Each label reads back as its tick.
      for (const [i, t] of ticks.entries()) assert.equal(Number(labels[i].replace(/,/g, '').replace('−', '-').replace('+', '')), t, `${metric}: ${t} → ${labels[i]}`);
      assert.ok(ticks[0] <= Math.min(...values) && ticks[ticks.length - 1] >= Math.max(...values), `${metric} ${values}: ${ticks}`);
    }
  });

  test('random ranges never repeat a label', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const metric of ['e1rm', 'top_set', 'volume', 'reps', 'sets', 'longest_hold', 'bodyweight'] as ShownMetric[]) {
      for (let i = 0; i < 300; i++) {
        const a = Math.round(random() * 3000 * 10) / 10;
        const b = a + (random() < 0.3 ? 0 : random() * (random() < 0.5 ? 3 : 400));
        const labels = valueTicks([a, b], metric).map(label(metric));
        assert.equal(new Set(labels).size, labels.length, `${metric} ${a}..${b}: ${labels}`);
      }
    }
  });

  test('decimals per metric', () => {
    assert.equal(metricDecimals('top_set', 102.5), 1);
    assert.equal(metricDecimals('top_set', 1200), 0);
    assert.equal(metricDecimals('e1rm', 102.5), 0);
    assert.equal(metricDecimals('bodyweight'), 1);
    assert.deepEqual(valueTicks([], 'e1rm'), []);
  });
});

describe('dates with the year when it isn’t this year', () => {
  test('text and speech', () => {
    assert.equal(formatMonthDayYear('2026-10-20', today), 'Oct 20');
    assert.equal(formatMonthDayYear('2025-10-20', today), 'Oct 20, 2025');
    assert.equal(formatShortDateYear('2026-10-20', today), 'Tue, Oct 20');
    assert.equal(formatShortDateYear('2025-10-20', today), 'Mon, Oct 20, 2025');
    assert.equal(formatLongDateYear('2026-10-20', today), 'Tuesday, October 20');
    assert.equal(formatLongDateYear('2025-10-20', today), 'Monday, October 20, 2025');
  });
});
