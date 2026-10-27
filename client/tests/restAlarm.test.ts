import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { defaultPreferences } from '../src/data/preferences';
import type { LoggedSet, SessionExercise, WorkoutSession } from '../src/data/types';
import { restoredRest } from '../src/features/workout/persistence';
import { adjustedRest, nextUp, presetRest, restAfterSet, restEnd, startedRest, toggledPause, withCurrentNext, type NextUp, type RestChoice, type RestTimer } from '../src/features/workout/rest';
import {
  createRestAlarmSync,
  isRestAlarm,
  permissionFrom,
  planKey,
  presentationFor,
  REST_ALARM_FALLBACK_BODY,
  REST_ALARM_ID,
  REST_ALARM_KIND,
  REST_ALARM_LAST_SET_BODY,
  REST_ALARM_TITLE,
  restAlarmContent,
  restAlarmPlan,
  shouldOfferRestAlarm,
  type AlarmPermission,
  type RestAlarmPlan,
  type ScheduleAlarm,
} from '../src/features/workout/restAlarm';
import { workoutReducer, type ActiveWorkout } from '../src/features/workout/workoutReducer';

// A whole second, so fire times read plainly.
const NOW = Date.parse('2026-10-26T18:00:00.000Z');
const SEC = 1000;

const alarmOn = { ...defaultPreferences.notifications, restTimer: true };
const alarmOff = { ...defaultPreferences.notifications, restTimer: false };

const squatSet3: NextUp = { entryId: 'sq', setId: 'sq3', exerciseId: 'squat', exerciseName: 'Squat', setLabel: 'set 3' };
const benchSet2: NextUp = { entryId: 'be', setId: 'be2', exerciseId: 'bench', exerciseName: 'Bench Press', setLabel: 'set 2' };

/** The rest that starts by itself after a set, as ActiveWorkoutProvider starts it. `next` is null after the workout's last set. */
function autoRest(choice: Partial<RestChoice> = {}, nowMs = NOW, next: NextUp | null = squatSet3): RestTimer {
  const rest = startedRest({ durationSec: 180, source: 'default', learnable: true, ...choice }, { label: 'Squat · set 2', after: { entryId: 'sq', setId: 'sq2', exerciseId: 'squat' }, next }, nowMs);
  assert.ok(rest);
  return rest;
}

function planFor(rest: RestTimer | null, patch: { nowMs?: number; permission?: AlarmPermission; notifications?: typeof alarmOn } = {}): RestAlarmPlan {
  return restAlarmPlan({ rest, notifications: patch.notifications ?? alarmOn, permission: patch.permission ?? 'granted', nowMs: patch.nowMs ?? NOW });
}

const cancel: RestAlarmPlan = { kind: 'cancel', identifier: REST_ALARM_ID };
const scheduled = (fireAtMs: number, body = 'Squat, set 3'): RestAlarmPlan => ({ kind: 'schedule', identifier: REST_ALARM_ID, fireAtMs, title: REST_ALARM_TITLE, body });

describe('rest alarm: what should be pending', () => {
  test('a running rest schedules "Rest over" at its end, naming what comes next', () => {
    assert.deepEqual(planFor(autoRest()), scheduled(NOW + 180 * SEC));
    assert.equal(REST_ALARM_TITLE, 'Rest over');
  });

  test('a superset round rest names the next exercise', () => {
    const round = autoRest({ source: 'round', learnable: false, durationSec: 120 }, NOW, benchSet2);
    assert.deepEqual(planFor(round), scheduled(NOW + 120 * SEC, 'Bench Press, set 2'));
  });

  test('with nothing known to follow it, the body falls back', () => {
    // A manual timer from the presets.
    assert.deepEqual(planFor(presetRest(null, 90, NOW)), scheduled(NOW + 90 * SEC, REST_ALARM_FALLBACK_BODY));
    // One restored from a note saved before G3.8.
    assert.deepEqual(planFor({ ...autoRest(), next: undefined }), scheduled(NOW + 180 * SEC, 'Time for your next set'));
  });

  test("after the workout's last set it says so, instead of sending you to a set that doesn't exist", () => {
    assert.deepEqual(planFor(autoRest({}, NOW, null)), scheduled(NOW + 180 * SEC, REST_ALARM_LAST_SET_BODY));
    assert.equal(REST_ALARM_LAST_SET_BODY, 'That was your last set. Tap Finish when you’re ready.');
    // As completeSet starts it: the last set left to do has no next set.
    const sets: LoggedSet[] = [
      { id: 'sq1', kind: 'normal', modifiers: [], completedAt: '2026-10-26T17:55:00.000Z' },
      { id: 'sq2', kind: 'normal', modifiers: [], completedAt: '2026-10-26T17:59:00.000Z' },
    ];
    const session: WorkoutSession = { id: 's', name: 'Legs', status: 'in_progress', createdAt: '', updatedAt: '', blocks: [{ id: 'b', type: 'single', exercises: [{ id: 'sq', exerciseId: 'squat', skipped: false, sets }] }] };
    const done = { entryId: 'sq', setId: 'sq2' };
    const lookup = new Map([['squat', { name: 'Squat', category: 'compound' as const }]]);
    const choice = restAfterSet(session, done, lookup, { defaults: defaultPreferences.restDefaultsSec, remembered: {} })!;
    const rest = startedRest(choice, { label: 'Squat · set 2', after: { ...done, exerciseId: 'squat' }, next: nextUp(session, done, lookup) }, NOW);
    assert.equal(restAlarmContent(rest!).body, REST_ALARM_LAST_SET_BODY);
  });

  test('a set swapped, skipped or removed during the rest: the alarm names the set that is next now', () => {
    const lookup = new Map([
      ['squat', { name: 'Squat', category: 'compound' as const }],
      ['bench', { name: 'Bench Press', category: 'compound' as const }],
      ['dip', { name: 'Dip', category: 'compound' as const }],
    ]);
    const entry = (id: string, exerciseId: string): SessionExercise => ({ id, exerciseId, skipped: false, sets: [1, 2].map((n) => ({ id: `${id}${n}`, kind: 'normal' as const, modifiers: [] })) });
    const start: ActiveWorkout = {
      mode: 'new',
      session: { id: 's', name: 'Push', status: 'in_progress', createdAt: '', updatedAt: '', blocks: [{ id: 'ss', type: 'superset', transitionRestSec: 30, exercises: [entry('a', 'squat'), entry('b', 'bench')] }] },
    };
    const w = workoutReducer(start, { type: 'completeSet', entryId: 'a', setId: 'a1', completedAt: '2026-10-26T17:59:00.000Z' })!;
    const done = { entryId: 'a', setId: 'a1' };
    const choice = restAfterSet(w.session, done, lookup, { defaults: defaultPreferences.restDefaultsSec, remembered: {} })!;
    const rest = startedRest(choice, { label: 'Squat · set 1', after: { ...done, exerciseId: 'squat' }, next: nextUp(w.session, done, lookup) }, NOW)!;
    assert.deepEqual(planFor(withCurrentNext(rest, w.session, lookup)), scheduled(NOW + 30 * SEC, 'Bench Press, set 1'));
    const swapped = workoutReducer(w, { type: 'swapExercise', entryId: 'b', exerciseId: 'dip' })!;
    assert.deepEqual(planFor(withCurrentNext(rest, swapped.session, lookup)), scheduled(NOW + 30 * SEC, 'Dip, set 1'));
    // Bench removed: round 1 is done, so the next set is round 2's.
    const removed = workoutReducer(w, { type: 'removeExercise', entryId: 'b' })!;
    assert.deepEqual(planFor(withCurrentNext(rest, removed.session, lookup)), scheduled(NOW + 30 * SEC, 'Squat, set 2'));
  });

  test('the time rounds up to the whole second, so it never rings before 0:00', () => {
    const rest = autoRest({}, NOW + 400);
    assert.equal(planFor(rest, { nowMs: NOW + 400 }).kind, 'schedule');
    assert.equal((planFor(rest, { nowMs: NOW + 400 }) as ScheduleAlarm).fireAtMs, NOW + 181 * SEC);
  });

  test('no rest, or a paused one, has no alarm', () => {
    assert.deepEqual(planFor(null), cancel);
    assert.deepEqual(planFor(toggledPause(autoRest(), NOW + 10 * SEC), { nowMs: NOW + 10 * SEC }), cancel);
  });

  test('the alarm turned off in Settings has no alarm', () => {
    assert.deepEqual(planFor(autoRest(), { notifications: alarmOff }), cancel);
  });

  test('only when iOS allows it; a failed check still tries', () => {
    assert.deepEqual(planFor(autoRest(), { permission: 'denied' }), cancel);
    assert.deepEqual(planFor(autoRest(), { permission: 'undetermined' }), cancel);
    assert.deepEqual(planFor(autoRest(), { permission: 'unknown' }), scheduled(NOW + 180 * SEC));
  });

  test('an end moments away keeps its alarm; once the alarm time passes there is none', () => {
    const rest = autoRest({ durationSec: 30 }, NOW + 400);
    // Ends at 30.4 s; the alarm rings at 31 s.
    assert.deepEqual(planFor(rest, { nowMs: NOW + 30_900 }), scheduled(NOW + 31 * SEC));
    assert.deepEqual(planFor(rest, { nowMs: NOW + 31 * SEC }), cancel);
    assert.deepEqual(planFor(rest, { nowMs: NOW + 40 * SEC }), cancel);
  });

  test('quiet hours never hold the rest alarm back (spec 2.11)', () => {
    const allDay = { ...alarmOn, quietHours: { start: '00:00', end: '23:59' } };
    assert.deepEqual(planFor(autoRest(), { notifications: allDay }), scheduled(NOW + 180 * SEC));
  });

  test('every alarm uses the one identifier', () => {
    const plans = [planFor(autoRest()), planFor(presetRest(null, 60, NOW)), planFor(null), planFor(autoRest({ source: 'round' }, NOW, benchSet2))];
    assert.deepEqual(new Set(plans.map((p) => p.identifier)), new Set([REST_ALARM_ID]));
  });

  test('the key changes exactly when the pending alarm would', () => {
    const rest = autoRest();
    assert.equal(planKey(planFor(rest)), planKey(planFor(rest, { nowMs: NOW + 5 * SEC })));
    assert.notEqual(planKey(planFor(rest)), planKey(planFor(adjustedRest(rest, 15, NOW))));
    assert.notEqual(planKey(planFor(rest)), planKey(planFor(autoRest({}, NOW, benchSet2))));
    assert.equal(planKey(planFor(null)), planKey(planFor(rest, { notifications: alarmOff })));
  });
});

describe('rest alarm: through a rest', () => {
  test('start, adjust, pause, resume, preset, toggle, revoke, skip', () => {
    let rest: RestTimer | null = autoRest();
    assert.deepEqual(planFor(rest), scheduled(NOW + 180 * SEC), 'starts with the rest');

    rest = adjustedRest(rest, 15, NOW + 5 * SEC);
    assert.deepEqual(planFor(rest, { nowMs: NOW + 5 * SEC }), scheduled(NOW + 195 * SEC), '+15 s moves it later');
    rest = adjustedRest(rest, -15, NOW + 6 * SEC);
    assert.deepEqual(planFor(rest, { nowMs: NOW + 6 * SEC }), scheduled(NOW + 180 * SEC), '−15 s moves it back');

    rest = toggledPause(rest, NOW + 10 * SEC);
    assert.deepEqual(planFor(rest, { nowMs: NOW + 10 * SEC }), cancel, 'pause cancels');
    rest = adjustedRest(rest, 15, NOW + 20 * SEC);
    assert.deepEqual(planFor(rest, { nowMs: NOW + 20 * SEC }), cancel, 'adjusting while paused stays cancelled');
    rest = toggledPause(rest, NOW + 70 * SEC);
    // 170 s were left at the pause, plus 15: resumed at 70 s, it ends at 255 s.
    assert.deepEqual(planFor(rest, { nowMs: NOW + 70 * SEC }), scheduled(NOW + 255 * SEC), 'resume reschedules what was left');

    rest = presetRest(rest, 60, NOW + 80 * SEC);
    assert.deepEqual(planFor(rest, { nowMs: NOW + 80 * SEC }), scheduled(NOW + 140 * SEC), 'a preset restarts it');

    assert.deepEqual(planFor(rest, { nowMs: NOW + 85 * SEC, notifications: alarmOff }), cancel, 'turned off mid-rest');
    assert.deepEqual(planFor(rest, { nowMs: NOW + 90 * SEC }), scheduled(NOW + 140 * SEC), 'turned back on: the time left');
    assert.deepEqual(planFor(rest, { nowMs: NOW + 95 * SEC, permission: 'denied' }), cancel, 'permission revoked');

    rest = null;
    assert.deepEqual(planFor(rest), cancel, 'skip');
  });

  test('ending with the app open clears it', () => {
    const rest = autoRest({ durationSec: 60 });
    assert.equal(restEnd(rest, rest.endsAtMs, { awaySinceMs: null }), 'alert');
    // settleRest then clears the rest, which cancels whatever hasn't rung yet.
    assert.deepEqual(planFor(null, { nowMs: rest.endsAtMs }), cancel);
  });

  test('after a restart: a running rest keeps its alarm, an ended one has none', () => {
    const rest = autoRest({ durationSec: 120 });
    const later = NOW + 30 * SEC;
    assert.deepEqual(planFor(restoredRest(rest, later), { nowMs: later }), scheduled(NOW + 120 * SEC));
    assert.deepEqual(planFor(restoredRest(toggledPause(rest, NOW + 10 * SEC), later), { nowMs: later }), cancel);
    assert.deepEqual(planFor(restoredRest(rest, NOW + 200 * SEC), { nowMs: NOW + 200 * SEC }), cancel);
  });
});

/** Stands in for expo-notifications: one pending alarm per identifier, like iOS. */
function fakeNotifications(options: { scheduleDelayMs?: number } = {}) {
  const pending = new Map<string, ScheduleAlarm>();
  const calls: string[] = [];
  let failing = false;
  return {
    pending,
    calls,
    fail: (on: boolean) => {
      failing = on;
    },
    scheduler: {
      schedule: async (alarm: ScheduleAlarm) => {
        calls.push(`schedule ${(alarm.fireAtMs - NOW) / SEC}`);
        if (options.scheduleDelayMs) await new Promise((resolve) => setTimeout(resolve, options.scheduleDelayMs));
        if (failing) throw new Error('Notifications are not allowed');
        pending.set(alarm.identifier, alarm);
      },
      cancel: async (identifier: string) => {
        calls.push('cancel');
        pending.delete(identifier);
      },
    },
  };
}

describe('rest alarm: keeping it in step', () => {
  test('a cancel never overtakes the schedule before it', async () => {
    const fake = fakeNotifications({ scheduleDelayMs: 20 });
    const sync = createRestAlarmSync(fake.scheduler);
    const started = sync.apply(planFor(autoRest()));
    await new Promise((resolve) => setImmediate(resolve)); // the schedule is on its way
    await Promise.all([started, sync.apply(cancel)]);
    assert.deepEqual(fake.calls, ['schedule 180', 'cancel']);
    assert.equal(fake.pending.size, 0);
  });

  test('a burst of changes sends only the newest', async () => {
    const fake = fakeNotifications();
    const sync = createRestAlarmSync(fake.scheduler);
    let rest = autoRest();
    const applying: Promise<void>[] = [];
    for (let i = 0; i < 4; i++) {
      rest = adjustedRest(rest, 15, NOW);
      applying.push(sync.apply(planFor(rest)));
    }
    await Promise.all(applying);
    assert.deepEqual(fake.calls, ['schedule 240']);
    assert.equal(fake.pending.get(REST_ALARM_ID)?.fireAtMs, NOW + 240 * SEC);
  });

  test('leaving the app in the last second of a rest keeps its alarm', async () => {
    const fake = fakeNotifications();
    const sync = createRestAlarmSync(fake.scheduler);
    const rest = autoRest({ durationSec: 60 });
    await sync.apply(planFor(rest));
    // Settings saved on the way out (a learned rest, say) recompute the plan with 0.5 s left.
    await sync.apply(planFor(rest, { nowMs: rest.endsAtMs - 500 }));
    assert.deepEqual(fake.calls, ['schedule 60']);
    assert.equal(fake.pending.get(REST_ALARM_ID)?.fireAtMs, NOW + 60 * SEC);
  });

  test('a rest that ends just after the phone is locked keeps its alarm until it rings', async () => {
    const fake = fakeNotifications();
    const sync = createRestAlarmSync(fake.scheduler);
    // Started at :00.300, so it ends at 1:30.300 and the alarm rings at 1:31.
    const rest = autoRest({ durationSec: 90 }, NOW + 300);
    await sync.apply(planFor(rest, { nowMs: NOW + 300 }));
    assert.equal(fake.pending.get(REST_ALARM_ID)?.fireAtMs, NOW + 91 * SEC);
    // Locked 3 s before the end. iOS still runs the app's timers for a moment, so the end timer fires.
    const lockedAt = rest.endsAtMs - 3 * SEC;
    assert.equal(restEnd(rest, rest.endsAtMs, { awaySinceMs: lockedAt }), 'away', 'the rest is left alone');
    // Anything that re-plans meanwhile (settings saved on the way out) plans the same alarm: nothing is sent.
    await sync.apply(planFor(rest, { nowMs: rest.endsAtMs + 100 }));
    assert.deepEqual(fake.calls, ['schedule 91']);
    assert.ok(fake.pending.has(REST_ALARM_ID), 'still pending when it is due to ring');
    // Back after it rang: the rest clears quietly, and the cancel finds nothing left to stop.
    assert.equal(restEnd(rest, NOW + 120 * SEC, { awaySinceMs: lockedAt, returning: true }), 'quiet');
  });

  test('back in the app between the end and the alarm: the app buzzes, and only then is the alarm cancelled', () => {
    const rest = autoRest({ durationSec: 60 }, NOW + 400);
    const backAt = rest.endsAtMs + 300;
    assert.equal(restEnd(rest, backAt, { awaySinceMs: rest.endsAtMs - 10 * SEC, returning: true }), 'alert');
    assert.deepEqual(planFor(null, { nowMs: backAt }), cancel);
  });

  test('a plan already in place is not sent again', async () => {
    const fake = fakeNotifications();
    const sync = createRestAlarmSync(fake.scheduler);
    const rest = autoRest();
    await sync.apply(planFor(rest));
    await sync.apply(planFor(rest, { nowMs: NOW + 3 * SEC }));
    await sync.apply(cancel);
    await sync.apply(cancel);
    assert.deepEqual(fake.calls, ['schedule 180', 'cancel']);
  });

  test('never more than one pending alarm', async () => {
    const fake = fakeNotifications();
    const sync = createRestAlarmSync(fake.scheduler);
    await sync.apply(planFor(autoRest()));
    await sync.apply(planFor(presetRest(null, 60, NOW)));
    await sync.apply(planFor(autoRest({ source: 'round' }, NOW, benchSet2)));
    assert.equal(fake.pending.size, 1);
    assert.equal(fake.pending.get(REST_ALARM_ID)?.body, 'Bench Press, set 2');
  });

  test('a failure is silent and leaves no alarm for an older end', async () => {
    const fake = fakeNotifications();
    const sync = createRestAlarmSync(fake.scheduler);
    const rest = autoRest();
    await sync.apply(planFor(rest));
    fake.fail(true);
    await assert.doesNotReject(sync.apply(planFor(adjustedRest(rest, 15, NOW))));
    assert.equal(fake.pending.size, 0, 'the 3:00 alarm went too');
    // Allowed again: the next change schedules as usual.
    fake.fail(false);
    await sync.apply(planFor(adjustedRest(rest, 30, NOW)));
    assert.equal(fake.pending.get(REST_ALARM_ID)?.fireAtMs, NOW + 210 * SEC);
  });

  test('a cancel that fails is retried by the next change', async () => {
    const calls: string[] = [];
    let failing = true;
    const sync = createRestAlarmSync({
      schedule: async () => {
        calls.push('schedule');
      },
      cancel: async () => {
        calls.push('cancel');
        if (failing) throw new Error('unavailable');
      },
    });
    await sync.apply(cancel);
    failing = false;
    await sync.apply(cancel);
    assert.deepEqual(calls, ['cancel', 'cancel']);
  });
});

describe('rest alarm: iOS permission', () => {
  test('reads a permission check', () => {
    assert.equal(permissionFrom(undefined), 'unknown');
    assert.equal(permissionFrom({ granted: true, canAskAgain: true, status: 'granted', ios: { status: 2 } }), 'granted');
    assert.equal(permissionFrom({ granted: false, canAskAgain: true, status: 'undetermined', ios: { status: 0 } }), 'undetermined');
    assert.equal(permissionFrom({ granted: false, canAskAgain: false, status: 'denied', ios: { status: 1 } }), 'denied');
    assert.equal(permissionFrom({ granted: false, canAskAgain: false, status: 'undetermined' }), 'denied');
    // Provisional (3) and ephemeral (4): asking again shows the real prompt.
    assert.equal(permissionFrom({ granted: false, canAskAgain: true, status: 'undetermined', ios: { status: 3 } }), 'undetermined');
    assert.equal(permissionFrom({ granted: false, canAskAgain: true, status: 'undetermined', ios: { status: 4 } }), 'undetermined');
  });
});

describe('rest alarm: asking at the first rest (decision A)', () => {
  const offer = (rest: RestTimer | null, patch: { enabled?: boolean; asked?: boolean; permission?: AlarmPermission | null } = {}) =>
    shouldOfferRestAlarm({ rest, enabled: false, asked: false, permission: 'undetermined', ...patch });

  test('the first rest after a set offers it, whether iOS has asked yet or already allows it', () => {
    assert.equal(offer(autoRest()), true);
    assert.equal(offer(autoRest(), { permission: 'granted' }), true);
    assert.equal(offer(autoRest({ source: 'warmup', learnable: false, durationSec: 60 })), true);
    assert.equal(offer(autoRest({ source: 'round', learnable: false })), true);
  });

  test('never more than once, and not when the alarm is already on', () => {
    assert.equal(offer(autoRest(), { asked: true }), false);
    assert.equal(offer(autoRest(), { enabled: true }), false);
  });

  test("not when iOS has said no, or the answer isn't known", () => {
    assert.equal(offer(autoRest(), { permission: 'denied' }), false);
    assert.equal(offer(autoRest(), { permission: 'unknown' }), false);
    assert.equal(offer(autoRest(), { permission: null }), false);
  });

  test('never during a superset transition, and not for a timer started by hand', () => {
    assert.equal(offer(autoRest({ source: 'transition', learnable: false, durationSec: 15 })), false);
    assert.equal(offer(presetRest(null, 90, NOW)), false);
    assert.equal(offer(null), false);
  });
});

describe('rest alarm: arriving with the app open', () => {
  const arriving = (identifier: string, data?: Record<string, unknown>) => ({ request: { identifier, content: { data } } });

  test("the rest alarm stays silent and out of the list; the app's haptic covers it", () => {
    const quiet = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    assert.deepEqual(presentationFor(arriving(REST_ALARM_ID)), quiet);
    // Recognized by its data too, in case the identifier comes back changed (Expo Go scopes them).
    assert.deepEqual(presentationFor(arriving('@me/exercise-tracker/rest-alarm', { kind: REST_ALARM_KIND })), quiet);
    assert.equal(isRestAlarm(arriving('rest-alarm-2')), false);
  });

  test('anything else shows as it would with no handler', () => {
    assert.deepEqual(presentationFor(arriving('workout-reminder', { kind: 'reminder' })), { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true });
  });
});
