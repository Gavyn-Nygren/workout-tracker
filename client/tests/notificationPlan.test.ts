// The notification planner (G3.12, spec 2.11 and 7): which workout reminders, missed-workout
// prompts and weekly summaries should be pending, their wording, keys, previews, and which
// delivered ones get cleared. Quiet hours and DST: notificationQuietHours.test.ts; the summary's
// timing: summaryTiming.test.ts.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { defaultPreferences } from '../src/data/preferences';
import type { Plan, Preferences, ScheduledOccurrence } from '../src/data/types';
import { localInstantMs } from '../src/features/notifications/localTime';
import { missedCopy, reminderCopy, shortWorkoutList } from '../src/features/notifications/notificationCopy';
import {
  deliveredToDismiss,
  HORIZON_DAYS,
  MAX_PENDING,
  MIN_LEAD_MS,
  MISSED_PROMPT_TIME,
  notificationKey,
  notificationPlan,
  previewPlan,
} from '../src/features/notifications/notificationPlan';
import type { PendingRequest, PlanInput, PlannedNotification, SummaryFire } from '../src/features/notifications/types';

const TODAY = '2026-11-02'; // a Monday
const YESTERDAY = '2026-11-01';
const TOMORROW = '2026-11-03';
const STAMP = '2026-10-01T08:00:00.000Z';
const OWNER = 'install_1';

const at = (date: string, time: string) => localInstantMs({ date, time });

const plan = (id: string, extra: Partial<Plan> = {}): Plan => ({
  id,
  name: `Plan ${id}`,
  version: 1,
  status: 'active',
  startDate: '2026-10-05',
  schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }] },
  workouts: [
    { id: 'a', name: 'Lower A', blocks: [], estimatedMinutes: 60 },
    { id: 'b', name: 'Upper B', blocks: [], estimatedMinutes: 45 },
    { id: 'c', name: 'Calves & Core', blocks: [] },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const occ = (planId: string, date: string, workoutId = 'a', extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({
  id: `occ_${planId}_${extra.shiftedFromDate ?? date}_${workoutId}`,
  planId,
  planVersion: 1,
  planWorkoutId: workoutId,
  scheduledDate: date,
  ...extra,
});

const notifications = (patch: Partial<Preferences['notifications']> = {}): Preferences['notifications'] => ({
  ...defaultPreferences.notifications,
  workoutReminders: true,
  ...patch,
});

function input(extra: Partial<PlanInput> = {}): PlanInput {
  return {
    nowMs: at(TODAY, '08:00'),
    today: TODAY,
    owner: OWNER,
    permission: 'granted',
    signedIn: true,
    onboarded: true,
    notifications: notifications(),
    weekStartsOn: 1,
    occurrences: [],
    plans: [plan('p1')],
    planVersions: [],
    keptMissedIds: new Set(),
    summaryText: () => null,
    ...extra,
  };
}

const nids = (items: PlannedNotification[]) => items.map((i) => i.nid);

// ---------------------------------------------------------------------------

describe('gates', () => {
  const planned = { occurrences: [occ('p1', TODAY)] };

  test('nothing when iOS said no or has not been asked, when signed out, or before onboarding', () => {
    assert.deepEqual(notificationPlan(input({ ...planned, permission: 'denied' })), []);
    assert.deepEqual(notificationPlan(input({ ...planned, permission: 'undetermined' })), []);
    assert.deepEqual(notificationPlan(input({ ...planned, signedIn: false })), []);
    assert.deepEqual(notificationPlan(input({ ...planned, onboarded: false })), []);
  });

  test("granted and 'unknown' (as the rest alarm treats it) both plan", () => {
    assert.deepEqual(nids(notificationPlan(input({ ...planned, permission: 'granted' }))), [`et.reminder.${TODAY}`]);
    assert.deepEqual(nids(notificationPlan(input({ ...planned, permission: 'unknown' }))), [`et.reminder.${TODAY}`]);
  });

  test('each kind follows its own toggle', () => {
    const all = { occurrences: [occ('p1', YESTERDAY), occ('p1', TODAY)], summaryText: () => ({ title: 'Your week', body: '1 of 3 workouts' }) };
    const off = notifications({ workoutReminders: false, missedWorkout: false, weeklySummary: false });
    assert.deepEqual(notificationPlan(input({ ...all, notifications: off })), []);
    const kinds = (patch: Partial<Preferences['notifications']>) => [...new Set(notificationPlan(input({ ...all, notifications: { ...off, ...patch } })).map((i) => i.kind))];
    assert.deepEqual(kinds({ workoutReminders: true }), ['workoutReminder']);
    assert.deepEqual(kinds({ missedWorkout: true }), ['missedWorkout']);
    assert.deepEqual(kinds({ weeklySummary: true }), ['weeklySummary']);
  });

  test('an unreadable reminder time plans no reminders, and nothing throws', () => {
    const bad = notifications({ reminderTime: true as unknown as string });
    assert.deepEqual(notificationPlan(input({ occurrences: [occ('p1', TODAY)], notifications: bad })), []);
  });
});

describe('workout reminders', () => {
  test('one per day with an unstarted workout, at the reminder time, with plan and minutes', () => {
    const items = notificationPlan(input({ occurrences: [occ('p1', TODAY), occ('p1', addDays(TODAY, 1), 'b'), occ('p1', addDays(TODAY, 3), 'c')] }));
    assert.deepEqual(nids(items), [`et.reminder.${TODAY}`, `et.reminder.${addDays(TODAY, 1)}`, `et.reminder.${addDays(TODAY, 3)}`]);
    const [first, second, third] = items;
    assert.deepEqual(first.at, { date: TODAY, time: '17:00' });
    assert.equal(first.fireAtMs, at(TODAY, '17:00'));
    assert.equal(first.title, 'Lower A today');
    assert.equal(first.body, 'Plan p1 · about 60 min');
    assert.equal(first.sound, true);
    assert.equal(first.threadId, 'et.reminder');
    assert.equal(second.title, 'Upper B today');
    // No estimate: the minutes are left out.
    assert.equal(third.title, 'Calves & Core today');
    assert.equal(third.body, 'Plan p1');
  });

  test('the reminder time comes from Settings', () => {
    const [item] = notificationPlan(input({ occurrences: [occ('p1', TOMORROW)], notifications: notifications({ reminderTime: '06:30' }) }));
    assert.deepEqual(item.at, { date: TOMORROW, time: '06:30' });
    assert.equal(item.fireAtMs, at(TOMORROW, '06:30'));
  });

  test('settled workouts get none: started, done, partial or skipped (a session), or open right now', () => {
    const occurrences = [
      occ('p1', TODAY, 'a', { sessionId: 'started' }),
      occ('p1', addDays(TODAY, 1), 'a', { sessionId: 'skipped' }),
      occ('p1', addDays(TODAY, 2), 'a'),
      occ('p1', addDays(TODAY, 3), 'a'),
    ];
    const items = notificationPlan(input({ occurrences, openOccurrenceId: occurrences[2].id }));
    assert.deepEqual(nids(items), [`et.reminder.${addDays(TODAY, 3)}`]);
  });

  test('a workout started early and finished on another day is settled through its sessionId', () => {
    // Tomorrow's workout was done today: its session's day is today, but the occurrence is linked.
    const items = notificationPlan(input({ occurrences: [occ('p1', TOMORROW, 'a', { sessionId: 'done_early' })] }));
    assert.deepEqual(items, []);
  });

  test('paused, archived and deleted plans get nothing', () => {
    const occurrences = [occ('paused', TODAY), occ('archived', TOMORROW), occ('gone', addDays(TODAY, 2)), occ('p1', addDays(TODAY, 3))];
    const plans = [plan('paused', { status: 'paused' }), plan('archived', { status: 'archived' }), plan('p1')];
    assert.deepEqual(nids(notificationPlan(input({ occurrences, plans }))), [`et.reminder.${addDays(TODAY, 3)}`]);
  });

  test('two plans on one day: one notification naming both, renamed once one is done', () => {
    const plans = [plan('p1'), plan('p2', { name: 'Plan two' })];
    const both = [occ('p1', TODAY, 'a'), occ('p2', TODAY, 'b')];
    const [item] = notificationPlan(input({ occurrences: both, plans }));
    assert.equal(item.title, 'Lower A and Upper B today');
    assert.equal(item.body, '2 workouts · about 105 min');
    const [rest] = notificationPlan(input({ occurrences: [both[0], { ...both[1], sessionId: 's1' }], plans }));
    assert.equal(rest.nid, item.nid);
    assert.equal(rest.title, 'Lower A today');
    assert.equal(rest.body, 'Plan p1 · about 60 min');
    assert.notEqual(rest.data.key, item.data.key);
  });

  test('names follow occurrence id order, so the wording is stable', () => {
    const plans = [plan('p1'), plan('p2')];
    const forward = notificationPlan(input({ occurrences: [occ('p1', TODAY, 'a'), occ('p2', TODAY, 'b')], plans }));
    const backward = notificationPlan(input({ occurrences: [occ('p2', TODAY, 'b'), occ('p1', TODAY, 'a')], plans }));
    assert.deepEqual(backward, forward);
  });

  test('a long list shortens to "+N", and an unknown estimate leaves the minutes out', () => {
    const plans = [plan('p1'), plan('p2'), plan('p3')];
    const [item] = notificationPlan(input({ occurrences: [occ('p1', TODAY, 'a'), occ('p2', TODAY, 'b'), occ('p3', TODAY, 'c')], plans }));
    // "Lower A, Upper B and Calves & Core" is 34 characters: still named in full.
    assert.equal(item.title, 'Lower A, Upper B and Calves & Core today');
    assert.equal(item.body, '3 workouts');
    const long = plan('p4', { workouts: [{ id: 'a', name: 'Heavy Lower Body Strength', blocks: [] }, { id: 'b', name: 'Posterior Chain', blocks: [] }] });
    const [short] = notificationPlan(input({ occurrences: [occ('p4', TODAY, 'a'), occ('p4', TODAY, 'b')], plans: [long] }));
    assert.equal(short.title, 'Heavy Lower Body Strength +1 today');
  });

  test('names come from the plan version the workout was scheduled with; the plan name is current', () => {
    const v1 = plan('p1', { version: 1, name: 'Old name' });
    const v2 = plan('p1', { version: 2, name: 'New name', workouts: [{ id: 'a', name: 'Renamed', blocks: [], estimatedMinutes: 30 }] });
    const items = notificationPlan(input({ occurrences: [occ('p1', TODAY, 'a', { planVersion: 1 }), occ('p1', TOMORROW, 'a', { planVersion: 2 })], plans: [v2], planVersions: [v1] }));
    assert.deepEqual(
      items.map((i) => [i.title, i.body]),
      [
        ['Lower A today', 'New name · about 60 min'],
        ['Renamed today', 'New name · about 30 min'],
      ],
    );
  });

  test(`the horizon is ${HORIZON_DAYS} days from today`, () => {
    const occurrences = Array.from({ length: 20 }, (_, i) => occ('p1', addDays(TODAY, i)));
    const items = notificationPlan(input({ occurrences }));
    assert.equal(items.length, HORIZON_DAYS);
    assert.equal(items[0].at.date, TODAY);
    assert.equal(items[items.length - 1].at.date, addDays(TODAY, HORIZON_DAYS - 1));
  });

  test('past items are dropped; one 3 s ahead is still planned (the diff applies the minimum lead)', () => {
    const occurrences = [occ('p1', TODAY), occ('p1', TOMORROW)];
    const fire = at(TODAY, '17:00');
    assert.deepEqual(nids(notificationPlan(input({ occurrences, nowMs: fire - 3000 }))), [`et.reminder.${TODAY}`, `et.reminder.${TOMORROW}`]);
    assert.deepEqual(nids(notificationPlan(input({ occurrences, nowMs: fire }))), [`et.reminder.${TOMORROW}`]);
    assert.deepEqual(nids(notificationPlan(input({ occurrences, nowMs: fire + 1 }))), [`et.reminder.${TOMORROW}`]);
    assert.ok(3000 < MIN_LEAD_MS);
  });
});

describe('the missed-workout prompt', () => {
  const missedOn = notifications({ workoutReminders: false, missedWorkout: true });

  test(`yesterday's prompt is planned at ${MISSED_PROMPT_TIME} this morning and gone once that has passed`, () => {
    const occurrences = [occ('p1', YESTERDAY)];
    const [item] = notificationPlan(input({ occurrences, notifications: missedOn, nowMs: at(TODAY, '07:00') }));
    assert.equal(item.nid, `et.missed.${YESTERDAY}`);
    assert.equal(item.data.date, YESTERDAY);
    assert.deepEqual(item.at, { date: TODAY, time: '09:00' });
    assert.equal(item.fireAtMs, at(TODAY, '09:00'));
    assert.equal(item.title, 'You missed Lower A yesterday');
    assert.equal(item.body, 'Move it to today or keep your schedule. Tap to choose.');
    assert.equal(item.sound, true);
    assert.equal(item.threadId, 'et.missed');
    assert.deepEqual(notificationPlan(input({ occurrences, notifications: missedOn, nowMs: at(TODAY, '09:00') })), []);
  });

  test('only one is pending: the earliest day whose prompt is still ahead', () => {
    const occurrences = [occ('p1', YESTERDAY), occ('p1', TODAY, 'b'), occ('p1', addDays(TODAY, 2), 'c')];
    const early = notificationPlan(input({ occurrences, notifications: missedOn, nowMs: at(TODAY, '07:00') }));
    assert.deepEqual(nids(early), [`et.missed.${YESTERDAY}`]);
    // After 09:00, today's workout is next: its prompt would go out tomorrow morning.
    const later = notificationPlan(input({ occurrences, notifications: missedOn, nowMs: at(TODAY, '10:00') }));
    assert.deepEqual(nids(later), [`et.missed.${TODAY}`]);
    assert.deepEqual(later[0].at, { date: TOMORROW, time: '09:00' });
    assert.equal(later[0].title, 'You missed Upper B yesterday');
  });

  test('settled, kept and pushed misses are not prompted', () => {
    const now = { notifications: missedOn, nowMs: at(TODAY, '07:00') };
    const settled = [occ('p1', YESTERDAY, 'a', { sessionId: 's1' }), occ('p1', TODAY, 'b')];
    assert.deepEqual(nids(notificationPlan(input({ ...now, occurrences: settled }))), [`et.missed.${TODAY}`]);
    const kept = [occ('p1', YESTERDAY), occ('p1', TODAY, 'b')];
    assert.deepEqual(nids(notificationPlan(input({ ...now, occurrences: kept, keptMissedIds: new Set([kept[0].id]) }))), [`et.missed.${TODAY}`]);
    // A push moves the missed workout onto today (its id keeps the original date).
    const pushed = [occ('p1', TODAY, 'a', { shiftedFromDate: YESTERDAY })];
    const [item] = notificationPlan(input({ ...now, occurrences: pushed }));
    assert.equal(item.nid, `et.missed.${TODAY}`);
    // The open workout counts as started.
    const open = [occ('p1', YESTERDAY)];
    assert.deepEqual(notificationPlan(input({ ...now, occurrences: open, openOccurrenceId: open[0].id })), []);
  });

  test('a kept workout leaves the rest of its day in the prompt', () => {
    const plans = [plan('p1'), plan('p2')];
    const occurrences = [occ('p1', YESTERDAY, 'a'), occ('p2', YESTERDAY, 'b')];
    const [both] = notificationPlan(input({ occurrences, plans, notifications: missedOn, nowMs: at(TODAY, '07:00') }));
    assert.equal(both.title, 'You missed Lower A and Upper B yesterday');
    assert.equal(both.body, 'Move them to today or keep your schedule. Tap to choose.');
    const [one] = notificationPlan(input({ occurrences, plans, notifications: missedOn, nowMs: at(TODAY, '07:00'), keptMissedIds: new Set([occurrences[0].id]) }));
    assert.equal(one.title, 'You missed Upper B yesterday');
    assert.equal(one.body, 'Move it to today or keep your schedule. Tap to choose.');
  });

  test('paused plans and days before yesterday are never prompted', () => {
    const occurrences = [occ('p1', addDays(TODAY, -2)), occ('paused', YESTERDAY)];
    const plans = [plan('p1'), plan('paused', { status: 'paused' })];
    assert.deepEqual(notificationPlan(input({ occurrences, plans, notifications: missedOn, nowMs: at(TODAY, '07:00') })), []);
  });

  test('quiet hours hold it to their end', () => {
    const occurrences = [occ('p1', YESTERDAY)];
    const quiet = (start: string, end: string) => notifications({ workoutReminders: false, missedWorkout: true, quietHours: { start, end } });
    const [held] = notificationPlan(input({ occurrences, notifications: quiet('22:00', '09:30'), nowMs: at(TODAY, '07:00') }));
    assert.deepEqual(held.at, { date: TODAY, time: '09:30' });
    // Held past now: still pending at 09:15, though 09:00 has passed.
    assert.deepEqual(nids(notificationPlan(input({ occurrences, notifications: quiet('22:00', '09:30'), nowMs: at(TODAY, '09:15') }))), [`et.missed.${YESTERDAY}`]);
    const [daytime] = notificationPlan(input({ occurrences, notifications: quiet('08:00', '10:00'), nowMs: at(TODAY, '07:00') }));
    assert.deepEqual(daytime.at, { date: TODAY, time: '10:00' });
  });
});

describe('the weekly summary', () => {
  const summaryOn = notifications({ workoutReminders: false, weeklySummary: true });

  test('the next two, silent, each with its own text; null means no item', () => {
    const seen: SummaryFire[] = [];
    const summaryText = (fire: SummaryFire) => {
      seen.push(fire);
      return fire.weekStart === '2026-11-02' ? { title: 'This week so far', body: '2 of 4 workouts' } : null;
    };
    const items = notificationPlan(input({ notifications: summaryOn, summaryText }));
    assert.deepEqual(
      seen.map((f) => [f.configured.date, f.weekStart]),
      [
        ['2026-11-08', '2026-11-02'],
        ['2026-11-15', '2026-11-09'],
      ],
    );
    assert.equal(items.length, 1);
    const [item] = items;
    assert.equal(item.nid, 'et.summary.2026-11-02');
    assert.equal(item.data.date, '2026-11-02');
    assert.deepEqual(item.at, { date: '2026-11-08', time: '19:00' });
    assert.equal(item.sound, false);
    assert.equal(item.threadId, 'et.summary');
    assert.deepEqual([item.title, item.body], ['This week so far', '2 of 4 workouts']);
  });

  test('a summary text that throws drops that summary only', () => {
    const items = notificationPlan(
      input({
        occurrences: [occ('p1', TODAY)],
        notifications: notifications({ weeklySummary: true }),
        summaryText: () => {
          throw new Error('boom');
        },
      }),
    );
    assert.deepEqual(nids(items), [`et.reminder.${TODAY}`]);
  });
});

describe('order, cap and keys', () => {
  const everything = () =>
    input({
      occurrences: Array.from({ length: 15 }, (_, i) => occ('p1', addDays(TODAY, i - 1))),
      notifications: notifications({ missedWorkout: true, weeklySummary: true }),
      summaryText: (fire) => ({ title: `Week of ${fire.weekStart}`, body: 'numbers' }),
      nowMs: at(TODAY, '07:00'),
    });

  test(`soonest first, never more than ${MAX_PENDING}`, () => {
    const items = notificationPlan(everything());
    // Everything on: 14 reminders, one prompt and two summaries is the most real data can ask for.
    assert.equal(items.length, HORIZON_DAYS + 1 + 2);
    assert.ok(items.length <= MAX_PENDING);
    for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].fireAtMs <= items[i].fireAtMs);
    assert.equal(items[0].nid, `et.missed.${YESTERDAY}`);
  });

  test('every item carries our data, and its key', () => {
    for (const item of notificationPlan(everything())) {
      assert.deepEqual(item.data, { app: 'et', v: 1, owner: OWNER, kind: item.kind, nid: item.nid, date: item.data.date, fireAt: item.fireAtMs, key: notificationKey(item) });
      assert.ok(item.nid.startsWith('et.'));
    }
  });

  test('keys are stable, and change with the time, the text, the sound or the thread', () => {
    assert.deepEqual(notificationPlan(everything()), notificationPlan(everything()));
    const base = { fireAtMs: 1_800_000_000_000, title: 'Lower A today', body: 'Plan p1', sound: true, threadId: 'et.reminder' };
    const key = notificationKey(base);
    assert.equal(notificationKey({ ...base }), key);
    for (const patch of [{ fireAtMs: base.fireAtMs + 60_000 }, { title: 'Upper B today' }, { body: 'Plan p2' }, { sound: false }, { threadId: 'et.missed' }]) {
      assert.notEqual(notificationKey({ ...base, ...patch }), key, JSON.stringify(patch));
    }
  });
});

describe('copy', () => {
  test('shortWorkoutList names them in full up to about 40 characters, then "+N"', () => {
    assert.equal(shortWorkoutList([]), 'Workout');
    assert.equal(shortWorkoutList(['Upper A']), 'Upper A');
    assert.equal(shortWorkoutList(['Upper A', 'Calves & Core']), 'Upper A and Calves & Core');
    assert.equal(shortWorkoutList(['Upper A', 'Calves & Core', 'Conditioning Finisher']), 'Upper A +2');
    assert.equal(shortWorkoutList(['Upper A', 'Calves & Core'], 10), 'Upper A +1');
  });

  test('reminder and missed wording', () => {
    assert.deepEqual(reminderCopy([{ name: 'Leg Day', planName: 'PPL', minutes: 50 }]), { title: 'Leg Day today', body: 'PPL · about 50 min' });
    assert.deepEqual(reminderCopy([{ name: 'Upper A', planName: 'X', minutes: 40 }, { name: 'Calves & Core', planName: 'Y', minutes: 45 }]), {
      title: 'Upper A and Calves & Core today',
      body: '2 workouts · about 85 min',
    });
    assert.deepEqual(missedCopy(['Lower A']), { title: 'You missed Lower A yesterday', body: 'Move it to today or keep your schedule. Tap to choose.' });
    assert.equal(missedCopy(['Upper A', 'Calves & Core']).body, 'Move them to today or keep your schedule. Tap to choose.');
  });

  test('no emoji or exclamation marks in the reminder and prompt wording', () => {
    const texts = [reminderCopy([{ name: 'Lower A', planName: 'Plan', minutes: 60 }]), missedCopy(['Lower A', 'Upper B'])];
    for (const { title, body } of texts) assert.doesNotMatch(`${title} ${body}`, /[!\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('previews', () => {
  const previewInput = (extra: Partial<PlanInput> = {}) => {
    const { permission: _p, signedIn: _s, onboarded: _o, ...rest } = input(extra);
    return rest;
  };
  const off = notifications({ workoutReminders: false, missedWorkout: false, weeklySummary: false, quietHours: { start: '00:00', end: '23:55' } });

  test('with nothing planned and every toggle off: one of each, sample names, about 5 s ahead', () => {
    const now = at(TODAY, '12:00');
    const items = previewPlan(previewInput({ notifications: off, nowMs: now }));
    assert.deepEqual(nids(items), ['preview.workoutReminder', 'preview.missedWorkout', 'preview.weeklySummary']);
    assert.deepEqual(
      items.map((i) => i.kind),
      ['workoutReminder', 'missedWorkout', 'weeklySummary'],
    );
    for (const item of items) {
      assert.equal(item.fireAtMs, now + MIN_LEAD_MS);
      assert.equal(item.data.nid, item.nid);
      assert.equal(item.data.owner, OWNER);
      assert.equal(item.data.key, notificationKey(item));
    }
    assert.deepEqual([items[0].title, items[0].body], ['Lower A today', 'Upper / Lower Strength · about 60 min']);
    assert.equal(items[1].title, 'You missed Lower A yesterday');
    // Monday noon, Sunday 19:00 summaries, Monday weeks: the latest covered Oct 26 – Nov 1.
    assert.equal(items[2].data.date, '2026-10-26');
    assert.match(items[2].title, /^Your week · /);
    assert.equal(items[2].body, 'No workouts logged that week.');
    assert.equal(items[2].sound, false);
  });

  test('real names and the real summary text when there are some', () => {
    const plans = [plan('p1', { name: 'Upper / Lower' })];
    const fires: SummaryFire[] = [];
    const items = previewPlan(
      previewInput({
        plans,
        occurrences: [occ('p1', addDays(TODAY, 2), 'b')],
        notifications: off,
        summaryText: (fire) => {
          fires.push(fire);
          return { title: 'Your week · Oct 26 – Nov 1', body: '4 of 5 workouts' };
        },
      }),
    );
    assert.deepEqual([items[0].title, items[0].body], ['Upper B today', 'Upper / Lower · about 45 min']);
    assert.equal(items[1].title, 'You missed Upper B yesterday');
    assert.deepEqual([items[2].title, items[2].body], ['Your week · Oct 26 – Nov 1', '4 of 5 workouts']);
    // The week of the latest send (held by quiet hours to 23:55 Sunday), worded for when the preview
    // itself arrives, about 5 s from now (previews skip quiet hours).
    assert.equal(fires[0].weekStart, '2026-10-26');
    assert.deepEqual(fires[0].configured, { date: '2026-11-01', time: '19:00' });
    assert.deepEqual(fires[0].held, { date: TODAY, time: '08:00' });
    assert.equal(fires[0].fireAtMs, at(TODAY, '08:00') + MIN_LEAD_MS);
    assert.equal(items[2].data.date, '2026-10-26');
  });
});

describe('delivered notifications to clear', () => {
  const ours = (nid: string, kind: string, date: string, owner = OWNER): PendingRequest => ({ identifier: `scoped:${nid}`, data: { app: 'et', v: 1, owner, kind, nid, date, fireAt: 0, key: 'k' } });
  const foreign: PendingRequest[] = [
    { identifier: 'rest-alarm', data: { kind: 'restAlarm' } },
    { identifier: 'other-project', data: { app: 'other', nid: `et.reminder.${TODAY}`, kind: 'workoutReminder', date: TODAY } },
    ours(`et.reminder.${YESTERDAY}`, 'workoutReminder', YESTERDAY, 'someone_else'),
    { identifier: 'no-data' },
    { identifier: 'null-data', data: null },
  ];
  const base = (extra: Partial<PlanInput> = {}) => {
    const all = input(extra);
    return { today: all.today, owner: all.owner, signedIn: all.signedIn, onboarded: all.onboarded, occurrences: all.occurrences, plans: all.plans, openOccurrenceId: all.openOccurrenceId, keptMissedIds: all.keptMissedIds };
  };

  test('everything of ours when signed out or not onboarded, nothing of anyone else', () => {
    const delivered = [...foreign, ours(`et.reminder.${TODAY}`, 'workoutReminder', TODAY), ours('et.summary.2026-10-26', 'weeklySummary', '2026-10-26'), ours('preview.missedWorkout', 'missedWorkout', YESTERDAY)];
    const expected = [`et.reminder.${TODAY}`, 'et.summary.2026-10-26', 'preview.missedWorkout'];
    assert.deepEqual(deliveredToDismiss(delivered, base({ signedIn: false })), expected);
    assert.deepEqual(deliveredToDismiss(delivered, base({ onboarded: false })), expected);
    assert.deepEqual(deliveredToDismiss(foreign, base({ signedIn: false })), []);
  });

  test('reminders go once their day has passed or their workouts are all settled', () => {
    const today = occ('p1', TODAY);
    const delivered = [ours(`et.reminder.${YESTERDAY}`, 'workoutReminder', YESTERDAY), ours(`et.reminder.${TODAY}`, 'workoutReminder', TODAY), ...foreign];
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [occ('p1', YESTERDAY), today] })), [`et.reminder.${YESTERDAY}`]);
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [{ ...today, sessionId: 's1' }] })), [`et.reminder.${YESTERDAY}`, `et.reminder.${TODAY}`]);
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [today], openOccurrenceId: today.id })), [`et.reminder.${YESTERDAY}`, `et.reminder.${TODAY}`]);
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [today], plans: [plan('p1', { status: 'paused' })] })), [`et.reminder.${YESTERDAY}`, `et.reminder.${TODAY}`]);
  });

  test("missed prompts go once the day's workouts are settled, kept or pushed, or the day is before yesterday", () => {
    const missed = occ('p1', YESTERDAY);
    const delivered = [ours(`et.missed.${YESTERDAY}`, 'missedWorkout', YESTERDAY), ours(`et.missed.${addDays(TODAY, -2)}`, 'missedWorkout', addDays(TODAY, -2))];
    const twoDaysAgo = `et.missed.${addDays(TODAY, -2)}`;
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [missed, occ('p1', addDays(TODAY, -2))] })), [twoDaysAgo]);
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [{ ...missed, sessionId: 's1' }] })), [`et.missed.${YESTERDAY}`, twoDaysAgo]);
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [missed], keptMissedIds: new Set([missed.id]) })), [`et.missed.${YESTERDAY}`, twoDaysAgo]);
    assert.deepEqual(deliveredToDismiss(delivered, base({ occurrences: [{ ...missed, scheduledDate: TODAY, shiftedFromDate: YESTERDAY }] })), [`et.missed.${YESTERDAY}`, twoDaysAgo]);
  });

  test('summaries and previews stay while signed in, and each nid is listed once', () => {
    const delivered = [ours('et.summary.2026-10-26', 'weeklySummary', '2026-10-26'), ours('preview.workoutReminder', 'workoutReminder', YESTERDAY), ours(`et.reminder.${YESTERDAY}`, 'workoutReminder', YESTERDAY), ours(`et.reminder.${YESTERDAY}`, 'workoutReminder', YESTERDAY)];
    assert.deepEqual(deliveredToDismiss(delivered, base()), [`et.reminder.${YESTERDAY}`]);
  });
});
