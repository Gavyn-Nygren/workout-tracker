import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/**
 * Small persisted store for on-device UI preferences (pinned exercises, saved graphs). Values
 * live in SQLite's key-value table and every subscriber re-renders on change.
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

  return {
    get: () => value,
    set,
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}
