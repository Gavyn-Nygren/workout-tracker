// Keeping iOS's pending notifications in line with the plan (G3.12): which requests are ours, the
// diff (never cancelling a wanted one for being close), the single-flight queue, and one run's
// apply step against a fake iOS that also holds requests that must never be touched. The whole
// chain on a real database: notificationSyncDb.test.ts.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { defaultPreferences } from '../src/data/preferences';
import type { DataRepository } from '../src/data/repository';
import type { Plan, Preferences, ScheduledOccurrence } from '../src/data/types';
import { localInstantMs } from '../src/features/notifications/localTime';
import { MIN_LEAD_MS, notificationKey } from '../src/features/notifications/notificationPlan';
import { createSyncQueue, diffPending, ownRequests, type OwnPending } from '../src/features/notifications/reconcile';
import { createSummaryMemo, describePending, readyToSync, runNotificationSync, type NotificationScheduler, type SyncContext } from '../src/features/notifications/runSync';
import type { NotificationKind, PendingRequest, PlannedNotification } from '../src/features/notifications/types';

const TODAY = '2026-11-02'; // a Monday
const OWNER = 'install_1';
const STAMP = '2026-10-01T08:00:00.000Z';
const at = (date: string, time: string) => localInstantMs({ date, time });

function item(nid: string, fireAtMs: number, title = 'Lower A today', kind: NotificationKind = 'workoutReminder'): PlannedNotification {
  const body = 'Upper / Lower · about 60 min';
  const threadId = 'et.reminder';
  const key = notificationKey({ fireAtMs, title, body, sound: true, threadId });
  return {
    nid,
    kind,
    at: { date: TODAY, time: '17:00' },
    fireAtMs,
    title,
    body,
    sound: true,
    threadId,
    data: { app: 'et', v: 1, owner: OWNER, kind, nid, date: TODAY, fireAt: fireAtMs, key },
  };
}

const own = (n: PlannedNotification): OwnPending => ({ nid: n.nid, key: n.data.key, fireAt: n.fireAtMs });

// ---------------------------------------------------------------------------
// A fake iOS: one request per identifier, pending until its time, then delivered.

type Req = { identifier: string; data: Record<string, unknown> | null; title?: string; body?: string; fireAtMs?: number; inSeconds?: number };

/** Requests that are never ours to touch: another project's, another install's with our tag, the rest alarm, and a preview. */
function untouchables(): { pending: Req[]; delivered: Req[] } {
  const otherOwner = (nid: string, kind: NotificationKind): Req => ({
    identifier: `@anonymous/exercise-tracker-old/${nid}`,
    data: { app: 'et', v: 1, owner: 'install_old', kind, nid, date: TODAY, fireAt: at(TODAY, '17:00'), key: 'old' },
  });
  return {
    pending: [
      { identifier: '@someone/other-project/daily', data: { scopeKey: '@someone/other-project', kind: 'workoutReminder', nid: `et.reminder.${TODAY}` } },
      otherOwner(`et.reminder.${TODAY}`, 'workoutReminder'),
      { identifier: 'rest-alarm', data: { kind: 'restAlarm' } },
      { identifier: 'preview.workoutReminder', data: { app: 'et', v: 1, owner: OWNER, kind: 'workoutReminder', nid: 'preview.workoutReminder', date: TODAY, fireAt: 0, key: 'p' } },
    ],
    delivered: [
      { identifier: '@someone/other-project/old', data: { scopeKey: '@someone/other-project' } },
      otherOwner(`et.missed.${addDays(TODAY, -1)}`, 'missedWorkout'),
      { identifier: 'rest-alarm', data: { kind: 'restAlarm' } },
      { identifier: 'preview.missedWorkout', data: { app: 'et', v: 1, owner: OWNER, kind: 'missedWorkout', nid: 'preview.missedWorkout', date: '2026-01-01', fireAt: 0, key: 'p' } },
    ],
  };
}

function fakeIos(clock: () => number) {
  const pending = new Map<string, Req>();
  const delivered = new Map<string, Req>();
  const calls: string[] = [];
  const failing = { schedule: new Set<string>(), cancel: new Set<string>(), dismiss: new Set<string>(), getPending: false, getDelivered: false };
  const seeded = untouchables();
  for (const r of seeded.pending) pending.set(r.identifier, structuredClone(r));
  for (const r of seeded.delivered) delivered.set(r.identifier, structuredClone(r));
  const listed = (map: Map<string, Req>): PendingRequest[] => [...map.values()].map((r) => ({ identifier: r.identifier, data: r.data && structuredClone(r.data) }));

  const scheduler: NotificationScheduler = {
    getPending: async () => {
      if (failing.getPending) throw new Error('getAll failed');
      return listed(pending);
    },
    getDelivered: async () => {
      if (failing.getDelivered) throw new Error('getPresented failed');
      return listed(delivered);
    },
    schedule: async (n, opts) => {
      calls.push(`schedule ${n.nid}`);
      if (failing.schedule.has(n.nid)) throw new Error('Notifications are not allowed');
      // Like TriggerRecords.swift: a date trigger that has passed makes the call fail.
      if (!opts?.inSeconds && !(n.fireAtMs > clock())) throw new Error('Trigger date is in the past');
      pending.set(n.nid, { identifier: n.nid, data: structuredClone(n.data), title: n.title, body: n.body, fireAtMs: n.fireAtMs, inSeconds: opts?.inSeconds });
    },
    cancel: async (nid) => {
      calls.push(`cancel ${nid}`);
      if (failing.cancel.has(nid)) throw new Error('cancel failed');
      pending.delete(nid);
    },
    dismiss: async (nid) => {
      calls.push(`dismiss ${nid}`);
      if (failing.dismiss.has(nid)) throw new Error('dismiss failed');
      delivered.delete(nid);
    },
  };

  return {
    scheduler,
    pending,
    delivered,
    calls,
    failing,
    /** Our pending nids (this owner, not previews), sorted. */
    ours: () => ownRequests(listed(pending), OWNER).map((p) => p.nid).sort(),
    /** Every request that isn't ours is exactly as it was seeded, and no call ever named one. */
    assertUntouched: () => {
      for (const r of seeded.pending) assert.deepEqual(pending.get(r.identifier), r, `pending ${r.identifier}`);
      for (const r of seeded.delivered) assert.deepEqual(delivered.get(r.identifier), r, `delivered ${r.identifier}`);
      for (const call of calls) {
        assert.ok(!/\b(rest-alarm|preview\.|@someone|@anonymous)/.test(call), call);
      }
    },
  };
}

// ---------------------------------------------------------------------------

describe('which pending requests are ours', () => {
  test('app "et", this install, a nid that is not a preview: nothing else', () => {
    const ok = item(`et.reminder.${TODAY}`, at(TODAY, '17:00'));
    const all: PendingRequest[] = [
      { identifier: 'whatever-expo-go-made-of-it', data: ok.data },
      ...untouchables().pending,
      { identifier: 'no-data' },
      { identifier: 'null-data', data: null },
      { identifier: 'nid-not-string', data: { app: 'et', owner: OWNER, nid: 7 } },
      { identifier: 'empty-nid', data: { app: 'et', owner: OWNER, nid: '' } },
    ];
    assert.deepEqual(ownRequests(all, OWNER), [{ nid: ok.nid, key: ok.data.key, fireAt: ok.fireAtMs }]);
  });

  test('the nid comes from the data, never from the identifier', () => {
    const ok = item(`et.reminder.${TODAY}`, at(TODAY, '17:00'));
    const [mine] = ownRequests([{ identifier: `@anonymous/exercise-tracker-abc/et.reminder.2026-12-25`, data: ok.data }], OWNER);
    assert.equal(mine.nid, `et.reminder.${TODAY}`);
  });

  test('a request without a readable key is still ours, and gets replaced', () => {
    const planned = item(`et.reminder.${TODAY}`, at(TODAY, '17:00'));
    const mine = ownRequests([{ identifier: planned.nid, data: { app: 'et', owner: OWNER, nid: planned.nid } }], OWNER);
    assert.deepEqual(mine, [{ nid: planned.nid, key: '', fireAt: Number.NaN }]);
    assert.deepEqual(diffPending(mine, [planned], at(TODAY, '08:00')), { cancel: [], schedule: [planned] });
  });
});

describe('the diff', () => {
  const now = at(TODAY, '08:00');
  const a = item(`et.reminder.${TODAY}`, at(TODAY, '17:00'));
  const b = item(`et.reminder.${addDays(TODAY, 2)}`, at(addDays(TODAY, 2), '17:00'));

  test('nothing to do when the pending set matches', () => {
    assert.deepEqual(diffPending([own(a), own(b)], [a, b], now), { cancel: [], schedule: [] });
  });

  test('ours that are no longer planned are cancelled; missing ones are scheduled', () => {
    assert.deepEqual(diffPending([own(a)], [b], now), { cancel: [a.nid], schedule: [b] });
    assert.deepEqual(diffPending([], [a, b], now), { cancel: [], schedule: [a, b] });
    assert.deepEqual(diffPending([own(a), own(b)], [], now), { cancel: [a.nid, b.nid], schedule: [] });
  });

  test('a changed key replaces the request (same nid, so no cancel)', () => {
    const renamed = item(a.nid, a.fireAtMs, 'Squat Day today');
    assert.deepEqual(diffPending([own(a)], [renamed], now), { cancel: [], schedule: [renamed] });
    const moved = item(a.nid, at(TODAY, '18:00'));
    assert.deepEqual(diffPending([own(a)], [moved], now), { cancel: [], schedule: [moved] });
  });

  test('replanning 3 s before a pending reminder fires cancels nothing', () => {
    const soon = at(TODAY, '17:00') - 3000;
    assert.deepEqual(diffPending([own(a)], [a], soon), { cancel: [], schedule: [] });
  });

  test('a changed item under 5 s away keeps the pending copy; a missing one that close is not sent', () => {
    const soon = a.fireAtMs - (MIN_LEAD_MS - 1);
    assert.deepEqual(diffPending([own(a)], [item(a.nid, a.fireAtMs, 'Squat Day today')], soon), { cancel: [], schedule: [] });
    assert.deepEqual(diffPending([], [a], soon), { cancel: [], schedule: [] });
    // Exactly the minimum lead is enough.
    assert.deepEqual(diffPending([], [a], a.fireAtMs - MIN_LEAD_MS), { cancel: [], schedule: [a] });
  });

  test('a stale duplicate under the same nid does not hide the matching one', () => {
    assert.deepEqual(diffPending([{ nid: a.nid, key: 'old', fireAt: 0 }, own(a)], [a], now), { cancel: [], schedule: [] });
    assert.deepEqual(diffPending([{ nid: b.nid, key: 'x', fireAt: 0 }, { nid: b.nid, key: 'y', fireAt: 0 }], [], now), { cancel: [b.nid], schedule: [] }, 'cancelled once');
  });
});

describe('the run queue', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };

  test('requests during a run cause exactly one more run, which applies the newest data', async () => {
    let version = 0;
    const applied: number[] = [];
    const gates = [deferred(), deferred()];
    let runs = 0;
    const queue = createSyncQueue(async () => {
      const read = version; // the run's reads
      const gate = gates[runs++];
      if (gate) await gate.promise;
      applied.push(read);
    });

    queue.request();
    assert.equal(runs, 1, 'the first request starts a run straight away');
    version = 1;
    queue.request();
    version = 2;
    queue.request();
    queue.request();
    assert.equal(runs, 1, 'no overlapping run');
    gates[0].resolve();
    await new Promise((r) => setImmediate(r));
    assert.equal(runs, 2, 'one rerun for the three requests');
    gates[1].resolve();
    await queue.idle();
    assert.deepEqual(applied, [0, 2], 'the last plan applied is from the newest reads');

    queue.request();
    await queue.idle();
    assert.equal(runs, 3);
    assert.deepEqual(applied, [0, 2, 2]);
  });

  test('a failing run is swallowed and the queue keeps working', async () => {
    let runs = 0;
    const queue = createSyncQueue(async () => {
      runs++;
      if (runs === 1) throw new Error('boom');
    });
    queue.request();
    await queue.idle();
    queue.request();
    await queue.idle();
    assert.equal(runs, 2);

    const sync = createSyncQueue(() => {
      throw new Error('thrown before any await');
    });
    sync.request();
    await sync.idle();
  });

  test('a request made by the run itself causes one rerun, not a loop', async () => {
    let runs = 0;
    const queue = createSyncQueue(async () => {
      runs++;
      if (runs === 1) queue.request();
    });
    queue.request();
    await queue.idle();
    assert.equal(runs, 2);
  });

  test('idle resolves at once when nothing is running', async () => {
    const queue = createSyncQueue(async () => {});
    await queue.idle();
  });
});

describe('readiness', () => {
  test('no run until the permission is known and the open workout is restored', () => {
    assert.equal(readyToSync({ permission: null, workoutReady: true }), false);
    assert.equal(readyToSync({ permission: 'granted', workoutReady: false }), false);
    assert.equal(readyToSync({ permission: null, workoutReady: false }), false);
    for (const permission of ['granted', 'denied', 'undetermined', 'unknown'] as const) assert.equal(readyToSync({ permission, workoutReady: true }), true, permission);
  });
});

// ---------------------------------------------------------------------------
// One run against a stand-in repository: the apply step.

const plan: Plan = {
  id: 'p1',
  name: 'Upper / Lower',
  version: 1,
  status: 'active',
  startDate: '2026-10-05',
  schedule: { type: 'weekly', days: [1, 3, 5].map((weekday) => ({ weekday: weekday as 1 | 3 | 5, workoutIds: ['a'] })) },
  workouts: [{ id: 'a', name: 'Lower A', blocks: [], estimatedMinutes: 60 }],
  createdAt: STAMP,
  updatedAt: STAMP,
};

/** Mon, Wed and Fri in the planner's window (yesterday through the horizon). */
const occurrences: ScheduledOccurrence[] = Array.from({ length: 16 }, (_, i) => addDays(TODAY, i - 1))
  .filter((date) => [1, 3, 5].includes(new Date(`${date}T12:00:00`).getDay()))
  .map((date) => ({ id: `occ_p1_${date}_a`, planId: 'p1', planVersion: 1, planWorkoutId: 'a', scheduledDate: date }));

function stubRepo(o: { preferences?: Preferences; plans?: Plan[]; failing?: string } = {}) {
  const preferences = o.preferences ?? { ...defaultPreferences, notifications: { ...defaultPreferences.notifications, workoutReminders: true } };
  const reads: Record<string, () => Promise<unknown>> = {
    getPreferences: async () => preferences,
    listOccurrences: async () => occurrences,
    listPlans: async () => o.plans ?? [plan],
    listPlanVersions: async () => [],
  };
  return new Proxy({} as DataRepository, {
    get(_, prop) {
      if (prop === 'today') return () => TODAY;
      const read = reads[String(prop)];
      if (!read) return async () => assert.fail(`unexpected call: ${String(prop)}`);
      return async () => {
        if (o.failing === prop) throw new Error(`${String(prop)} failed`);
        return read();
      };
    },
  });
}

const context = (extra: Partial<SyncContext> = {}): SyncContext => ({
  permission: 'granted',
  signedIn: true,
  onboarded: true,
  workoutOpen: false,
  keptMissedIds: new Set(),
  owner: OWNER,
  ...extra,
});

const REMINDER_DAYS = occurrences.map((o) => o.scheduledDate).filter((d) => d >= TODAY && d < addDays(TODAY, 14));

describe('a run against a fake iOS', () => {
  test('schedules ours beside the requests it must not touch, even one with our nid from another install', async () => {
    let now = at(TODAY, '08:00');
    const ios = fakeIos(() => now);
    const deps = { repo: stubRepo(), scheduler: ios.scheduler, now: () => now, memo: createSummaryMemo() };
    const result = await runNotificationSync(deps, context());
    assert.equal(result.status, 'applied');
    assert.deepEqual(ios.ours(), REMINDER_DAYS.map((d) => `et.reminder.${d}`).sort());
    assert.equal(result.scheduled, REMINDER_DAYS.length);
    ios.assertUntouched();

    // A second run with nothing changed makes no calls at all.
    ios.calls.length = 0;
    now += 60_000;
    assert.deepEqual(await runNotificationSync(deps, context()), { status: 'applied', scheduled: 0, cancelled: 0, dismissed: 0 });
    assert.deepEqual(ios.calls, []);
  });

  test('a run 3 s before a pending reminder leaves it alone', async () => {
    let now = at(TODAY, '08:00');
    const ios = fakeIos(() => now);
    const deps = { repo: stubRepo(), scheduler: ios.scheduler, now: () => now, memo: createSummaryMemo() };
    await runNotificationSync(deps, context());
    ios.calls.length = 0;
    now = at(TODAY, '17:00') - 3000;
    await runNotificationSync(deps, context());
    assert.equal(ios.calls.length, 0, ios.calls.join(', '));
    assert.ok(ios.pending.has(`et.reminder.${TODAY}`));

    // The plan renamed 3 s before: today's keeps its pending copy, the later ones are replaced.
    const renamed = { ...plan, workouts: [{ ...plan.workouts[0], name: 'Squat Day' }] };
    await runNotificationSync({ ...deps, repo: stubRepo({ plans: [renamed] }) }, context());
    assert.equal(ios.pending.get(`et.reminder.${TODAY}`)?.title, 'Lower A today');
    assert.ok(!ios.calls.includes(`schedule et.reminder.${TODAY}`) && !ios.calls.includes(`cancel et.reminder.${TODAY}`));
    assert.equal(ios.pending.get(`et.reminder.${REMINDER_DAYS[1]}`)?.title, 'Squat Day today');
  });

  test('one failed call never stops the rest', async () => {
    const now = at(TODAY, '08:00');
    const ios = fakeIos(() => now);
    ios.failing.schedule.add(`et.reminder.${REMINDER_DAYS[1]}`);
    const deps = { repo: stubRepo(), scheduler: ios.scheduler, now: () => now, memo: createSummaryMemo() };
    const first = await runNotificationSync(deps, context());
    assert.equal(first.scheduled, REMINDER_DAYS.length - 1);
    assert.deepEqual(ios.ours(), REMINDER_DAYS.filter((d) => d !== REMINDER_DAYS[1]).map((d) => `et.reminder.${d}`).sort());

    // The next run tries the failed one again.
    ios.failing.schedule.clear();
    assert.equal((await runNotificationSync(deps, context())).scheduled, 1);
    assert.equal(ios.ours().length, REMINDER_DAYS.length);

    // Turning reminders off with two cancels failing: every other one still goes.
    ios.failing.cancel.add(`et.reminder.${REMINDER_DAYS[0]}`).add(`et.reminder.${REMINDER_DAYS[3]}`);
    const off = stubRepo({ preferences: defaultPreferences });
    const third = await runNotificationSync({ ...deps, repo: off }, context());
    assert.equal(third.cancelled, REMINDER_DAYS.length - 2);
    assert.deepEqual(ios.ours(), [`et.reminder.${REMINDER_DAYS[0]}`, `et.reminder.${REMINDER_DAYS[3]}`].sort());
    ios.assertUntouched();
  });

  test('a failed read aborts before anything is touched', async () => {
    const now = at(TODAY, '08:00');
    const ios = fakeIos(() => now);
    const deps = { repo: stubRepo(), scheduler: ios.scheduler, now: () => now, memo: createSummaryMemo() };
    await runNotificationSync(deps, context());
    const before = ios.ours();
    ios.calls.length = 0;
    for (const failing of ['getPreferences', 'listOccurrences', 'listPlans', 'listPlanVersions']) {
      const result = await runNotificationSync({ ...deps, repo: stubRepo({ preferences: defaultPreferences, failing }) }, context());
      assert.deepEqual(result, { status: 'aborted', scheduled: 0, cancelled: 0, dismissed: 0 }, failing);
    }
    assert.deepEqual(ios.calls, []);
    assert.deepEqual(ios.ours(), before);
  });

  test('without the pending list nothing is changed; without the delivered list only clearing is skipped', async () => {
    const now = at(TODAY, '08:00');
    const ios = fakeIos(() => now);
    const deps = { repo: stubRepo(), scheduler: ios.scheduler, now: () => now, memo: createSummaryMemo() };
    ios.failing.getPending = true;
    assert.equal((await runNotificationSync(deps, context())).status, 'aborted');
    assert.deepEqual(ios.calls, []);
    ios.failing.getPending = false;
    ios.failing.getDelivered = true;
    const result = await runNotificationSync(deps, context({ signedIn: false }));
    assert.equal(result.status, 'applied');
    assert.equal(result.dismissed, 0);
  });

  test('describePending lists ours soonest first, previews marked, and counts the rest', async () => {
    const now = at(TODAY, '08:00');
    const ios = fakeIos(() => now);
    const deps = { repo: stubRepo(), scheduler: ios.scheduler, now: () => now, memo: createSummaryMemo() };
    assert.match(await describePending(ios.scheduler, OWNER), /^1 pending\nReminder \(preview\)/);
    await runNotificationSync(deps, context());
    const text = await describePending(ios.scheduler, OWNER);
    const lines = text.split('\n');
    assert.equal(lines[0], `${REMINDER_DAYS.length + 1} pending`);
    assert.match(lines[1], /^Reminder \(preview\) · /, 'the seeded preview fires at 0 here, so it comes first');
    assert.equal(lines[2], 'Reminder · Mon, Nov 2, 5:00 PM · Lower A today');
    assert.equal(lines[3], 'Reminder · Wed, Nov 4, 5:00 PM · Lower A today');
    assert.deepEqual(lines.slice(-2), ['Rest alarm pending.', 'Also pending: 2 other.'], 'the rest alarm gets its own line; the other project and the old install are counted');
    assert.equal(await describePending(fakeIos(() => now).scheduler, 'nobody'), 'Nothing pending.\nRest alarm pending.\nAlso pending: 3 other.');
  });

  test('describePending in a build of its own: only ours and the rest alarm, so no "other" line', async () => {
    const now = at(TODAY, '08:00');
    const own = fakeIos(() => now);
    await own.scheduler.cancel('@someone/other-project/daily');
    await own.scheduler.cancel(`@anonymous/exercise-tracker-old/et.reminder.${TODAY}`);
    const lines = (await describePending(own.scheduler, OWNER)).split('\n');
    assert.equal(lines[0], '1 pending');
    assert.equal(lines.at(-1), 'Rest alarm pending.');
    assert.equal(lines.length, 3);
  });
});

// ---------------------------------------------------------------------------

describe('never everything at once', () => {
  /** Every source file under src/. */
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  test('no code calls cancel-all or dismiss-all (they would also drop a running rest alarm and other projects)', () => {
    const src = join(__dirname, '..', 'src');
    const offenders = files(src).filter((path) => {
      const code = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /\b(cancelAllScheduledNotificationsAsync|dismissAllNotificationsAsync|cancelAllNotificationsAsync)\b/.test(code);
    });
    assert.deepEqual(offenders, []);
  });
});
