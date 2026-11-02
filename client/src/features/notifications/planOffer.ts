// The first-plan notification offer (spec 2.11: ask the first time it's relevant, "the first
// plan scheduled", after a short explanation; never at launch). Pure, so it's unit-tested;
// planOfferStore.ts keeps the flags and PlanReminderOffer.tsx opens the sheet. Nothing here may
// import React Native, Expo or localStore.
import type { Preferences } from '@/data/types';
import type { AlarmPermission } from '@/features/workout/restAlarm';

/** How long the tabs must stay showing before the sheet opens (onboarding's tour opens 150 ms after it ends). */
export const PLAN_OFFER_DELAY_MS = 600;

/** The notifications the offer turns on: the three a plan makes useful. */
export const PLAN_OFFER_KINDS = ['workoutReminders', 'missedWorkout', 'weeklySummary'] as const;
export type PlanOfferKind = (typeof PLAN_OFFER_KINDS)[number];

export type OfferInput = {
  /** A plan was started or resumed since the last offer (notePlanScheduled). */
  pending: boolean;
  /** This phone has been offered, or the user set one of the three themselves. */
  asked: boolean;
  /** null until the first check comes back. */
  permission: AlarmPermission | null;
  /** undefined until the saved preferences load. */
  notifications: Preferences['notifications'] | undefined;
  signedIn: boolean;
  onboarded: boolean;
  /** A tab screen is showing (not onboarding, the tour, a sheet or a pushed screen). */
  onTabs: boolean;
  workoutOpen: boolean;
};

const anyKindOn = (notifications: Preferences['notifications']) => PLAN_OFFER_KINDS.some((kind) => notifications[kind]);

/**
 * Whether to offer workout reminders now: once per phone, after a plan was scheduled, only on a
 * tab screen with no workout open, signed in and onboarded, once the permission and settings are
 * known, while iOS can still ask or already allows it, and while none of the three is on yet.
 * 'unknown' (the check failed) still offers: the sheet asks iOS again.
 */
export function shouldOfferPlanReminders(x: OfferInput): boolean {
  if (!x.pending || x.asked) return false;
  if (!x.signedIn || !x.onboarded || !x.onTabs || x.workoutOpen) return false;
  if (x.permission === null || x.permission === 'denied' || !x.notifications) return false;
  return !anyKindOn(x.notifications);
}

/**
 * A lasting reason not to offer, so the offer is marked asked instead of waiting: iOS has
 * notifications off, or one of the three is already on. Passing moments (another screen, a
 * workout, the tour, signed out) and inputs not known yet aren't reasons: null.
 */
export function offerSkipReason(x: OfferInput): 'denied' | 'alreadyOn' | null {
  if (!x.pending || x.asked) return null;
  if (x.permission === 'denied') return 'denied';
  if (x.notifications && anyKindOn(x.notifications)) return 'alreadyOn';
  return null;
}

/**
 * Opens the offer once it has been wanted for `delayMs` without a break. `update(false)` clears
 * the countdown; `update(true)` while one runs leaves it be. When it runs out, `check()` is asked
 * again (the rule may have turned false between updates) before `show()`. Like the rest alarm's
 * offer (ActiveWorkoutProvider.tsx).
 */
export function createDelayedOffer(o: {
  delayMs: number;
  check: () => boolean;
  show: () => void;
  timers?: { set: typeof setTimeout; clear: typeof clearTimeout };
}): { update(wanted: boolean): void; dispose(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const stop = () => {
    if (timer === null) return;
    if (o.timers) o.timers.clear(timer);
    else clearTimeout(timer);
    timer = null;
  };
  const fire = () => {
    timer = null;
    if (!disposed && o.check()) o.show();
  };

  return {
    update(wanted) {
      if (disposed) return;
      if (!wanted) stop();
      else if (timer === null) timer = o.timers ? o.timers.set(fire, o.delayMs) : setTimeout(fire, o.delayMs);
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
