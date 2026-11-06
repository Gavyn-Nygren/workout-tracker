import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

// A sheet whose ScrollView sits inside a wrapping View draws blank in the native build on iOS 26
// (react-native-screens 4.30), though it works in Expo Go, so no other test would notice. The
// ScrollView must be the screen's top view; a fragment with a ToastViewport beside it is fine.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Routes registered as sheets in the root layout: `<Stack.Screen name="…" options={sheet(…)} />`. */
const sheetRoutes = [...read('src/app/_layout.tsx').matchAll(/name="([^"]+)"\s+options=\{sheet\(/g)].map((m) => m[1]);

const routeFile = (name: string) => [`src/app/${name}.tsx`, `src/app/${name}/index.tsx`].find((p) => existsSync(new URL(`../${p}`, import.meta.url)));

/** A `return (` whose first element is a View, whose first child is a ScrollView (comments skipped). */
const WRAPPED_SCROLL = /return \(\s*(?:\/\/[^\n]*\n\s*|\{\/\*[\s\S]*?\*\/\}\s*)*<View\b(?:=>|[^>])*>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*<ScrollView\b/;

describe('sheet layout', () => {
  test('the root layout registers the sheets', () => {
    assert.ok(sheetRoutes.length >= 8, `found ${sheetRoutes.join(', ')}`);
    assert.ok(sheetRoutes.includes('notifications-permission') && sheetRoutes.includes('log-weight'));
  });

  test('no sheet wraps its ScrollView in a View', () => {
    for (const name of sheetRoutes) {
      const file = routeFile(name);
      assert.ok(file, `no screen file for the "${name}" sheet`);
      assert.doesNotMatch(read(file), WRAPPED_SCROLL, `${file}: make the ScrollView the top view (see sheet() in _layout.tsx)`);
    }
  });

  test('the check catches the layout that drew blank', () => {
    const blank = `return (
    // Scrolls, so Save stays reachable at large text sizes.
    <View style={[styles.fill, { backgroundColor: colors.cardElevated }]} onAccessibilityEscape={() => router.back()}>
      {/* note */}
      <ScrollView contentContainerStyle={styles.screen}>`;
    const fine = `return (
    <>
      <ScrollView style={{ backgroundColor: colors.cardElevated }} onAccessibilityEscape={() => router.back()}>
        <View style={styles.header}>`;
    assert.match(blank, WRAPPED_SCROLL);
    assert.doesNotMatch(fine, WRAPPED_SCROLL);
  });
});
