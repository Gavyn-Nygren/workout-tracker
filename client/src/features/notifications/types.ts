// Shared contract for the local notifications (G3.12). Pure: no React Native,
// Expo or localStore imports, so the planner, the sync run and the tests can
// all use it.
import type { ID, ISODate, Plan, Preferences, ScheduledOccurrence, Weekday } from '@/data/types';
import type { AlarmPermission } from '@/features/workout/restAlarm';

/** data.app on every notification this app schedules. */
export const NOTIFICATION_APP = 'et';
/** nid prefix of the Developer previews; the diff ignores them. */
export const PREVIEW_PREFIX = 'preview.';

export type NotificationKind = 'workoutReminder' | 'missedWorkout' | 'weeklySummary';
/** A floating local date and wall-clock time ('HH:MM'). */
export type LocalTime = { date: ISODate; time: string };
export type QuietHours = NonNullable<Preferences['notifications']['quietHours']>;
export type SummaryText = { title: string; body: string };
export type NotificationData = { app: 'et'; v: 1; owner: string; kind: NotificationKind; nid: string; date: ISODate; fireAt: number; key: string };
export type PlannedNotification = { nid: string; kind: NotificationKind; at: LocalTime; fireAtMs: number; title: string; body: string; sound: boolean; threadId: string; data: NotificationData };
/** A pending or delivered request as iOS reports it. */
export type PendingRequest = { identifier: string; data?: Record<string, unknown> | null };
/** One weekly-summary send: the configured slot, where quiet hours put it, and the week it covers. */
export type SummaryFire = { configured: LocalTime; held: LocalTime; fireAtMs: number; weekStart: ISODate };

export type PlanInput = {
  nowMs: number;
  today: ISODate;
  owner: string;
  permission: AlarmPermission;
  signedIn: boolean;
  onboarded: boolean;
  notifications: Preferences['notifications'];
  weekStartsOn: Weekday;
  /** addDays(today, -1) .. addDays(today, HORIZON_DAYS) */
  occurrences: ScheduledOccurrence[];
  plans: Plan[];
  planVersions: Plan[];
  openOccurrenceId?: ID;
  keptMissedIds: ReadonlySet<ID>;
  summaryText: (fire: SummaryFire) => SummaryText | null;
  /** Defaults to localInstantMs. */
  toInstant?: (at: LocalTime) => number;
};
