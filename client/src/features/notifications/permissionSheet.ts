/**
 * The notification permission sheet's ways out, guarded so the sheet closes once (spec 2.11).
 * A second tap on "Turn on" while iOS is asking does nothing. An answer that comes after the sheet
 * closed some other way (Not now, a swipe down, the VoiceOver escape) still counts, but doesn't
 * close it again: a second router.back() would pop the screen underneath, such as the workout.
 */
export type AskSteps<A> = {
  request: () => Promise<A>;
  /** Runs when the ask begins (not for an ignored tap). */
  started?: () => void;
  answered: (answer: A) => void;
  failed: () => void;
  /** Closes the sheet; skipped when it's already closed. */
  exit: () => void;
};

export type PermissionSheetGuard = {
  /** Asks once, then closes the sheet unless it's already closed. */
  allow<A>(steps: AskSteps<A>): Promise<void>;
  /** Closes the sheet with `exit`, once. */
  close(exit: () => void): void;
  /**
   * For an effect: the sheet is showing until the returned cleanup runs. A swipe down unmounts it
   * without close(), and after that a late answer mustn't close anything.
   */
  showing(): () => void;
};

export function permissionSheetGuard(): PermissionSheetGuard {
  let asking = false;
  let closed = false;
  const close = (exit: () => void) => {
    if (closed) return;
    closed = true;
    exit();
  };
  async function allow<A>({ request, started, answered, failed, exit }: AskSteps<A>) {
    if (asking || closed) return;
    asking = true;
    started?.();
    let answer: A;
    try {
      answer = await request();
    } catch {
      failed();
      close(exit);
      return;
    }
    answered(answer);
    close(exit);
  }
  return {
    allow,
    close,
    showing: () => {
      closed = false;
      return () => {
        closed = true;
      };
    },
  };
}
