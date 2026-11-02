import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { defaultPreferences } from '../src/data/preferences';
import { createDelayedOffer, offerSkipReason, PLAN_OFFER_DELAY_MS, shouldOfferPlanReminders, type OfferInput } from '../src/features/notifications/planOffer';

// Spec 2.11 / section 7: permission is asked at the first relevant moment ("first plan
// scheduled"), after an explanation, never at launch.

const off = defaultPreferences.notifications;

/** Back on the tabs after a plan was saved, nothing on yet, iOS hasn't asked. */
function input(patch: Partial<OfferInput> = {}): OfferInput {
  return { pending: true, asked: false, permission: 'undetermined', notifications: off, signedIn: true, onboarded: true, onTabs: true, workoutOpen: false, ...patch };
}

describe('when the first-plan offer shows', () => {
  test('after a plan is scheduled, on the tabs, with nothing on yet', () => {
    assert.equal(shouldOfferPlanReminders(input()), true);
    assert.equal(offerSkipReason(input()), null);
  });

  test('never at launch: nothing scheduled since the last offer', () => {
    assert.equal(shouldOfferPlanReminders(input({ pending: false })), false);
    assert.equal(offerSkipReason(input({ pending: false, permission: 'denied' })), null, 'nothing to mark');
  });

  test('once per phone', () => {
    assert.equal(shouldOfferPlanReminders(input({ asked: true })), false);
    assert.equal(offerSkipReason(input({ asked: true, permission: 'denied' })), null);
  });

  test('when iOS allows notifications, or the check failed, it offers; it never asks over a no', () => {
    assert.equal(shouldOfferPlanReminders(input({ permission: 'granted' })), true);
    assert.equal(shouldOfferPlanReminders(input({ permission: 'unknown' })), true);
    assert.equal(shouldOfferPlanReminders(input({ permission: 'denied' })), false);
  });

  test('iOS turned off is a lasting reason: marked asked instead of waiting', () => {
    assert.equal(offerSkipReason(input({ permission: 'denied' })), 'denied');
    assert.equal(offerSkipReason(input({ permission: 'denied', onTabs: false, workoutOpen: true, onboarded: false })), 'denied', 'wherever the user is');
  });

  test('one of the three already on is a lasting reason too', () => {
    for (const kind of ['workoutReminders', 'missedWorkout', 'weeklySummary'] as const) {
      const on = input({ notifications: { ...off, [kind]: true } });
      assert.equal(shouldOfferPlanReminders(on), false, kind);
      assert.equal(offerSkipReason(on), 'alreadyOn', kind);
    }
  });

  test('the rest alarm or form alerts on do not count: those are offered elsewhere', () => {
    const others = input({ notifications: { ...off, restTimer: true, formAnalysisComplete: true } });
    assert.equal(shouldOfferPlanReminders(others), true);
    assert.equal(offerSkipReason(others), null);
  });

  test('not off the tabs, during a workout, during onboarding or the tour, or signed out; it waits', () => {
    for (const patch of [{ onTabs: false }, { workoutOpen: true }, { onboarded: false }, { onboarded: false, onTabs: false }, { signedIn: false }] satisfies Partial<OfferInput>[]) {
      assert.equal(shouldOfferPlanReminders(input(patch)), false, JSON.stringify(patch));
      assert.equal(offerSkipReason(input(patch)), null, `${JSON.stringify(patch)} passes; still pending`);
    }
  });

  test('not before the permission or the settings are known; no skip either', () => {
    assert.equal(shouldOfferPlanReminders(input({ permission: null })), false);
    assert.equal(offerSkipReason(input({ permission: null })), null);
    assert.equal(shouldOfferPlanReminders(input({ notifications: undefined })), false);
    assert.equal(offerSkipReason(input({ notifications: undefined })), null);
    assert.equal(offerSkipReason(input({ notifications: undefined, permission: 'denied' })), 'denied');
  });
});

describe('the delayed offer', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  /** A delayed offer driven by a changing rule, the way PlanReminderOffer drives it. */
  function harness(start: Partial<OfferInput> = {}) {
    let state = input(start);
    const shown: number[] = [];
    let checks = 0;
    const offer = createDelayedOffer({
      delayMs: PLAN_OFFER_DELAY_MS,
      check: () => {
        checks++;
        return shouldOfferPlanReminders(state);
      },
      show: () => shown.push(checks),
    });
    const set = (patch: Partial<OfferInput>, tellOffer = true) => {
      state = { ...state, ...patch };
      if (tellOffer) offer.update(shouldOfferPlanReminders(state));
    };
    offer.update(shouldOfferPlanReminders(state));
    return { offer, set, shown, checks: () => checks };
  }

  test('shows once the rule has held for the delay, checking it again first', () => {
    const h = harness();
    mock.timers.tick(PLAN_OFFER_DELAY_MS - 1);
    assert.deepEqual(h.shown, []);
    mock.timers.tick(1);
    assert.deepEqual(h.shown, [1], 'checked once, right before showing');
    mock.timers.tick(10 * PLAN_OFFER_DELAY_MS);
    assert.deepEqual(h.shown, [1], 'only once');
  });

  test('the rule turning false clears the countdown: Take the tour opens /tutorial 150 ms after onboarding ends', () => {
    const h = harness({ onboarded: false, onTabs: false });
    h.set({ onboarded: true, onTabs: true });
    mock.timers.tick(150);
    h.set({ onTabs: false });
    mock.timers.tick(10 * PLAN_OFFER_DELAY_MS);
    assert.deepEqual(h.shown, []);
    assert.equal(h.checks(), 0, 'the timer was cleared, not just ignored');
  });

  test('back on the tabs after the tour, it starts over and shows', () => {
    const h = harness({ onTabs: false });
    h.set({ onTabs: true });
    mock.timers.tick(300);
    h.set({ onTabs: false });
    mock.timers.tick(300);
    h.set({ onTabs: true });
    mock.timers.tick(PLAN_OFFER_DELAY_MS - 1);
    assert.deepEqual(h.shown, []);
    mock.timers.tick(1);
    assert.equal(h.shown.length, 1);
  });

  test('a rule that turned false without an update is caught by the check when the timer fires', () => {
    const h = harness();
    mock.timers.tick(100);
    h.set({ workoutOpen: true }, false);
    mock.timers.tick(PLAN_OFFER_DELAY_MS);
    assert.deepEqual(h.shown, []);
    assert.equal(h.checks(), 1);
    // The next update while it's wanted starts a new countdown.
    h.set({ workoutOpen: false });
    mock.timers.tick(PLAN_OFFER_DELAY_MS);
    assert.equal(h.shown.length, 1);
  });

  test('more updates while wanted keep the countdown that is running', () => {
    const h = harness();
    mock.timers.tick(400);
    h.offer.update(true);
    h.offer.update(true);
    mock.timers.tick(PLAN_OFFER_DELAY_MS - 400);
    assert.equal(h.shown.length, 1, 'not pushed back by re-renders');
  });

  test('marking asked when it shows stops a second sheet', () => {
    let state = input();
    let shown = 0;
    const offer = createDelayedOffer({
      delayMs: PLAN_OFFER_DELAY_MS,
      check: () => shouldOfferPlanReminders(state),
      show: () => {
        shown++;
        state = { ...state, asked: true, pending: false };
      },
    });
    offer.update(true);
    mock.timers.tick(PLAN_OFFER_DELAY_MS);
    offer.update(shouldOfferPlanReminders(state));
    offer.update(true);
    mock.timers.tick(PLAN_OFFER_DELAY_MS);
    assert.equal(shown, 1);
  });

  test('dispose clears the countdown and ignores later updates', () => {
    const h = harness();
    mock.timers.tick(300);
    h.offer.dispose();
    mock.timers.tick(PLAN_OFFER_DELAY_MS);
    h.offer.update(true);
    mock.timers.tick(PLAN_OFFER_DELAY_MS);
    assert.deepEqual(h.shown, []);
    assert.equal(h.checks(), 0);
  });

  test('uses the timers it is given', () => {
    const pending = new Map<number, () => void>();
    let next = 0;
    const set = ((fn: () => void) => {
      pending.set(++next, fn);
      return next;
    }) as unknown as typeof setTimeout;
    const clear = ((id: number) => void pending.delete(id)) as unknown as typeof clearTimeout;
    let shown = 0;
    const offer = createDelayedOffer({ delayMs: 600, check: () => true, show: () => shown++, timers: { set, clear } });
    offer.update(true);
    assert.equal(pending.size, 1);
    offer.update(false);
    assert.equal(pending.size, 0, 'cleared through the given clear');
    offer.update(true);
    [...pending.values()].forEach((fn) => fn());
    assert.equal(shown, 1);
  });
});
