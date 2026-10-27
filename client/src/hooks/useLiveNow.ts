import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useNow } from './useNow';

// When the app last came back to the foreground. One shared AppState subscription serves every
// countdown, like useReducedMotion's shared reading.
let foregroundAt = 0;
const listeners = new Set<() => void>();
let started = false;

function subscribe(listener: () => void) {
  if (!started) {
    started = true;
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      foregroundAt = Date.now();
      listeners.forEach((l) => l());
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * useNow for countdowns: also refreshed the moment the app returns to the foreground, so a
 * countdown never shows the time from before the phone was locked (JS timers stop meanwhile).
 */
export function useLiveNow(intervalMs = 1000, active = true): number {
  const now = useNow(intervalMs, active);
  const resumedAt = useSyncExternalStore(subscribe, () => foregroundAt);
  return Math.max(now, resumedAt);
}
