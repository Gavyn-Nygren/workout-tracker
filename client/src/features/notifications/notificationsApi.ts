import * as Notifications from 'expo-notifications';
import { useMemo } from 'react';

import { useRepository } from '@/data/DataProvider';
import { newId } from '@/lib/id';
import { createLocalStore } from '@/lib/localStore';
import type { ForegroundContext } from './presentation';
import { createSummaryMemo, describePending, sendPreviews, type NotificationScheduler } from './runSync';
import type { PendingRequest } from './types';

// The expo-notifications side of the local notifications (G3.12). The decisions are in the pure
// modules beside this one (notificationPlan.ts, reconcile.ts, runSync.ts, routing.ts,
// presentation.ts); this file only makes the calls.
//
// Never add cancel-all or dismiss-all here, and never cancel or dismiss 'rest-alarm': the rest
// alarm keeps its own sync (useRestAlarm.ts), which wouldn't put a running rest's alarm back.

/** A pending or delivered request as runSync reads it: the identifier and the content data. */
const toRequest = (request: Notifications.NotificationRequest | null | undefined): PendingRequest[] =>
  request ? [{ identifier: request.identifier, data: request.content?.data ?? null }] : [];

/**
 * runSync's scheduler, on iOS. Identifier = the nid, so a changed item replaces the pending one
 * under the same id. One-off DATE triggers at the instant worked out in JS (the same path as the
 * rest alarm); the Developer previews use a short interval instead.
 */
export const expoScheduler: NotificationScheduler = {
  // Expo Go hands back every Expo Go project's pending requests; runSync keeps only ours by data.
  getPending: async () => (await Notifications.getAllScheduledNotificationsAsync()).flatMap(toRequest),
  getDelivered: async () => (await Notifications.getPresentedNotificationsAsync()).flatMap((n) => toRequest(n?.request)),
  schedule: async (n, opts) => {
    const trigger: Notifications.NotificationTriggerInput =
      opts?.inSeconds !== undefined
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, opts.inSeconds), repeats: false }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.fireAtMs };
    await Notifications.scheduleNotificationAsync({
      identifier: n.nid,
      content: { title: n.title, body: n.body, sound: n.sound ? 'default' : false, threadIdentifier: n.threadId, data: n.data },
      trigger,
    });
  },
  cancel: (nid) => Notifications.cancelScheduledNotificationAsync(nid),
  dismiss: (nid) => Notifications.dismissNotificationAsync(nid),
};

// ---------------------------------------------------------------------------
// This install's id

/**
 * Marks our notifications (data.owner) apart from look-alikes: ones another Expo Go project or an
 * earlier Expo Go scope left pending carry the same 'et' tag, but can't be cancelled from here.
 * Made once and kept: Erase all data and Restart first-run setup don't reset it.
 */
const installIdStore = createLocalStore<string | null>('notifications.installId', null);

export function getInstallId(): string {
  const saved = installIdStore.get();
  if (typeof saved === 'string' && saved) return saved;
  const id = newId('install');
  installIdStore.set(id);
  return id;
}

// ---------------------------------------------------------------------------
// Where the app is, for the notification handler

let foreground: ForegroundContext = { onToday: false, workoutOpen: false };

/** NotificationTaps keeps this up to date from the route and the open workout. */
export function setForegroundContext(next: ForegroundContext): void {
  if (next.onToday === foreground.onToday && next.workoutOpen === foreground.workoutOpen) return;
  foreground = { onToday: next.onToday, workoutOpen: next.workoutOpen };
}

/** Read by the notification handler (setUpNotificationHandler) when one arrives with the app open. */
export function getForegroundContext(): ForegroundContext {
  return foreground;
}

// ---------------------------------------------------------------------------
// Profile → Developer

/**
 * Preview notifications: one of each kind about 5 seconds from now, with real names and numbers
 * (sample names when nothing is planned); rejects if a read fails or iOS refuses one. Pending
 * notifications: ours that iOS has pending, one line each, for an Alert.
 */
export function useNotificationDevTools(): { preview(): Promise<void>; pendingSummary(): Promise<string> } {
  const repo = useRepository();
  return useMemo(
    () => ({
      preview: () => sendPreviews({ repo, scheduler: expoScheduler, now: () => Date.now(), memo: createSummaryMemo() }, getInstallId()),
      pendingSummary: () => describePending(expoScheduler, getInstallId()),
    }),
    [repo],
  );
}
