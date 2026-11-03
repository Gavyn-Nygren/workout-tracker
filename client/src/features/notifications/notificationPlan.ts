// What should be scheduled (spec 2.11, G3.12): workout reminders, the missed-workout prompt and
// the weekly summary, worked out from saved data and the settings. Pure, so the rules run in
// Node (tests/notificationPlan.test.ts); runSync.ts reads the data and applies the result.
//
// - Everything is planned in local wall-clock time ({ date, 'HH:MM' }) and turned into an instant
//   last, through toInstant (localInstantMs): one-off DATE triggers, planned again on every run.
// - A workout is settled once its occurrence has a session (started, done, partial or skipped)
//   or it's the workout open right now. Only unsettled workouts of active plans are reminded of.
// - Quiet hours are applied first, then anything whose time has passed is dropped. The 5 s
//   minimum lead is the diff's job (reconcile.ts), so a pending item that's about to fire is
//   never cancelled for being close.
import { addDays, toISODate } from '@/data/dates';
import type { ID, ISODate, Plan, ScheduledOccurrence } from '@/data/types';
import { buildAgenda } from '@/features/today/agenda';
import { formatMonthDay } from '@/lib/format';
import { holdForQuietHours, localInstantMs, parseTime } from './localTime';
import { missedCopy, reminderCopy } from './notificationCopy';
import { latestSummaryFire, latestSummaryWeek, summaryFires } from './summaryTiming';
import {
  NOTIFICATION_APP,
  PREVIEW_PREFIX,
  type LocalTime,
  type NotificationKind,
  type PendingRequest,
  type PlanInput,
  type PlannedNotification,
  type SummaryFire,
  type SummaryText,
} from './types';

/** Days of reminders and prompts planned ahead, from today. */
export const HORIZON_DAYS = 14;
/** The most of ours pending at once. iOS keeps only the soonest 64 per app, shared with the rest alarm (and in Expo Go, with every other project). */
export const MAX_PENDING = 40;
/** The least lead the diff schedules a new or changed notification with. */
export const MIN_LEAD_MS = 5000;
/** The missed-workout prompt goes out the morning after, at this time (held by quiet hours). */
export const MISSED_PROMPT_TIME = '09:00';

/** How many weekly summaries are scheduled ahead. runSync reads the data for these weeks. */
export const SUMMARIES_AHEAD = 2;

const NID_PREFIX: Record<NotificationKind, string> = { workoutReminder: 'et.reminder.', missedWorkout: 'et.missed.', weeklySummary: 'et.summary.' };
/** Notification Center groups each kind on its own. */
const THREAD: Record<NotificationKind, string> = { workoutReminder: 'et.reminder', missedWorkout: 'et.missed', weeklySummary: 'et.summary' };
/** Reminders and prompts play the default sound; the summary arrives silently. */
const SOUND: Record<NotificationKind, boolean> = { workoutReminder: true, missedWorkout: true, weeklySummary: false };

/** What a pending request must match to be left in place: when, what it says, and how it sounds. */
export function notificationKey(n: Pick<PlannedNotification, 'fireAtMs' | 'title' | 'body' | 'sound' | 'threadId'>): string {
  return [n.fireAtMs, n.title, n.body, n.sound ? 'sound' : 'silent', n.threadId].join('|');
}

function planned(kind: NotificationKind, nid: string, date: ISODate, at: LocalTime, fireAtMs: number, text: SummaryText, owner: string): PlannedNotification {
  const sound = SOUND[kind];
  const threadId = THREAD[kind];
  const key = notificationKey({ fireAtMs, title: text.title, body: text.body, sound, threadId });
  return {
    nid,
    kind,
    at,
    fireAtMs,
    title: text.title,
    body: text.body,
    sound,
    threadId,
    data: { app: NOTIFICATION_APP, v: 1, owner, kind, nid, date, fireAt: fireAtMs, key },
  };
}

// ---------------------------------------------------------------------------
// Settled and unsettled workouts

type SettleInput = Pick<PlanInput, 'plans' | 'openOccurrenceId'>;

/** Still to do: no session (started, done, partial and skipped all have one), not open right now, and its plan is active. */
function isUnsettled(o: ScheduledOccurrence, plansById: Map<ID, Plan>, openOccurrenceId: ID | undefined): boolean {
  return !o.sessionId && o.id !== openOccurrenceId && plansById.get(o.planId)?.status === 'active';
}

type DayWorkout = { occurrenceId: ID; name: string; planName: string; minutes?: number };

/**
 * Each day's unsettled workouts, sorted by occurrence id so the wording (and the key) is stable.
 * Names and estimates come from the plan version the workout was scheduled with, as on Today; the
 * plan name is the plan's current one.
 */
function unsettledByDay(input: SettleInput & Pick<PlanInput, 'occurrences' | 'planVersions' | 'today'>): Map<ISODate, DayWorkout[]> {
  const plansById = new Map(input.plans.map((p) => [p.id, p]));
  const open = input.occurrences.filter((o) => isUnsettled(o, plansById, input.openOccurrenceId));
  const agenda = buildAgenda({ occurrences: open, sessions: [], plans: input.plans, planVersions: input.planVersions, today: input.today });
  const byDay = new Map<ISODate, DayWorkout[]>();
  for (const [date, items] of agenda) {
    const list = items
      .flatMap((item): DayWorkout[] =>
        item.occurrence
          ? [{ occurrenceId: item.occurrence.id, name: item.name, planName: plansById.get(item.occurrence.planId)?.name ?? item.plan?.name ?? '', minutes: item.workout?.estimatedMinutes }]
          : [],
      )
      .sort((a, b) => (a.occurrenceId < b.occurrenceId ? -1 : a.occurrenceId > b.occurrenceId ? 1 : 0));
    if (list.length) byDay.set(date, list);
  }
  return byDay;
}

// ---------------------------------------------------------------------------
// The plan

/**
 * Everything that should be pending now, soonest first, at most MAX_PENDING. Nothing at all when
 * signed out, not onboarded, or iOS has said no (or hasn't been asked); 'unknown' still plans.
 */
export function notificationPlan(input: PlanInput): PlannedNotification[] {
  if (!input.signedIn || !input.onboarded) return [];
  if (input.permission === 'denied' || input.permission === 'undetermined') return [];
  const { nowMs, today, owner, notifications: n } = input;
  const toInstant = input.toInstant ?? localInstantMs;
  const quiet = n.quietHours;
  const byDay = unsettledByDay(input);
  const items: PlannedNotification[] = [];

  // Workout reminders: one per training day, at the reminder time. One that quiet hours would
  // hold into the next day is dropped, since "Lower A today" would be wrong there.
  if (n.workoutReminders && parseTime(n.reminderTime)) {
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const date = addDays(today, i);
      const workouts = byDay.get(date);
      if (!workouts) continue;
      const at = holdForQuietHours({ date, time: n.reminderTime }, quiet);
      if (at.date !== date) continue;
      items.push(planned('workoutReminder', `${NID_PREFIX.workoutReminder}${date}`, date, at, toInstant(at), reminderCopy(workouts), owner));
    }
  }

  // The missed-workout prompt: the morning after a training day whose workouts are still
  // unstarted. Only the earliest one still ahead is pending, yesterday's included, so someone
  // who stops training gets one prompt, not a stack of them.
  if (n.missedWorkout) {
    for (let i = -1; i < HORIZON_DAYS; i++) {
      const date = addDays(today, i);
      const workouts = (byDay.get(date) ?? []).filter((w) => !input.keptMissedIds.has(w.occurrenceId));
      if (!workouts.length) continue;
      const after = addDays(date, 1);
      const at = holdForQuietHours({ date: after, time: MISSED_PROMPT_TIME }, quiet);
      // "Yesterday" would be wrong if quiet hours held it another day (they'd have to start before 09:00 and run overnight).
      if (at.date !== after) continue;
      const fireAtMs = toInstant(at);
      if (!(fireAtMs > nowMs)) continue;
      items.push(planned('missedWorkout', `${NID_PREFIX.missedWorkout}${date}`, date, at, fireAtMs, missedCopy(workouts.map((w) => w.name)), owner));
      break;
    }
  }

  // The weekly summary: the next two, held by quiet hours before the "still ahead" check. A null
  // text means there's nothing worth sending for that week.
  if (n.weeklySummary) {
    const fires = summaryFires({ nowMs, at: n.weeklySummaryAt, quietHours: quiet, weekStartsOn: input.weekStartsOn, count: SUMMARIES_AHEAD, toInstant });
    for (const fire of fires) {
      const text = summaryTextFor(input, fire);
      if (text) items.push(planned('weeklySummary', `${NID_PREFIX.weeklySummary}${fire.weekStart}`, fire.weekStart, fire.held, fire.fireAtMs, text, owner));
    }
  }

  return items
    .filter((item) => Number.isFinite(item.fireAtMs) && item.fireAtMs > nowMs)
    .sort((a, b) => a.fireAtMs - b.fireAtMs || (a.nid < b.nid ? -1 : a.nid > b.nid ? 1 : 0))
    .slice(0, MAX_PENDING);
}

/** A summary text that fails to build drops that summary only, never the reminders. */
function summaryTextFor(input: Pick<PlanInput, 'summaryText'>, fire: SummaryFire): SummaryText | null {
  try {
    return input.summaryText(fire);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Developer previews

const SAMPLE_REMINDER = { name: 'Lower A', planName: 'Upper / Lower Strength', minutes: 60 };

/** 'HH:MM' of an instant on this phone. */
function localTimeAt(ms: number): LocalTime {
  const d = new Date(ms);
  return { date: toISODate(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

/** The most recent summary send, for the preview's week; "now" when the setting can't be read. */
function latestFire(input: Omit<PlanInput, 'permission' | 'signedIn' | 'onboarded'>): SummaryFire {
  const at = input.notifications.weeklySummaryAt;
  const fire = latestSummaryFire({ nowMs: input.nowMs, at, quietHours: input.notifications.quietHours, weekStartsOn: input.weekStartsOn });
  if (fire) return fire;
  const now = localTimeAt(input.nowMs);
  return { configured: now, held: now, fireAtMs: input.nowMs, weekStart: latestSummaryWeek({ nowMs: input.nowMs, at, weekStartsOn: input.weekStartsOn }) };
}

/**
 * One of each kind for Profile → Developer → Preview notifications, with real names and numbers:
 * sample names when nothing is planned, a fallback summary when there's nothing to report. They
 * skip the toggles and quiet hours, and their nids ('preview.<kind>') keep them out of the diff,
 * so they never hide or replace a real reminder. Scheduled about MIN_LEAD_MS ahead.
 */
export function previewPlan(input: Omit<PlanInput, 'permission' | 'signedIn' | 'onboarded'>): PlannedNotification[] {
  const { nowMs, today, owner } = input;
  const fireAtMs = nowMs + MIN_LEAD_MS;
  const at = localTimeAt(fireAtMs);
  const byDay = unsettledByDay(input);

  const nextDay = (from: number, keep: (w: DayWorkout) => boolean = () => true): { date: ISODate; workouts: DayWorkout[] } | undefined => {
    for (let i = from; i < HORIZON_DAYS; i++) {
      const date = addDays(today, i);
      const workouts = (byDay.get(date) ?? []).filter(keep);
      if (workouts.length) return { date, workouts };
    }
    return undefined;
  };

  const reminderDay = nextDay(0);
  const reminder = reminderCopy(reminderDay?.workouts ?? [SAMPLE_REMINDER]);
  const missedDay = nextDay(-1, (w) => !input.keptMissedIds.has(w.occurrenceId));
  const missed = missedCopy(missedDay?.workouts.map((w) => w.name) ?? [SAMPLE_REMINDER.name]);

  // The week the latest send covered (the one "See latest summary" opens), worded for when the
  // preview arrives: on a Monday that week has ended, so it isn't "so far" any more.
  const fire = latestFire(input);
  const summary = summaryTextFor(input, { ...fire, held: at, fireAtMs }) ?? {
    title: `Your week · ${formatMonthDay(fire.weekStart)} – ${formatMonthDay(addDays(fire.weekStart, 6))}`,
    body: 'No workouts logged that week.',
  };

  return [
    planned('workoutReminder', `${PREVIEW_PREFIX}workoutReminder`, reminderDay?.date ?? today, at, fireAtMs, reminder, owner),
    planned('missedWorkout', `${PREVIEW_PREFIX}missedWorkout`, missedDay?.date ?? addDays(today, -1), at, fireAtMs, missed, owner),
    planned('weeklySummary', `${PREVIEW_PREFIX}weeklySummary`, fire.weekStart, at, fireAtMs, summary, owner),
  ];
}

// ---------------------------------------------------------------------------
// Delivered notifications to clear from Notification Center

/**
 * The nids of our delivered notifications that are no longer true:
 * - every one of ours when signed out or not onboarded (so a tap can't navigate after sign-in);
 * - reminders whose day has passed or whose workouts are all settled;
 * - missed prompts whose day is before yesterday, or whose workouts are all settled or kept.
 * Other projects' and other owners' notifications, and the rest alarm, are never included.
 */
export function deliveredToDismiss(
  delivered: PendingRequest[],
  input: Pick<PlanInput, 'today' | 'owner' | 'signedIn' | 'onboarded' | 'occurrences' | 'plans' | 'openOccurrenceId' | 'keptMissedIds'>,
): string[] {
  const ours = delivered.flatMap((r) => {
    const data = r.data;
    if (!data || data.app !== NOTIFICATION_APP || data.owner !== input.owner || typeof data.nid !== 'string') return [];
    return [{ nid: data.nid, kind: data.kind, date: typeof data.date === 'string' ? data.date : undefined }];
  });
  const unique = (nids: string[]) => [...new Set(nids)];
  if (!input.signedIn || !input.onboarded) return unique(ours.map((o) => o.nid));

  const plansById = new Map(input.plans.map((p) => [p.id, p]));
  const unsettledOn = (date: ISODate, keep: (o: ScheduledOccurrence) => boolean = () => true) =>
    input.occurrences.some((o) => o.scheduledDate === date && isUnsettled(o, plansById, input.openOccurrenceId) && keep(o));
  const yesterday = addDays(input.today, -1);

  return unique(
    ours.flatMap(({ nid, kind, date }) => {
      if (nid.startsWith(PREVIEW_PREFIX) || !date) return [];
      if (kind === 'workoutReminder' && nid.startsWith(NID_PREFIX.workoutReminder)) {
        return date < input.today || !unsettledOn(date) ? [nid] : [];
      }
      if (kind === 'missedWorkout' && nid.startsWith(NID_PREFIX.missedWorkout)) {
        return date < yesterday || !unsettledOn(date, (o) => !input.keptMissedIds.has(o.id)) ? [nid] : [];
      }
      return [];
    }),
  );
}
