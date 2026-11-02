import { useSyncExternalStore } from 'react';

// Today's selected day is the screen's own state, not a route param, so code elsewhere (a tapped
// workout reminder or missed-workout prompt) asks for today through this store instead.
let nonce = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getNonce = () => nonce;

/** Asks the Today tab to select today's date. Navigating there is up to the caller. */
export function requestTodayFocus(): void {
  nonce++;
  for (const listener of [...listeners]) listener();
}

/** Goes up by one on every requestTodayFocus(); Today selects today when it changes. */
export function useTodayFocusNonce(): number {
  return useSyncExternalStore(subscribe, getNonce);
}
