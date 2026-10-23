import type { RefObject } from 'react';
import { AccessibilityInfo, type TextInputInstance } from 'react-native';

import { TextField } from '@/components/ui';

/** TextField forwards `ref` to its input; kept as an alias so the auth screens read clearly. */
export const TextFieldWithRef = TextField;

type FieldCheck = { error?: string; ref?: RefObject<TextInputInstance | null> };

/**
 * On a submit with errors, moves VoiceOver to the first invalid field (its label includes the
 * error) and reads the remaining errors after it. Returns true when there were errors.
 * Does nothing visible, so sighted users don't get a keyboard popping up.
 */
export function reportFormErrors(fields: FieldCheck[]): boolean {
  const invalid = fields.filter((f): f is FieldCheck & { error: string } => !!f.error);
  if (!invalid.length) return false;
  const target = invalid.find((f) => f.ref?.current);
  const rest = invalid.filter((f) => f !== target);
  // Wait a beat so the field has re-rendered with its error before VoiceOver reads it.
  setTimeout(() => {
    if (target?.ref?.current) AccessibilityInfo.sendAccessibilityEvent(target.ref.current, 'focus');
    if (rest.length) AccessibilityInfo.announceForAccessibilityWithOptions(rest.map((f) => f.error).join(' '), { queue: true });
  }, 150);
  return true;
}
