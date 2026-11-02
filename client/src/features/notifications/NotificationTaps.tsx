import * as Notifications from 'expo-notifications';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

import { authStore } from '@/features/auth/authStore';
import { requestTodayFocus } from '@/features/today/focusToday';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { setForegroundContext } from './notificationsApi';
import { responseKey, tapAction, type TapAction, type TapContext } from './routing';

type RootState = ReturnType<typeof useRootNavigationState>;

/** expo-router's own top route, which holds the root layout's Stack (its INTERNAL_SLOT_NAME). */
const ROOT_SLOT = '__root';

/**
 * The root layout's Stack routes ('(tabs)', 'workout/index', …). The navigation container's state
 * starts one level up, with expo-router's '__root' slot as its route; the Stack is inside that.
 */
function rootStackRouteNames(state: RootState | undefined): string[] {
  const routes = state?.routes ?? [];
  const inner = routes.find((route) => route.name === ROOT_SLOT)?.state?.routes;
  return (inner ?? routes).map((route) => route.name);
}

/** Taps already handled this launch: iOS can hand the same one to the listener and as the last response. */
const handled = new Set<string>();
const MAX_HANDLED = 50;

function remember(key: string) {
  handled.add(key);
  if (handled.size > MAX_HANDLED) handled.delete(handled.values().next().value as string);
}

function perform(action: TapAction) {
  switch (action.kind) {
    case 'today':
      // Close the workout, a summary or any other screen over the tabs, then show Today on today.
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/');
      requestTodayFocus();
      return;
    case 'push':
      router.push(action.href);
      return;
    case 'setParams':
      router.setParams(action.params);
      return;
  }
}

const clearLast = () => {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Nothing to clear, or the module isn't there: the tap stays handled through `handled`.
  }
};

/**
 * Opens the right screen for a tapped notification (G3.12; the decision is routing.ts's tapAction):
 * a workout reminder or missed-workout prompt shows Today with today selected, the weekly summary
 * opens "Your week", and the rest alarm opens the workout unless it's already showing. Covers a
 * tap that started or woke the app (the last response, read once ready) and taps while it runs.
 * Acts only when signed in and onboarded, and after the launch check for an open workout; until
 * then the last response is left for later. Also tells the notification handler where the app is.
 * Renders nothing; mounted inside the root layout's NavigationRoot so the route hooks don't
 * re-render the root Stack.
 */
export function NotificationTaps() {
  const auth = authStore.use();
  const { workout, ready } = useActiveWorkout();
  const workoutOpen = Boolean(workout);
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const rootRouteNames = useMemo(() => rootStackRouteNames(rootState), [rootState]);

  // How a notification arriving now shows (presentation.ts): quieter on Today or in a workout.
  useEffect(() => {
    setForegroundContext({ onToday: pathname === '/', workoutOpen });
  }, [pathname, workoutOpen]);

  // Where the app is when a tap arrives, read when it does.
  const where = useRef<TapContext>({ workoutOpen, rootRouteNames, pathname });
  where.current = { workoutOpen, rootRouteNames, pathname };

  const active = auth.signedIn && auth.onboarded && ready;
  useEffect(() => {
    if (!active) return;
    const open = (response: Notifications.NotificationResponse | null | undefined) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const notification = response.notification;
      const key = responseKey(notification.request.identifier, notification.date);
      if (!handled.has(key)) {
        remember(key);
        const action = tapAction(notification.request.content.data, where.current);
        try {
          if (action) perform(action);
        } catch {
          // The navigator wasn't ready for it: the app stays where it is.
        }
      }
      // Handled: a later remount (signing out and back in) mustn't open it again.
      clearLast();
    };

    try {
      open(Notifications.getLastNotificationResponse());
    } catch {
      // No last response to read.
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        open(response);
      } catch {
        // As above.
      }
    });
    return () => subscription.remove();
  }, [active]);

  return null;
}
