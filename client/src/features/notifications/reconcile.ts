// Bringing iOS's pending notifications in line with the plan (G3.12). Pure, so the diff and the
// run queue are tested in Node (tests/notificationReconcile.test.ts); runSync.ts calls them.
//
// - Ours are recognised by their content data only (app 'et', this install's owner id, data.nid),
//   never by parsing identifiers: Expo Go rewrites them per project, iOS also lists other
//   projects' requests, and requests left under an old Expo Go scope carry the same tag.
// - The Developer previews ('preview.<kind>'), the rest alarm and everything that isn't ours are
//   left out, so nothing here can cancel them.
// - There's no memory of what was applied: every run diffs against what iOS says is pending.
import { MIN_LEAD_MS } from './notificationPlan';
import { NOTIFICATION_APP, PREVIEW_PREFIX, type PendingRequest, type PlannedNotification } from './types';

/** One of our pending requests: its nid, the key it was scheduled with, and when it fires. */
export type OwnPending = { nid: string; key: string; fireAt: number };

/** Our pending requests: app 'et', this install's owner, a nid that isn't a preview's. */
export function ownRequests(all: PendingRequest[], owner: string): OwnPending[] {
  return all.flatMap((request): OwnPending[] => {
    const data = request?.data;
    if (!data || typeof data !== 'object') return [];
    if (data.app !== NOTIFICATION_APP || data.owner !== owner) return [];
    const { nid } = data;
    if (typeof nid !== 'string' || !nid || nid.startsWith(PREVIEW_PREFIX)) return [];
    // A request without a readable key never matches a plan, so it gets replaced.
    return [{ nid, key: typeof data.key === 'string' ? data.key : '', fireAt: typeof data.fireAt === 'number' ? data.fireAt : Number.NaN }];
  });
}

/**
 * What to change so the pending set matches the plan:
 * - cancel ours that aren't planned any more;
 * - schedule planned items that are missing or whose key differs (the same identifier replaces
 *   the pending one), but only when they're at least MIN_LEAD_MS away, since iOS rejects a
 *   trigger that has passed by the time it gets there.
 * A pending item that's still wanted is never cancelled for being close: if its text changed but
 * it's under MIN_LEAD_MS away, the pending copy is kept and rings as it is.
 */
export function diffPending(own: OwnPending[], planned: PlannedNotification[], nowMs: number): { cancel: string[]; schedule: PlannedNotification[] } {
  const wanted = new Set(planned.map((n) => n.nid));
  const keysByNid = new Map<string, Set<string>>();
  for (const p of own) {
    const keys = keysByNid.get(p.nid) ?? new Set<string>();
    keys.add(p.key);
    keysByNid.set(p.nid, keys);
  }

  const cancel = [...keysByNid.keys()].filter((nid) => !wanted.has(nid));
  const schedule = planned.filter((n) => {
    if (keysByNid.get(n.nid)?.has(n.data.key)) return false;
    return n.fireAtMs - nowMs >= MIN_LEAD_MS;
  });
  return { cancel, schedule };
}

/**
 * Runs `run` one at a time. A request while a run is going marks it dirty, which causes exactly
 * one more run once it ends, however many requests came in: so the last plan applied always comes
 * from the newest reads. Errors are swallowed (the next request tries again). `idle()` resolves
 * once nothing is running or waiting to rerun.
 */
export function createSyncQueue(run: () => Promise<unknown>): { request(): void; idle(): Promise<void> } {
  let running: Promise<void> | null = null;
  let dirty = false;

  const loop = async () => {
    try {
      do {
        dirty = false;
        try {
          await run();
        } catch {
          // A failed run changes nothing here; the next request runs again.
        }
      } while (dirty);
    } finally {
      running = null;
    }
  };

  return {
    request() {
      if (running) {
        dirty = true;
        return;
      }
      running = loop();
    },
    idle: () => running ?? Promise.resolve(),
  };
}
