// What NumberField shows and reads back. Pure, so tests can run it.

/** Accepts both "." and "," as the decimal separator. */
export function parseNumber(text: string, decimal: boolean): number | undefined {
  const normalized = text.replace(',', '.').trim();
  if (normalized === '' || normalized === '.') return undefined;
  const value = decimal ? Number.parseFloat(normalized) : Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : undefined;
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined) return '';
  return String(Math.round(value * 100) / 100);
}

/**
 * Whether the field should replace its text with `value`, which has just changed. Always when
 * it isn't focused. While it's focused, only when the text no longer says `value`, e.g. when a
 * tap copied in last time's numbers, so typing "100." or "1,5" is never rewritten. The field keeps
 * 2 decimals, and a lb↔kg round trip can land either side of the last one, so within half a
 * hundredth counts as the same.
 */
export function shouldSyncText(text: string, value: number | undefined, decimal: boolean, focused: boolean): boolean {
  if (!focused) return true;
  const typed = parseNumber(text, decimal);
  if (typed === undefined || value === undefined) return typed !== value;
  return Math.abs(typed - value) > 0.005 + 1e-9;
}
