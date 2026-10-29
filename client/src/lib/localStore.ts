import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/** Each store made so far, by key, to put back to its fallback (resetLocalStores). */
const resets = new Map<string, () => void>();

/**
 * Small persisted store for on-device UI state (the Progress range, sign-in state). Values live in
 * SQLite's key-value table and every subscriber re-renders on change.
 */
export function createLocalStore<T>(key: string, fallback: T) {
  let value: T = fallback;
  try {
    const raw = Storage.getItemSync(key);
    if (raw) value = JSON.parse(raw) as T;
  } catch {
    // Unreadable or missing: start from the fallback.
  }
  const listeners = new Set<() => void>();

  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    try {
      Storage.setItemSync(key, JSON.stringify(value));
    } catch {
      // Non-fatal: the change still applies until the app restarts.
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  resets.set(key, () => set(fallback));

  return {
    get: () => value,
    set,
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}

/**
 * Puts these stores back to their fallbacks: a store already made changes at once, and one not
 * made yet (its screen not opened since launch) starts from its fallback.
 */
export function resetLocalStores(keys: readonly string[]): void {
  for (const key of keys) {
    const reset = resets.get(key);
    if (reset) {
      reset();
      continue;
    }
    try {
      Storage.removeItemSync(key);
    } catch {
      // Non-fatal: the value stays until it's next changed.
    }
  }
}
