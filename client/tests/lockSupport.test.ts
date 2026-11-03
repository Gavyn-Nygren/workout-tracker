import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { lockSubtitle, lockSupport, lockSwitchDisabled } from '../src/features/settings/lockSupport';

describe('app lock support (spec 2.3)', () => {
  test('Face ID set up and allowed', () => {
    assert.equal(lockSupport({ level: 2, faceIdPhone: true, biometryAllowed: true }), 'faceId');
    assert.equal(lockSupport({ level: 3, faceIdPhone: true, biometryAllowed: true }), 'faceId');
  });

  test('Face ID denied for this app: the passcode still works', () => {
    assert.equal(lockSupport({ level: 1, faceIdPhone: true, biometryAllowed: false }), 'faceIdOff');
  });

  test('a passcode without usable Face ID', () => {
    assert.equal(lockSupport({ level: 1, faceIdPhone: true, biometryAllowed: true }), 'passcode', 'Face ID phone, no face set up');
    assert.equal(lockSupport({ level: 1, faceIdPhone: false, biometryAllowed: false }), 'passcode', 'no Face ID on the phone');
  });

  test('no passcode', () => {
    assert.equal(lockSupport({ level: 0, faceIdPhone: true, biometryAllowed: false }), 'none');
  });

  test('a lock that is on can always be turned off', () => {
    for (const support of ['faceId', 'faceIdOff', 'passcode', 'none', undefined] as const) {
      assert.equal(lockSwitchDisabled(support, true), false, String(support));
    }
    assert.equal(lockSwitchDisabled('none', false), true);
    assert.equal(lockSwitchDisabled('faceIdOff', false), false, 'the passcode can turn it on');
    assert.equal(lockSwitchDisabled(undefined, false), false);
  });

  test('each state says what to do', () => {
    assert.equal(lockSubtitle(undefined), 'Unlock the app with Face ID, or your passcode as a fallback');
    assert.equal(lockSubtitle('faceId'), lockSubtitle(undefined));
    assert.match(lockSubtitle('faceIdOff'), /off for this app in iOS Settings/);
    assert.match(lockSubtitle('passcode'), /^Unlock the app with your passcode\./);
    assert.equal(lockSubtitle('none'), 'Set a passcode in iOS Settings to use this.');
  });
});
