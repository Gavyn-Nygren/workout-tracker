// When NotificationSync's runs start (G3.12). Pure (no React Native or Expo imports), so the timing
// is tested in Node with mock timers (tests/notificationSyncTimer.test.ts).
//
// Writes come in bursts, so a run waits for a quiet moment after the newest trigger, but never
// longer than MAX_WAIT_MS after the first one still waiting. Leaving the app doesn't wait at all:
// JS timers stop once iOS suspends the app, so a run still waiting then would leave iOS with the
// old reminders until the next open (a workout skipped, then the phone locked at once). The same
// reason ActiveWorkoutProvider saves its pending autosave on leaving.

/** Quiet time after the last trigger before a run. */
export const DEBOUNCE_MS = 1000;
/** Longer while a workout is open, where every logged set autosaves. */
export const WORKOUT_DEBOUNCE_MS = 3000;
/** However busy the triggers, a run starts at most this long after the first one waiting. */
export const MAX_WAIT_MS = 10_000;

/** iOS's app states that mean the app is leaving (or has left) the foreground. */
export function leftForeground(state: string | null | undefined): boolean {
  return state === 'background' || state === 'inactive';
}

export type SyncTimer = {
  /** Something changed: a run after the debounce, or at once while the app is away. */
  trigger(o: { workoutOpen: boolean; away: boolean }): void;
  /** The app is leaving the foreground: a run still waiting starts now. Nothing waiting, nothing runs. */
  flush(): void;
  /** Drops a run still waiting (the inputs aren't complete any more, or the component unmounted). */
  cancel(): void;
};

/**
 * `request` starts a run (NotificationSync: the single-flight queue's request). `now` is read at
 * each trigger; setTimeout and clearTimeout are the globals at call time, so mock timers work.
 */
export function createSyncTimer(request: () => void, now: () => number = () => Date.now()): SyncTimer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** When the oldest trigger still waiting for a run came in. */
  let waitingSince: number | null = null;

  const stop = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  const run = () => {
    stop();
    waitingSince = null;
    request();
  };

  return {
    trigger({ workoutOpen, away }) {
      stop();
      if (away) {
        run();
        return;
      }
      const t = now();
      waitingSince ??= t;
      const debounce = workoutOpen ? WORKOUT_DEBOUNCE_MS : DEBOUNCE_MS;
      timer = setTimeout(run, Math.max(0, Math.min(debounce, waitingSince + MAX_WAIT_MS - t)));
    },
    flush() {
      if (timer !== null) run();
    },
    cancel() {
      stop();
      waitingSince = null;
    },
  };
}
