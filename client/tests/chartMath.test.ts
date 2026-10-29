import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  areaPath,
  compactTick,
  dotsPath,
  lineRuns,
  linePath,
  maxTimeTicks,
  nearestIndex,
  placeX,
  textWidth,
  timeDomain,
  timeLabels,
  uniqueTicks,
} from '../src/components/charts/chartMath';
import { fromISODate } from '../src/data/dates';
import { pointTime } from '../src/features/progress/series';

const today = '2026-10-29';
const p = (date: string, at?: string) => ({ date, value: 0, ...(at ? { at } : {}) });
/** A local timestamp (what a finish time is, read on this device). */
const local = (date: string, hour: number) => new Date(fromISODate(date).getTime() + hour * 3_600_000).toISOString();

describe('line runs (gaps)', () => {
  const points = [p('2026-01-01'), p('2026-01-10'), p('2026-03-01'), p('2026-03-05'), p('2026-06-01')];

  test('without a gap rule, one solid run', () => {
    assert.deepEqual(lineRuns(points), [{ from: 0, to: 4, gap: false }]);
    assert.deepEqual(lineRuns([]), []);
  });

  test('dashed: a two-point gap run across every gap longer than the limit', () => {
    assert.deepEqual(lineRuns(points, { days: 28, draw: 'dashed' }), [
      { from: 0, to: 1, gap: false },
      { from: 1, to: 2, gap: true },
      { from: 2, to: 3, gap: false },
      { from: 3, to: 4, gap: true },
      // A point standing alone after a gap is still a run of its own (drawn as a marker).
      { from: 4, to: 4, gap: false },
    ]);
  });

  test('none: the line breaks, nothing drawn across', () => {
    assert.deepEqual(lineRuns(points, { days: 28, draw: 'none' }), [
      { from: 0, to: 1, gap: false },
      { from: 2, to: 3, gap: false },
      { from: 4, to: 4, gap: false },
    ]);
  });

  test('exactly the limit apart is not a gap', () => {
    assert.deepEqual(lineRuns([p('2026-01-01'), p('2026-01-29')], { days: 28, draw: 'dashed' }), [{ from: 0, to: 1, gap: false }]);
    assert.equal(lineRuns([p('2026-01-01'), p('2026-01-30')], { days: 28, draw: 'dashed' }).length, 3);
  });
});

describe('x positions', () => {
  test('the domain spans every series; one day has no width', () => {
    const a = [p('2026-10-01'), p('2026-10-20')];
    const b = [p('2026-09-01')];
    assert.deepEqual(timeDomain([a, b]), { t0: fromISODate('2026-09-01').getTime(), t1: fromISODate('2026-10-20').getTime() });
    const sameDay = [p('2026-10-20', local('2026-10-20', 8)), p('2026-10-20', local('2026-10-20', 18))];
    const d = timeDomain([sameDay])!;
    assert.equal(d.t0, d.t1);
    assert.equal(timeDomain([[]]), undefined);
  });

  test('points sit at their time, finish times included', () => {
    const points = [p('2026-10-01'), p('2026-10-11'), p('2026-10-21')];
    const xs = placeX(points, timeDomain([points])!, 10, 200);
    assert.deepEqual(xs, [10, 110, 210]);
    const one = [p('2026-10-01')];
    assert.deepEqual(placeX(one, timeDomain([one])!, 10, 200), [110]);
  });

  test('two workouts on one day get their own spots, in the order they were finished', () => {
    const points = [p('2026-10-01'), p('2026-10-20', local('2026-10-20', 8)), p('2026-10-20', local('2026-10-20', 9)), p('2026-10-29')];
    const domain = timeDomain([points])!;
    const xs = placeX(points, domain, 0, 300, 6);
    assert.ok(xs[2] - xs[1] >= 6 - 1e-9, `${xs[1]} → ${xs[2]}`);
    assert.ok(xs[0] < xs[1] && xs[2] < xs[3]);
    // Without a minimum gap they nearly overlap (an hour apart in a month-wide chart).
    const raw = placeX(points, domain, 0, 300);
    assert.ok(raw[2] - raw[1] < 1);
    assert.ok(pointTime(points[1]) < pointTime(points[2]));
  });

  test('a spread-out day stays inside the plot', () => {
    const points = [p('2026-10-01'), p('2026-10-29', local('2026-10-29', 8)), p('2026-10-29', local('2026-10-29', 9)), p('2026-10-29', local('2026-10-29', 10))];
    const xs = placeX(points, timeDomain([points])!, 0, 300, 6);
    assert.ok(xs[3] <= 300 + 1e-9);
    assert.ok(xs[3] - xs[2] >= 6 - 1e-9 && xs[2] - xs[1] >= 6 - 1e-9);
    // All on one day: centred, spread around the middle.
    const day = points.slice(1);
    assert.deepEqual(placeX(day, timeDomain([day])!, 0, 300, 6), [144, 150, 156]);
  });
});

describe('nearest point', () => {
  test('by x; ties in one column go to the finger’s height', () => {
    const xs = [10, 50, 53, 100];
    const ys = [100, 20, 180, 100];
    assert.equal(nearestIndex(xs, ys, 12), 0);
    assert.equal(nearestIndex(xs, ys, 90), 3);
    // Between two close points: the one nearer the finger vertically.
    assert.equal(nearestIndex(xs, ys, 51.5, 170), 2);
    assert.equal(nearestIndex(xs, ys, 51.5, 30), 1);
    // A point far off to the side never wins on height.
    assert.equal(nearestIndex(xs, ys, 12, 20), 0);
    assert.equal(nearestIndex([], [], 10), -1);
  });

  test('stacked points (one x) can each be reached', () => {
    const xs = [40, 40];
    const ys = [30, 150];
    assert.equal(nearestIndex(xs, ys, 40, 25), 0);
    assert.equal(nearestIndex(xs, ys, 40, 160), 1);
  });
});

describe('axis labels', () => {
  test('ticks whose label repeats the one below are left out', () => {
    const label = (v: number) => String(Math.round(v));
    assert.deepEqual(
      uniqueTicks([2.8, 2.9, 3, 3.1, 3.2], label).map((t) => t.label),
      ['3'],
    );
    assert.deepEqual(
      uniqueTicks([100, 102.5, 105], (v) => String(v)).map((t) => t.value),
      [100, 102.5, 105],
    );
  });

  test('thousands compact from 10,000 when exact', () => {
    const plain = (v: number) => v.toLocaleString('en-US');
    assert.equal(compactTick(12_500, plain), '12.5K');
    assert.equal(compactTick(10_000, plain), '10K');
    assert.equal(compactTick(9_500, plain), '9,500');
    assert.equal(compactTick(12_250, plain), '12,250');
    assert.equal(compactTick(-20_000, plain), '−20K');
  });

  test('text width grows with the text and the size', () => {
    assert.ok(textWidth('12,345', 12) > textWidth('123', 12));
    assert.ok(textWidth('100', 18) > textWidth('100', 12));
    assert.ok(maxTimeTicks(300, 12) >= 2 && maxTimeTicks(300, 12) <= 6);
    assert.ok(maxTimeTicks(800, 12) >= maxTimeTicks(200, 12));
  });
});

describe('date labels', () => {
  const measure = (text: string) => textWidth(text, 12);
  const xOf = (date: string) => 40 + ((fromISODate(date).getTime() - fromISODate('2025-11-01').getTime()) / (fromISODate('2026-10-29').getTime() - fromISODate('2025-11-01').getTime())) * 260;

  test('ends: first and last dates, with the year when it isn’t this year', () => {
    const labels = timeLabels({ first: { date: '2025-11-01', x: 40 }, last: { date: '2026-10-29', x: 300 }, mode: 'ends', xOf, width: 340, today, measure });
    assert.deepEqual(
      labels.map((l) => [l.text, l.anchor]),
      [
        ['Nov 1, 2025', 'start'],
        ['Oct 29', 'end'],
      ],
    );
  });

  test('one day gets one label; two that would touch keep the last', () => {
    const one = timeLabels({ first: { date: '2026-10-20', x: 150 }, last: { date: '2026-10-20', x: 150 }, mode: 'ends', xOf, width: 300, today, measure });
    assert.deepEqual(one.map((l) => l.text), ['Oct 20']);
    const close = timeLabels({ first: { date: '2026-10-19', x: 140 }, last: { date: '2026-10-20', x: 160 }, mode: 'ends', xOf, width: 300, today, measure });
    assert.deepEqual(close.map((l) => l.text), ['Oct 20']);
  });

  test('months: month ticks under their month starts, a January as its year, none touching', () => {
    const labels = timeLabels({ first: { date: '2025-11-01', x: 40 }, last: { date: '2026-10-29', x: 300 }, mode: 'months', xOf, width: 340, today, measure, maxTicks: 5 });
    assert.ok(labels.length >= 3, JSON.stringify(labels));
    assert.ok(labels.every((l) => l.anchor === 'middle' && l.markX !== undefined));
    assert.ok(labels.some((l) => l.text === '2026'), JSON.stringify(labels));
    for (let i = 1; i < labels.length; i++) {
      assert.ok(labels[i].x - measure(labels[i].text) / 2 > labels[i - 1].x + measure(labels[i - 1].text) / 2, 'labels overlap');
    }
    assert.ok(labels.every((l) => l.x - measure(l.text) / 2 >= 0 && l.x + measure(l.text) / 2 <= 340));
  });

  test('months over two years repeat month names, but every label has its own date (its key)', () => {
    const first = '2024-11-02';
    const last = '2026-10-27';
    const span = fromISODate(last).getTime() - fromISODate(first).getTime();
    const x = (date: string) => 40 + ((fromISODate(date).getTime() - fromISODate(first).getTime()) / span) * 246;
    const labels = timeLabels({ first: { date: first, x: 40 }, last: { date: last, x: 286 }, mode: 'months', xOf: x, width: 326, today, measure, maxTicks: 4 });
    const texts = labels.map((l) => l.text);
    assert.ok(new Set(texts).size < texts.length, `a month name repeats: ${JSON.stringify(texts)}`);
    assert.equal(new Set(labels.map((l) => l.date)).size, labels.length, 'dates are unique');
    const ends = timeLabels({ first: { date: '2025-11-01', x: 40 }, last: { date: '2026-10-29', x: 300 }, mode: 'ends', xOf, width: 340, today, measure });
    assert.deepEqual(ends.map((l) => l.date), ['2025-11-01', '2026-10-29']);
  });

  test('months over a short span fall back to the ends, which say more', () => {
    const labels = timeLabels({ first: { date: '2026-09-20', x: 40 }, last: { date: '2026-10-29', x: 300 }, mode: 'months', xOf, width: 340, today, measure });
    assert.deepEqual(labels.map((l) => l.text), ['Sep 20', 'Oct 29']);
  });
});

describe('paths', () => {
  test('lines, areas and dots', () => {
    assert.equal(linePath([0, 10, 20], [5, 6, 7]), 'M0.0,5.0 L10.0,6.0 L20.0,7.0');
    assert.equal(linePath([0, 10, 20], [5, 6, 7], 1, 2), 'M10.0,6.0 L20.0,7.0');
    assert.equal(areaPath([0, 10], [5, 6], 0, 1, 50), 'M0.0,5.0 L10.0,6.0 L10.0,50.0 L0.0,50.0 Z');
    assert.equal(dotsPath([10], [20], 2), 'M8.0,20.0 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0');
  });
});
