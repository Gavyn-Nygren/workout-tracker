// A version number that goes up after every repository write, for code that has to follow the data
// without going through the query hooks: the notification sync (G3.12). The hooks and invalidation.ts
// miss the active workout's autosave, which calls repo.saveSession directly, so the feed wraps the
// repository itself. Kept free of React so it can be unit-tested (tests/writeFeed.test.ts).
import { WRITE_NAME } from './invalidation';

import type { DataRepository } from './repository';

export type WriteFeed = {
  /** The repository to hand out: writes bump the version once they settle; `today` and reads are the originals. */
  repository: DataRepository;
  /** Calls the listener after every bump. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Starts at 0 and goes up by one per bump. */
  getVersion(): number;
  /**
   * Bumps by hand, for changes made beside the repository: Erase all data and Load sample data
   * rewrite the database directly (DataProvider's reload).
   */
  bump(): void;
};

/**
 * Wraps the repository so every write (a method named like WRITE_NAME in invalidation.ts) bumps the
 * feed when it settles, failed or not: a failed write may still have changed something, and an extra
 * bump only costs a resync. The write's result and rejection pass through unchanged. `today` and
 * every read are returned as they are, never wrapped as async, so repo.today() stays a string.
 */
export function withWriteFeed(repo: DataRepository): WriteFeed {
  let version = 0;
  const listeners = new Set<() => void>();
  const bump = () => {
    version++;
    // A copy, so a listener that unsubscribes (or subscribes another) doesn't change this round.
    for (const listener of [...listeners]) listener();
  };

  // One wrapper per original method, so reading `repository.saveSession` twice gives the same function.
  const wrapped = new WeakMap<object, (...args: unknown[]) => Promise<unknown>>();

  const repository = new Proxy(repo, {
    get(target, prop, receiver) {
      const original: unknown = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function' || typeof prop !== 'string' || prop === 'today' || !WRITE_NAME.test(prop)) return original;
      const write = original as (...args: unknown[]) => unknown;
      let wrapper = wrapped.get(write);
      if (!wrapper) {
        wrapper = async (...args: unknown[]) => {
          try {
            return await write.apply(target, args);
          } finally {
            bump();
          }
        };
        wrapped.set(write, wrapper);
      }
      return wrapper;
    },
  });

  return {
    repository,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion: () => version,
    bump,
  };
}
