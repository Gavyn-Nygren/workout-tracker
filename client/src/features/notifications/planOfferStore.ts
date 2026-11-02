import { useMemo } from 'react';

import { createLocalStore } from '@/lib/localStore';

// The first-plan offer's two flags (planOffer.ts has the rule), kept on the phone. Neither is
// cleared by Erase all data or Load sample data; Restart first-run setup clears both
// (resetPlanOffer), so the offer can be seen again.

export type PlanOfferState = {
  /** A plan was started or resumed in this launch and the offer hasn't been made since. */
  pending: boolean;
  /** Offered on this phone, skipped for a lasting reason, or a type turned on in Settings. */
  asked: boolean;
};

const pendingStore = createLocalStore<boolean>('notifications.planOfferPending', false);
const askedStore = createLocalStore<boolean>('notifications.planOfferAsked', false);

// A plan noted in an earlier launch (the app was closed during the tour, say) doesn't carry over:
// the offer belongs to the moment the plan was scheduled, and never opens at launch (spec 2.11).
if (pendingStore.get()) pendingStore.set(false);

/** Both flags, now (`get`) or kept current in a component (`use`, a hook). */
export const planOfferStore = {
  get: (): PlanOfferState => ({ pending: pendingStore.get(), asked: askedStore.get() }),
  use: (): PlanOfferState => {
    const pending = pendingStore.use();
    const asked = askedStore.use();
    return useMemo(() => ({ pending, asked }), [pending, asked]);
  },
};

/**
 * Call after an active plan is saved: onboarding's Start this plan, Use this template, a new
 * plan's Create, and Resume plan. Not for renames, schedule edits or pausing. Does nothing once asked.
 */
export function notePlanScheduled(): void {
  if (!askedStore.get() && !pendingStore.get()) pendingStore.set(true);
}

/**
 * The offer is done with: shown, skipped for a lasting reason (offerSkipReason), or one of the
 * three types turned on or off in Settings. Clears the pending flag too.
 */
export function markPlanOfferAsked(): void {
  if (!askedStore.get()) askedStore.set(true);
  if (pendingStore.get()) pendingStore.set(false);
}

/** Restart first-run setup: the next plan scheduled offers again. */
export function resetPlanOffer(): void {
  if (pendingStore.get()) pendingStore.set(false);
  if (askedStore.get()) askedStore.set(false);
}
