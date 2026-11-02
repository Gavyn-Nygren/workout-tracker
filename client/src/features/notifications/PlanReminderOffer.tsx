import { router, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { usePreferences } from '@/data/hooks';
import { authStore } from '@/features/auth/authStore';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { notificationPermission, useNotificationPermission } from '@/features/workout/useRestAlarm';
import { createDelayedOffer, offerSkipReason, PLAN_OFFER_DELAY_MS, shouldOfferPlanReminders, type OfferInput } from './planOffer';
import { markPlanOfferAsked, planOfferStore } from './planOfferStore';

/**
 * The first-plan offer (spec 2.11: ask the first time it's relevant, "the first plan scheduled").
 * After notePlanScheduled(), once a tab screen has shown for PLAN_OFFER_DELAY_MS with no workout
 * open, signed in and onboarded (so never over onboarding or the tour), it opens the permission
 * sheet with `from=plan`, once per phone. A lasting reason not to (iOS has notifications off, or
 * one of the three is already on) marks the offer asked instead. Renders nothing; mounted as a
 * child of the root layout's NavigationRoot so its useSegments doesn't re-render the Stack.
 */
export function PlanReminderOffer() {
  const segments = useSegments();
  const auth = authStore.use();
  const { workout, ready } = useActiveWorkout();
  const permission = useNotificationPermission();
  const notifications = usePreferences().data?.notifications;
  const flags = planOfferStore.use();

  const input: OfferInput = {
    pending: flags.pending,
    asked: flags.asked,
    permission,
    notifications,
    signedIn: auth.signedIn,
    onboarded: auth.onboarded,
    onTabs: segments[0] === '(tabs)',
    // Until the launch check finishes, a workout that's about to resume reads as none: count it as open.
    workoutOpen: !ready || Boolean(workout),
  };
  // What the timer checks again when it runs out, with the stores read fresh.
  const latest = useRef(input);
  latest.current = input;

  const offer = useRef<ReturnType<typeof createDelayedOffer> | null>(null);
  useEffect(() => {
    const delayed = createDelayedOffer({
      delayMs: PLAN_OFFER_DELAY_MS,
      check: () => {
        const session = authStore.get();
        return shouldOfferPlanReminders({ ...latest.current, ...planOfferStore.get(), permission: notificationPermission(), signedIn: session.signedIn, onboarded: session.onboarded });
      },
      show: () => {
        markPlanOfferAsked();
        router.push({ pathname: '/notifications-permission', params: { from: 'plan' } });
      },
    });
    offer.current = delayed;
    return () => {
      delayed.dispose();
      offer.current = null;
    };
  }, []);

  const skip = offerSkipReason(input);
  const wanted = shouldOfferPlanReminders(input);
  useEffect(() => {
    if (skip) {
      offer.current?.update(false);
      markPlanOfferAsked();
      return;
    }
    offer.current?.update(wanted);
  }, [skip, wanted]);

  return null;
}
