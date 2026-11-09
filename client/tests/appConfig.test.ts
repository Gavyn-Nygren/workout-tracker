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

  test("linked to the owner's EAS project, so builds and credentials stay on one account", () => {
    assert.equal(app.owner, 'gavyn17');
    assert.equal(app.extra.eas.projectId, 'b6da9cab-c7e9-420a-84cf-f016dfc25da8');
    assert.equal(app.extra.router, undefined, 'the router plugin adds its own defaults; app.json keeps none');
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

describe('camera stack (G4.2)', () => {
  const pkg = read('package.json');
  const formPose = JSON.parse(readFileSync(new URL('../modules/form-pose/package.json', import.meta.url), 'utf8'));
  const podspec = readFileSync(new URL('../modules/form-pose/FormPose.podspec', import.meta.url), 'utf8');

  test("the camera prompt says why, in the owner's words, and there's no microphone prompt (no sound)", () => {
    assert.equal(app.ios.infoPlist.NSCameraUsageDescription, 'The camera records your sets so the app can check your form. Videos stay on this phone.');
    assert.equal(app.ios.infoPlist.NSMicrophoneUsageDescription, undefined);
  });

  test('VisionCamera 5 with its Nitro and worklets packages, pinned exactly', () => {
    for (const name of ['react-native-vision-camera', 'react-native-vision-camera-worklets', 'react-native-nitro-modules', 'react-native-nitro-image']) {
      assert.match(pkg.dependencies[name], /^\d+\.\d+\.\d+$/, `${name} is pinned`);
    }
    assert.match(pkg.dependencies['react-native-vision-camera'], /^5\./);
    // 0.37.2 fixed a launch crash on iOS 17 for apps built with Xcode 27 (EAS's SDK 58 image).
    const [major, minor, patch] = pkg.dependencies['react-native-nitro-modules'].split('.').map(Number);
    assert.ok(major > 0 || minor > 37 || (minor === 37 && patch >= 2), 'Nitro 0.37.2 or later');
    assert.equal(pkg.devDependencies.nitrogen, pkg.dependencies['react-native-nitro-modules'], 'nitrogen matches Nitro');
  });

  test('Reanimated and Worklets build from source, the same on EAS as on the GitHub compile check', () => {
    assert.deepEqual(pkg.expo.autolinking.ios.buildFromSource, ['react-native-reanimated', 'react-native-worklets']);
  });

  test('the pose plugin is a private local module with MediaPipe pinned to the last CocoaPods release', () => {
    assert.equal(formPose.private, true);
    assert.match(podspec, /s\.dependency "MediaPipeTasksVision", "1\.0\.0"/);
    assert.match(podspec, /:ios => "17\.0"/);
    assert.match(podspec, /"FormPoseModels" => \["ios\/models\/\*\.task"\]/);
    for (const model of ['lite', 'full', 'heavy']) {
      assert.ok(readFileSync(new URL(`../modules/form-pose/ios/models/pose_landmarker_${model}.task`, import.meta.url)).length > 1_000_000, `${model} model is bundled`);
    }
  });
});
