import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { deriveRecordBests, exerciseBests } from '../src/data/records';
import { lbToKg } from '../src/data/units';
import {
  bestSetLine,
  exerciseRecords,
  hasPartialRepSets,
  historyMonths,
  historySessions,
  historySet,
  markLegend,
  recordRows,
  RECORD_ROWS,
  setMarks,
  spokenSets,
  type SessionRecord,
} from '../src/features/progress/exerciseHistory';
import { exerciseLogs } from '../src/features/progress/series';
import { bodyweight, entry, exercisesById, hold, lift, session } from './support/progressFixtures';

const today = '2026-10-29';
const squat = exercisesById.get('ex_back_squat')!;
const pullUp = exercisesById.get('ex_pull_up')!;
const plank = exercisesById.get('ex_plank')!;
const logsOf = (id: string, sessions: Parameters<typeof exerciseLogs>[0]) => exerciseLogs(sessions).get(id) ?? [];
const typesOf = (bySession: ReadonlyMap<string, SessionRecord[]>, id: string) => bySession.get(id)?.map((r) => r.type);

describe('History sessions', () => {
  const warmupOnly = session('2026-10-05', [entry('ex_back_squat', [lift(60, 5, { kind: 'warmup' })])]);
  const first = session('2026-10-01', [entry('ex_back_squat', [lift(60, 5, { kind: 'warmup' }), lift(100, 5), lift(100, 5)])], { name: 'Legs' });
  const second = session('2026-10-08', [entry('ex_back_squat', [lift(110, 3), lift(90, 8, { kind: 'drop' }), lift(120, 4, { modifiers: ['shortened_partials'] }), lift(80, 12, { modifiers: ['amrap'] })])], {
    name: 'Legs',
  });
  const sessions = [first, warmupOnly, second];

  test('lists sessions with a working set, newest first, and leaves out warm-up-only ones', () => {
    const rows = historySessions(logsOf('ex_back_squat', sessions), squat, 'metric', today);
    assert.deepEqual(
      rows.map((r) => r.sessionId),
      [second.id, first.id],
    );
  });

  test('shows every set, warm-ups dimmed with "w", and markers for drop, partial-rep and AMRAP sets', () => {
    const [latest, earliest] = historySessions(logsOf('ex_back_squat', sessions), squat, 'metric', today);
    assert.deepEqual(
      earliest.sets.map((s) => [s.text, s.mark, s.warmup]),
      [
        ['60×5', 'w', true],
        ['100×5', '', false],
        ['100×5', '', false],
      ],
    );
    assert.deepEqual(
      latest.sets.map((s) => `${s.text}${s.mark}`),
      ['110×3', '90×8d', '120×4p', '80×12+'],
    );
  });

  test('a set with several markers shows each', () => {
    assert.deepEqual(setMarks(lift(80, 6, { kind: 'drop', modifiers: ['amrap', 'lengthened_partials'] })), ['drop', 'partial', 'amrap']);
    assert.equal(historySet(lift(80, 6, { kind: 'drop', modifiers: ['amrap'] }), squat, 'metric').mark, 'd+');
  });

  test('bodyweight sets show what was added, and assistance as a minus', () => {
    const sets = [bodyweight(8, { addedLoadKg: lbToKg(20) }), bodyweight(10), bodyweight(6, { kind: 'assisted', assistanceKg: lbToKg(30) })];
    assert.deepEqual(
      sets.map((s) => historySet(s, pullUp, 'imperial').text),
      ['+20×8', 'BW×10', '−30×6'],
    );
    assert.equal(historySet(sets[0], pullUp, 'imperial').spoken, 'bodyweight plus 20 pounds for 8 reps');
  });

  test('timed holds show their time', () => {
    const shown = historySet(hold(75), plank, 'metric');
    assert.equal(shown.text, '75 s');
    assert.equal(shown.spoken, '1 minute 15 seconds hold');
  });

  test('VoiceOver reads repeats once with a count, and says what each marker means', () => {
    const sets = [lift(60, 5, { kind: 'warmup' }), lift(100, 5), lift(100, 5)].map((s) => historySet(s, squat, 'metric'));
    assert.equal(spokenSets(sets), 'warm-up, 60 kilograms for 5 reps; 2 sets of 100 kilograms for 5 reps');
    const [, earliest] = historySessions(logsOf('ex_back_squat', sessions), squat, 'metric', today);
    assert.match(earliest.accessibilityLabel, /^Thursday, October 1, Legs\. 2 sets and 1 warm-up: /);
    assert.match(earliest.accessibilityLabel, /Top set 100 kilograms for 5 reps\.$/);
  });

  test('a session from another year has the year in its title', () => {
    const old = session('2025-10-20', [entry('ex_back_squat', [lift(100, 5)])], { name: 'Legs' });
    const [row] = historySessions(logsOf('ex_back_squat', [old]), squat, 'metric', today);
    assert.equal(row.title, 'Mon, Oct 20, 2025 · Legs');
    assert.match(row.accessibilityLabel, /^Monday, October 20, 2025, Legs/);
  });

  test('a reopened workout is listed as it was before the reopen', () => {
    const reopened = session('2026-10-10', [entry('ex_back_squat', [lift(100, 5)])], { status: 'in_progress' });
    const rows = historySessions(logsOf('ex_back_squat', [reopened]), squat, 'metric', today);
    assert.deepEqual(
      rows.map((r) => r.sessionId),
      [reopened.id],
    );
  });

  test('groups sessions by month, newest first', () => {
    const rows = historySessions(
      logsOf('ex_back_squat', [session('2026-09-30', [entry('ex_back_squat', [lift(100, 5)])]), ...sessions, session('2025-12-31', [entry('ex_back_squat', [lift(90, 5)])])]),
      squat,
      'metric',
      today,
    );
    const months = historyMonths(rows);
    assert.deepEqual(
      months.map((m) => [m.title, m.data.length]),
      [
        ['October 2026', 2],
        ['September 2026', 1],
        ['December 2025', 1],
      ],
    );
  });

  test('the marker key lists only the markers used', () => {
    assert.equal(markLegend(logsOf('ex_back_squat', sessions)), 'w warm-up · d drop set · p partial reps · + AMRAP');
    assert.equal(markLegend(logsOf('ex_back_squat', [session('2026-10-01', [entry('ex_back_squat', [lift(100, 5)])])])), undefined);
    // Warm-ups of a warm-up-only session (not listed) don't add to the key.
    assert.equal(markLegend(logsOf('ex_back_squat', [warmupOnly, session('2026-10-08', [entry('ex_back_squat', [lift(100, 5)])])])), undefined);
  });

  test('knows when partial-rep sets were logged', () => {
    assert.equal(hasPartialRepSets(logsOf('ex_back_squat', sessions)), true);
    assert.equal(hasPartialRepSets(logsOf('ex_back_squat', [first])), false);
  });
});

describe('Best-set line', () => {
  test('loaded lifts: the top set', () => {
    assert.equal(bestSetLine([lift(100, 5), lift(105, 3), lift(60, 5, { kind: 'warmup' })], squat, 'metric')?.text, 'Top set 105 kg × 3');
  });

  test('bodyweight lifts: added weight, or bodyweight', () => {
    assert.equal(bestSetLine([bodyweight(8, { addedLoadKg: 10 }), bodyweight(12)], pullUp, 'metric')?.text, 'Top set +10 kg × 8');
    assert.equal(bestSetLine([bodyweight(12), bodyweight(10)], pullUp, 'metric')?.text, 'Top set bodyweight × 12');
    assert.equal(bestSetLine([bodyweight(8, { kind: 'assisted', assistanceKg: 20 })], pullUp, 'metric')?.spoken, 'Top set 20 kilograms of assistance for 8 reps');
  });

  test('timed holds: the longest hold', () => {
    assert.deepEqual(bestSetLine([hold(45), hold(75)], plank, 'metric'), { text: 'Longest hold 75 s', spoken: 'Longest hold 1 minute 15 seconds' });
  });

  test('warm-ups only: no line', () => {
    assert.equal(bestSetLine([lift(60, 5, { kind: 'warmup' })], squat, 'metric'), undefined);
  });
});

describe('History records', () => {
  const s1 = session('2026-09-01', [entry('ex_back_squat', [lift(100, 5), lift(100, 5)])]);
  const s2 = session('2026-09-08', [entry('ex_back_squat', [lift(100, 8)])]);
  const s3 = session('2026-09-15', [entry('ex_back_squat', [lift(110, 3)])]);
  // A partial-rep set doesn't count toward records, so this session sets none.
  const s4 = session('2026-09-22', [entry('ex_back_squat', [lift(140, 5, { modifiers: ['shortened_partials'] }), lift(90, 5)])]);
  const other = session('2026-09-15', [entry('ex_bench_press', [lift(80, 5)])]);
  const sessions = [s1, s2, s3, s4, other];

  test('bests match records.ts over every workout', () => {
    const { bests } = exerciseRecords(logsOf('ex_back_squat', sessions), squat);
    assert.deepEqual(bests, exerciseBests(deriveRecordBests(sessions, exercisesById), squat));
  });

  test('stars: the first workout sets baselines, and later ones star for the records they set', () => {
    const { bySession } = exerciseRecords(logsOf('ex_back_squat', sessions), squat);
    assert.equal(bySession.has(s1.id), false);
    assert.deepEqual(bySession.get(s2.id), [{ type: 'reps_at_weight', atLoadKg: 100 }, { type: 'e1rm' }]);
    // The first set at a new weight is that weight's baseline for most reps, not a record.
    assert.deepEqual(typesOf(bySession, s3.id), ['heaviest_weight']);
    assert.equal(bySession.has(s4.id), false);
  });

  test('most reps stars only at the heaviest weight so far (what the card lists), never a lighter back-off weight', () => {
    const bench = (day: string, sets: ReturnType<typeof lift>[]) => session(day, [entry('ex_bench_press', sets)]);
    const ex = exercisesById.get('ex_bench_press')!;
    // Oct 8 beats its reps at 60 kg, but the card's Most reps is at 100 kg: only the volume star.
    const a = [bench('2026-10-01', [lift(100, 5), lift(60, 8)]), bench('2026-10-08', [lift(95, 5), lift(60, 10)])];
    const ra = exerciseRecords(logsOf('ex_bench_press', a), ex);
    assert.deepEqual(typesOf(ra.bySession, a[1].id), ['volume']);
    assert.equal(recordRows(ra.bests, 'metric', today)[1].value, '5 reps at 100 kg');
    // Top set the same, back-off reps up: no star at all.
    const b = [bench('2026-10-01', [lift(100, 5), lift(80, 8)]), bench('2026-10-08', [lift(100, 4), lift(80, 9)])];
    assert.equal(exerciseRecords(logsOf('ex_bench_press', b), ex).bySession.has(b[1].id), false);
  });

  test('a most-reps star at the heaviest weight of its day stays after a heavier set is lifted', () => {
    const list = [
      session('2026-09-01', [entry('ex_back_squat', [lift(100, 5)])]),
      session('2026-09-08', [entry('ex_back_squat', [lift(100, 6)])]),
      session('2026-09-15', [entry('ex_back_squat', [lift(110, 1)])]),
    ];
    const { bests, bySession } = exerciseRecords(logsOf('ex_back_squat', list), squat);
    assert.equal(recordRows(bests, 'metric', today)[1].value, '1 rep at 110 kg');
    assert.deepEqual(typesOf(bySession, list[1].id), ['reps_at_weight', 'e1rm', 'volume']);
  });

  test('every type a star can be for has a row on the card', () => {
    const { bySession } = exerciseRecords(logsOf('ex_back_squat', sessions), squat);
    const listed = new Set(RECORD_ROWS.map((r) => r.type));
    for (const records of bySession.values()) for (const { type } of records) assert.ok(listed.has(type));
  });

  test('a session row says which records it set', () => {
    const { bySession } = exerciseRecords(logsOf('ex_back_squat', sessions), squat);
    const rows = historySessions(logsOf('ex_back_squat', sessions), squat, 'metric', today, bySession);
    const row = rows.find((r) => r.sessionId === s2.id)!;
    assert.deepEqual(row.records, ['reps_at_weight', 'e1rm']);
    // The star's most reps names its weight, since the card's row may be at a heavier one by now.
    assert.match(row.accessibilityLabel, /, personal records: most reps at 100 kilograms and estimated one-rep max\./);
  });

  test('the card: heaviest weight, most reps, e1RM and volume (whole numbers), with dates', () => {
    const { bests } = exerciseRecords(logsOf('ex_back_squat', sessions), squat);
    const rows = recordRows(bests, 'metric', today);
    assert.deepEqual(
      rows.map((r) => [r.label, r.value, r.dateText]),
      [
        ['Heaviest weight', '110 kg', 'Sep 15'],
        ['Most reps', '3 reps at 110 kg', 'Sep 15'],
        ['Est. 1RM', '127 kg', 'Sep 8'],
        ['Best session volume', '1,000 kg', 'Sep 1'],
      ],
    );
    assert.equal(rows[2].accessibilityLabel, 'Estimated one-rep max: 127 kilograms, Tuesday, September 8');
  });

  test('the card in lb, with a year on an older record', () => {
    const old = session('2025-06-01', [entry('ex_back_squat', [lift(lbToKg(225), 5)])]);
    const rows = recordRows(exerciseRecords(logsOf('ex_back_squat', [old]), squat).bests, 'imperial', today);
    assert.deepEqual(rows[0], {
      type: 'heaviest_weight',
      label: 'Heaviest weight',
      value: '225 lb',
      date: '2025-06-01',
      dateText: 'Jun 1, 2025',
      accessibilityLabel: 'Heaviest weight: 225 pounds, Sunday, June 1, 2025',
    });
  });

  test('bodyweight lifts read added weight, and most reps at bodyweight', () => {
    const pulls = [session('2026-10-01', [entry('ex_pull_up', [bodyweight(10), bodyweight(8)])]), session('2026-10-08', [entry('ex_pull_up', [bodyweight(12)])])];
    const { bests, bySession } = exerciseRecords(logsOf('ex_pull_up', pulls), pullUp);
    assert.deepEqual(
      recordRows(bests, 'imperial', today).map((r) => [r.label, r.value]),
      [
        ['Heaviest weight', 'Bodyweight'],
        ['Most reps', '12 reps at bodyweight'],
      ],
    );
    // No weigh-in: the only record is most reps, and the card lists it.
    assert.deepEqual(bySession.get(pulls[1].id), [{ type: 'reps_at_weight', atLoadKg: 0, addedLoad: true }]);
    const [row] = historySessions(logsOf('ex_pull_up', pulls), pullUp, 'imperial', today, bySession);
    assert.match(row.accessibilityLabel, /, personal record: most reps at bodyweight\./);
  });

  test('timed holds: longest hold only', () => {
    const planks = [session('2026-10-01', [entry('ex_plank', [hold(45)])]), session('2026-10-08', [entry('ex_plank', [hold(75)])])];
    const { bests, bySession } = exerciseRecords(logsOf('ex_plank', planks), plank);
    assert.deepEqual(
      recordRows(bests, 'metric', today).map((r) => [r.label, r.value]),
      [['Longest hold', '75 s']],
    );
    assert.deepEqual(typesOf(bySession, planks[1].id), ['longest_hold']);
  });

  test('a reopened workout counts as it was before the reopen', () => {
    const reopened = session('2026-09-29', [entry('ex_back_squat', [lift(150, 1)])], { status: 'in_progress' });
    const { bests, bySession } = exerciseRecords(logsOf('ex_back_squat', [...sessions, reopened]), squat);
    assert.equal(bests.heaviest_weight?.value, 150);
    assert.deepEqual(typesOf(bySession, reopened.id), ['heaviest_weight', 'e1rm']);
  });
});
