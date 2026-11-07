// Route params come from links too, and a link can carry anything: a key can be missing, or repeated
// (Expo Router then gives an array). Screens read them through these instead of trusting the type.

/** A param as one string: the first of a repeated key, '' when it's missing. */
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** A whole-number param kept within min..max, with the fallback when it's missing or not a number. */
export function numberParam(value: string | string[] | undefined, { min, max, fallback }: { min: number; max: number; fallback: number }): number {
  const text = firstParam(value).trim();
  const n = text === '' ? NaN : Number(text);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
