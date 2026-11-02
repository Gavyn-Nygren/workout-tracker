import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { migrate } from '../src/data/db/schema';
import { eraseAllData } from '../src/data/db/sampleData';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { cleanNotifications, defaultPreferences, isNotificationToggle, isTimeOfDay, NOTIFICATION_TOGGLES, withPreferenceDefaults } from '../src/data/preferences';
import type { Preferences } from '../src/data/types';
import { openTestDatabase } from './support/nodeSqlite';

type Notifications = Preferences['notifications'];
const defaults = defaultPreferences.notifications;

/** Notification settings as a bad save might have left them, loaded the way the app loads them. */
function loaded(notifications: unknown): Notifications {
  return withPreferenceDefaults({ ...defaultPreferences, notifications: notifications as Notifications }).notifications;
}

describe('notification settings are cleaned on load', () => {
  test('good settings load as saved, quiet hours included', () => {
    const saved: Notifications = {
      workoutReminders: true,
      restTimer: true,
      missedWorkout: false,
      weeklySummary: true,
      formAnalysisComplete: false,
      reminderTime: '06:45',
      weeklySummaryAt: { weekday: 1, time: '08:00' },
      quietHours: { start: '22:00', end: '07:00' },
    };
    assert.deepEqual(loaded(saved), saved);
    assert.deepEqual(loaded(defaults), defaults);
    assert.equal('quietHours' in loaded(defaults), false, 'off stays left out, not undefined');
  });

  test('quiet hours with the same start and end are kept: the scheduler reads them as none', () => {
    assert.deepEqual(loaded({ ...defaults, quietHours: { start: '22:00', end: '22:00' } }).quietHours, { start: '22:00', end: '22:00' });
  });

  test('saved before these settings, or not an object: the defaults', () => {
    const { notifications: _none, ...older } = defaultPreferences;
    assert.deepEqual(withPreferenceDefaults(older).notifications, defaults);
    for (const junk of [null, undefined, 5, 'on', true, ['restTimer']]) assert.deepEqual(loaded(junk), defaults, String(junk));
    assert.equal(withPreferenceDefaults(null), defaultPreferences);
  });

  test('a setting missing from an older save gets its default, the rest are kept', () => {
    const { formAnalysisComplete: _a, weeklySummaryAt: _b, ...older } = { ...defaults, workoutReminders: true, reminderTime: '18:30' };
    assert.deepEqual(loaded(older), { ...defaults, workoutReminders: true, reminderTime: '18:30' });
  });

  test('a toggle that is not true or false is off (its default)', () => {
    const got = loaded({ ...defaults, workoutReminders: 'yes', restTimer: 1, missedWorkout: null, weeklySummary: {}, formAnalysisComplete: true });
    assert.deepEqual(
      NOTIFICATION_TOGGLES.map((k) => got[k]),
      [false, false, false, false, true],
    );
  });

  test('?key=reminderTime saved true into the time: it loads as the default time, so Settings opens', () => {
    const got = loaded({ ...defaults, workoutReminders: true, reminderTime: true });
    assert.equal(got.reminderTime, '17:00');
    assert.equal(got.workoutReminders, true);
    // What crashed Profile > Notifications (useSettings.ts timeToDate): time.split.
    assert.deepEqual(got.reminderTime.split(':').map(Number), [17, 0]);
  });

  test('the same for ?key=weeklySummaryAt and ?key=quietHours', () => {
    assert.deepEqual(loaded({ ...defaults, weeklySummaryAt: true }).weeklySummaryAt, { weekday: 7, time: '19:00' });
    const quiet = loaded({ ...defaults, quietHours: true });
    assert.equal('quietHours' in quiet, false);
  });

  test('a reminder time that is not "HH:MM" is the default', () => {
    for (const bad of ['7:00', '24:00', '12:60', '17:00:00', ' 17:00', '', 'noon', 1700, null, undefined]) {
      assert.equal(loaded({ ...defaults, reminderTime: bad }).reminderTime, '17:00', String(bad));
    }
    assert.equal(loaded({ ...defaults, reminderTime: '00:00' }).reminderTime, '00:00');
    assert.equal(loaded({ ...defaults, reminderTime: '23:55' }).reminderTime, '23:55');
  });

  test("the summary's day and time are checked one by one", () => {
    const at = (weeklySummaryAt: unknown) => loaded({ ...defaults, weeklySummaryAt }).weeklySummaryAt;
    for (const weekday of [0, 8, -1, 1.5, '7', null, Number.NaN]) assert.deepEqual(at({ weekday, time: '08:00' }), { weekday: 7, time: '08:00' }, String(weekday));
    assert.deepEqual(at({ weekday: 1, time: '8:00' }), { weekday: 1, time: '19:00' });
    assert.deepEqual(at({ weekday: 1 }), { weekday: 1, time: '19:00' });
    assert.deepEqual(at({ weekday: 3, time: '20:15' }), { weekday: 3, time: '20:15' }, 'any ISO weekday 1-7 is kept');
    for (const junk of [null, 'sunday', 7, []]) assert.deepEqual(at(junk), { weekday: 7, time: '19:00' }, String(junk));
  });

  test('broken quiet hours are off', () => {
    for (const quietHours of [null, 'night', 22, [], {}, { start: '22:00' }, { end: '07:00' }, { start: '22:00', end: true }, { start: '25:00', end: '07:00' }, { start: '22:00', end: '7:00' }]) {
      const got = loaded({ ...defaults, quietHours });
      assert.equal('quietHours' in got, false, JSON.stringify(quietHours));
    }
  });

  test('settings nobody knows are dropped, and nothing extra is kept', () => {
    const got = loaded({ ...defaults, foo: true, quietHours: { start: '21:00', end: '06:00', extra: 1 } });
    assert.deepEqual(got, { ...defaults, quietHours: { start: '21:00', end: '06:00' } });
  });

  test('cleaning never changes the defaults', () => {
    const before = JSON.stringify(defaults);
    const got = cleanNotifications(undefined);
    got.weeklySummaryAt.weekday = 1;
    got.workoutReminders = true;
    assert.equal(JSON.stringify(defaultPreferences.notifications), before);
  });

  test('the database load cleans a bad saved row', async () => {
    const db = openTestDatabase();
    migrate(db);
    eraseAllData(db);
    const repo = createSqliteRepository(db, { today: () => '2026-11-02' });
    const bad = { ...defaultPreferences, notifications: { ...defaults, workoutReminders: true, reminderTime: true, quietHours: { start: true } } };
    db.runSync('INSERT INTO preferences (id, data, updated_at) VALUES (?, ?, ?)', ['me', JSON.stringify(bad), '2026-11-02']);
    assert.deepEqual((await repo.getPreferences()).notifications, { ...defaults, workoutReminders: true });
    db.close();
  });
});

describe('which keys the permission sheet may turn on', () => {
  test('only the five toggles', () => {
    for (const key of ['workoutReminders', 'restTimer', 'missedWorkout', 'weeklySummary', 'formAnalysisComplete']) assert.equal(isNotificationToggle(key), true, key);
    for (const key of ['reminderTime', 'weeklySummaryAt', 'quietHours', 'toString', '__proto__', '', 'RESTTIMER', undefined, null, 1, ['restTimer']]) {
      assert.equal(isNotificationToggle(key), false, String(key));
    }
  });

  test('a time of day is 24-hour "HH:MM"', () => {
    assert.deepEqual(['00:00', '09:05', '19:00', '23:59'].map(isTimeOfDay), [true, true, true, true]);
    assert.deepEqual(['9:05', '24:00', '19:60', '19:0', 'ab:cd', 900].map(isTimeOfDay), [false, false, false, false, false, false]);
  });
});
