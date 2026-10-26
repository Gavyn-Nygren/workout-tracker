import { useEffect, useState } from 'react';

import { TextField } from '@/components/ui';
import { parseTempo } from '@/data/logging';

const HINT = 'Down, pause, up, pause in seconds, like 3-1-1-0. X means explosive.';

type Props = {
  value: string | undefined;
  /** Called with the normalized tempo ("3-1-1-0"), or undefined when cleared. */
  onChange: (tempo: string | undefined) => void;
};

/**
 * Tempo input (spec 2.6). Typing "3110" or "3 1 1 0" saves "3-1-1-0"; anything else isn't saved,
 * and the field explains the format once you leave it.
 */
export function TempoField({ value, onChange }: Props) {
  const [text, setText] = useState(value ?? '');
  const [showError, setShowError] = useState(false);

  // Follow changes from elsewhere (e.g. another set's shared tempo) without fighting the typing.
  useEffect(() => {
    const typed = parseTempo(text);
    if ((typed.ok ? typed.tempo : undefined) !== value) setText(value ?? '');
    // Only react to the stored value changing, not to each keystroke.
  }, [value]);

  const parsed = parseTempo(text);
  return (
    <TextField
      label="Tempo"
      value={text}
      onChangeText={(next) => {
        setText(next);
        const result = parseTempo(next);
        if (result.ok) {
          setShowError(false);
          onChange(result.tempo);
        }
      }}
      onBlur={() => {
        if (parsed.ok && parsed.tempo) setText(parsed.tempo);
        setShowError(!parsed.ok);
      }}
      placeholder="e.g. 3-1-1-0"
      autoCapitalize="characters"
      autoCorrect={false}
      hint={HINT}
      error={showError ? 'Use four numbers like 3-1-1-0, or X for explosive.' : undefined}
    />
  );
}
