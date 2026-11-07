import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

// The root layout can't load under Node (it's React Native), so these read its source.
const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');

/** Each `<Stack.Protected guard={…}>` group in the root layout: its guard and the routes inside. */
const groups = [...layout.matchAll(/<Stack\.Protected guard=\{([^}]*)\}>([\s\S]*?)<\/Stack\.Protected>/g)].map((m) => ({
  guard: m[1],
  routes: [...m[2].matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((r) => r[1]),
}));

describe('root layout', () => {
  test('developer screens open only in development builds, not from a link in the real app', () => {
    const devRoutes = readdirSync(new URL('../src/app/dev', import.meta.url)).map((f) => `dev/${f.replace(/\.tsx$/, '')}`);
    assert.ok(devRoutes.length >= 2, devRoutes.join(', '));
    for (const route of devRoutes) {
      const group = groups.find((g) => g.routes.includes(route));
      assert.ok(group, `${route} isn't registered in a Stack.Protected group`);
      assert.match(group.guard, /__DEV__/, `${route}'s guard (${group.guard}) must include __DEV__`);
      assert.match(group.guard, /auth\.signedIn && auth\.onboarded/, `${route} is still for signed-in, onboarded users`);
    }
  });

  test('every other screen keeps its guard', () => {
    const app = groups.find((g) => g.routes.includes('(tabs)'));
    assert.ok(app && !app.guard.includes('__DEV__'));
    assert.ok(app.routes.includes('workout/index') && app.routes.includes('notifications-permission'));
  });

  test('a screen that throws shows an error screen with Try again instead of closing the app', () => {
    assert.match(layout, /export function ErrorBoundary\(\{ retry \}: ErrorBoundaryProps\)/);
    assert.match(layout, /<ErrorState\b[^>]*onRetry=/);
  });
});
