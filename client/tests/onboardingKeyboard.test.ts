import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

// Onboarding's bodyweight and height steps use the number pads, which have no return key, so the
// footer's Continue and Skip must stay above the keyboard. The screen can't load under Node (it's
// React Native), so this reads its source.
const source = readFileSync(new URL('../src/app/onboarding.tsx', import.meta.url), 'utf8');

describe('onboarding with the keyboard up', () => {
  test('the ScrollView and the Continue / Skip footer both sit in a KeyboardAvoidingView', () => {
    const avoiding = /<KeyboardAvoidingView\b[^>]*behavior="padding"[^>]*>([\s\S]*?)<\/KeyboardAvoidingView>/.exec(source);
    assert.ok(avoiding, 'no KeyboardAvoidingView with behavior="padding"');
    const inside = avoiding[1];
    assert.match(inside, /<ScrollView\b/);
    assert.match(inside, /<View style=\{styles\.footer\}>[\s\S]*title="Continue"[\s\S]*title="Skip"/);
  });

  test("the ScrollView adds no keyboard inset of its own, since it's already above the keyboard", () => {
    // Its inset is worked out before the view shrinks, so it would leave blank space to scroll into.
    assert.doesNotMatch(source, /automaticallyAdjustKeyboardInsets/);
  });
});
