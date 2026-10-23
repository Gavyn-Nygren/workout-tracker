import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One shared reading of the setting for the whole app. Set rows and cards each use this hook,
// so a per-component subscription would mean dozens of listeners in a long workout.
let reduced = false;
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    reduced = value;
    listeners.forEach((l) => l());
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    reduced = value;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the user has turned on Reduce Motion; skip non-essential animation then. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduced);
}
