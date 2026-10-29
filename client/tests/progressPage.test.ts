import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import type { BodyweightEntry, ISODate, UnitSystem, WorkoutSession } from '../src/data/types';
import { keyExercises, type KeyPin } from '../src/features/progress/keyExercises';
import { lineRuns } from '../src/components/charts/chartMath';
import { bodyweightSeries } from '../src/features/progress/bodyweight';
import {
  ALL_EXERCISES_PREVIEW,
  BODYWEIGHT_GAPS,
  bodyweightCardView,
  exerciseRowsView,
  graphRowView,
  keyCardView,
  pinActionLabel,
  type GraphRowView,
} from '../src/features/progress/progressPage';
import type { SavedGraph } from '../src/features/progress/progressPrefs';
import { exerciseLogs, type Metric } from '../src/features/progress/series';
import { loggedExercises } from '../src/features/progress/variations';
import { bodyweight, entry, exercisesById, hold, lift, session } from './support/progressFixtures';

const today = '2026-10-29';
const DEADLIFT = exercisesById.get('ex_deadlift')!.name;
const ago = (days: number) => addDays(today, -days);
const defaults: KeyPin[] = ['ex_back_squat', 'ex_bench_press', 'ex_deadlift'].map((exerciseId) => ({ exerciseId, isDefault: true }));
const userPin = (exerciseId: string): KeyPin[] => [{ exerciseId }];

/** The Key exercises cards as the page shows them; `from` is the range start (3M by default). */
const cards = (sessions: WorkoutSession[], pins: KeyPin[] = defaults, { from = ago(91) as ISODate | undefined, units = 'metric' as UnitSystem } = {}) =>
  keyExercises({ sessions, exercisesById, pins, today, from }).map((card) => keyCardView(card, units, today));

const squat = (day: ISODate, loadKg: number, reps = 3) => session(day, [entry('ex_back_squat', [lift(loadKg, reps)])]);

describe('Key exercises cards', () => {
  test('an e1RM card: the latest value, the 4-week change with its date, and the range trend for VoiceOver', () => {
    const [card] = cards([squat(ago(35), 90), squat(ago(0), 100)]);
    assert.equal(card.name, 'Back Squat (Barbell)');
    assert.equal(card.metric, 'e1rm');
    assert.equal(card.metricLabel, undefined, 'e1RM is in the section title');
    assert.equal(card.value, '110 kg');
    assert.deepEqual(card.status, { text: '+11 kg since Sep 24', spoken: 'Up 11 kilograms since Thursday, September 24', direction: 'up', isChange: true });
    assert.equal(card.points.length, 2);
    assert.equal(
      card.label,
      'Back Squat (Barbell), pinned. Estimated one-rep max, 110 kilograms. Up 11 kilograms since Thursday, September 24. In this range, rising from 99 kilograms to 110 kilograms over 2 sessions.',
    );
  });

  test('pounds: the value, the change and the sparkline points are converted', () => {
    const [card] = cards([squat(ago(35), 90), squat(ago(0), 100)], defaults, { units: 'imperial' });
    assert.equal(card.value, '243 lb');
    assert.equal(card.status?.text, '+24 lb since Sep 24');
    assert.ok(Math.abs(card.points[1].value - 242.508) < 0.01);
  });

  test('a change that rounds to zero reads as no change, never “+0 kg”', () => {
    const [card] = cards([squat(ago(35), 100), squat(ago(0), 100.4)]);
    assert.equal(card.status?.text, 'No change since Sep 24');
    assert.equal(card.status?.direction, 'none');
    assert.match(card.label, /No change since/);
  });

  test('without a session 4 weeks before the latest: “First logged”, plain', () => {
    const [card] = cards([squat(ago(10), 100), squat(ago(3), 105)]);
    assert.deepEqual(card.status, { text: 'First logged Oct 19', spoken: 'First logged Monday, October 19', direction: 'none', isChange: false });
  });

  test('a lift logged before the range: its last value, “Last logged”, and nothing in this range', () => {
    const [card] = cards([squat(ago(100), 100)], defaults, { from: ago(30) });
    assert.equal(card.value, '110 kg');
    assert.equal(card.status?.text, 'Last logged Jul 21');
    assert.equal(card.status?.isChange, false);
    assert.equal(card.emptyRange, true);
    assert.deepEqual(card.points, []);
    assert.match(card.label, /Last logged Tuesday, July 21\. Nothing in this range\.$/);
  });

  test('dates in another year carry the year, in text and speech', () => {
    const [card] = cards([squat('2025-12-01', 100)], defaults, { from: undefined });
    assert.equal(card.status?.text, 'Last logged Dec 1, 2025');
    assert.equal(card.status?.spoken, 'Last logged Monday, December 1, 2025');
  });

  test('a pin the user added that isn’t logged: a dash and “Not logged yet”', () => {
    const [card] = cards([], userPin('ex_front_squat'));
    assert.equal(card.value, '—');
    assert.deepEqual(card.status, { text: 'Not logged yet', spoken: 'Not logged yet', direction: 'none', isChange: false });
    assert.equal(card.emptyRange, false);
    assert.equal(card.label, 'Front Squat (Barbell), pinned. Not logged yet.');
  });

  test('a pinned bodyweight lift without a weigh-in shows Top set as added weight, labelled', () => {
    const sessions = [session(ago(2), [entry('ex_pull_up', [bodyweight(8, { addedLoadKg: 10 })])])];
    const [card] = cards(sessions, userPin('ex_pull_up'));
    assert.equal(card.metric, 'top_set');
    assert.equal(card.metricLabel, 'Top set');
    assert.equal(card.value, '+10 kg');
    assert.match(card.label, /^Pull-Up, pinned\. Top set, bodyweight plus 10 kilograms\./);
  });

  test('a pinned hold shows Longest hold, labelled, before and after it’s logged', () => {
    const [before] = cards([], userPin('ex_plank'));
    assert.equal(before.metricLabel, 'Longest hold');
    assert.equal(before.value, '—');
    const [after] = cards([session(ago(1), [entry('ex_plank', [hold(45), hold(60)])])], userPin('ex_plank'));
    assert.equal(after.value, '60 s');
    assert.match(after.label, /Longest hold, 1 minute/);
  });

  test('an automatic pick isn’t pinned, and the menu offers to pin it', () => {
    const sessions = [session(ago(1), [entry('ex_overhead_press', [lift(50, 5)])])];
    const [card] = cards(sessions, []);
    assert.equal(card.pinned, false);
    assert.doesNotMatch(card.label, /pinned/);
    assert.equal(pinActionLabel(card.pinned), 'Pin to Key exercises');
    assert.equal(pinActionLabel(true), 'Unpin from Key exercises');
  });
});

describe('Your graphs rows', () => {
  const graph = (exerciseId: string, metric: Metric): SavedGraph => ({ id: `g_${exerciseId}_${metric}`, exerciseId, metric });
  const row = (sessions: WorkoutSession[], g: SavedGraph, { from = ago(91) as ISODate | undefined, units = 'metric' as UnitSystem } = {}) =>
    graphRowView(g, exercisesById.get(g.exerciseId), exerciseLogs(sessions).get(g.exerciseId) ?? [], units, today, from);
  const shown = (r: GraphRowView) => {
    assert.equal(r.kind, 'graph');
    return r as Extract<GraphRowView, { kind: 'graph' }>;
  };

  test('a graph whose exercise no longer exists reads “Deleted exercise”', () => {
    const r = row([], graph('ex_gone', 'volume'));
    assert.equal(r.kind, 'deleted');
    assert.equal(r.title, 'Deleted exercise · Volume');
    assert.equal(r.sheetTitle, 'Deleted exercise · Volume');
    assert.equal(r.label, 'Deleted exercise, Volume graph.');
  });

  test('the latest value of all time with its date; top set to one decimal', () => {
    const sessions = [squat(ago(20), 100, 5), squat(ago(1), 102.5, 5)];
    const r = shown(row(sessions, graph('ex_back_squat', 'top_set')));
    assert.equal(r.title, 'Back Squat (Barbell) · Top set');
    assert.equal(r.subtitle, '102.5 kg · Wed, Oct 28');
    assert.equal(r.points.length, 2);
    assert.match(r.label, /^Back Squat \(Barbell\), Top set\. Latest 102\.5 kilograms, Wednesday, October 28\. Rising/);
  });

  test('a date in another year carries the year; nothing in the range is said', () => {
    const r = shown(row([squat('2025-06-02', 100)], graph('ex_back_squat', 'volume')));
    assert.equal(r.subtitle, '300 kg · Mon, Jun 2, 2025');
    assert.deepEqual(r.points, []);
    assert.match(r.label, /Monday, June 2, 2025\. Nothing in this range\.$/);
  });

  test('no value yet: the reason instead', () => {
    const pullUps = [session(ago(2), [entry('ex_pull_up', [bodyweight(8)])])];
    assert.equal(shown(row(pullUps, graph('ex_pull_up', 'e1rm'))).subtitle, 'Logged without a weigh-in');
    assert.equal(shown(row([], graph('ex_bench_press', 'e1rm'))).subtitle, 'Not logged yet');
    const planks = [session(ago(2), [entry('ex_plank', [hold(60)])])];
    assert.equal(shown(row(planks, graph('ex_plank', 'volume'))).subtitle, 'Doesn’t apply to this exercise');
    assert.match(shown(row(pullUps, graph('ex_pull_up', 'e1rm'))).label, /^Pull-Up, Estimated one-rep max\. Logged without a weigh-in\.$/);
  });

  test('pounds', () => {
    const r = shown(row([squat(ago(1), 100, 5)], graph('ex_back_squat', 'top_set'), { units: 'imperial' }));
    assert.equal(r.subtitle, '220.5 lb · Wed, Oct 28');
  });
});

describe('Bodyweight card', () => {
  const at = '2026-01-01T07:00:00.000Z';
  const weighIn = (date: ISODate, weightKg: number): BodyweightEntry => ({ id: `bw_${date}`, date, weightKg, createdAt: at, updatedAt: at });

  test('no weigh-ins', () => {
    const view = bodyweightCardView([], 'metric', today, ago(91));
    assert.equal(view.value, '—');
    assert.equal(view.status.text, 'No weigh-ins yet');
    assert.deepEqual(view.trend, []);
    assert.equal(view.label, 'Bodyweight, 7-day trend not available. No weigh-ins yet.');
  });

  test('the trend at the latest weigh-in and its change in the range, neutral wording', () => {
    const view = bodyweightCardView([weighIn(ago(20), 82), weighIn(ago(0), 80)], 'metric', today, ago(91));
    assert.equal(view.value, '80 kg');
    assert.deepEqual(view.status, { text: '−2 kg in range', spoken: 'Down 2 kilograms in range', direction: 'down', isChange: true });
    assert.equal(view.label, 'Bodyweight, 7-day trend 80 kilograms. Down 2 kilograms in range.');
  });

  test('the trend line breaks where weigh-ins are more than 7 days apart, as the trend’s runs do', () => {
    const entries = [weighIn(ago(30), 83), weighIn(ago(20), 82), weighIn(ago(19), 82), weighIn(ago(12), 81), weighIn(ago(1), 80), weighIn(ago(0), 80)];
    const view = bodyweightCardView(entries, 'metric', today, ago(91));
    assert.equal(view.trend.length, 6);
    const drawn = lineRuns(view.trend, BODYWEIGHT_GAPS).map((r) => r.to - r.from + 1);
    assert.deepEqual(drawn, [1, 3, 2], 'no line across the 10- and 11-day gaps; exactly 7 days apart stays joined');
    assert.deepEqual(drawn, bodyweightSeries(entries, { from: ago(91) }).runs.map((r) => r.points.length));
  });

  test('a change that rounds to zero reads “No change”', () => {
    const view = bodyweightCardView([weighIn(ago(6), 80), weighIn(ago(3), 80.02), weighIn(ago(0), 80.01)], 'metric', today, ago(91));
    assert.equal(view.status.text, 'No change in range');
    assert.equal(view.status.direction, 'none');
  });

  test('an old latest weigh-in says when it was instead of a change', () => {
    const view = bodyweightCardView([weighIn(ago(40), 81), weighIn(ago(10), 80)], 'metric', today, ago(91));
    assert.equal(view.value, '80 kg');
    assert.deepEqual(view.status, { text: 'Last weigh-in Oct 19', spoken: 'Last weigh-in Monday, October 19', direction: 'none', isChange: false });
  });

  test('one weigh-in in the range: when it was', () => {
    const view = bodyweightCardView([weighIn(ago(2), 80)], 'imperial', today, ago(91));
    assert.equal(view.value, '176.4 lb');
    assert.equal(view.status.text, 'Weighed in Oct 27');
  });

  test('the latest trend shows even when the range has no weigh-in, with the year when it isn’t this year', () => {
    const view = bodyweightCardView([weighIn('2025-12-30', 80)], 'metric', today, ago(30));
    assert.equal(view.value, '80 kg');
    assert.deepEqual(view.trend, []);
    assert.equal(view.status.text, 'Last weigh-in Dec 30, 2025');
  });
});

describe('All exercises', () => {
  test('all time, last logged first, with the year when needed; a deleted exercise is left out', () => {
    const sessions = [
      session('2025-11-03', [entry('ex_deadlift', [lift(140, 5)])]),
      session(ago(30), [entry('ex_back_squat', [lift(100, 5)]), entry('ex_gone', [lift(10, 5)])]),
      session(ago(2), [entry('ex_back_squat', [lift(100, 5)])]),
    ];
    const rows = exerciseRowsView(loggedExercises(sessions), exercisesById, today);
    assert.deepEqual(
      rows.map((r) => [r.title, r.subtitle]),
      [
        ['Back Squat (Barbell)', '2 sessions · last Tue, Oct 27'],
        [DEADLIFT, '1 session · last Mon, Nov 3, 2025'],
      ],
    );
    assert.equal(rows[1].label, `${DEADLIFT}, 1 session, last Monday, November 3, 2025`);
  });

  test('warm-ups alone don’t make an exercise logged', () => {
    const sessions = [session(ago(1), [entry('ex_back_squat', [lift(60, 5, { kind: 'warmup' })])])];
    assert.deepEqual(exerciseRowsView(loggedExercises(sessions), exercisesById, today), []);
  });

  test('the page previews a few; the rest are a tap away', () => {
    assert.ok(ALL_EXERCISES_PREVIEW >= 5 && ALL_EXERCISES_PREVIEW <= 10);
  });
});
