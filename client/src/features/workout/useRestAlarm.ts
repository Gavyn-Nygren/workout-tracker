import * as Notifications from 'expo-notifications';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { Preferences } from '@/data/types';
import { getForegroundContext } from '@/features/notifications/notificationsApi';
import { presentationForAny } from '@/features/notifications/presentation';
import { createLocalStore } from '@/lib/localStore';
import type { RestTimer } from './rest';
import { createRestAlarmSync, permissionFrom, REST_ALARM_ID, REST_ALARM_KIND, restAlarmPlan, type AlarmPermission } from './restAlarm';

// The expo-notifications side of the rest alarm. The decisions are in restAlarm.ts.

/**
 * Decides how a notification that arrives with the app open is shown. Set once, at the root
 * layout's load: the rest alarm stays quiet there (the app's own haptic covers it); the others
 * by kind and where the app is (presentationForAny, G3.12).
 */
export function setUpNotificationHandler() {
  Notifications.setNotificationHandler({ handleNotification: async (notification) => presentationForAny(notification, getForegroundContext()) });
}

// ---------------------------------------------------------------------------
// iOS permission, shared by the alarm, the first-rest offer, and the permission sheet

let permission: AlarmPermission | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Records a permission answer (from a check or a request). */
export function setNotificationPermission(next: AlarmPermission) {
  if (next === permission) return;
  permission = next;
  listeners.forEach((l) => l());
}

/** Checks iOS again. It can change in iOS Settings while the app is away. */
export async function refreshNotificationPermission(): Promise<AlarmPermission> {
  const next = permissionFrom(await Notifications.getPermissionsAsync().catch(() => undefined));
  setNotificationPermission(next);
  return next;
}

/** The last known permission, or null before the first check. */
export const notificationPermission = () => permission;

export function useNotificationPermission(): AlarmPermission | null {
  return useSyncExternalStore(subscribe, notificationPermission);
}

/** Asks iOS (the system prompt shows only if it hasn't been answered). Throws if the request fails. */
export async function requestNotificationPermission(): Promise<AlarmPermission> {
  const result = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  const next = permissionFrom(result);
  setNotificationPermission(next);
  return next;
}

// ---------------------------------------------------------------------------
// Asked once (decision A)

/** Whether this phone has offered the rest alarm, or the user has set it themselves. Never reset. */
const askedStore = createLocalStore<boolean>('restAlarmAsked', false);
export const restAlarmAsked = () => askedStore.get();
export function markRestAlarmAsked() {
  if (!askedStore.get()) askedStore.set(true);
}

// ---------------------------------------------------------------------------
// Keeping the pending alarm in step with the rest

const sync = createRestAlarmSync({
  schedule: (alarm) =>
    Notifications.scheduleNotificationAsync({
      identifier: alarm.identifier,
      content: { title: alarm.title, body: alarm.body, sound: 'default', data: { kind: REST_ALARM_KIND } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alarm.fireAtMs },
    }),
  cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
});

/** Clears a rest alarm that rang while the app was away, once the app is open again. */
const dismissDelivered = () => {
  Notifications.dismissNotificationAsync(REST_ALARM_ID).catch(() => {});
};

/**
 * Keeps the one pending rest alarm matching the running rest: scheduled for its end while it runs,
 * moved when it's adjusted, cancelled when it's paused, skipped, over, or the workout closes, and
 * when the alarm is turned off or iOS stops allowing it. `notifications` is undefined until the
 * saved settings load; nothing changes before then or before `ready` (the resume check), so an
 * alarm pending from before a restart isn't cancelled only to be scheduled again.
 */
export function useRestAlarm(rest: RestTimer | null, notifications: Preferences['notifications'] | undefined, ready: boolean) {
  const known = useNotificationPermission();

  // Checked at launch and on every return to the app.
  useEffect(() => {
    void refreshNotificationPermission();
    dismissDelivered();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshNotificationPermission();
      dismissDelivered();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready || !notifications || known === null) return;
    void sync.apply(restAlarmPlan({ rest, notifications, permission: known, nowMs: Date.now() }));
  }, [rest, notifications, known, ready]);
}
