import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useDataVersion, useRepository, useToday } from '@/data/DataProvider';
import type { ID } from '@/data/types';
import { authStore } from '@/features/auth/authStore';
import { keptMissedStore } from '@/features/today/keptMissed';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { useNotificationPermission } from '@/features/workout/useRestAlarm';
import { expoScheduler, getInstallId } from './notificationsApi';
import { createSyncQueue } from './reconcile';
import { createSummaryMemo, readyToSync, runNotificationSync, type SyncContext, type SyncDeps } from './runSync';
import { createSyncTimer, leftForeground } from './syncTimer';

// One queue for the whole app: a run reads, plans and reconciles start to finish before the next
// starts, and a request during a run causes exactly one more run, with the newest inputs.
let latest: { deps: SyncDeps; ctx: SyncContext } | null = null;
const memo = createSummaryMemo();
const queue = createSyncQueue(async () => {
  const input = latest;
  if (input) await runNotificationSync(input.deps, input.ctx);
});
/** The debounce in front of the queue (syncTimer.ts): at once when the app is leaving. */
const timer = createSyncTimer(() => queue.request());

/**
 * Keeps iOS's pending workout reminders, missed-workout prompts and weekly summaries in step with
 * the data (G3.12; the run is runSync.ts). A run follows every repository write (the write feed,
 * Erase all data and Load sample data included), a new day, every return to the app, the iOS
 * permission, signing in or out, the open workout (whether one is open, and which), the launch
 * check for it, and "Keep schedule" on Today. Nothing runs until the permission is known and the
 * launch check has finished, so a run never works from half the inputs. A run still waiting for
 * its debounce starts at once when the app leaves the foreground, and any trigger while it's away
 * runs straight away, before iOS suspends the app. Errors are swallowed: the next trigger tries
 * again. Renders nothing; mounted inside the root layout's NavigationRoot.
 */
export function NotificationSync() {
  const repo = useRepository();
  const version = useDataVersion();
  const today = useToday();
  const permission = useNotificationPermission();
  const auth = authStore.use();
  const { ready, workout } = useActiveWorkout();
  const workoutOpen = Boolean(workout);
  const openOccurrenceId = workout?.session.occurrenceId;
  const kept = keptMissedStore.use();
  const keptMissedIds = useMemo<ReadonlySet<ID>>(
    () => new Set(Array.isArray(kept) ? kept.flatMap((miss) => (typeof miss?.id === 'string' ? [miss.id] : [])) : []),
    [kept],
  );

  // Every return to the app, whatever else changed; leaving it runs whatever is still waiting.
  const [returns, setReturns] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReturns((n) => n + 1);
      else if (leftForeground(state)) timer.flush();
    });
    return () => {
      subscription.remove();
      timer.cancel();
    };
  }, []);

  useEffect(() => {
    if (permission === null || !readyToSync({ permission, workoutReady: ready })) {
      timer.cancel();
      return;
    }
    try {
      latest = {
        deps: { repo, scheduler: expoScheduler, now: () => Date.now(), memo },
        ctx: { permission, signedIn: auth.signedIn, onboarded: auth.onboarded, workoutOpen, openOccurrenceId, keptMissedIds, owner: getInstallId() },
      };
    } catch {
      timer.cancel();
      return;
    }
    timer.trigger({ workoutOpen, away: leftForeground(AppState.currentState) });
  }, [repo, version, today, returns, permission, auth.signedIn, auth.onboarded, ready, workoutOpen, openOccurrenceId, keptMissedIds]);

  return null;
}
