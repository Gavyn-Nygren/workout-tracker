// Tapping a notification and how one shows while the app is open (G3.12, spec 2.11): every tap
// branch, duplicate taps, and the in-app presentation for every kind and context.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { presentationForAny, type ForegroundContext } from '../src/features/notifications/presentation';
import { responseKey, tapAction, type TapContext } from '../src/features/notifications/routing';
import type { NotificationData, NotificationKind } from '../src/features/notifications/types';
import { presentationFor, REST_ALARM_ID, REST_ALARM_KIND, type IncomingNotification, type Presentation } from '../src/features/workout/restAlarm';

const TODAY = '2026-11-02';

const data = (kind: NotificationKind, date = TODAY, extra: Partial<NotificationData> = {}): NotificationData => ({
  app: 'et',
  v: 1,
  owner: 'install_1',
  kind,
  nid: `et.${kind}.${date}`,
  date,
  fireAt: 0,
  key: 'k',
  ...extra,
});

/** On a tab, nothing open on top. */
const onTabs = (extra: Partial<TapContext> = {}): TapContext => ({ workoutOpen: false, rootRouteNames: ['(tabs)'], pathname: '/', ...extra });

describe('tapping a notification', () => {
  test('a workout reminder or missed prompt opens Today, from anywhere', () => {
    for (const kind of ['workoutReminder', 'missedWorkout'] as const) {
      assert.deepEqual(tapAction(data(kind), onTabs()), { kind: 'today' });
      assert.deepEqual(tapAction(data(kind), onTabs({ pathname: '/progress' })), { kind: 'today' });
      // With the workout screen and a sheet on top: Today still, and the caller closes the modals first.
      assert.deepEqual(tapAction(data(kind), onTabs({ workoutOpen: true, rootRouteNames: ['(tabs)', 'workout/index', 'workout/timer'], pathname: '/workout/timer' })), { kind: 'today' });
    }
  });

  test('an old notification for a past day still opens Today', () => {
    assert.deepEqual(tapAction(data('workoutReminder', '2026-10-20'), onTabs()), { kind: 'today' });
    assert.deepEqual(tapAction(data('missedWorkout', '2026-10-01'), onTabs()), { kind: 'today' });
  });

  test('a preview routes like the real one', () => {
    assert.deepEqual(tapAction(data('workoutReminder', TODAY, { nid: 'preview.workoutReminder' }), onTabs()), { kind: 'today' });
    assert.deepEqual(tapAction(data('weeklySummary', '2026-10-26', { nid: 'preview.weeklySummary' }), onTabs()), {
      kind: 'push',
      href: { pathname: '/weekly-summary', params: { week: '2026-10-26' } },
    });
  });

  test('the weekly summary opens "Your week" for its week', () => {
    assert.deepEqual(tapAction(data('weeklySummary', '2026-11-02'), onTabs()), { kind: 'push', href: { pathname: '/weekly-summary', params: { week: '2026-11-02' } } });
    // Over the open workout too: the summary goes on top of it.
    assert.deepEqual(tapAction(data('weeklySummary', '2026-11-02'), onTabs({ workoutOpen: true, rootRouteNames: ['(tabs)', 'workout/index'], pathname: '/workout' })), {
      kind: 'push',
      href: { pathname: '/weekly-summary', params: { week: '2026-11-02' } },
    });
  });

  test('a summary tapped while "Your week" is showing changes its week instead of stacking a copy', () => {
    const showing = onTabs({ rootRouteNames: ['(tabs)', 'weekly-summary'], pathname: '/weekly-summary' });
    assert.deepEqual(tapAction(data('weeklySummary', '2026-10-26'), showing), { kind: 'setParams', params: { week: '2026-10-26' } });
  });

  test('a summary with an unreadable week opens the latest one, and does nothing when it is showing', () => {
    const bad = data('weeklySummary', 'not-a-date');
    assert.deepEqual(tapAction(bad, onTabs()), { kind: 'push', href: { pathname: '/weekly-summary' } });
    assert.equal(tapAction(bad, onTabs({ pathname: '/weekly-summary' })), null);
    assert.deepEqual(tapAction(data('weeklySummary', '2026-02-30'), onTabs()), { kind: 'push', href: { pathname: '/weekly-summary' } });
  });

  test('the rest alarm opens the workout only when one is open and not already in the stack', () => {
    const rest = { kind: REST_ALARM_KIND };
    assert.equal(tapAction(rest, onTabs()), null, 'no workout open');
    assert.deepEqual(tapAction(rest, onTabs({ workoutOpen: true })), { kind: 'push', href: { pathname: '/workout' } }, 'open but hidden behind the tabs');
    assert.equal(tapAction(rest, onTabs({ workoutOpen: true, rootRouteNames: ['(tabs)', 'workout/index'], pathname: '/workout' })), null, 'already showing');
    assert.equal(tapAction(rest, onTabs({ workoutOpen: true, rootRouteNames: ['(tabs)', 'workout/index', 'workout/timer'], pathname: '/workout/timer' })), null, 'its timer sheet is on top');
    assert.equal(
      tapAction(rest, onTabs({ workoutOpen: true, rootRouteNames: ['(tabs)', 'workout/index', 'summary'], pathname: '/summary' })),
      null,
      'in the stack under another modal: a push would stack a second workout',
    );
    assert.equal(tapAction(rest, onTabs({ workoutOpen: true, rootRouteNames: ['(tabs)', 'workout'], pathname: '/' })), null);
  });

  test('malformed data, another app, or an unknown kind does nothing', () => {
    for (const bad of [undefined, null, 'et.reminder.2026-11-02', 42, [], {}, { kind: 'workoutReminder' }, { app: 'other', kind: 'workoutReminder' }, { app: 'et', kind: 'formReady' }, { app: 'et' }]) {
      assert.equal(tapAction(bad, onTabs()), null, JSON.stringify(bad));
    }
  });

  test('duplicate taps share a key; a re-delivery of the same id does not', () => {
    assert.equal(responseKey('et.reminder.2026-11-02', 1000), 'et.reminder.2026-11-02@1000');
    assert.equal(responseKey('et.reminder.2026-11-02', 1000), responseKey('et.reminder.2026-11-02', 1000));
    assert.notEqual(responseKey('et.reminder.2026-11-02', 1000), responseKey('et.reminder.2026-11-02', 2000));
    assert.notEqual(responseKey('rest-alarm', 1000), responseKey('et.reminder.2026-11-02', 1000));

    // As NotificationTaps de-duplicates: the cold-start response and the listener's copy of it act once.
    const seen = new Set<string>();
    const acted: string[] = [];
    const tap = (identifier: string, date: number) => {
      const key = responseKey(identifier, date);
      if (seen.has(key)) return;
      seen.add(key);
      acted.push(key);
    };
    tap('et.reminder.2026-11-02', 1000);
    tap('et.reminder.2026-11-02', 1000);
    tap('rest-alarm', 1000);
    tap('rest-alarm', 5000);
    assert.deepEqual(acted, ['et.reminder.2026-11-02@1000', 'rest-alarm@1000', 'rest-alarm@5000']);
  });
});

// ---------------------------------------------------------------------------

const incoming = (identifier: string, d: Record<string, unknown> | null | undefined): IncomingNotification => ({ request: { identifier, content: { data: d } } });

const CONTEXTS: ForegroundContext[] = [
  { onToday: false, workoutOpen: false },
  { onToday: true, workoutOpen: false },
  { onToday: false, workoutOpen: true },
  { onToday: true, workoutOpen: true },
];

const BANNER_SOUND: Presentation = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
const BANNER_SILENT: Presentation = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
const LIST_ONLY: Presentation = { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
const HIDDEN: Presentation = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

describe('arriving while the app is open', () => {
  test('a reminder or missed prompt is a banner with sound, except on Today or during a workout (Notification Center only)', () => {
    for (const kind of ['workoutReminder', 'missedWorkout'] as const) {
      const n = incoming(`et.${kind}`, data(kind));
      assert.deepEqual(presentationForAny(n, CONTEXTS[0]), BANNER_SOUND, kind);
      for (const ctx of CONTEXTS.slice(1)) assert.deepEqual(presentationForAny(n, ctx), LIST_ONLY, `${kind} ${JSON.stringify(ctx)}`);
    }
  });

  test('the weekly summary is a banner with no sound, everywhere', () => {
    for (const ctx of CONTEXTS) assert.deepEqual(presentationForAny(incoming('et.summary', data('weeklySummary')), ctx), BANNER_SILENT);
  });

  test('the rest alarm stays hidden, by id or by kind, as presentationFor has it', () => {
    for (const ctx of CONTEXTS) {
      assert.deepEqual(presentationForAny(incoming(REST_ALARM_ID, { kind: REST_ALARM_KIND }), ctx), HIDDEN);
      assert.deepEqual(presentationForAny(incoming(REST_ALARM_ID, null), ctx), HIDDEN);
      assert.deepEqual(presentationForAny(incoming('scoped/xyz', { kind: REST_ALARM_KIND }), ctx), HIDDEN);
    }
    const n = incoming(REST_ALARM_ID, { kind: REST_ALARM_KIND });
    assert.deepEqual({ ...presentationFor(n), shouldSetBadge: false }, presentationForAny(n, CONTEXTS[0]));
  });

  test('anything else is a banner with sound', () => {
    for (const ctx of CONTEXTS) {
      assert.deepEqual(presentationForAny(incoming('other', { kind: 'workoutReminder' }), ctx), BANNER_SOUND, 'not ours: no app tag');
      assert.deepEqual(presentationForAny(incoming('other', { app: 'et', kind: 'formReady' }), ctx), BANNER_SOUND, 'an unknown kind');
      assert.deepEqual(presentationForAny(incoming('other', null), ctx), BANNER_SOUND);
      assert.deepEqual(presentationForAny(incoming('other', undefined), ctx), BANNER_SOUND);
    }
  });

  test('no notification ever sets a badge', () => {
    const all = [
      incoming('a', data('workoutReminder')),
      incoming('b', data('missedWorkout')),
      incoming('c', data('weeklySummary')),
      incoming(REST_ALARM_ID, { kind: REST_ALARM_KIND }),
      incoming('d', { kind: 'other' }),
      incoming('e', null),
    ];
    for (const n of all) for (const ctx of CONTEXTS) assert.equal(presentationForAny(n, ctx).shouldSetBadge, false);
  });

  test('each answer is a fresh object, so a caller changing one cannot change the next', () => {
    const a = presentationForAny(incoming('a', data('weeklySummary')), CONTEXTS[0]);
    a.shouldPlaySound = true;
    assert.equal(presentationForAny(incoming('a', data('weeklySummary')), CONTEXTS[0]).shouldPlaySound, false);
  });
});
