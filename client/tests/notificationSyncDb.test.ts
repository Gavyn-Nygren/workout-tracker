// End to end (G3.12, spec 7: "reminders cancel or reschedule when a workout is completed or
// shifted"): the real SQLite repository behind the write feed, the sync run, and a fake iOS.
// Each write goes through the feed, which queues a run, exactly as NotificationSync wires it; the
// test then checks what iOS has pending and delivered. The fake also holds another project's
// request, another install's request with our tag, the rest alarm and a preview, and checks after
// every run that none of them was touched.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays } from '../src/data/dates';
import { eraseAllData, loadSampleData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { devFaults, withDevFaults } from '../src/data/devFaults';
import { defaultPreferences } from '../src/data/preferences';
import type { DataRepository } from '../src/data/repository';
import type { LoggedSet, Plan, Preferences, WorkoutSession } from '../src/data/types';
import { withWriteFeed } from '../src/data/writeFeed';
import { localInstantMs } from '../src/features/notifications/localTime';
import { ownRequests, createSyncQueue } from '../src/features/notifications/reconcile';
import { createSummaryMemo, runNotificationSync, sendPreviews, type NotificationScheduler, type SyncContext, type SyncDeps, type SyncResult } from '../src/features/notifications/runSync';
import type { NotificationKind, PendingRequest } from '../src/features/notifications/types';
import { openTestDatabase } from './support/nodeSqlite';

const PLAN_START = '2026-10-26'; // the Monday before
const TODAY = '2026-11-02'; // a Monday
const YESTERDAY = '2026-11-01';
const OWNER = 'install_1';
const STAMP = '2026-10-26T08:00:00.000Z';
const at = (date: string, time: string) => localInstantMs({ date, time });

/** Mon Lower A, Wed Upper A, Fri Lower A, Sun Upper A. */
const p1: Plan = {
  id: 'p1',
  name: 'Upper / Lower',
  version: 1,
  status: 'active',
  startDate: PLAN_START,
  schedule: {
    type: 'weekly',
    days: [
      { weekday: 1, workoutIds: ['a'] },
      { weekday: 3, workoutIds: ['b'] },
      { weekday: 5, workoutIds: ['a'] },
      { weekday: 7, workoutIds: ['b'] },
    ],
  },
  workouts: [
    { id: 'a', name: 'Lower A', blocks: [], estimatedMinutes: 60 },
    { id: 'b', name: 'Upper A', blocks: [], estimatedMinutes: 45 },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
};

/** Mondays: Calves & Core, so Mondays have two workouts from two plans. */
const p2: Plan = {
  id: 'p2',
  name: 'Core',
  version: 1,
  status: 'active',
  startDate: PLAN_START,
  schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['c'] }] },
  workouts: [{ id: 'c', name: 'Calves & Core', blocks: [], estimatedMinutes: 20 }],
  createdAt: STAMP,
  updatedAt: STAMP,
};

const occId = (planId: string, date: string, workoutId: string) => `occ_${planId}_${date}_${workoutId}`;
const TODAY_A = occId('p1', TODAY, 'a');
const TODAY_C = occId('p2', TODAY, 'c');
const YESTERDAY_B = occId('p1', YESTERDAY, 'b');

const reminder = (date: string) => `et.reminder.${date}`;
const missed = (date: string) => `et.missed.${date}`;
const summary = (weekStart: string) => `et.summary.${weekStart}`;

/** Training days in the 14 days from today: Mon, Wed, Fri, Sun, Mon, Wed, Fri, Sun. */
const REMINDER_DAYS = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-15'];
/** The weekly summary (Sunday 19:00, Monday weeks): this week so far, then next week. */
const SUMMARIES = [summary('2026-11-02'), summary('2026-11-09')];
const INITIAL = [...REMINDER_DAYS.map(reminder), missed(YESTERDAY), ...SUMMARIES].sort();

const PREFERENCES: Preferences = {
  ...defaultPreferences,
  notifications: { ...defaultPreferences.notifications, workoutReminders: true, missedWorkout: true, weeklySummary: true },
};

// ---------------------------------------------------------------------------
// Workouts

let nextId = 0;
const workingSet = (): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], reps: 5, loadKg: 100, completedAt: `${TODAY}T18:00:00.000Z` });

/** A workout started from a scheduled one (what the first autosave writes). */
function started(occurrenceId: string, name: string, sets: LoggedSet[] = []): WorkoutSession {
  const [, planId, scheduledDate, planWorkoutId] = /^occ_(\w+?)_(\d{4}-\d{2}-\d{2})_(\w+)$/.exec(occurrenceId)!;
  return {
    id: `sess_${occurrenceId}`,
    name,
    occurrenceId,
    planId,
    planWorkoutId,
    status: 'in_progress',
    scheduledDate,
    startedAt: `${TODAY}T17:30:00.000Z`,
    blocks: [{ id: `blk${nextId++}`, type: 'single', exercises: [{ id: `ent${nextId++}`, exerciseId: 'ex_back_squat', skipped: false, sets }] }],
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

const finished = (s: WorkoutSession): WorkoutSession => ({
  ...s,
  status: 'completed',
  completion: 'full',
  completedDate: TODAY,
  completedAt: `${TODAY}T18:30:00.000Z`,
  blocks: s.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.length ? e.sets : [workingSet()] })) })),
});

/** Today's ⋯ → Skip workout. */
function skipped(occurrenceId: string, name: string): WorkoutSession {
  const s = started(occurrenceId, name);
  return { ...s, id: `skip_${occurrenceId}`, status: 'skipped', startedAt: undefined, blocks: [] };
}

// ---------------------------------------------------------------------------
// A fake iOS: one request per identifier, pending until its time, then delivered.

type Req = { identifier: string; data: Record<string, unknown> | null; title?: string; body?: string; fireAtMs?: number; inSeconds?: number };

function untouchables(): { pending: Req[]; delivered: Req[] } {
  const otherOwner = (nid: string, kind: NotificationKind, date: string): Req => ({
    identifier: `@anonymous/exercise-tracker-old/${nid}`,
    data: { app: 'et', v: 1, owner: 'install_old', kind, nid, date, fireAt: at(TODAY, '17:00'), key: 'old' },
  });
  return {
    pending: [
      { identifier: '@someone/other-project/daily', data: { scopeKey: '@someone/other-project', kind: 'workoutReminder', nid: reminder(TODAY) } },
      otherOwner(reminder(TODAY), 'workoutReminder', TODAY),
      { identifier: 'rest-alarm', data: { kind: 'restAlarm' } },
      { identifier: 'preview.workoutReminder', data: { app: 'et', v: 1, owner: OWNER, kind: 'workoutReminder', nid: 'preview.workoutReminder', date: TODAY, fireAt: 0, key: 'p' } },
    ],
    delivered: [
      { identifier: '@someone/other-project/old', data: { scopeKey: '@someone/other-project' } },
      otherOwner(missed('2026-10-20'), 'missedWorkout', '2026-10-20'),
      { identifier: 'rest-alarm', data: { kind: 'restAlarm' } },
      { identifier: 'preview.missedWorkout', data: { app: 'et', v: 1, owner: OWNER, kind: 'missedWorkout', nid: 'preview.missedWorkout', date: '2026-10-20', fireAt: 0, key: 'p' } },
    ],
  };
}

function fakeIos(clock: () => number) {
  const pending = new Map<string, Req>();
  const delivered = new Map<string, Req>();
  const calls: string[] = [];
  const seeded = untouchables();
  for (const r of seeded.pending) pending.set(r.identifier, structuredClone(r));
  for (const r of seeded.delivered) delivered.set(r.identifier, structuredClone(r));
  const listed = (map: Map<string, Req>): PendingRequest[] => [...map.values()].map((r) => ({ identifier: r.identifier, data: r.data && structuredClone(r.data) }));

  const scheduler: NotificationScheduler = {
    getPending: async () => listed(pending),
    getDelivered: async () => listed(delivered),
    schedule: async (n, opts) => {
      calls.push(`schedule ${n.nid}`);
      if (!opts?.inSeconds && !(n.fireAtMs > clock())) throw new Error('Trigger date is in the past');
      pending.set(n.nid, { identifier: n.nid, data: structuredClone(n.data), title: n.title, body: n.body, fireAtMs: n.fireAtMs, ...(opts?.inSeconds ? { inSeconds: opts.inSeconds } : {}) });
    },
    cancel: async (nid) => {
      calls.push(`cancel ${nid}`);
      pending.delete(nid);
    },
    dismiss: async (nid) => {
      calls.push(`dismiss ${nid}`);
      delivered.delete(nid);
    },
  };

  return {
    scheduler,
    pending,
    delivered,
    calls,
    /** Our pending nids, sorted. */
    ours: () => ownRequests(listed(pending), OWNER).map((p) => p.nid).sort(),
    /** Our delivered nids, sorted. */
    oursDelivered: () => ownRequests(listed(delivered), OWNER).map((p) => p.nid).sort(),
    /** nid → key of ours, to compare whole pending sets. */
    keys: () => new Map(ownRequests(listed(pending), OWNER).map((p) => [p.nid, p.key])),
    title: (nid: string) => pending.get(nid)?.title,
    body: (nid: string) => pending.get(nid)?.body,
    /** iOS delivers whatever's due: it moves from pending to delivered under the same identifier. */
    deliverDue: () => {
      for (const [id, r] of pending) {
        if (r.fireAtMs !== undefined && r.fireAtMs <= clock()) {
          pending.delete(id);
          delivered.set(id, r);
        }
      }
    },
    assertUntouched: () => {
      for (const r of seeded.pending) assert.deepEqual(pending.get(r.identifier), r, `pending ${r.identifier}`);
      for (const r of seeded.delivered) assert.deepEqual(delivered.get(r.identifier), r, `delivered ${r.identifier}`);
      for (const call of calls) assert.ok(!/\b(rest-alarm|preview\.|@someone|@anonymous)/.test(call), call);
    },
  };
}

// ---------------------------------------------------------------------------
// The setup: a database with two plans started a week ago, the feed, the queue and the fake iOS.

async function setup(o: { ctx?: Partial<SyncContext> } = {}) {
  const db = openTestDatabase();
  migrate(db);
  eraseAllData(db);
  let today = PLAN_START;
  const store = createSqliteRepository(db, { today: () => today });
  await store.savePreferences(PREFERENCES);
  await store.savePlan(p1);
  await store.savePlan(p2);
  today = TODAY;

  const feed = withWriteFeed(store);
  let nowMs = at(TODAY, '08:00');
  const ios = fakeIos(() => nowMs);
  const ctx: SyncContext = { permission: 'granted', signedIn: true, onboarded: true, workoutOpen: false, keptMissedIds: new Set(), owner: OWNER, ...o.ctx };
  const deps: SyncDeps = { repo: feed.repository, scheduler: ios.scheduler, now: () => nowMs, memo: createSummaryMemo() };
  const results: SyncResult[] = [];
  // The queue swallows errors, so a failed check inside a run is kept and thrown by sync()/settled().
  let failure: unknown;
  const queue = createSyncQueue(async () => {
    try {
      results.push(await runNotificationSync(deps, ctx));
      ios.assertUntouched();
    } catch (error) {
      failure ??= error;
    }
  });
  const done = async () => {
    await queue.idle();
    if (failure !== undefined) throw failure;
    return results.at(-1)!;
  };
  // As NotificationSync wires it: every write queues a run.
  feed.subscribe(() => queue.request());

  return {
    db,
    store,
    feed,
    repo: feed.repository,
    ios,
    ctx,
    deps,
    results,
    /** A run for a trigger that isn't a write (the open workout, auth, permission, kept misses, a new day). */
    sync: () => {
      queue.request();
      return done();
    },
    /** Waits for the run a write queued. */
    settled: done,
    setClock: (date: string, time: string, seconds = 0) => {
      nowMs = at(date, time) + seconds * 1000;
      ios.deliverDue();
    },
    setToday: (date: string) => {
      today = date;
    },
  };
}

/** Counts the repository calls a run makes. */
function countingRepo(repo: DataRepository) {
  const counts = new Map<string, number>();
  const proxy = new Proxy(repo, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function' || prop === 'today') return original;
      return (...args: unknown[]) => {
        counts.set(String(prop), (counts.get(String(prop)) ?? 0) + 1);
        return (original as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { repo: proxy, counts };
}

const SUMMARY_READS = ['listSessions', 'listExercises', 'listPersonalRecords', 'getStreak', 'listFormReports', 'listGoals'];

// ---------------------------------------------------------------------------

describe('notification sync on a real database', () => {
  test('a first run: a reminder per training day, one missed prompt, two summaries; its own reads never bump the feed', async () => {
    const env = await setup();
    const version = env.feed.getVersion();
    const result = await env.sync();
    assert.equal(result.status, 'applied');
    assert.deepEqual(env.ios.ours(), INITIAL);
    assert.equal(result.scheduled, INITIAL.length);
    assert.equal(env.feed.getVersion(), version, 'ensureSchedule and the streak freeze write during reads, but not through the feed: no loop');

    assert.equal(env.ios.title(reminder(TODAY)), 'Lower A and Calves & Core today');
    assert.equal(env.ios.body(reminder(TODAY)), '2 workouts · about 80 min');
    assert.equal(env.ios.title(reminder('2026-11-04')), 'Upper A today');
    assert.equal(env.ios.body(reminder('2026-11-04')), 'Upper / Lower · about 45 min');
    assert.equal(env.ios.title(missed(YESTERDAY)), 'You missed Upper A yesterday');
    assert.equal(env.ios.pending.get(missed(YESTERDAY))?.fireAtMs, at(TODAY, '09:00'));
    assert.equal(env.ios.title(summary('2026-11-02')), 'This week so far');
    assert.equal(env.ios.pending.get(summary('2026-11-02'))?.fireAtMs, at('2026-11-08', '19:00'));

    // Nothing changed: nothing is sent again.
    env.ios.calls.length = 0;
    assert.deepEqual(await env.sync(), { status: 'applied', scheduled: 0, cancelled: 0, dismissed: 0 });
    assert.deepEqual(env.ios.calls, []);
    env.db.close();
  });

  test('starting a workout: the open workout settles it before the first autosave, then the saved session does', async () => {
    const env = await setup();
    await env.sync();

    // Open: no write yet (the autosave comes 500 ms later).
    Object.assign(env.ctx, { workoutOpen: true, openOccurrenceId: TODAY_A });
    await env.sync();
    assert.equal(env.ios.title(reminder(TODAY)), 'Calves & Core today', 'renamed to name only the one left');
    assert.equal(env.ios.body(reminder(TODAY)), 'Core · about 20 min');

    // The first autosave links it: nothing changes.
    env.ios.calls.length = 0;
    await env.repo.saveSession(started(TODAY_A, 'Lower A'));
    await env.settled();
    assert.deepEqual(env.ios.calls, []);

    // Closed (minimized and finished elsewhere would be the same): the link keeps it settled.
    Object.assign(env.ctx, { workoutOpen: false, openOccurrenceId: undefined });
    await env.sync();
    assert.equal(env.ios.title(reminder(TODAY)), 'Calves & Core today');

    // The other one today starts too: today's reminder goes.
    await env.repo.saveSession(started(TODAY_C, 'Calves & Core'));
    await env.settled();
    assert.ok(!env.ios.ours().includes(reminder(TODAY)));
    assert.ok(env.ios.ours().includes(reminder('2026-11-09')), 'next Monday still has its reminder');
    env.db.close();
  });

  test('finishing a workout keeps its reminder away and updates the summary', async () => {
    const env = await setup();
    await env.sync();
    const bodyBefore = env.ios.body(summary(TODAY));
    const workout = started(TODAY_A, 'Lower A');
    await env.repo.saveSession(workout);
    await env.settled();
    await env.repo.saveSession(finished(workout));
    await env.settled();
    assert.equal(env.ios.title(reminder(TODAY)), 'Calves & Core today');
    assert.notEqual(env.ios.body(summary(TODAY)), bodyBefore);
    assert.match(env.ios.body(summary(TODAY)) ?? '', /^1 of \d+ workouts so far/);
    assert.ok(env.ios.ours().includes(summary(TODAY)), 'replaced under the same nid');
    env.db.close();
  });

  test('skip, then unskip', async () => {
    const env = await setup();
    await env.sync();
    await env.repo.saveSession(skipped(TODAY_A, 'Lower A'));
    await env.settled();
    await env.repo.saveSession(skipped(TODAY_C, 'Calves & Core'));
    await env.settled();
    assert.ok(!env.ios.ours().includes(reminder(TODAY)));

    await env.repo.deleteSession(`skip_${TODAY_C}`);
    await env.settled();
    assert.equal(env.ios.title(reminder(TODAY)), 'Calves & Core today', 'back on the plan');
    env.db.close();
  });

  test('a skipped miss is answered: yesterday’s prompt goes, and the next one waits for today', async () => {
    const env = await setup();
    await env.sync();
    await env.repo.saveSession(skipped(YESTERDAY_B, 'Upper A'));
    await env.settled();
    assert.ok(!env.ios.ours().includes(missed(YESTERDAY)));
    assert.ok(env.ios.ours().includes(missed(TODAY)), 'the only prompt pending is for the next unsettled day');
    assert.equal(env.ios.ours().filter((n) => n.startsWith('et.missed.')).length, 1);
    env.db.close();
  });

  test('discarding a started workout puts its reminder back', async () => {
    const env = await setup();
    await env.sync();
    const keys = env.ios.keys();
    await env.repo.saveSession(started(TODAY_A, 'Lower A'));
    await env.settled();
    await env.repo.saveSession(started(TODAY_C, 'Calves & Core'));
    await env.settled();
    assert.ok(!env.ios.ours().includes(reminder(TODAY)));
    await env.repo.deleteSession(`sess_${TODAY_A}`);
    await env.settled();
    await env.repo.deleteSession(`sess_${TODAY_C}`);
    await env.settled();
    assert.deepEqual(env.ios.keys(), keys, 'exactly as before');
    env.db.close();
  });

  test('a reminder that already arrived is cleared from Notification Center once its workouts are settled', async () => {
    const env = await setup();
    await env.sync();
    env.setClock(TODAY, '17:00', 30);
    await env.sync();
    assert.ok(env.ios.oursDelivered().includes(reminder(TODAY)), 'delivered and still true: left alone');
    await env.repo.saveSession(started(TODAY_A, 'Lower A'));
    await env.settled();
    assert.ok(env.ios.oursDelivered().includes(reminder(TODAY)), 'one of its two workouts is still to do');
    await env.repo.saveSession(skipped(TODAY_C, 'Calves & Core'));
    const result = await env.settled();
    assert.ok(!env.ios.oursDelivered().includes(reminder(TODAY)));
    assert.equal(result.dismissed, 1);
    env.db.close();
  });

  test('push forward and undo', async () => {
    const env = await setup();
    await env.sync();
    const keys = env.ios.keys();

    // Yesterday's Upper A moves to today; this week's later workouts move a day.
    await env.repo.pushPlanForward(YESTERDAY_B, 'shift_1');
    await env.settled();
    const ours = env.ios.ours();
    assert.ok(!ours.includes(missed(YESTERDAY)), 'the miss is answered');
    assert.equal(env.ios.title(reminder(TODAY)), 'Upper A and Calves & Core today');
    assert.equal(env.ios.title(reminder('2026-11-03')), 'Lower A today', "today's own Lower A moved to Tuesday");
    assert.ok(ours.includes(missed(TODAY)), 'the next prompt is for today, the morning after');
    assert.equal(env.ios.title(missed(TODAY)), 'You missed Upper A and Calves & Core yesterday');

    await env.repo.undoPlanShift('shift_1');
    await env.settled();
    assert.deepEqual(env.ios.keys(), keys, 'everything back where it was');
    env.db.close();
  });

  test('pausing a plan drops its reminders and prompts; resuming brings them back', async () => {
    const env = await setup();
    await env.sync();
    const keys = env.ios.keys();

    const saved = (await env.store.getPlan('p1'))!;
    await env.repo.savePlan({ ...saved, status: 'paused' });
    await env.settled();
    assert.deepEqual(env.ios.ours(), [missed(TODAY), reminder(TODAY), reminder('2026-11-09'), ...SUMMARIES].sort());
    assert.equal(env.ios.title(reminder(TODAY)), 'Calves & Core today');
    assert.equal(env.ios.title(missed(TODAY)), 'You missed Calves & Core yesterday');

    const paused = (await env.store.getPlan('p1'))!;
    await env.repo.savePlan({ ...paused, status: 'active' });
    await env.settled();
    assert.deepEqual(env.ios.keys(), keys);
    env.db.close();
  });

  test('plan edits: a renamed workout and a changed schedule', async () => {
    const env = await setup();
    await env.sync();
    const saved = (await env.store.getPlan('p1'))!;
    await env.repo.savePlan({
      ...saved,
      schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }, { weekday: 3, workoutIds: ['b'] }, { weekday: 7, workoutIds: ['b'] }] },
      workouts: saved.workouts.map((w) => (w.id === 'a' ? { ...w, name: 'Squat Day' } : w)),
    });
    await env.settled();
    const ours = env.ios.ours();
    assert.ok(!ours.includes(reminder('2026-11-06')) && !ours.includes(reminder('2026-11-13')), 'no more Fridays');
    assert.equal(env.ios.title(reminder(TODAY)), 'Squat Day and Calves & Core today');
    assert.equal(env.ios.title(reminder('2026-11-09')), 'Squat Day and Calves & Core today');
    assert.equal(env.ios.title(missed(YESTERDAY)), 'You missed Upper A yesterday', 'a past workout keeps the version it was scheduled with');

    // A workout's exercises changed (updatePlanWorkout, also through commitPlan): same names, nothing re-sent.
    env.ios.calls.length = 0;
    await env.repo.updatePlanWorkout('p1', 'b', []);
    await env.settled();
    assert.deepEqual(env.ios.calls, []);
    env.db.close();
  });

  test('deleting a plan', async () => {
    const env = await setup();
    await env.sync();
    await env.repo.deletePlan('p1');
    await env.settled();
    assert.deepEqual(env.ios.ours(), [missed(TODAY), reminder(TODAY), reminder('2026-11-09'), ...SUMMARIES].sort());
    await env.repo.deletePlan('p2');
    await env.settled();
    assert.deepEqual(env.ios.ours(), [], 'nothing planned, nothing done, no streak: no summary either');
    env.db.close();
  });

  test('Erase all data and Load sample data, then the feed bump that reload() makes', async () => {
    const env = await setup();
    await env.sync();

    // As DataProvider: rewrite the database, forget the caches, bump.
    eraseAllData(env.db);
    env.store.forgetCache();
    env.feed.bump();
    await env.settled();
    assert.deepEqual(env.ios.ours(), []);
    assert.equal((await env.store.getPreferences()).notifications.workoutReminders, true, 'settings survive');

    loadSampleData(env.db, TODAY);
    env.store.forgetCache();
    env.feed.bump();
    await env.settled();
    const ours = env.ios.ours();
    // The sample plans train Mon, Tue, Thu, Fri and Sat.
    assert.ok(ours.includes(reminder('2026-11-03')) && ours.includes(reminder('2026-11-07')), ours.join(', '));
    assert.ok(!ours.includes(reminder('2026-11-04')) && !ours.includes(reminder('2026-11-08')));
    // Two plans on a Monday, named in occurrence-id order, as Today's banner names them.
    assert.equal(env.ios.title(reminder('2026-11-09')), 'Calves & Core and Upper A today');
    env.db.close();
  });

  test('sign-out cancels and clears ours; sign-in brings them back; onboarding counts the same', async () => {
    const env = await setup();
    await env.sync();
    env.setClock(TODAY, '09:00', 30); // yesterday's prompt arrives
    await env.sync();
    assert.deepEqual(env.ios.oursDelivered(), [missed(YESTERDAY)]);
    assert.ok(env.ios.ours().includes(missed(TODAY)), 'the next prompt waits');

    env.ctx.signedIn = false;
    const out = await env.sync();
    assert.deepEqual(env.ios.ours(), []);
    assert.deepEqual(env.ios.oursDelivered(), [], 'a tap while signed out cannot navigate after the next sign-in');
    assert.equal(out.cancelled, INITIAL.length);
    assert.equal(out.dismissed, 1);

    env.ctx.signedIn = true;
    await env.sync();
    assert.deepEqual(env.ios.ours(), [...REMINDER_DAYS.map(reminder), missed(TODAY), ...SUMMARIES].sort());

    env.ctx.onboarded = false;
    await env.sync();
    assert.deepEqual(env.ios.ours(), []);
    env.db.close();
  });

  test('signed out, a run needs no reads: ours go even when the database cannot be read', async () => {
    const env = await setup();
    await env.sync();
    env.ctx.signedIn = false;
    devFaults.set({ failReads: true });
    try {
      const result = await runNotificationSync({ ...env.deps, repo: withDevFaults(env.repo) }, env.ctx);
      assert.equal(result.status, 'applied');
      assert.deepEqual(env.ios.ours(), []);
    } finally {
      devFaults.set({ failReads: false });
    }
    env.db.close();
  });

  test('kept misses: Keep schedule answers the prompt, pending or already delivered', async () => {
    const env = await setup();
    await env.sync();
    env.ctx.keptMissedIds = new Set([YESTERDAY_B]);
    await env.sync();
    assert.ok(!env.ios.ours().includes(missed(YESTERDAY)));
    assert.ok(env.ios.ours().includes(missed(TODAY)));

    // Delivered first, then kept on Today.
    const later = await setup();
    await later.sync();
    later.setClock(TODAY, '09:00', 30);
    await later.sync();
    assert.deepEqual(later.ios.oursDelivered(), [missed(YESTERDAY)]);
    later.ctx.keptMissedIds = new Set([YESTERDAY_B]);
    await later.sync();
    assert.deepEqual(later.ios.oursDelivered(), []);
    env.db.close();
    later.db.close();
  });

  test('a new day: the window moves on, and yesterday’s delivered ones are cleared', async () => {
    const env = await setup();
    await env.sync();
    env.setClock(TODAY, '17:00', 30);
    await env.sync();
    assert.deepEqual(env.ios.oursDelivered(), [missed(YESTERDAY), reminder(TODAY)]);

    env.setToday('2026-11-03');
    env.setClock('2026-11-03', '08:00');
    const result = await env.sync();
    assert.deepEqual(env.ios.oursDelivered(), [], "Monday's reminder and Sunday's prompt are out of date");
    assert.equal(result.dismissed, 2);
    const days = ['2026-11-04', '2026-11-06', '2026-11-08', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-15', '2026-11-16'];
    assert.deepEqual(env.ios.ours(), [...days.map(reminder), missed(TODAY), ...SUMMARIES].sort(), "Monday's unstarted workouts get tomorrow morning's prompt");
    env.db.close();
  });

  test('Settings and iOS: a toggle turned off cancels its kind; iOS saying no cancels all of ours', async () => {
    const env = await setup();
    await env.sync();
    await env.repo.savePreferences({ ...PREFERENCES, notifications: { ...PREFERENCES.notifications, workoutReminders: false } });
    await env.settled();
    assert.deepEqual(env.ios.ours(), [missed(YESTERDAY), ...SUMMARIES].sort());

    await env.repo.savePreferences({ ...PREFERENCES, notifications: { ...PREFERENCES.notifications, reminderTime: '18:30' } });
    await env.settled();
    assert.equal(env.ios.pending.get(reminder(TODAY))?.fireAtMs, at(TODAY, '18:30'));

    env.ctx.permission = 'denied';
    await env.sync();
    assert.deepEqual(env.ios.ours(), []);
    env.ctx.permission = 'unknown';
    await env.sync();
    assert.equal(env.ios.ours().length, INITIAL.length, "'unknown' still plans, as the rest alarm does");
    env.db.close();
  });

  test('a failing read aborts the run with nothing touched', async () => {
    const env = await setup();
    await env.sync();
    const keys = env.ios.keys();
    env.ios.calls.length = 0;
    // Something has changed that would cancel today's reminder…
    Object.assign(env.ctx, { workoutOpen: true, openOccurrenceId: TODAY_A });
    env.ctx.signedIn = true;

    const failing = (name: string) =>
      new Proxy(env.repo, {
        get(target, prop, receiver) {
          if (prop === name) return async () => Promise.reject(new Error(`${name} failed`));
          return Reflect.get(target, prop, receiver);
        },
      });
    // …but a planner read or a summary read fails (a memo is no help: this run has to read the summary).
    env.deps.memo = createSummaryMemo();
    for (const name of ['getPreferences', 'listOccurrences', 'listPlans', 'listPlanVersions', 'getStreak', 'listSessions', 'listFormReports']) {
      const result = await runNotificationSync({ ...env.deps, repo: failing(name) }, env.ctx);
      assert.deepEqual(result, { status: 'aborted', scheduled: 0, cancelled: 0, dismissed: 0 }, name);
    }
    // Developer "failReads".
    devFaults.set({ failReads: true });
    try {
      assert.equal((await runNotificationSync({ ...env.deps, repo: withDevFaults(env.repo) }, env.ctx)).status, 'aborted');
    } finally {
      devFaults.set({ failReads: false });
    }
    assert.deepEqual(env.ios.calls, []);
    assert.deepEqual(env.ios.keys(), keys);
    env.ios.assertUntouched();
    env.db.close();
  });

  test('while a workout is open the summary text is reused, not read again; closing it reads everything', async () => {
    const env = await setup();
    await env.sync(); // a full run fills the memo
    const keys = env.ios.keys();
    const spy = countingRepo(env.repo);
    env.deps.repo = spy.repo;

    Object.assign(env.ctx, { workoutOpen: true, openOccurrenceId: TODAY_A });
    await env.sync();
    const workout = started(TODAY_A, 'Lower A', [workingSet()]);
    await env.repo.saveSession(workout); // autosaves
    await env.settled();
    await env.repo.saveSession({ ...workout, blocks: workout.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: [...e.sets, workingSet()] })) })) });
    await env.settled();
    for (const name of SUMMARY_READS) assert.equal(spy.counts.get(name) ?? 0, 0, name);
    assert.equal(spy.counts.get('listOccurrences'), 3, 'the planner still reads its window every run');
    for (const nid of SUMMARIES) assert.equal(env.ios.keys().get(nid), keys.get(nid), `${nid} unchanged`);
    assert.equal(env.ios.title(reminder(TODAY)), 'Calves & Core today');

    // Finished: the workout closes, and the next run counts it.
    await env.repo.saveSession(finished(workout));
    await env.settled();
    Object.assign(env.ctx, { workoutOpen: false, openOccurrenceId: undefined });
    await env.sync();
    assert.ok((spy.counts.get('getStreak') ?? 0) >= 1);
    assert.match(env.ios.body(summary(TODAY)) ?? '', /^1 of \d+ workouts so far/);
    env.db.close();
  });

  test('a workout open since launch has no full run to reuse: the summary is read once', async () => {
    const env = await setup({ ctx: { workoutOpen: true, openOccurrenceId: TODAY_A } });
    const spy = countingRepo(env.repo);
    env.deps.repo = spy.repo;
    await env.sync();
    assert.equal(spy.counts.get('getStreak'), 1);
    assert.ok(SUMMARIES.every((nid) => env.ios.ours().includes(nid)), 'the summaries stay pending');
    await env.sync();
    assert.equal(spy.counts.get('getStreak'), 1, 'from then on, the memo');
    env.db.close();
  });

  test('during a workout only texts from since the last run without one are reused: the summary turned back on', async () => {
    const env = await setup();
    await env.sync(); // a full run: "No workouts logged so far."
    await env.repo.savePreferences({ ...PREFERENCES, notifications: { ...PREFERENCES.notifications, weeklySummary: false } });
    await env.settled();
    await env.repo.saveSession(finished(started(TODAY_A, 'Lower A')));
    await env.settled(); // a full run with the summary off: nothing read, nothing written
    Object.assign(env.ctx, { workoutOpen: true, openOccurrenceId: TODAY_C });
    await env.sync();
    await env.repo.savePreferences(PREFERENCES); // Profile → Notifications, the workout minimized
    await env.settled();
    assert.match(env.ios.body(summary(TODAY)) ?? '', /^1 of \d+ workouts so far · [\d,]+ lb/, 'read once, not the text from before Lower A');
    env.db.close();
  });

  test('during a workout only texts from since the last run without one are reused: units switched back', async () => {
    const env = await setup();
    await env.sync(); // a full run, imperial: "No workouts logged so far."
    await env.repo.savePreferences({ ...PREFERENCES, units: 'metric' });
    await env.settled();
    await env.repo.saveSession(finished(started(TODAY_A, 'Lower A')));
    await env.settled(); // a full run, metric: "1 of 5 workouts so far · … kg"
    assert.match(env.ios.body(summary(TODAY)) ?? '', /^1 of \d+ workouts so far · [\d,.]+ kg/);
    Object.assign(env.ctx, { workoutOpen: true, openOccurrenceId: TODAY_C });
    await env.sync();
    await env.repo.savePreferences(PREFERENCES); // back to imperial during the workout
    await env.settled();
    assert.match(env.ios.body(summary(TODAY)) ?? '', /^1 of \d+ workouts so far · [\d,]+ lb/, 'read once, not the imperial text from before Lower A');
    env.db.close();
  });

  test('the weekly summary turned off skips its reads', async () => {
    const env = await setup();
    await env.repo.savePreferences({ ...PREFERENCES, notifications: { ...PREFERENCES.notifications, weeklySummary: false } });
    await env.settled();
    const spy = countingRepo(env.repo);
    env.deps.repo = spy.repo;
    await env.sync();
    for (const name of SUMMARY_READS) assert.equal(spy.counts.get(name) ?? 0, 0, name);
    assert.ok(!env.ios.ours().some((n) => n.startsWith('et.summary.')));
    env.db.close();
  });

  test('previews carry real content, and never hide or replace the real ones', async () => {
    const env = await setup();
    await sendPreviews(env.deps, OWNER);
    const previews = [...env.ios.pending.values()].filter((r) => String(r.data?.nid).startsWith('preview.'));
    assert.deepEqual(previews.map((r) => r.identifier).sort(), ['preview.missedWorkout', 'preview.weeklySummary', 'preview.workoutReminder']);
    assert.ok(previews.every((r) => r.inSeconds === 5), 'about 5 s later');
    assert.equal(env.ios.title('preview.workoutReminder'), 'Lower A and Calves & Core today');
    assert.equal(env.ios.title('preview.missedWorkout'), 'You missed Upper A yesterday');
    assert.ok(env.ios.title('preview.weeklySummary'));
    assert.deepEqual(env.ios.ours(), [], 'a preview is not one of the real ones');

    // The real run schedules today's reminder although a preview says the same, and leaves the previews be.
    const result = await runNotificationSync(env.deps, env.ctx);
    assert.equal(result.scheduled, INITIAL.length);
    assert.deepEqual(env.ios.ours(), INITIAL);
    assert.ok(!env.ios.calls.some((c) => c.startsWith('cancel preview.') || c.startsWith('dismiss preview.')));
    assert.equal(env.ios.title('preview.workoutReminder'), 'Lower A and Calves & Core today');

    // Previews ignore the toggles and send sample names when nothing is planned.
    // (Written past the feed: the runs it would queue check the seeded previews, which these replaced.)
    await env.store.savePreferences(defaultPreferences);
    await env.store.deletePlan('p1');
    await env.store.deletePlan('p2');
    await sendPreviews(env.deps, OWNER);
    assert.equal(env.ios.title('preview.workoutReminder'), 'Lower A today');
    env.db.close();
  });

  test('the summary preview covers the latest summary week, worded for when the preview arrives', async () => {
    const env = await setup();
    // Monday morning: the latest send (Sunday 19:00) covered last week, which has ended by now.
    await sendPreviews(env.deps, OWNER);
    assert.equal(env.ios.pending.get('preview.weeklySummary')?.data?.date, '2026-10-26');
    assert.equal(env.ios.title('preview.weeklySummary'), 'Your week · Oct 26 – Nov 1');
    assert.doesNotMatch(env.ios.body('preview.weeklySummary') ?? '', /so far|this week/);

    // Sunday evening, after this week's send: this week, still on.
    env.setToday('2026-11-08');
    env.setClock('2026-11-08', '20:00');
    await sendPreviews(env.deps, OWNER);
    assert.equal(env.ios.pending.get('preview.weeklySummary')?.data?.date, TODAY);
    assert.equal(env.ios.title('preview.weeklySummary'), 'This week so far');
    env.db.close();
  });

  test('two runs asked for at once apply once more after the first, from the newest data', async () => {
    const env = await setup();
    await env.sync();
    // Two writes back to back: the second lands while the first's run is reading.
    const first = env.repo.saveSession(skipped(TODAY_A, 'Lower A'));
    const second = env.repo.saveSession(skipped(TODAY_C, 'Calves & Core'));
    await Promise.all([first, second]);
    await env.settled();
    assert.ok(!env.ios.ours().includes(reminder(TODAY)), 'the last run saw both skips');
    env.db.close();
  });
});

// Keep the shared timestamps honest: the fixture's "yesterday" is the day before today.
assert.equal(addDays(TODAY, -1), YESTERDAY);
