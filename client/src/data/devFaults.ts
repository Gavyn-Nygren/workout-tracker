import { useSyncExternalStore } from 'react';

import type { DataRepository } from './repository';

/**
 * Developer switches for seeing loading and error states on the phone. The fake repository answers
 * instantly and never fails, so without these the states can't be checked. Profile → Developer
 * → Component gallery has the controls. Not saved: a restart turns them off.
 */
export type DevFaults = {
  /** Extra wait before every read and write, in ms. */
  delayMs: number;
  /** Every read fails while on. */
  failReads: boolean;
  /** Every save and delete fails while on. */
  failWrites: boolean;
};

let faults: DevFaults = { delayMs: 0, failReads: false, failWrites: false };
const listeners = new Set<() => void>();

export const devFaults = {
  get: () => faults,
  set: (patch: Partial<DevFaults>) => {
    faults = { ...faults, ...patch };
    listeners.forEach((l) => l());
  },
  use: () =>
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => faults,
    ),
};

const isWrite = (name: string) => /^(save|delete|update)/.test(name);

/** Wraps every repository call with the current dev faults. */
export function withDevFaults(repo: DataRepository): DataRepository {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function' || prop === 'today') return original;
      const name = String(prop);
      return async (...args: unknown[]) => {
        const { delayMs, failReads, failWrites } = faults;
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        if (isWrite(name) ? failWrites : failReads) {
          throw new Error(`Simulated ${isWrite(name) ? 'write' : 'read'} failure (${name})`);
        }
        return (original as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
