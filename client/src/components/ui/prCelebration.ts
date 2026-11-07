// What a PR badge does when it appears. Pure, so tests can run it.

/** How recently a set must have been completed for its badge to celebrate. */
export const JUST_COMPLETED_MS = 2000;

type Input = {
  /** The badge is somewhere a PR was just set (set completion), not a history list. */
  celebrate: boolean;
  /** Settings → Workout defaults → PR celebrations. */
  celebrations: boolean;
  /** When the set was completed; a badge that appears from an edit or on opening stays quiet. */
  completedAt?: string;
  now: number;
  reducedMotion: boolean;
};

/**
 * The success haptic and the pop-in, only for a PR set moments ago and only with PR celebrations
 * on (spec 2.13). Reduce Motion keeps the haptic and drops the animation.
 */
export function badgeCelebration({ celebrate, celebrations, completedAt, now, reducedMotion }: Input): { haptic: boolean; animate: boolean } {
  const justCompleted = !completedAt || now - Date.parse(completedAt) < JUST_COMPLETED_MS;
  const on = celebrate && celebrations && justCompleted;
  return { haptic: on, animate: on && !reducedMotion };
}
