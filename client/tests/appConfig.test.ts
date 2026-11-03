import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { appVariant, DEV_NAME, withVariant } from '../app.config';

// The native settings G4.1 decided (app.json, app.config.ts, eas.json). A change here needs a new
// EAS build, so the test makes it a deliberate one.
const read = (file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const app = read('app.json').expo;
const eas = read('eas.json');
const plugin = (name: string) => {
  const entry = app.plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(entry) ? entry[1] : entry;
};

describe('app variants', () => {
  test('unset means development; anything unknown is refused', () => {
    assert.equal(appVariant(undefined), 'development');
    assert.equal(appVariant(''), 'development');
    assert.equal(appVariant('development'), 'development');
    assert.equal(appVariant('production'), 'production');
    assert.throws(() => appVariant('prod'));
  });

  test('the development build is its own app; production is app.json unchanged', () => {
    const dev = withVariant(app, 'development');
    assert.equal(dev.name, DEV_NAME);
    assert.equal(dev.ios?.bundleIdentifier, 'com.gavynnygren.exercisetracker.dev');
    assert.equal(dev.android?.package, 'com.gavynnygren.exercisetracker.dev');
    assert.equal(dev.scheme, 'exercisetracker-dev');
    assert.equal(dev.ios?.usesAppleSignIn, true, 'the rest of the iOS config carries over');
    assert.equal(withVariant(app, 'production'), app);
    assert.equal(app.ios.bundleIdentifier, 'com.gavynnygren.exercisetracker');
  });

  test('every build profile names its variant', () => {
    assert.equal(eas.build.development.env.APP_VARIANT, 'development');
    assert.equal(eas.build.development.developmentClient, true);
    assert.equal(eas.build.development.distribution, 'internal');
    assert.equal(eas.build.preview.env.APP_VARIANT, 'production');
    assert.equal(eas.build.production.env.APP_VARIANT, 'production');
    assert.equal(eas.cli.appVersionSource, 'remote');
  });
});

describe('native settings', () => {
  test('iOS 17 or later (spec 1)', () => {
    assert.equal(app.ios.deploymentTarget, '17.0');
  });

  test('the Face ID prompt says why, in the owner-approved words', () => {
    assert.equal(plugin('expo-local-authentication').faceIDPermission, 'Face ID unlocks the app when the app lock is on. The app never sees your face.');
  });

  test('notifications are local only, so no push entitlement (spec 2.11)', () => {
    assert.equal(plugin('expo-notifications').enableRemoteNotifications, false);
    assert.equal(eas.cli.promptToConfigurePushNotifications, false);
  });

  test('exempt encryption only, and the dev menu stays out of the way', () => {
    assert.equal(app.ios.config.usesNonExemptEncryption, false);
    assert.deepEqual(plugin('expo-dev-client'), { toolsButton: false, showMenuAtLaunch: false });
  });
});
