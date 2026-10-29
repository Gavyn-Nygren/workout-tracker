import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { performance } from 'node:perf_hooks';

import { addDays, daysBetween } from '../src/data/dates';
import type { BodyweightEntry, ISODate } from '../src/data/types';
import { kgToLb, lbToKg } from '../src/data/units';
import {
  BIG_CHANGE,
  bigChangeFrom,
  BODYWEIGHT_LIMITS,
  BODYWEIGHT_PLACEHOLDER,
  bodyweightSeries,
  isPlausibleBodyweight,
  replacedOn,
  TREND_DAYS,
} from '../src/features/progress/bodyweight';

const START = '2021-01-04';
const at = `${START}T07:00:00.000Z`;
const entry = (date: ISODate, weightKg: number, id = `bw_${date}`): BodyweightEntry => ({ id, date, weightKg, createdAt: at, updatedAt: at });
const day = (n: number) => addDays(START, n);
const close = (a: number, b: number, message?: string) => assert.ok(Math.abs(a - b) < 1e-9, message ?? `${a} ≈ ${b}`);

/** The rule written out the slow way: the mean of the weigh-ins in the 7 days ending each weigh-in's day. */
function reference(entries: BodyweightEntry[], from?: ISODate) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return sorted
    .filter((e) => !from || e.date >= from)
    .map((e) => {
      const window = sorted.filter((w) => w.date <= e.date && daysBetween(w.date, e.date) < 7);
      return { date: e.date, value: window.reduce((sum, w) => sum + w.weightKg, 0) / window.length };
    });
}

/** Seeded pseudo-random numbers, so a failure can be replayed. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

/** `count` weigh-ins, mostly a day or a few apart, with the odd break of weeks or months. */
function history(count: number, seed = 1): BodyweightEntry[] {
  const next = random(seed);
  const entries: BodyweightEntry[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const r = next();
    offset += r < 0.02 ? 30 + Math.floor(next() * 90) : r < 0.06 ? 8 + Math.floor(next() * 5) : 1 + Math.floor(next() * 3);
    entries.push(entry(day(offset), 80 + Math.sin(i / 40) * 4 + (next() - 0.5)));
  }
  return entries;
}

describe('the 7-day trend', () => {
  test('is the mean of the weigh-ins in the 7 days ending each weigh-in’s day', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(day(i), 80 + i));
    const { trend, points } = bodyweightSeries(entries);
    assert.equal(TREND_DAYS, 7);
    assert.deepEqual(points.map((p) => p.value), entries.map((e) => e.weightKg));
    close(trend[0].value, 80);
    close(trend[6].value, (80 + 81 + 82 + 83 + 84 + 85 + 86) / 7, 'day 7: days 1–7');
    close(trend[7].value, (81 + 82 + 83 + 84 + 85 + 86 + 87) / 7, 'day 8: the first day has left the window');
  });

  test('matches the rule worked out the slow way, with gaps and a range', () => {
    const entries = history(600, 7);
    for (const from of [undefined, entries[300].date, addDays(entries[450].date, -3)]) {
      const fast = bodyweightSeries(entries, { from }).trend;
      const slow = reference(entries, from);
      assert.equal(fast.length, slow.length);
      fast.forEach((p, i) => {
        assert.equal(p.date, slow[i].date);
        close(p.value, slow[i].value);
      });
    }
  });

  test('weigh-ins before the range still count toward its first days', () => {
    const entries = [entry(day(0), 90), entry(day(3), 80), entry(day(5), 70)];
    const { points, trend } = bodyweightSeries(entries, { from: day(4) });
    assert.deepEqual(points, [{ date: day(5), value: 70 }]);
    close(trend[0].value, (90 + 80 + 70) / 3);
  });

  test('breaks into separate runs where weigh-ins are more than 7 days apart', () => {
    // 7 days apart stays one line (its window holds just itself); 8 days apart breaks it.
    const entries = [entry(day(0), 80), entry(day(2), 81), entry(day(9), 82), entry(day(17), 83), entry(day(18), 84), entry(day(60), 85)];
    const { runs, trend } = bodyweightSeries(entries);
    assert.deepEqual(
      runs.map((r) => r.points.map((p) => p.date)),
      [[day(0), day(2), day(9)], [day(17), day(18)], [day(60)]],
    );
    assert.ok(runs.every((r) => r.gap === false));
    assert.equal(trend.length, entries.length, 'every weigh-in has a trend point');
    close(trend[2].value, 82, 'day 9 alone in its window (day 2 is 7 days before)');
    close(trend[4].value, (83 + 84) / 2);
  });

  test('a range starting inside a gap starts a new run, and runs before the range are left out', () => {
    const entries = [entry(day(0), 80), entry(day(1), 81), entry(day(20), 82), entry(day(21), 83)];
    const { runs } = bodyweightSeries(entries, { from: day(10) });
    assert.deepEqual(runs.map((r) => r.points.map((p) => p.date)), [[day(20), day(21)]]);
    assert.deepEqual(bodyweightSeries(entries, { from: day(30) }), { points: [], trend: [], runs: [], trendByDate: new Map() });
    assert.deepEqual(bodyweightSeries([]).runs, []);
  });

  test('reads the weigh-ins in date order, whatever order they come in', () => {
    const entries = [entry(day(3), 83), entry(day(0), 80), entry(day(1), 81)];
    const { points, trend } = bodyweightSeries(entries);
    assert.deepEqual(points.map((p) => p.date), [day(0), day(1), day(3)]);
    close(trend[2].value, (80 + 81 + 83) / 3);
    assert.deepEqual(entries.map((e) => e.date), [day(3), day(0), day(1)], 'the list itself is left alone');
  });

  test('gives values in pounds for imperial, and the trend by date for readouts', () => {
    const entries = [entry(day(0), lbToKg(180)), entry(day(1), lbToKg(182))];
    const lb = bodyweightSeries(entries, { units: 'imperial' });
    close(lb.points[1].value, 182);
    close(lb.trend[1].value, 181);
    close(lb.trendByDate.get(day(1))!, 181);
    assert.equal(lb.trendByDate.get(day(2)), undefined);
    close(bodyweightSeries(entries, { units: 'metric' }).points[1].value, lbToKg(182));
    close(bodyweightSeries(entries).trend[1].value, lbToKg(181), 'kg without units');
  });

  test('is worked out once per list of weigh-ins and options', () => {
    const entries = history(50);
    const first = bodyweightSeries(entries, { from: entries[10].date, units: 'imperial' });
    assert.equal(bodyweightSeries(entries, { from: entries[10].date, units: 'imperial' }), first, 'a re-render or a scrub step gets the same result back');
    assert.notEqual(bodyweightSeries(entries, { from: entries[20].date, units: 'imperial' }), first);
    assert.notEqual(bodyweightSeries([...entries], { from: entries[10].date, units: 'imperial' }), first, 'a new read is worked out again');
  });

  test('stays fast with years of daily weigh-ins: one pass, O(n)', () => {
    const daily = Array.from({ length: 2_000 }, (_, i) => entry(day(i), 80 + Math.sin(i / 30) * 3));
    bodyweightSeries(history(200, 3)); // warm up
    const t0 = performance.now();
    const series = bodyweightSeries(daily, { units: 'imperial' });
    const elapsed = performance.now() - t0;
    assert.equal(series.trend.length, 2_000);
    assert.equal(series.runs.length, 1);
    close(series.trend[1_999].value, kgToLb(daily.slice(-7).reduce((sum, e) => sum + e.weightKg, 0) / 7), 'the last week of daily weigh-ins');
    // The slow way takes about a second here; one pass takes a few milliseconds.
    assert.ok(elapsed < 50, `2,000 weigh-ins took ${elapsed.toFixed(1)} ms`);
    // Ten times as many weigh-ins take about ten times as long, not a hundred.
    const many = Array.from({ length: 20_000 }, (_, i) => entry(day(i), 80));
    const t1 = performance.now();
    bodyweightSeries(many);
    assert.ok(performance.now() - t1 < 400, '20,000 weigh-ins in one pass');
  });
});

describe('typo guard', () => {
  test('a plausible bodyweight is 25–350 kg, or 55–770 lb', () => {
    assert.deepEqual(BODYWEIGHT_LIMITS, { metric: { min: 25, max: 350 }, imperial: { min: 55, max: 770 } });
    for (const ok of [25, 80.5, 350]) assert.ok(isPlausibleBodyweight(ok, 'metric'), `${ok} kg`);
    for (const bad of [24.9, 350.1, 0, -80, 1805, undefined, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(isPlausibleBodyweight(bad, 'metric'), false, `${bad} kg`);
    for (const ok of [55, 180.5, 770]) assert.ok(isPlausibleBodyweight(ok, 'imperial'), `${ok} lb`);
    for (const bad of [54.9, 770.5, 18, 1805, undefined]) assert.equal(isPlausibleBodyweight(bad, 'imperial'), false, `${bad} lb`);
    assert.ok(isPlausibleBodyweight(30, 'metric') && !isPlausibleBodyweight(30, 'imperial'), 'checked in the unit typed');
    assert.deepEqual(BODYWEIGHT_PLACEHOLDER, { metric: 80, imperial: 180 });
  });

  test('more than 10% from the nearest earlier weigh-in asks first, in kg', () => {
    const entries = [entry(day(0), 80), entry(day(5), 100)];
    assert.equal(BIG_CHANGE, 0.1);
    assert.equal(bigChangeFrom(entries, { date: day(1), weightKg: 88 }), undefined, 'exactly 10% doesn’t ask');
    const up = bigChangeFrom(entries, { date: day(1), weightKg: 88.1 })!;
    assert.equal(up.previous.date, day(0));
    assert.ok(up.change > 0.1);
    assert.equal(up.percent, 10);
    const down = bigChangeFrom(entries, { date: day(1), weightKg: 71.9 })!;
    assert.ok(down.change < -0.1);
    assert.equal(bigChangeFrom(entries, { date: day(6), weightKg: 95 }), undefined, 'compared with the latest earlier one (100), not the first');
    assert.equal(bigChangeFrom(entries, { date: day(6), weightKg: 80 })?.percent, 20);
  });

  test('the same in lb, where a slipped decimal is caught', () => {
    const entries = [entry(day(0), lbToKg(180))];
    const lb = (value: number, date = day(1)) => bigChangeFrom(entries, { date, weightKg: lbToKg(value) });
    assert.equal(lb(198), undefined, '198 lb after 180 lb is exactly 10%');
    assert.equal(lb(162), undefined);
    assert.equal(lb(199)?.percent, 11);
    assert.equal(lb(161)?.percent, 11);
    assert.equal(lb(18.05)?.percent, 90);
    assert.equal(lb(1805)?.percent, 903);
  });

  test('only earlier weigh-ins count: not later ones, not the day replaced, not the one being fixed', () => {
    const entries = [entry(day(3), 100, 'later'), entry(day(1), 60, 'same day')];
    assert.equal(bigChangeFrom(entries, { date: day(1), weightKg: 80 }), undefined, 'the first weigh-in, or one before them all');
    const fixing = [entry(day(0), 80, 'a'), entry(day(2), 100, 'b')];
    assert.equal(bigChangeFrom(fixing, { id: 'b', date: day(2), weightKg: 82 }), undefined, 'b fixed to 82 compares with a (80), not with itself');
    assert.equal(bigChangeFrom(fixing, { id: 'b', date: day(2), weightKg: 100 })?.percent, 25);
    assert.equal(bigChangeFrom(fixing, { id: 'a', date: day(0), weightKg: 50 }), undefined, 'nothing before a');
  });

  test('the weigh-in a save replaces: another one on that day', () => {
    const entries = [entry(day(0), 80, 'a'), entry(day(1), 81, 'b')];
    assert.equal(replacedOn(entries, day(1))?.id, 'b');
    assert.equal(replacedOn(entries, day(1), 'b'), undefined, 'fixing b on its own day replaces nothing');
    assert.equal(replacedOn(entries, day(1), 'a')?.id, 'b', 'moving a onto b’s day replaces b');
    assert.equal(replacedOn(entries, day(2)), undefined);
  });
});
