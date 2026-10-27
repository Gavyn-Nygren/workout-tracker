/** Room kept above a row scrolled up into view, so its exercise's name and table header show too. */
export const CONTEXT_ABOVE = 96;
/** Gap kept between a row scrolled down into view and the bar docked at the bottom. */
export const GAP_BELOW = 16;

export type ScrollMetrics = {
  /** The row's top and height in the scroll content. */
  rowTop: number;
  rowHeight: number;
  /** Current scroll offset. */
  scrollY: number;
  /** Height of the scroll view itself. */
  viewportHeight: number;
  /** Height of the scroll content (including its bottom padding). */
  contentHeight: number;
  /**
   * What covers the bottom of the scroll view: the docked bar, and below it the keyboard while
   * it's up, else the home indicator. See `coveredBelow`.
   */
  coveredBelow: number;
  /**
   * The keyboard's height over the scroll view while it's up, else 0. iOS adds it to the content's
   * bottom inset (automaticallyAdjustKeyboardInsets), so the content can scroll that much further.
   */
  keyboardInset?: number;
};

/**
 * What covers the bottom of the scroll view: the docked bar (`barSpace`, its height plus its gap)
 * sitting on the keyboard while it's up, or on the bottom safe area.
 */
export function coveredBelow(input: { safeAreaBottom: number; keyboardHeight: number; barSpace: number }): number {
  return Math.max(input.safeAreaBottom, input.keyboardHeight) + input.barSpace;
}

/**
 * Where to scroll so a set row is in view, or null when it's already fully visible above the
 * docked bar (and the keyboard). A row below the visible area scrolls up just far enough to sit
 * above the bar; a row above it comes down with room for its exercise's header. Never past either
 * end of the content.
 */
export function scrollOffsetToShow(m: ScrollMetrics): number | null {
  const visibleBottom = m.scrollY + m.viewportHeight - m.coveredBelow;
  const rowBottom = m.rowTop + m.rowHeight;
  if (m.rowTop >= m.scrollY && rowBottom <= visibleBottom) return null;
  const target = m.rowTop < m.scrollY ? m.rowTop - CONTEXT_ABOVE : rowBottom - (m.viewportHeight - m.coveredBelow) + GAP_BELOW;
  const max = Math.max(0, m.contentHeight + (m.keyboardInset ?? 0) - m.viewportHeight);
  return Math.min(max, Math.max(0, target));
}

// ---------------------------------------------------------------------------
// Waiting for the layout to settle

/** How long the layout has to stay still before the scroll: the new bar and any PR line report their size first. */
export const SETTLE_MS = 50;
/** The longest a scroll waits for the layout to settle. */
export const SETTLE_MAX_MS = 300;

/**
 * How long to wait before scrolling to a pending set, after a layout report (or the completion
 * itself) at `nowMs`: SETTLE_MS more, but never past `deadlineMs`. The screen calls it on every
 * layout report while a scroll is pending, so the scroll uses sizes measured for the new state.
 */
export function settleDelayMs(nowMs: number, deadlineMs: number): number {
  return Math.max(0, Math.min(SETTLE_MS, deadlineMs - nowMs));
}
