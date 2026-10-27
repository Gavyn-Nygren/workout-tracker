import type { Preferences } from '@/data/types';
import { describeNextUp, followsLastSet, restAlarmTimeMs, type RestTimer } from './rest';

// The rest-over alarm (spec 2.11, roadmap G3.8): a local notification that rings when the rest
// ends while the app is in the background or the phone is locked. Pure, so it's unit-tested;
// useRestAlarm.ts makes the expo-notifications calls. Nothing here may import React Native or Expo.

/** The one identifier every rest alarm uses, so there's never more than one pending. */
export const REST_ALARM_ID = 'rest-alarm';
/** Marks the rest alarm in the notification's data, for recognizing it when it arrives. */
export const REST_ALARM_KIND = 'restAlarm';
export const REST_ALARM_TITLE = 'Rest over';
/** For a rest with nothing known to follow it (a manual timer, or a note saved before G3.8). */
export const REST_ALARM_FALLBACK_BODY = 'Time for your next set';
/** For a rest after the workout's last set: there's no next set to name. */
export const REST_ALARM_LAST_SET_BODY = 'That was your last set. Tap Finish when you’re ready.';

/**
 * Notification permission as the alarm needs it. 'unknown' means the check failed: the alarm is
 * still tried, and iOS refuses it quietly if it isn't allowed.
 */
export type AlarmPermission = 'granted' | 'undetermined' | 'denied' | 'unknown';

/** What expo-notifications' getPermissionsAsync / requestPermissionsAsync resolve to, as far as it matters here. */
export type PermissionSnapshot = {
  granted: boolean;
  canAskAgain?: boolean;
  status?: string;
  ios?: { status?: number } | null;
};

/** iOS UNAuthorizationStatus raw values (Notifications.IosAuthorizationStatus). */
const IOS_DENIED = 1;
const IOS_AUTHORIZED = 2;

/**
 * Reads a permission check. Provisional and ephemeral (iOS statuses 3 and 4) count as undetermined,
 * like expo-notifications' `granted`: asking again shows the real prompt.
 */
export function permissionFrom(snapshot: PermissionSnapshot | null | undefined): AlarmPermission {
  if (!snapshot) return 'unknown';
  if (snapshot.granted || snapshot.ios?.status === IOS_AUTHORIZED) return 'granted';
  if (snapshot.ios?.status === IOS_DENIED || snapshot.status === 'denied' || snapshot.canAskAgain === false) return 'denied';
  return 'undetermined';
}

export type ScheduleAlarm = { kind: 'schedule'; identifier: string; fireAtMs: number; title: string; body: string };
export type CancelAlarm = { kind: 'cancel'; identifier: string };
export type RestAlarmPlan = ScheduleAlarm | CancelAlarm;

/**
 * "Rest over" / "Squat, set 3": what's next. Pass the rest with its next set brought up to date
 * (`withCurrentNext`), so edits made during the rest are named right.
 */
export function restAlarmContent(rest: RestTimer): { title: string; body: string } {
  const body = rest.next ? describeNextUp(rest.next) : followsLastSet(rest) ? REST_ALARM_LAST_SET_BODY : REST_ALARM_FALLBACK_BODY;
  return { title: REST_ALARM_TITLE, body };
}

/**
 * The alarm that should be pending for the rest as it is now: one at the rest's end while it's
 * running, the alarm is on in Settings, and iOS allows it; otherwise none. Quiet hours don't apply:
 * a rest timer still alerts during them (spec 2.11).
 *
 * The time is rounded up to the whole second (`restAlarmTimeMs`) because iOS date triggers drop
 * the milliseconds; the alarm then never rings before the countdown reads 0:00. Once that time has
 * passed there's nothing left to ring. An end only moments away still gets its alarm: if it's
 * already pending it isn't sent again (see createRestAlarmSync), so leaving the app in the last
 * second of a rest keeps it. A rest that ends while the app is in the background stays set until
 * the app is back (`restEnd` says 'away'), so its alarm isn't cancelled before it rings.
 */
export function restAlarmPlan(input: {
  rest: RestTimer | null;
  notifications: Pick<Preferences['notifications'], 'restTimer' | 'quietHours'>;
  permission: AlarmPermission;
  nowMs: number;
}): RestAlarmPlan {
  const cancel: CancelAlarm = { kind: 'cancel', identifier: REST_ALARM_ID };
  const { rest } = input;
  if (!rest || rest.pausedRemainingMs !== undefined) return cancel;
  if (!input.notifications.restTimer) return cancel;
  if (input.permission === 'denied' || input.permission === 'undetermined') return cancel;
  const fireAtMs = restAlarmTimeMs(rest.endsAtMs);
  if (!Number.isFinite(fireAtMs) || fireAtMs <= input.nowMs) return cancel;
  return { kind: 'schedule', identifier: REST_ALARM_ID, fireAtMs, ...restAlarmContent(rest) };
}

/** Equal for plans that leave the same alarm pending, so an unchanged plan isn't sent again. */
export function planKey(plan: RestAlarmPlan): string {
  return plan.kind === 'cancel' ? `cancel:${plan.identifier}` : `schedule:${plan.identifier}:${plan.fireAtMs}:${plan.title}:${plan.body}`;
}

/** The two notification calls the alarm needs, so the sync below runs against a fake in tests. */
export type AlarmScheduler = {
  schedule: (alarm: ScheduleAlarm) => Promise<unknown>;
  cancel: (identifier: string) => Promise<unknown>;
};

/**
 * Keeps the pending alarm matching the latest plan. Calls run one at a time, in order, so a
 * cancel can never overtake the schedule before it. A burst of plans (±15 s taps) applies only the
 * newest, a plan already in place isn't sent again, and every failure is silent (permission
 * revoked in iOS Settings, or a time that passed on the way). A failed schedule also cancels, so
 * an alarm for an older end never rings. `apply` resolves once its plan has been dealt with.
 */
export function createRestAlarmSync(scheduler: AlarmScheduler) {
  let queue: Promise<void> = Promise.resolve();
  let latest = 0;
  /** The plan that's in place, or null when that isn't known (at launch, or after a failure). */
  let applied: string | null = null;

  const run = async (plan: RestAlarmPlan) => {
    const key = planKey(plan);
    if (key === applied) return;
    try {
      if (plan.kind === 'schedule') await scheduler.schedule(plan);
      else await scheduler.cancel(plan.identifier);
      applied = key;
    } catch {
      applied = null;
      if (plan.kind !== 'schedule') return;
      try {
        await scheduler.cancel(plan.identifier);
        applied = planKey({ kind: 'cancel', identifier: plan.identifier });
      } catch {
        // Nothing more to do; the next change tries again.
      }
    }
  };

  return {
    apply(plan: RestAlarmPlan): Promise<void> {
      const mine = ++latest;
      queue = queue.then(() => (mine === latest ? run(plan) : undefined));
      return queue;
    },
  };
}

/**
 * Whether a rest that just started should offer the rest alarm (decision A: ask at the first
 * rest). Only a rest that started by itself after a set (not a manual timer, never a superset
 * transition), only while the alarm is off, only if nobody has been asked on this phone before,
 * and only if iOS can still ask or already allows it.
 */
export function shouldOfferRestAlarm(input: { rest: RestTimer | null; enabled: boolean; asked: boolean; permission: AlarmPermission | null }): boolean {
  const { rest } = input;
  if (!rest?.after || rest.source === 'transition') return false;
  if (input.enabled || input.asked) return false;
  return input.permission === 'granted' || input.permission === 'undetermined';
}

/** The parts of an arriving notification the handler reads. */
export type IncomingNotification = { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };

/** What iOS should do with a notification that arrives while the app is open. */
export type Presentation = { shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean };

export function isRestAlarm(notification: IncomingNotification): boolean {
  return notification.request.identifier === REST_ALARM_ID || notification.request.content.data?.kind === REST_ALARM_KIND;
}

/**
 * The notification handler's answer (iOS asks it only while the app is in the foreground). The
 * rest alarm stays silent and out of the list: the app's own haptic and "Rest over" bar mark the
 * end. Anything else shows the way expo-notifications shows it with no handler set: banner, list,
 * sound, and badge.
 */
export function presentationFor(notification: IncomingNotification): Presentation {
  if (isRestAlarm(notification)) return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
  return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
}
