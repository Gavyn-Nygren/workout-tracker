// One notification sync run (G3.12): read everything, plan, then bring iOS in line. Pure apart
// from the repository and the scheduler it's handed (no React Native or Expo imports), so the
// whole chain (write → read → plan → reconcile) is tested end to end with Node's SQLite and a
// fake iOS (tests/notificationSyncDb.test.ts). NotificationSync.tsx only wires the triggers and
// runs this through createSyncQueue; notificationsApi.ts is the Expo side of the scheduler.
//
// The rules that keep a run from doing harm:
// - No complete input, no run: readyToSync waits for the iOS permission and the active
//   workout's resume check.
// - Every repository read happens before anything is cancelled. If any read throws (summary
//   reads included, or Developer "failReads"), the run stops and touches nothing.
// - Signed out or not onboarded means nothing is wanted: ours are cancelled and cleared.
// - Only our own requests are ever cancelled or dismissed, one by one: never cancel-all or
//   dismiss-all, never the rest alarm, never a preview, another project's or another install's.
import type { DataRepository } from '@/data/repository';
import { addDays, toISODate } from '@/data/dates';
import type { ID, ISODate, Plan, Preferences, ScheduledOccurrence, UnitSystem } from '@/data/types';
import { buildWeeklySummary, weeklySummaryText, type WeeklySummaryInput } from '@/features/weekly/weeklySummary';
import { REST_ALARM_ID, REST_ALARM_KIND, type AlarmPermission } from '@/features/workout/restAlarm';
import { formatShortDate } from '@/lib/format';
import { deliveredToDismiss, HORIZON_DAYS, MIN_LEAD_MS, notificationPlan, previewPlan, SUMMARIES_AHEAD } from './notificationPlan';
import { diffPending, ownRequests } from './reconcile';
import { latestSummaryWeek, summaryFires } from './summaryTiming';
import { NOTIFICATION_APP, PREVIEW_PREFIX, type NotificationKind, type PendingRequest, type PlannedNotification, type SummaryFire, type SummaryText } from './types';

/** The expo-notifications calls a run needs, so it runs against a fake iOS in tests. */
export type NotificationScheduler = {
  getPending(): Promise<PendingRequest[]>;
  getDelivered(): Promise<PendingRequest[]>;
  /** Identifier = n.nid. A DATE trigger at n.fireAtMs, or an interval of `inSeconds` (previews). */
  schedule(n: PlannedNotification, opts?: { inSeconds?: number }): Promise<void>;
  cancel(nid: string): Promise<void>;
  dismiss(nid: string): Promise<void>;
};

/** What a run needs from outside the repository. */
export type SyncContext = {
  permission: AlarmPermission;
  signedIn: boolean;
  onboarded: boolean;
  workoutOpen: boolean;
  openOccurrenceId?: ID;
  keptMissedIds: ReadonlySet<ID>;
  owner: string;
};

/**
 * The weekly-summary texts written since the last run with no workout open, reused while one is.
 * Every run without a workout clears it first, so a text never outlives the data it came from.
 */
export type SummaryMemo = { get(key: string): SummaryText | null | undefined; set(key: string, v: SummaryText | null): void; clear(): void };
export type SyncDeps = { repo: DataRepository; scheduler: NotificationScheduler; now: () => number; memo: SummaryMemo };
export type SyncResult = { status: 'applied' | 'aborted'; scheduled: number; cancelled: number; dismissed: number };

const ABORTED: SyncResult = { status: 'aborted', scheduled: 0, cancelled: 0, dismissed: 0 };

/** A run only makes sense once the iOS permission is known and the open workout has been restored. */
export function readyToSync(x: { permission: AlarmPermission | null; workoutReady: boolean }): boolean {
  return x.permission !== null && x.workoutReady;
}

/** A small memo for runSync's summary texts (the newest few weeks are plenty). */
export function createSummaryMemo(maxEntries = 8): SummaryMemo {
  const entries = new Map<string, SummaryText | null>();
  return {
    get: (key) => entries.get(key),
    set: (key, value) => {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
    clear: () => entries.clear(),
  };
}

/** The same summary text for the same week, send time, units and "still ahead" answer. */
function summaryMemoKey(fire: SummaryFire, units: UnitSystem, today: ISODate): string {
  return [fire.weekStart, `${fire.held.date} ${fire.held.time}`, units, fire.weekStart > today ? 'ahead' : 'on'].join('|');
}

// ---------------------------------------------------------------------------
// Reads

type BaseReads = { preferences: Preferences; occurrences: ScheduledOccurrence[]; plans: Plan[]; planVersions: Plan[] };
type SummaryReads = Omit<WeeklySummaryInput, 'weekStart' | 'weekStartsOn' | 'asOf' | 'plans' | 'planVersions'>;

/** The planner's reads: settings, yesterday through the horizon, and the plans with every version. */
async function readBase(repo: DataRepository, today: ISODate): Promise<BaseReads> {
  const [preferences, occurrences, plans, planVersions] = await Promise.all([
    repo.getPreferences(),
    repo.listOccurrences({ from: addDays(today, -1), to: addDays(today, HORIZON_DAYS) }),
    repo.listPlans(),
    repo.listPlanVersions(),
  ]);
  return { preferences, occurrences, plans, planVersions };
}

/** What buildWeeklySummary needs for the weeks starting on `weeks` (at least one). */
async function readSummary(repo: DataRepository, weeks: ISODate[]): Promise<SummaryReads> {
  const sorted = [...weeks].sort();
  const from = sorted[0];
  const to = addDays(sorted[sorted.length - 1], 6);
  const [sessions, exercises, records, streak, formReports, goals, occurrences] = await Promise.all([
    repo.listSessions(),
    repo.listExercises(),
    repo.listPersonalRecords({ since: from }),
    repo.getStreak(),
    repo.listFormReports(),
    repo.listGoals(),
    repo.listOccurrences({ from, to }),
  ]);
  return { sessions, exercisesById: new Map(exercises.map((e) => [e.id, e])), records, streak, formReports, goals, occurrences };
}

/** The notification text for one summary send, from the reads. Worded for when it fires (B3: asOf = the held time). */
function summaryTextFrom(reads: SummaryReads, base: BaseReads, fire: SummaryFire, today: ISODate): SummaryText | null {
  const { weekStartsOn, units } = base.preferences;
  const summary = buildWeeklySummary({ ...reads, weekStart: fire.weekStart, weekStartsOn, asOf: fire.held, plans: base.plans, planVersions: base.planVersions });
  return weeklySummaryText(summary, { units, fire, weekFullyAhead: fire.weekStart > today });
}

const summaryAllowed = (permission: AlarmPermission) => permission === 'granted' || permission === 'unknown';

// ---------------------------------------------------------------------------
// The run

/**
 * One sync run:
 * 1. Today and now, read together.
 * 2. Every read: settings, occurrences from yesterday through the horizon, plans and their
 *    versions; the summary data only when the weekly summary is on, iOS allows it, and no
 *    workout is open (while one is, the texts written since the last run without one are reused;
 *    in-progress workouts don't count toward the summary). Any read that throws → 'aborted',
 *    nothing touched.
 * 3. The plan (notificationPlan).
 * 4. What iOS has pending → ours → the diff → cancel, then schedule, each call on its own.
 * 5. What's delivered → the ones no longer true → dismissed.
 */
export async function runNotificationSync(deps: SyncDeps, ctx: SyncContext): Promise<SyncResult> {
  const { repo, scheduler, now, memo } = deps;
  const today = repo.today();
  const nowMs = now();
  const active = ctx.signedIn && ctx.onboarded;
  // With no workout open, nothing earlier may be reused: not a text from before the summary was
  // turned off or iOS said no, nor one under a time or units the settings have left and come back
  // to. Cleared first, so a run that aborts or skips the summary leaves nothing behind either.
  if (!ctx.workoutOpen) memo.clear();

  // 2. Reads. Signed out or not onboarded wants nothing, whatever the data says.
  let base: BaseReads | null = null;
  let summaryText: (fire: SummaryFire) => SummaryText | null = () => null;
  if (active) {
    try {
      const b = await readBase(repo, today);
      base = b;
      const n = b.preferences.notifications;
      const fires =
        n.weeklySummary && summaryAllowed(ctx.permission)
          ? summaryFires({ nowMs, at: n.weeklySummaryAt, quietHours: n.quietHours, weekStartsOn: b.preferences.weekStartsOn, count: SUMMARIES_AHEAD })
          : [];
      const keyOf = (fire: SummaryFire) => summaryMemoKey(fire, b.preferences.units, today);
      // Missing (a workout open since launch, or a setting changed during it): read once.
      const reuse = ctx.workoutOpen && fires.every((fire) => memo.get(keyOf(fire)) !== undefined);
      if (fires.length && !reuse) {
        const reads = await readSummary(repo, fires.map((f) => f.weekStart));
        summaryText = (fire) => {
          const text = summaryTextFrom(reads, b, fire, today);
          memo.set(keyOf(fire), text);
          return text;
        };
      } else {
        summaryText = (fire) => memo.get(keyOf(fire)) ?? null;
      }
    } catch {
      return { ...ABORTED };
    }
  }

  // 3. The plan.
  let planned: PlannedNotification[] = [];
  if (base) {
    try {
      planned = notificationPlan({
        nowMs,
        today,
        owner: ctx.owner,
        permission: ctx.permission,
        signedIn: ctx.signedIn,
        onboarded: ctx.onboarded,
        notifications: base.preferences.notifications,
        weekStartsOn: base.preferences.weekStartsOn,
        occurrences: base.occurrences,
        plans: base.plans,
        planVersions: base.planVersions,
        openOccurrenceId: ctx.openOccurrenceId,
        keptMissedIds: ctx.keptMissedIds,
        summaryText,
      });
    } catch {
      return { ...ABORTED };
    }
  }

  // 4. Pending → diff → cancel, then schedule. Without the pending list nothing can be diffed.
  let pending: PendingRequest[];
  try {
    pending = await scheduler.getPending();
  } catch {
    return { ...ABORTED };
  }
  // The lead is checked against the clock now, after the reads, so nothing is sent too late.
  const { cancel, schedule } = diffPending(ownRequests(pending, ctx.owner), planned, now());
  let cancelled = 0;
  let scheduled = 0;
  let dismissed = 0;
  for (const nid of cancel) {
    try {
      await scheduler.cancel(nid);
      cancelled++;
    } catch {
      // One failure never stops the rest; the next run tries again.
    }
  }
  for (const n of schedule) {
    try {
      await scheduler.schedule(n);
      scheduled++;
    } catch {
      // As above (permission revoked, or a time that passed on the way).
    }
  }

  // 5. Delivered notifications that aren't true any more. The Developer previews are left to
  // whoever sent them, delivered or pending: the sync never touches one, signed out included.
  let stale: string[] = [];
  try {
    const delivered = await scheduler.getDelivered();
    stale = deliveredToDismiss(delivered, {
      today,
      owner: ctx.owner,
      signedIn: ctx.signedIn,
      onboarded: ctx.onboarded,
      occurrences: base?.occurrences ?? [],
      plans: base?.plans ?? [],
      openOccurrenceId: ctx.openOccurrenceId,
      keptMissedIds: ctx.keptMissedIds,
    }).filter((nid) => !nid.startsWith(PREVIEW_PREFIX));
  } catch {
    // Clearing is a courtesy; the next run tries again.
  }
  for (const nid of stale) {
    try {
      await scheduler.dismiss(nid);
      dismissed++;
    } catch {
      // As above.
    }
  }

  return { status: 'applied', scheduled, cancelled, dismissed };
}

// ---------------------------------------------------------------------------
// Developer tools

/**
 * Profile → Developer → Preview notifications: one of each kind about MIN_LEAD_MS from now, with
 * real names and numbers (sample names when nothing is planned). They skip the toggles and quiet
 * hours, and their nids ('preview.<kind>') keep them out of the diff, so the real ones stay as
 * they are. Rejects if a settings read fails or iOS refuses one (after trying all three), so the
 * row can say so. The summary falls back to its plain text if its reads fail.
 */
export async function sendPreviews(deps: SyncDeps, owner: string): Promise<void> {
  const { repo, scheduler, now } = deps;
  const today = repo.today();
  const nowMs = now();
  const base = await readBase(repo, today);
  const { notifications: n, weekStartsOn } = base.preferences;
  let reads: SummaryReads | null = null;
  try {
    reads = await readSummary(repo, [latestSummaryWeek({ nowMs, at: n.weeklySummaryAt, quietHours: n.quietHours, weekStartsOn })]);
  } catch {
    // previewPlan's fallback text stands in.
  }
  const items = previewPlan({
    nowMs,
    today,
    owner,
    notifications: n,
    weekStartsOn,
    occurrences: base.occurrences,
    plans: base.plans,
    planVersions: base.planVersions,
    keptMissedIds: new Set(),
    summaryText: (fire) => (reads ? summaryTextFrom(reads, base, fire, today) : null),
  });
  let failure: unknown;
  for (const item of items) {
    try {
      await scheduler.schedule(item, { inSeconds: Math.round(MIN_LEAD_MS / 1000) });
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) throw failure;
}

const KIND_LABEL: Record<NotificationKind, string> = { workoutReminder: 'Reminder', missedWorkout: 'Missed workout', weeklySummary: 'Weekly summary' };

/** '5:00 PM' for an instant, in the phone's time zone. */
function clockLabel(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The title from a pending request's key (notificationKey: fireAt|title|body|sound|threadId).
 * iOS hands back only the data, and a title with '|' in it reads best effort.
 */
function titleFromKey(key: unknown): string {
  if (typeof key !== 'string') return '';
  const parts = key.split('|');
  return parts.length >= 5 ? parts[1] : '';
}

/**
 * Profile → Developer → Pending notifications: ours that iOS has pending, soonest first, one line
 * each ("Reminder · Mon, Nov 2, 5:00 PM · Lower A today"), then the rest alarm if one is pending, then
 * how many others are (in Expo Go, other projects' requests show up here too), since they all
 * share iOS's 64 slots.
 */
export async function describePending(scheduler: NotificationScheduler, owner: string): Promise<string> {
  const all = await scheduler.getPending();
  const ours = all
    .flatMap((r) => {
      const data = r?.data;
      if (!data || data.app !== NOTIFICATION_APP || data.owner !== owner || typeof data.nid !== 'string') return [];
      const fireAt = typeof data.fireAt === 'number' ? data.fireAt : Number.NaN;
      return [{ nid: data.nid, kind: data.kind, fireAt, title: titleFromKey(data.key) }];
    })
    .sort((a, b) => (Number.isFinite(a.fireAt) ? a.fireAt : Infinity) - (Number.isFinite(b.fireAt) ? b.fireAt : Infinity) || (a.nid < b.nid ? -1 : 1));
  const restAlarms = all.filter((r) => r?.identifier === REST_ALARM_ID || r?.data?.kind === REST_ALARM_KIND).length;
  const restAlarm = restAlarms > 0;
  const others = all.length - ours.length - restAlarms;

  const lines = ours.map(({ nid, kind, fireAt, title }) => {
    const label = (typeof kind === 'string' && KIND_LABEL[kind as NotificationKind]) || 'Notification';
    const when = Number.isFinite(fireAt) ? `${formatShortDate(toISODate(new Date(fireAt)))}, ${clockLabel(fireAt)}` : 'Time unknown';
    return [`${label}${nid.startsWith(PREVIEW_PREFIX) ? ' (preview)' : ''}`, when, title].filter(Boolean).join(' · ');
  });
  const head = ours.length ? `${ours.length} pending` : 'Nothing pending.';
  const tail = [...(restAlarm ? ['Rest alarm pending.'] : []), ...(others > 0 ? [`Also pending: ${others} other.`] : [])];
  return [head, ...lines, ...tail].join('\n');
}

