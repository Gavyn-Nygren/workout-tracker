// "Your week" and the weekly-summary notification text (G3.12, spec 2.11): counted the same way as
// Home's ring and streak (spec 2.5, 2.7), worded neutrally (spec 2.13).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { sessionVolumeKg } from '../src/data/calculations';
import { builtinExercises } from '../src/data/content';
import { addDays } from '../src/data/dates';
import { buildFakeDataset } from '../src/data/fake';
import { deriveStreak } from '../src/data/progress';
import type { FormReport, Goal, ISODate, LoggedSet, PersonalRecord, Plan, ScheduledOccurrence, StreakState, Weekday, WorkoutSession } from '../src/data/types';
import { weekTargetsFromHistory } from '../src/data/weekTargets';
import { prDetail } from '../src/features/home/wins';
import type { LocalTime, SummaryFire } from '../src/features/notifications/types';
import { buildSummary } from '../src/features/summary/summarize';
import { summarizeSession } from '../src/features/today/agenda';
import { buildWeeklySummary, summaryWeekStart, weekHeroLines, weeklyRecordRows, weeklySummaryText, type WeeklySummary } from '../src/features/weekly/weeklySummary';

// ---------------------------------------------------------------------------
// Fixtures: Monday weeks. W0 is Oct 19–25, W1 (the week under test) Oct 26 – Nov 1, W2 Nov 2–8.

const W0 = '2026-10-19';
const W1 = '2026-10-26';
const W2 = '2026-11-02';
const STAMP = '2026-10-01T08:00:00.000Z';
const SQUAT = 'ex_back_squat';
const HOLD = 'ex_hollow_hold';
const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));

const plan: Plan = {
  id: 'p',
  name: 'Upper / Lower',
  version: 1,
  status: 'active',
  startDate: '2026-10-05',
  schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }, { weekday: 3, workoutIds: ['b'] }, { weekday: 5, workoutIds: ['a'] }] },
  workouts: [
    { id: 'a', name: 'Upper A', blocks: [] },
    { id: 'b', name: 'Lower A', blocks: [] },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
};

/** Mon (Upper A), Wed (Lower A), Fri (Upper A) of the week starting `week`. */
const weekOccurrences = (week: ISODate, sessions: Partial<Record<0 | 2 | 4, string>> = {}): ScheduledOccurrence[] =>
  ([0, 2, 4] as const).map((d) => ({ id: `o_${addDays(week, d)}`, planId: 'p', planVersion: 1, planWorkoutId: d === 2 ? 'b' : 'a', scheduledDate: addDays(week, d), sessionId: sessions[d] }));

let nextId = 0;
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], reps: 5, loadKg: 100, completedAt: '2026-10-26T10:00:00.000Z', ...patch });

/** A finished workout on `date`: by default two squat sets of 100 kg × 5 (1,000 kg). */
function workout(id: string, date: ISODate, sets: LoggedSet[] = [set(), set()], patch: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    name: 'Upper A',
    status: 'completed',
    completion: 'full',
    completedDate: date,
    startedAt: `${date}T09:00:00.000Z`,
    completedAt: `${date}T10:00:00.000Z`,
    blocks: [{ id: `b${nextId++}`, type: 'single', exercises: [{ id: `e${nextId++}`, exerciseId: SQUAT, skipped: false, sets }] }],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...patch,
  };
}

/** One 100 kg × 5 set (500 kg). */
const single = (id: string, date: ISODate, patch: Partial<WorkoutSession> = {}) => workout(id, date, [set()], patch);

/** Three counted workouts in the week starting `week`. */
const fullWeek = (week: ISODate, prefix: string) => [0, 2, 4].map((d) => single(`${prefix}${d}`, addDays(week, d)));

const frequencyGoal = (workoutsPerWeek: number): Goal => ({ id: 'goal_weekly', type: 'frequency', title: 'Train every week', workoutsPerWeek, createdAt: STAMP, updatedAt: STAMP });

const pr = (id: string, sessionId: string, achievedDate: ISODate, patch: Partial<PersonalRecord> = {}): PersonalRecord => ({
  id,
  exerciseId: SQUAT,
  type: 'heaviest_weight',
  value: 100,
  previousValue: 90,
  sessionId,
  setId: 'x',
  achievedDate,
  ...patch,
});

function summarize(o: {
  sessions: WorkoutSession[];
  asOf: ISODate | LocalTime;
  weekStart?: ISODate;
  weekStartsOn?: Weekday;
  occurrences?: ScheduledOccurrence[];
  records?: PersonalRecord[];
  goals?: Goal[];
  formReports?: FormReport[];
  streak?: StreakState;
}): WeeklySummary {
  const asOf = typeof o.asOf === 'string' ? { date: o.asOf, time: '12:00' } : o.asOf;
  const weekStartsOn = o.weekStartsOn ?? 1;
  const occurrences = o.occurrences ?? [...weekOccurrences(W0), ...weekOccurrences(W1), ...weekOccurrences(W2)];
  const goals = o.goals ?? [];
  const streak = o.streak ?? deriveStreak(o.sessions, asOf.date, weekTargetsFromHistory({ goals, sessions: o.sessions, occurrences, weekStartsOn, today: asOf.date }), weekStartsOn);
  return buildWeeklySummary({
    weekStart: o.weekStart ?? W1,
    weekStartsOn,
    asOf,
    sessions: o.sessions,
    exercisesById,
    records: o.records ?? [],
    streak,
    occurrences,
    plans: [plan],
    planVersions: [plan],
    formReports: o.formReports ?? [],
    goals,
  });
}

const fire = (date: ISODate, time = '19:00', held?: LocalTime, weekStart = W1): SummaryFire => ({ configured: { date, time }, held: held ?? { date, time }, fireAtMs: 0, weekStart });
const text = (s: WeeklySummary, f: SummaryFire, weekFullyAhead = false) => weeklySummaryText(s, { units: 'metric', fire: f, weekFullyAhead });

// ---------------------------------------------------------------------------

describe('what the week counts', () => {
  test('done by completion date, with partials, a reopened workout as it was, and nothing outside the week', () => {
    const monday = workout('mon', '2026-10-26', [set({ kind: 'warmup', loadKg: 60 }), set(), set()]);
    // A timed hold is a working set but adds no volume.
    monday.blocks[0].exercises.push({ id: 'hold', exerciseId: HOLD, skipped: false, sets: [set({ kind: 'timed_hold', reps: undefined, loadKg: undefined, durationSec: 30 })] });
    const partial = workout('wed', '2026-10-28', [set(), set({ completedAt: undefined })], { completion: 'partial', name: 'Lower A' });
    const warmupsOnly = workout('fri', '2026-10-30', [set({ kind: 'warmup' })], { completion: 'partial' });
    const reopened = single('reopened', '2026-10-29', { status: 'in_progress' });
    const lastWeek = single('before', '2026-10-25');
    const nextWeek = single('after', '2026-11-02');
    const s = summarize({ sessions: [monday, partial, warmupsOnly, reopened, lastWeek, nextWeek], asOf: W2 });

    assert.equal(s.done, 3);
    assert.deepEqual(
      s.workouts.map((w) => [w.sessionId, w.date, w.partial]),
      [
        ['mon', '2026-10-26', false],
        ['wed', '2026-10-28', true],
        ['reopened', '2026-10-29', false],
      ],
    );
    // Warm-ups and holds add no volume: 1,000 + 500 + 500.
    assert.equal(s.volumeKg, 2000);
    assert.deepEqual(
      s.workouts.map((w) => w.volumeKg),
      [1000, 500, 500],
    );
    // Working sets: Monday's two squat sets and the hold, Wednesday's done set, the reopened one's set.
    assert.equal(s.workingSets, 5);
    assert.equal(s.weekEnd, '2026-11-01');
    assert.equal(s.ended, true);
    assert.equal(s.ahead, false);
  });

  test('PRs are the records achieved that week', () => {
    const monday = single('mon', '2026-10-26');
    const records = [pr('r_before', 'x', '2026-10-25'), pr('r_in', 'mon', '2026-10-26'), pr('r_in2', 'mon', '2026-10-26', { type: 'e1rm' }), pr('r_after', 'y', '2026-11-02')];
    const s = summarize({ sessions: [monday], asOf: W2, records });
    assert.equal(s.prCount, 2);
    assert.deepEqual(
      s.records.map((r) => r.id),
      ['r_in', 'r_in2'],
    );
    assert.equal(s.workouts[0].pr, true);
  });

  test('a Sunday week start covers Sunday to Saturday', () => {
    const sessions = [single('sun', '2026-10-25'), single('sat', '2026-10-31'), single('nextSun', '2026-11-01')];
    const s = summarize({ sessions, asOf: W2, weekStart: '2026-10-25', weekStartsOn: 7 });
    assert.equal(s.weekEnd, '2026-10-31');
    assert.deepEqual(
      s.workouts.map((w) => w.sessionId),
      ['sun', 'sat'],
    );
    assert.equal(s.days[0].date, '2026-10-25');
    // The Mon/Wed/Fri workouts of Oct 26–30 fall in this week.
    assert.equal(s.planned, 3);
  });

  test('sessionVolumeKg matches the workout summary and the Today card on the sample workouts', () => {
    const data = buildFakeDataset('2026-11-02');
    const byId = new Map(data.exercises.map((e) => [e.id, e]));
    const finished = data.sessions.filter((s) => s.status === 'completed');
    assert.ok(finished.length > 10);
    for (const session of finished) assert.equal(sessionVolumeKg(session, byId), summarizeSession(session, byId, []).volumeKg);
    for (const session of finished.slice(-8)) assert.equal(sessionVolumeKg(session, byId), buildSummary(session, data.sessions, byId).volumeKg);
  });
});

describe('the week target', () => {
  test('what the plans scheduled, or a weekly goal', () => {
    const sessions = [single('mon', '2026-10-26')];
    const plan = summarize({ sessions, asOf: W2 });
    assert.deepEqual([plan.target, plan.source, plan.planned], [3, 'plan', 3]);
    const goal = summarize({ sessions, asOf: W2, goals: [frequencyGoal(2)] });
    assert.deepEqual([goal.target, goal.source, goal.planned], [2, 'goal', 3]);
  });

  test('nothing planned needs 1', () => {
    const s = summarize({ sessions: [single('mon', '2026-10-26')], asOf: W2, occurrences: [] });
    assert.deepEqual([s.target, s.source, s.planned], [1, 'minimum', 0]);
  });

  test('a week before the first counted workout still gets its target', () => {
    const sessions = [single('mon', '2026-10-26')];
    const s = summarize({ sessions, asOf: W2, weekStart: W0 });
    assert.deepEqual([s.done, s.target, s.source, s.planned], [0, 3, 'plan', 3]);
    assert.equal(s.streak.status, 'none');
  });

  test('a week the streak lists keeps the streak’s (stored) target', () => {
    const sessions = [single('mon', '2026-10-26')];
    const listed = deriveStreak(sessions, W2, () => ({ target: 5, source: 'goal', planned: 4, frozen: true }), 1);
    const s = summarize({ sessions, asOf: W2, streak: listed });
    assert.deepEqual([s.target, s.source, s.planned], [5, 'goal', 4]);
  });
});

describe('the streak', () => {
  const metLastWeek = fullWeek(W0, 'w0_');

  test('met, adding the week to a run', () => {
    const s = summarize({ sessions: [...metLastWeek, ...fullWeek(W1, 'w1_')], asOf: W2 });
    assert.deepEqual(s.streak, { status: 'met', weeks: 2, before: 1, left: 0 });
  });

  test('started, when the weeks before had no run', () => {
    const s = summarize({ sessions: [single('old', '2026-10-21'), ...fullWeek(W1, 'w1_')], asOf: W2 });
    assert.deepEqual(s.streak, { status: 'started', weeks: 1, before: 0, left: 0 });
  });

  test('at risk while the week is on, ended once it’s over', () => {
    const sessions = [...metLastWeek, single('a', '2026-10-26'), single('b', '2026-10-28')];
    assert.deepEqual(summarize({ sessions, asOf: '2026-11-01' }).streak, { status: 'atRisk', weeks: 1, before: 1, left: 1 });
    assert.deepEqual(summarize({ sessions, asOf: W2 }).streak, { status: 'ended', weeks: 1, before: 1, left: 1 });
  });

  test('none, with no run at stake', () => {
    const s = summarize({ sessions: [single('old', '2026-10-21'), single('a', '2026-10-26')], asOf: W2 });
    assert.deepEqual(s.streak, { status: 'none', weeks: 0, before: 0, left: 2 });
  });

  test('longest-streak records reached that week are listed apart from PRs', () => {
    const weeks = [fullWeek('2026-09-28', 'a'), fullWeek('2026-10-12', 'c'), fullWeek(W0, 'd'), fullWeek(W1, 'e')].flat();
    const occurrences = ['2026-09-28', '2026-10-05', '2026-10-12', W0, W1, W2].flatMap((w) => weekOccurrences(w));
    const s = summarize({ sessions: weeks, asOf: W2, occurrences });
    assert.equal(s.streak.weeks, 3);
    assert.deepEqual(
      s.streakRecords.map((r) => [r.weeks, r.previousWeeks]),
      [[3, 1]],
    );
    assert.equal(s.prCount, 0);
  });
});

describe('days, missed workouts, and form', () => {
  test('day dots and the planned workouts that weren’t done', () => {
    const monday = single('mon', '2026-10-26', { occurrenceId: 'o_2026-10-26' });
    const skipped: WorkoutSession = { id: 'skip', name: 'Upper A', occurrenceId: 'o_2026-10-30', planId: 'p', status: 'skipped', blocks: [], createdAt: STAMP, updatedAt: STAMP };
    const occurrences = [...weekOccurrences(W0), ...weekOccurrences(W1, { 0: 'mon', 4: 'skip' })];
    const s = summarize({ sessions: [monday, skipped], asOf: W2, occurrences });
    assert.deepEqual(
      s.days.map((d) => d.status),
      ['done', 'rest', 'missed', 'rest', 'rest', 'rest', 'rest'],
    );
    assert.deepEqual(s.missed, [
      { date: '2026-10-28', name: 'Lower A', skipped: false },
      { date: '2026-10-30', name: 'Upper A', skipped: true },
    ]);

    // Midweek, the rest of the week is still planned, not missed.
    const midweek = summarize({ sessions: [monday], asOf: '2026-10-27', occurrences: [...weekOccurrences(W0), ...weekOccurrences(W1, { 0: 'mon' })] });
    assert.deepEqual(
      midweek.days.map((d) => d.status),
      ['done', 'rest', 'planned', 'rest', 'planned', 'rest', 'rest'],
    );
    assert.deepEqual(midweek.missed, []);
    assert.equal(midweek.daysLeft, 6);
  });

  test('form highlights: ready recordings that week, and gains of 5° or more', () => {
    const report = (id: string, date: ISODate, kneeMin: number, patch: Partial<FormReport> = {}): FormReport => ({
      id,
      recordingId: `rec_${id}`,
      sessionId: 'x',
      setId: 'y',
      exerciseId: SQUAT,
      family: 'squat',
      status: 'ready',
      modelVersion: 'm',
      ruleVersion: 'r',
      primaryJoint: 'knee',
      quality: { framing: 'good', warnings: [] },
      detectedReps: 1,
      reps: [{ index: 0, durationSec: 2, confidence: 'high', angles: { knee: { minDeg: kneeMin, maxDeg: 170 } }, romDeg: 80, partial: false }],
      observations: [],
      hasReplay: false,
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
      ...patch,
    });
    const formReports = [report('r0', '2026-10-20', 100), report('r1', '2026-10-27', 92), report('r2', '2026-10-29', 90), report('r3', '2026-10-30', 70, { status: 'processing' })];
    const s = summarize({ sessions: [], asOf: W2, formReports });
    assert.equal(s.form.reports, 2);
    assert.deepEqual(s.form.gains, [{ exerciseId: SQUAT, reportId: 'r1', deg: 8, joint: 'knee' }]);
    assert.deepEqual(s.form.recordings[0].gain, { deg: 8, nowDeg: 92, beforeDeg: 100 });
    assert.equal(s.form.recordings[1].gain, undefined);
  });
});

describe('notification text', () => {
  const metLastWeek = fullWeek(W0, 'w0_');
  const sunday = fire('2026-11-01');
  const monday = fire('2026-11-02', '08:00');
  const bodies: string[] = [];
  const check = (s: WeeklySummary, f: SummaryFire, weekFullyAhead = false) => {
    const t = text(s, f, weekFullyAhead);
    if (t) bodies.push(t.title, t.body);
    return t;
  };

  test('met, so far and once ended', () => {
    const sessions = [...metLastWeek, ...fullWeek(W1, 'w1_')];
    const s = summarize({ sessions, asOf: '2026-11-01', records: [pr('r', 'w1_0', '2026-10-26')] });
    assert.deepEqual(check(s, sunday), { title: 'This week so far', body: '3 of 3 workouts so far · 1,500 kg · 1 PR. 2-week streak.' });
    assert.deepEqual(check(s, monday), { title: 'Your week · Oct 26 – Nov 1', body: '3 of 3 workouts · 1,500 kg · 1 PR. 2-week streak.' });
  });

  test('a streak started', () => {
    const s = summarize({ sessions: fullWeek(W1, 'w1_'), asOf: W2 });
    assert.equal(check(s, monday)?.body, '3 of 3 workouts · 1,500 kg. Week target hit. Streak started.');
  });

  test('at risk on the last day: one more, or two or more', () => {
    const one = summarize({ sessions: [...metLastWeek, single('a', '2026-10-26'), single('b', '2026-10-28')], asOf: '2026-11-01' });
    assert.equal(check(one, sunday)?.body, '2 of 3 workouts so far · 1,000 kg. One more today keeps your 1-week streak.');
    const two = summarize({ sessions: [...metLastWeek, single('a', '2026-10-26')], asOf: '2026-11-01' });
    assert.equal(check(two, sunday)?.body, '1 of 3 workouts so far · 500 kg. Your 1-week streak needs 2 more workouts today.');
    const none = summarize({ sessions: [single('a', '2026-10-26'), single('b', '2026-10-28')], asOf: '2026-11-01' });
    assert.equal(check(none, sunday)?.body, '2 of 3 workouts so far · 1,000 kg. One more today starts a streak.');
  });

  test('a missed target is said plainly once the week is over', () => {
    const s = summarize({ sessions: [...metLastWeek, single('a', '2026-10-26'), single('b', '2026-10-28')], asOf: W2 });
    assert.equal(check(s, monday)?.body, '2 of 3 workouts · 1,000 kg. Your 1-week streak ended. Start a new one this week.');
  });

  test('worded for when quiet hours let it out, not when it was set for', () => {
    const s = summarize({ sessions: [...metLastWeek, single('a', '2026-10-26'), single('b', '2026-10-28')], asOf: '2026-11-01' });
    const held = fire('2026-11-01', '22:00', { date: '2026-11-02', time: '07:00' });
    assert.deepEqual(check(s, held), { title: 'Your week · Oct 26 – Nov 1', body: '2 of 3 workouts · 1,000 kg. Your 1-week streak ended. Start a new one this week.' });
  });

  test('nothing done', () => {
    const withStreak = summarize({ sessions: metLastWeek, asOf: W2 });
    assert.equal(check(withStreak, monday)?.body, 'No workouts logged. 3 were planned. Your 1-week streak ended. Start a new one this week.');
    const noStreak = summarize({ sessions: [], asOf: W2 });
    assert.equal(check(noStreak, monday)?.body, 'No workouts logged. 3 were planned.');
    assert.equal(check(noStreak, sunday)?.body, 'No workouts logged so far. 3 planned this week.');
  });

  test('nothing planned', () => {
    const occurrences = weekOccurrences(W0);
    const done = summarize({ sessions: [single('a', '2026-10-26'), single('b', '2026-10-28')], asOf: W2, occurrences });
    assert.equal(check(done, monday)?.body, '2 workouts · 1,000 kg. Week target hit. Streak started.');
    // Nothing planned, nothing done, and no streak at stake: not sent.
    assert.equal(check(summarize({ sessions: [], asOf: W2, occurrences }), monday), null);
    // A streak at stake is worth a line even with nothing planned.
    const atStake = summarize({ sessions: metLastWeek, asOf: W2, occurrences });
    assert.equal(check(atStake, monday)?.body, 'No workouts logged. Your 1-week streak ended. Start a new one this week.');
  });

  test('a week still ahead says only what stays true if nothing is logged', () => {
    const ahead = summarize({ sessions: metLastWeek, asOf: '2026-10-30', weekStart: W2 });
    assert.equal(ahead.ahead, true);
    assert.deepEqual(check(ahead, fire('2026-11-08', '19:00', undefined, W2), true), { title: 'This week so far', body: 'No workouts logged so far. 3 planned this week.' });
    assert.deepEqual(check(ahead, fire('2026-11-09', '08:00', undefined, W2), true), { title: 'Your week · Nov 2 – Nov 8', body: 'No workouts logged. 3 were planned.' });
    const empty = summarize({ sessions: metLastWeek, asOf: '2026-10-30', weekStart: W2, occurrences: weekOccurrences(W0) });
    assert.equal(check(empty, fire('2026-11-09', '08:00', undefined, W2), true), null);
  });

  test('short and plain: no emoji, under about 110 characters', () => {
    const busy = summarize({
      sessions: [...metLastWeek, ...Array.from({ length: 9 }, (_, i) => workout(`busy${i}`, addDays(W1, i % 7), Array.from({ length: 30 }, () => set({ loadKg: 140 }))))],
      asOf: '2026-11-01',
      // Set this week, so last week kept its plan target (and its streak).
      goals: [{ ...frequencyGoal(12), createdAt: '2026-10-26T08:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z' }],
      records: Array.from({ length: 12 }, (_, i) => pr(`r${i}`, 'busy0', '2026-10-26')),
    });
    const t = check(busy, sunday)!;
    assert.equal(t.body, '9 of 12 workouts so far · 189,000 kg · 12 PRs. Your 1-week streak needs 3 more workouts today.');
    assert.ok(bodies.length > 10);
    for (const line of bodies) {
      assert.ok(line.length <= 110, line);
      assert.doesNotMatch(line, /\p{Extended_Pictographic}/u, line);
    }
  });
});

describe('the screen', () => {
  const metLastWeek = fullWeek(W0, 'w0_');

  test('top card lines while the week is on', () => {
    const s = summarize({ sessions: [...metLastWeek, single('a', '2026-10-26'), single('b', '2026-10-28')], asOf: '2026-10-30' });
    assert.deepEqual(weekHeroLines(s), {
      badge: { text: 'WEEK SO FAR', kind: 'ongoing' },
      subtitle: 'Oct 26 – Nov 1 · 3 days left',
      streakWeeks: 1,
      // Home's words for the week in progress.
      streakLine: '1 more workout in 3 days to keep your streak.',
      caption: '3 planned this week',
    });
    assert.equal(weekHeroLines(summarize({ sessions: metLastWeek, asOf: '2026-11-01' })).subtitle, 'Oct 26 – Nov 1 · last day');
  });

  test('top card lines once the week is over', () => {
    const met = weekHeroLines(summarize({ sessions: [...metLastWeek, ...fullWeek(W1, 'w1_')], asOf: W2 }));
    assert.deepEqual([met.badge.text, met.subtitle, met.streakWeeks, met.streakLine, met.caption], ['WEEK TARGET HIT', 'Oct 26 – Nov 1', 2, 'Week target hit. Your streak grew.', '3 planned that week']);
    const ended = weekHeroLines(summarize({ sessions: [...metLastWeek, single('a', '2026-10-26')], asOf: W2 }));
    assert.deepEqual([ended.badge.text, ended.streakWeeks, ended.streakLine], ['WEEK ENDED', 0, 'Your 1-week streak ended that week.']);
    const ahead = weekHeroLines(summarize({ sessions: [], asOf: '2026-10-30', weekStart: W2 }));
    assert.equal(ahead.badge.text, 'WEEK AHEAD');
  });

  test('PR rows read like Recent wins: one per exercise and workout', () => {
    const records = [pr('r1', 'mon', '2026-10-26'), pr('r2', 'mon', '2026-10-26', { type: 'e1rm', value: 116 }), pr('r3', 'wed', '2026-10-28', { type: 'reps_at_weight', value: 8, atLoadKg: 80, previousValue: 6 })];
    const rows = weeklyRecordRows(records, exercisesById, 'metric');
    const squat = exercisesById.get(SQUAT)!.name;
    assert.deepEqual(rows, [
      { key: 'mon|ex_back_squat', sessionId: 'mon', date: '2026-10-26', title: `${squat} · heaviest weight + 1 more`, detail: prDetail(records[0], 'metric') },
      { key: 'wed|ex_back_squat', sessionId: 'wed', date: '2026-10-28', title: `${squat} · most reps`, detail: '8 reps at 80 kg (was 6)' },
    ]);
  });

  test('?week= opens the week under the current week-start setting', () => {
    assert.equal(summaryWeekStart('2026-10-28', 1), W1);
    assert.equal(summaryWeekStart(W1, 1), W1);
    // A Sunday-start week shares six days with the Monday week that follows it, and back.
    assert.equal(summaryWeekStart('2026-10-25', 1), W1);
    assert.equal(summaryWeekStart(W1, 7), '2026-10-25');
    for (const bad of [undefined, '', '2026-13-01', '2026-10-26T00:00:00Z', 20261026]) assert.equal(summaryWeekStart(bad, 1), undefined);
  });
});
